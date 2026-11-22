// The data model: the dashboard parsed defensively, the times of the API,
// the Gladys values of the modes, the setpoints, the daily energy cumulated
// into an index.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseDashboard,
  setTime,
  wallClock,
  localDay,
  daysBefore,
  zoneMode,
  operatingState,
  hotWaterMode,
  hotWaterHeating,
  zoneState,
  hotWaterState,
  checkSetpoint,
  energyDay,
  dayFigures,
  accountDays,
  KINDS,
  KEPT_DAYS,
} from '../src/remeha.js';
import {
  THERMOSTAT_MODE,
  THERMOSTAT_OPERATING_STATE,
  WATER_HEATER_MODE,
} from '../src/constants.js';
import {
  DASHBOARD,
  ENERGY,
  APPLIANCE_ID,
  SALON_ID,
  DHW_ID,
  item,
  variant,
} from './helpers/fixtures.js';

const TZ = 'Europe/Paris';

test('the dashboard: one appliance, its zones and its hot water', () => {
  const { appliances, zones, hotWaters } = parseDashboard(DASHBOARD);
  assert.equal(appliances.length, 1);
  const [appliance] = appliances;
  assert.equal(appliance.kind, KINDS.APPLIANCE);
  assert.equal(appliance.id, APPLIANCE_ID);
  assert.equal(appliance.name, 'Maison');
  assert.equal(appliance.type, 'HeatPump');
  assert.equal(appliance.pressure, 1.7);
  assert.equal(appliance.pressureOk, true);
  assert.equal(appliance.outdoor, 6.5, 'the sensor of the appliance first');
  assert.equal(appliance.outdoorSource, 'appliance');
  assert.equal(appliance.holidayActive, false);
  assert.equal(appliance.holidayStart, null, 'year 1 = not set');
  assert.equal(appliance.canEnergy, true);
  assert.equal(appliance.timezone, TZ);

  assert.deepEqual(
    zones.map((zone) => [zone.name, zone.mode, zone.program, zone.canFireplace, zone.fireplace]),
    [
      ['Salon', 'Scheduling', 1, true, false],
      ['Étage', 'Manual', 2, false, null],
    ],
  );
  const [salon] = zones;
  assert.equal(salon.id, SALON_ID);
  assert.equal(salon.applianceId, APPLIANCE_ID);
  assert.equal(salon.nextSwitch, '2026-11-15T22:30', 'a local time written with a Z');
  assert.equal(salon.overrideEnd, null);
  assert.equal(salon.canOverrideEnd, true);

  const [dhw] = hotWaters;
  assert.equal(dhw.id, DHW_ID);
  assert.deepEqual(
    [dhw.mode, dhw.type, dhw.temperature, dhw.comfort, dhw.min, dhw.max, dhw.canBoost],
    ['Scheduling', 'Tank', 52.4, 55, 40, 65, true],
  );
});

test('missing or wrong fields: null, empty lists, never a crash', () => {
  assert.deepEqual(parseDashboard(null), { appliances: [], zones: [], hotWaters: [] });
  assert.deepEqual(parseDashboard({ appliances: 'x' }).appliances, []);
  const parsed = parseDashboard({
    appliances: [
      {
        applianceId: 'a',
        climateZones: [{ name: 'no id' }, { climateZoneId: 'c' }],
        hotWaterZones: null,
      },
      { houseName: 'no id' },
    ],
  });
  assert.equal(parsed.appliances.length, 1);
  const [appliance] = parsed.appliances;
  assert.deepEqual(
    [appliance.pressure, appliance.outdoor, appliance.online, appliance.canEnergy],
    [null, null, null, false],
  );
  assert.equal(parsed.zones.length, 1);
  const [zone] = parsed.zones;
  assert.deepEqual([zone.min, zone.max, zone.program, zone.mode], [5, 30, 1, null]);
  assert.equal(parsed.hotWaters.length, 0);
});

test('the outdoor temperature of the weather service when the appliance has no sensor', () => {
  const dashboard = variant((d) => {
    d.appliances[0].outdoorTemperatureInformation.applianceOutdoorTemperature = null;
  });
  const [appliance] = parseDashboard(dashboard).appliances;
  assert.deepEqual([appliance.outdoor, appliance.outdoorSource], [7, 'cloud']);
});

test('times: year 1 is not set, the wall clock of a local time', () => {
  assert.equal(setTime('0001-01-01T00:00:00Z'), null);
  assert.equal(setTime('0001-01-01T00:00:01Z'), null);
  assert.equal(setTime(''), null);
  assert.equal(setTime('garbage'), null);
  assert.equal(setTime('2026-11-15T20:00:00Z'), '2026-11-15T20:00:00Z');
  assert.equal(wallClock('2026-10-22T22:00:00Z'), '2026-10-22T22:00');
  assert.equal(localDay(Date.parse('2026-11-14T23:30:00Z'), TZ), '2026-11-15');
  assert.equal(daysBefore('2026-03-01', 1), '2026-02-28');
  assert.equal(daysBefore('2026-11-15', -7), '2026-11-22');
});

test('the Gladys values of the zone modes and states', () => {
  const zone = (mode, demand) => ({ mode, demand });
  assert.equal(zoneMode(zone('Scheduling')), THERMOSTAT_MODE.AUTO);
  assert.equal(zoneMode(zone('TemporaryOverride')), THERMOSTAT_MODE.AUTO);
  assert.equal(zoneMode(zone('Manual')), THERMOSTAT_MODE.HEATING);
  assert.equal(zoneMode(zone('FrostProtection')), THERMOSTAT_MODE.OFF);
  assert.equal(zoneMode(zone('Something')), null);
  assert.equal(operatingState(zone('', 'ProducingHeat')), THERMOSTAT_OPERATING_STATE.HEATING);
  assert.equal(operatingState(zone('', 'RequestingHeat')), THERMOSTAT_OPERATING_STATE.HEATING);
  assert.equal(operatingState(zone('', 'ProducingCold')), THERMOSTAT_OPERATING_STATE.COOLING);
  assert.equal(operatingState(zone('', 'Idle')), THERMOSTAT_OPERATING_STATE.IDLE);
  assert.equal(operatingState(zone('', null)), null);
  assert.deepEqual(
    ['Scheduling', 'TemporaryOverride', 'Manual', 'FrostProtection', 'x'].map((mode) =>
      zoneState({ mode }),
    ),
    ['schedule', 'override', 'manual', 'off', null],
  );
});

test('the Gladys values of the hot water modes', () => {
  assert.equal(hotWaterMode({ mode: 'Scheduling' }), WATER_HEATER_MODE.PROGRAM);
  assert.equal(hotWaterMode({ mode: 'ContinuousComfort' }), WATER_HEATER_MODE.MANUAL);
  assert.equal(hotWaterMode({ mode: 'Off' }), WATER_HEATER_MODE.ECO, 'Eco in the app');
  assert.equal(hotWaterMode({ mode: 'Boost' }), WATER_HEATER_MODE.BOOST);
  assert.equal(hotWaterMode({ mode: 'x' }), null);
  assert.equal(hotWaterHeating({ status: 'ProducingHeat' }), true);
  assert.equal(hotWaterHeating({ status: 'LowTemperature' }), false);
  assert.equal(hotWaterHeating({ status: 'Idle' }), false);
  assert.equal(hotWaterHeating({ status: null }), null);
  assert.deepEqual(
    ['Scheduling', 'ContinuousComfort', 'Off', 'Boost'].map((mode) => hotWaterState({ mode })),
    ['schedule', 'comfort', 'eco', 'boost'],
  );
});

test('setpoints are rounded to their step and checked against the bounds', () => {
  const range = { min: 5, max: 30 };
  assert.equal(checkSetpoint(21.3, range, 0.5), 21.5);
  assert.equal(checkSetpoint('19', range, 0.5), 19);
  assert.equal(checkSetpoint(54.6, { min: 40, max: 65 }, 1), 55);
  assert.throws(() => checkSetpoint(31, range, 0.5), RangeError);
  assert.throws(() => checkSetpoint('warm', range, 0.5), RangeError);
  assert.throws(() => checkSetpoint(null, range, 0.5), RangeError);
});

test('the day of an energy item: a completed day as written, the running day on site', () => {
  assert.equal(energyDay('2026-11-14T00:00:00+00:00', TZ), '2026-11-14');
  assert.equal(energyDay('2026-11-15T07:00:00+00:00', TZ), '2026-11-15');
  // Right after midnight in Paris, the running day still carries yesterday's UTC date.
  assert.equal(energyDay('2026-11-14T23:00:00+00:00', TZ), '2026-11-15');
  assert.equal(energyDay('', TZ), null);
  assert.deepEqual(dayFigures(item('2026-11-14', 20, 3)), {
    heating: 20,
    hotWater: 3,
    cooling: 0,
    total: 23,
  });
  assert.equal(dayFigures({}), null);
});

test('the first reading starts the index at today, without the past days', () => {
  const { record, deltaKwh } = accountDays(null, ENERGY.data, TZ, '2026-11-15');
  assert.equal(record.kwh, 7);
  assert.equal(deltaKwh, 0);
  assert.equal(record.since, '2026-11-15');
  assert.equal(Object.keys(record.days).length, 8);
  assert.deepEqual(record.days['2026-11-14'], { heating: 23, hotWater: 4, cooling: 0, total: 27 });
});

test('only the increase of a day is added; a lower figure is ignored', () => {
  let { record } = accountDays(null, ENERGY.data, TZ, '2026-11-15');
  // Today grows from 7 to 10 kWh.
  ({ record } = accountDays(
    record,
    [...ENERGY.data.slice(0, 7), item('2026-11-15', 8, 2, '2026-11-15T09:00:00+00:00')],
    TZ,
    '2026-11-15',
  ));
  assert.equal(record.kwh, 10);
  // A lower figure (a glitch, the zeros after midnight): nothing changes.
  const lower = accountDays(
    record,
    [item('2026-11-15', 1, 0, '2026-11-15T10:00:00+00:00')],
    TZ,
    '2026-11-15',
  );
  assert.equal(lower.record.kwh, 10);
  assert.equal(lower.deltaKwh, 0);
  assert.equal(lower.record.days['2026-11-15'].total, 10);
});

test('after midnight: the end of yesterday arrives late, the new day starts from zero', () => {
  let { record } = accountDays(null, ENERGY.data, TZ, '2026-11-15');
  const day15 = (total, stamp) => item('2026-11-15', total, 0, stamp);
  ({ record } = accountDays(record, [day15(20, '2026-11-15T21:00:00+00:00')], TZ, '2026-11-15'));
  assert.equal(record.kwh, 20);
  // 00:30 in Paris: the new day with zeros, stamped on the UTC day before.
  ({ record } = accountDays(
    record,
    [day15(20), item('2026-11-16', 0, 0, '2026-11-15T23:00:00+00:00')],
    TZ,
    '2026-11-16',
  ));
  assert.equal(record.kwh, 20);
  // 02:30: yesterday completed (+3), the new day has 2 kWh.
  const late = accountDays(
    record,
    [day15(23), item('2026-11-16', 2, 0, '2026-11-16T01:00:00+00:00')],
    TZ,
    '2026-11-16',
  );
  assert.equal(late.deltaKwh, 5);
  assert.equal(late.record.kwh, 25);
});

test('a wrong figure is never energy; only the last days are kept', () => {
  const { record } = accountDays(null, [], TZ, '2026-11-15');
  const wrong = accountDays(
    record,
    [item('2026-11-15', 5000, 0, '2026-11-15T09:00:00+00:00')],
    TZ,
    '2026-11-15',
  );
  assert.equal(wrong.record.kwh, 0);
  const many = Array.from({ length: 20 }, (_, i) => item(daysBefore('2026-11-15', 19 - i), 1, 0));
  const kept = accountDays(null, many, TZ, '2026-11-15');
  assert.equal(Object.keys(kept.record.days).length, KEPT_DAYS);
  assert.ok(kept.record.days['2026-11-15']);
});

test('a day older than the record is never counted', () => {
  const { record } = accountDays(
    null,
    [item('2026-11-15', 5, 0, '2026-11-15T09:00:00+00:00')],
    TZ,
    '2026-11-15',
  );
  const old = accountDays(record, [item('2026-11-10', 30, 0)], TZ, '2026-11-15');
  assert.equal(old.deltaKwh, 0);
  assert.equal(old.record.kwh, 5);
});
