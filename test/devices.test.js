// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): a device is only polled with
// should_poll AND poll_frequency, every feature needs min / max / read_only /
// has_feedback, a wrong category / type pair shows no icon nor label, and a
// single invalid field rejects the whole discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

import { parseDashboard } from '../src/remeha.js';
import {
  buildDevice,
  buildStates,
  discoverySignature,
  deviceName,
  FEATURE_KEYS,
} from '../src/device.js';
import {
  THERMOSTAT_MODE,
  THERMOSTAT_OPERATING_STATE,
  WATER_HEATER_MODE,
} from '../src/constants.js';
import { LANGUAGES } from '../src/i18n.js';
import { DASHBOARD, fakeGladys } from './helpers/fixtures.js';

const parsed = parseDashboard(DASHBOARD);
const [salon, etage] = parsed.zones;
const [tank] = parsed.hotWaters;
const combi = { ...tank, type: 'Combi', temperature: null, canBoost: false };
const appliance = { ...parsed.appliances[0], model: 'Elga Ace', energyKwh: 42.12345 };
const models = [salon, etage, tank, appliance];
const devices = (language) => models.map((model) => buildDevice(fakeGladys, model, language));
const keysOf = (model) =>
  buildDevice(fakeGladys, model).features.map((f) => f.external_id.split(':').pop());
const statesOf = (model) =>
  Object.fromEntries(
    buildStates(fakeGladys, model).map((s) => [
      s.device_feature_external_id.split(':').pop(),
      s.state,
    ]),
  );

// DEVICE_FEATURE_UNITS_BY_CATEGORY of the Gladys core 5.3.0
// (server/utils/constants.js), and the pairs the front labels
// (front/src/config/i18n: deviceFeatureCategory.<category>.<type>).
const UNITS_OF = {
  [CATEGORIES.THERMOSTAT]: [UNITS.CELSIUS, UNITS.FAHRENHEIT],
  [CATEGORIES.WATER_HEATER]: [UNITS.CELSIUS, UNITS.FAHRENHEIT],
  [CATEGORIES.TEMPERATURE_SENSOR]: [UNITS.CELSIUS, UNITS.FAHRENHEIT],
  [CATEGORIES.PRESSURE_SENSOR]: [UNITS.BAR, UNITS.MILLIBAR, UNITS.PASCAL],
  [CATEGORIES.ENERGY_SENSOR]: [UNITS.KILOWATT_HOUR],
};
// Enums and on / off carry no unit in the core.
const NO_UNIT = [
  `${CATEGORIES.THERMOSTAT}/${TYPES.THERMOSTAT.MODE}`,
  `${CATEGORIES.THERMOSTAT}/${TYPES.THERMOSTAT.OPERATING_STATE}`,
  `${CATEGORIES.WATER_HEATER}/${TYPES.WATER_HEATER.MODE}`,
  `${CATEGORIES.WATER_HEATER}/${TYPES.WATER_HEATER.HEATING}`,
  `${CATEGORIES.SWITCH}/${TYPES.SWITCH.BINARY}`,
];
const PAIRS = [
  [CATEGORIES.THERMOSTAT, TYPES.THERMOSTAT.MODE],
  [CATEGORIES.THERMOSTAT, TYPES.THERMOSTAT.TARGET_TEMPERATURE],
  [CATEGORIES.THERMOSTAT, TYPES.THERMOSTAT.OPERATING_STATE],
  [CATEGORIES.TEMPERATURE_SENSOR, TYPES.SENSOR.DECIMAL],
  [CATEGORIES.SWITCH, TYPES.SWITCH.BINARY],
  [CATEGORIES.WATER_HEATER, TYPES.WATER_HEATER.MODE],
  [CATEGORIES.WATER_HEATER, TYPES.WATER_HEATER.TARGET_TEMPERATURE],
  [CATEGORIES.WATER_HEATER, TYPES.WATER_HEATER.HEATING],
  [CATEGORIES.PRESSURE_SENSOR, TYPES.SENSOR.DECIMAL],
  [CATEGORIES.ENERGY_SENSOR, TYPES.ENERGY_SENSOR.INDEX],
];
const WRITABLE = ['mode', 'target_temperature', 'fireplace'];

test('devices are never polled by Gladys: the integration has its own clock', () => {
  for (const device of devices('en')) {
    assert.equal(device.should_poll, false, device.external_id);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      for (const feature of device.features) {
        for (const key of ['min', 'max']) {
          assert.equal(typeof feature[key], 'number', `${feature.external_id}.${key}`);
        }
        assert.ok(feature.min <= feature.max, feature.external_id);
        const key = feature.external_id.split(':').pop();
        assert.equal(feature.read_only, !WRITABLE.includes(key), feature.external_id);
        assert.equal(feature.has_feedback, WRITABLE.includes(key), feature.external_id);
        assert.ok(feature.name, feature.external_id);
        assert.doesNotMatch(feature.name, /^feature_/, feature.external_id);
        for (const field of ['present', 'value', 'key', 'options']) {
          assert.equal(feature[field], undefined);
        }
      }
    }
  }
});

test('every category / type pair is a known one, every unit belongs to its category', () => {
  for (const device of devices('en')) {
    for (const feature of device.features) {
      assert.ok(
        PAIRS.some(([category, type]) => feature.category === category && feature.type === type),
        `${feature.external_id}: ${feature.category} / ${feature.type}`,
      );
      if (NO_UNIT.includes(`${feature.category}/${feature.type}`)) {
        assert.equal(feature.unit, undefined, feature.external_id);
      } else {
        assert.ok(UNITS_OF[feature.category].includes(feature.unit), feature.external_id);
      }
    }
  }
});

test('the features follow what each zone and appliance can do', () => {
  assert.deepEqual(keysOf(salon), [
    'mode',
    'target_temperature',
    'operating_state',
    'temperature',
    'fireplace',
  ]);
  assert.deepEqual(keysOf(etage), ['mode', 'target_temperature', 'operating_state', 'temperature']);
  assert.deepEqual(keysOf(tank), ['mode', 'target_temperature', 'heating', 'temperature']);
  assert.deepEqual(keysOf(combi), ['mode', 'target_temperature', 'heating'], 'no tank to measure');
  assert.deepEqual(keysOf(appliance), ['pressure', 'outdoor_temperature', 'energy']);
  assert.deepEqual(
    keysOf({ ...appliance, pressure: null, outdoor: null, canEnergy: false }),
    [],
    'a bare appliance',
  );
  for (const key of FEATURE_KEYS) assert.match(key, /^[a-z_]+$/);
});

test('the states of a zone, of the hot water and of the appliance', () => {
  assert.deepEqual(statesOf(salon), {
    mode: THERMOSTAT_MODE.AUTO,
    target_temperature: 20,
    operating_state: THERMOSTAT_OPERATING_STATE.HEATING,
    temperature: 19.6,
    fireplace: 0,
  });
  assert.deepEqual(statesOf(etage), {
    mode: THERMOSTAT_MODE.HEATING,
    target_temperature: 18,
    operating_state: THERMOSTAT_OPERATING_STATE.IDLE,
    temperature: 18.2,
  });
  assert.deepEqual(
    statesOf({ ...salon, mode: 'FrostProtection', fireplace: true }).mode,
    THERMOSTAT_MODE.OFF,
  );
  assert.deepEqual(statesOf({ ...salon, fireplace: true }).fireplace, 1);
  assert.deepEqual(statesOf(tank), {
    mode: WATER_HEATER_MODE.PROGRAM,
    target_temperature: 55,
    heating: 0,
    temperature: 52.4,
  });
  assert.equal(
    statesOf({ ...tank, mode: 'Boost', status: 'ProducingHeat' }).mode,
    WATER_HEATER_MODE.BOOST,
  );
  assert.equal(statesOf({ ...tank, status: 'ProducingHeat' }).heating, 1);
  assert.deepEqual(statesOf(appliance), {
    pressure: 1.7,
    outdoor_temperature: 6.5,
    energy: 42.123,
  });
  // Unknown values are not published.
  assert.deepEqual(
    statesOf({ ...appliance, outdoor: 3, pressure: 1, energyKwh: null }).energy,
    undefined,
  );
  assert.deepEqual(
    statesOf({ ...salon, mode: null, setpoint: null, demand: null, room: null, fireplace: null }),
    {},
  );
});

test('the bounds come from the zone; the options list what the zone offers', () => {
  const zone = buildDevice(fakeGladys, etage).features;
  const setpoint = zone.find((f) => f.external_id.endsWith(':target_temperature'));
  assert.deepEqual([setpoint.min, setpoint.max, setpoint.step], [5, 28, 0.5]);
  const mode = zone.find((f) => f.external_id.endsWith(':mode'));
  assert.deepEqual(
    mode.supported_options.map((o) => o.value),
    [THERMOSTAT_MODE.AUTO, THERMOSTAT_MODE.HEATING, THERMOSTAT_MODE.OFF],
  );
  const water = buildDevice(fakeGladys, tank, 'fr').features;
  const comfort = water.find((f) => f.external_id.endsWith(':target_temperature'));
  assert.deepEqual([comfort.min, comfort.max, comfort.step], [40, 65, 1]);
  const dhwMode = water.find((f) => f.external_id.endsWith(':mode'));
  assert.deepEqual(
    dhwMode.supported_options.map((o) => [o.value, o.label]),
    [
      [WATER_HEATER_MODE.PROGRAM, 'Programme horaire'],
      [WATER_HEATER_MODE.MANUAL, 'Confort'],
      [WATER_HEATER_MODE.ECO, 'Éco'],
      [WATER_HEATER_MODE.BOOST, 'Boost'],
    ],
  );
  const noBoost = buildDevice(fakeGladys, combi).features.find((f) =>
    f.external_id.endsWith(':mode'),
  );
  assert.ok(!noBoost.supported_options.some((o) => o.value === WATER_HEATER_MODE.BOOST));
  for (const feature of [mode, dhwMode]) {
    for (const option of feature.supported_options) {
      assert.ok(option.value >= feature.min && option.value <= feature.max);
    }
  }
});

test('external ids come from the Remeha ids, never from the names', () => {
  const device = buildDevice(fakeGladys, salon, 'fr');
  assert.equal(device.external_id, `ext:test-integration:zone:${salon.id}`);
  const renamed = buildDevice(fakeGladys, { ...salon, name: 'Séjour' }, 'fr');
  assert.deepEqual(
    renamed.features.map((f) => f.external_id),
    device.features.map((f) => f.external_id),
  );
  assert.equal(renamed.name, 'Séjour');
  assert.equal(device.features[1].name, 'Consigne');
  assert.deepEqual(device.params, [
    { name: 'REMEHA_KIND', value: 'zone' },
    { name: 'REMEHA_APPLIANCE', value: salon.applianceId },
  ]);
  assert.equal(
    buildDevice(fakeGladys, tank).external_id,
    `ext:test-integration:hot_water:${tank.id}`,
  );
  assert.equal(
    buildDevice(fakeGladys, appliance).external_id,
    `ext:test-integration:appliance:${appliance.id}`,
  );
  assert.notEqual(
    discoverySignature(fakeGladys, models, 'fr'),
    discoverySignature(fakeGladys, models, 'en'),
  );
});

test('the names: the zone, "Hot water" for DHW, the model and the home', () => {
  assert.equal(deviceName(salon, 'fr'), 'Salon');
  assert.equal(deviceName({ ...salon, name: '' }, 'de'), 'Heizzone');
  assert.equal(deviceName(tank, 'fr'), 'Eau chaude', 'DHW is the name of the app');
  assert.equal(deviceName({ ...tank, name: 'Ballon' }, 'fr'), 'Ballon');
  assert.equal(deviceName(appliance, 'fr'), 'Elga Ace (Maison)');
  assert.equal(deviceName({ ...appliance, model: null }, 'fr'), 'Pompe à chaleur (Maison)');
  assert.equal(
    deviceName({ ...appliance, model: null, type: 'Other', name: '' }, 'en'),
    'Remeha appliance',
  );
  assert.equal(buildDevice(fakeGladys, appliance).model, 'Elga Ace');
});

test('the whole Discovery batch and the states are accepted by the fake Gladys', async () => {
  for (const language of LANGUAGES) {
    const gladys = createFakeGladys();
    await gladys.connect();
    await gladys.publishDiscoveredDevices(
      models.map((model) => buildDevice(gladys, model, language)),
    );
    assert.equal(gladys.fake.discoveredDevices.length, 4);
    await gladys.publishStates(models.flatMap((model) => buildStates(gladys, model)));
    assert.equal(gladys.fake.requests.filter((r) => r.status >= 400).length, 0);
    await gladys.disconnect();
  }
});
