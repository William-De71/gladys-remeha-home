// The whole integration against the fake Gladys of the SDK and a fake Remeha
// API: readings, discovery, states, energy, commands, scene triggers and
// actions, widgets, errors, persistence.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  createApp,
  CONFIRM_DELAY_MS,
  PENDING_MS,
  REFUSED_RETRY_MS,
  ENERGY_MS,
} from '../src/app.js';
import { CredentialsError, RateLimitError, NetworkError, ApiError } from '../src/remeha-api.js';
import { THERMOSTAT_MODE, WATER_HEATER_MODE } from '../src/constants.js';
import {
  T0,
  APPLIANCE_ID,
  SALON_ID,
  ETAGE_ID,
  DHW_ID,
  ENERGY,
  item,
  fakeApi,
} from './helpers/fixtures.js';

const CONFIG = { email: 'me@example.com', password: 'secret' };
const MINUTE = 60 * 1000;
const EXT = {
  salon: `ext:test-integration:zone:${SALON_ID}`,
  etage: `ext:test-integration:zone:${ETAGE_ID}`,
  dhw: `ext:test-integration:hot_water:${DHW_ID}`,
  appliance: `ext:test-integration:appliance:${APPLIANCE_ID}`,
};
const out = (answer) => answer.data?.outputs ?? answer.data ?? answer;
const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A connected integration on a fake clock.
 * @param {object} [options] - Options.
 * @returns {Promise<object>} The handles.
 */
async function start({
  config = CONFIG,
  api = fakeApi(),
  statePath = null,
  created = true,
  devices = [],
} = {}) {
  const clock = { now: T0 };
  const gladys = createFakeGladys({ config: { ...config }, devices });
  const app = createApp(gladys, {
    api,
    now: () => clock.now,
    statePath,
    tickMs: 0,
    timezone: 'Europe/Paris',
    logger: silent,
  });
  await gladys.connect();
  if (created && devices.length === 0) {
    for (const device of gladys.fake.discoveredDevices) await gladys.fake.deviceCreated(device);
  }
  const advance = async (ms) => {
    clock.now += ms;
    await app.tick();
  };
  const device = (name) => gladys.fake.devices.find((d) => d.external_id === EXT[name]);
  const featureOf = (name, key) =>
    device(name).features.find((f) => f.external_id === `${EXT[name]}:${key}`);
  const state = (name, key) => gladys.fake.lastState(`${EXT[name]}:${key}`);
  const set = (name, key, value) => gladys.fake.setValue(device(name), featureOf(name, key), value);
  // Let a command sent without waiting reach the fake API.
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const zone = (id) => api.dashboard.appliances[0].climateZones.find((z) => z.climateZoneId === id);
  const dhw = () => api.dashboard.appliances[0].hotWaterZones[0];
  const raw = () => api.dashboard.appliances[0];
  return { gladys, app, api, clock, advance, device, state, set, settle, zone, dhw, raw };
}

test('without credentials: nothing is read, the status says what to do', async () => {
  const { gladys, api } = await start({ config: {} });
  assert.deepEqual(api.calls, []);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /e-mail et le mot de passe/);
  assert.equal(gladys.fake.discoveredDevices.length, 0);
});

test('the first reading: dashboard, model once, energy; four devices offered', async () => {
  const { gladys, api } = await start();
  assert.deepEqual(api.calls, [
    'getDashboard',
    'getTechnicalDetails',
    'getDailyEnergy:2026-11-07:2026-11-15',
  ]);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    ['Salon', 'Étage', 'Eau chaude', 'Elga Ace (Maison)'],
    'French guessed from the timezone',
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /1 appliance\(s\), 3 zone\(s\), read every 2 min/,
  );
});

test('the states of the created devices; nothing for a device not added', async () => {
  const { state } = await start();
  assert.equal(state('salon', 'mode'), THERMOSTAT_MODE.AUTO);
  assert.equal(state('salon', 'target_temperature'), 20);
  assert.equal(state('etage', 'mode'), THERMOSTAT_MODE.HEATING);
  assert.equal(state('dhw', 'mode'), WATER_HEATER_MODE.PROGRAM);
  assert.equal(state('dhw', 'temperature'), 52.4);
  assert.equal(state('appliance', 'pressure'), 1.7);
  assert.equal(state('appliance', 'energy'), 7, 'today so far');
  const lonely = await start({ created: false });
  assert.equal(lonely.gladys.fake.lastState(`${EXT.salon}:mode`), undefined);
});

test('the clock: the dashboard at the interval, the energy every 15 min, the model never again', async () => {
  const { api, advance } = await start();
  api.calls.length = 0;
  await advance(MINUTE);
  assert.deepEqual(api.calls, [], 'not due yet');
  await advance(MINUTE);
  assert.deepEqual(api.calls, ['getDashboard']);
  api.calls.length = 0;
  await advance(ENERGY_MS);
  assert.deepEqual(api.calls, ['getDashboard', 'getDailyEnergy:2026-11-07:2026-11-15']);
});

test('the energy index grows with the day, never goes back', async () => {
  const { api, advance, state } = await start();
  api.energy.data[7] = item('2026-11-15', 9, 2, '2026-11-15T10:00:00+00:00');
  await advance(ENERGY_MS);
  assert.equal(state('appliance', 'energy'), 11);
  api.energy.data[7] = item('2026-11-15', 1, 0, '2026-11-15T11:00:00+00:00');
  await advance(ENERGY_MS);
  assert.equal(state('appliance', 'energy'), 11);
});

test('setpoint of a zone on schedule: a temporary override, shown at once, confirmed later', async () => {
  const { api, set, settle, state, advance, zone } = await start();
  await set('salon', 'target_temperature', 21.3);
  assert.equal(state('salon', 'target_temperature'), 21.5, 'shown before Remeha answers');
  await settle();
  assert.deepEqual(api.writes.at(-1), ['setZoneTemporary', SALON_ID, 21.5]);
  // The cloud still shows the old values: the commanded ones win.
  await advance(CONFIRM_DELAY_MS);
  assert.equal(state('salon', 'target_temperature'), 21.5);
  Object.assign(zone(SALON_ID), { zoneMode: 'TemporaryOverride', setPoint: 21.5 });
  await advance(2 * MINUTE);
  assert.equal(state('salon', 'target_temperature'), 21.5);
  assert.equal(state('salon', 'mode'), THERMOSTAT_MODE.AUTO);
});

test('setpoint of a manual zone: manual; out of bounds: refused before anything', async () => {
  const { api, set, settle } = await start();
  await set('etage', 'target_temperature', 19);
  await settle();
  assert.deepEqual(api.writes.at(-1), ['setZoneManual', ETAGE_ID, 19]);
  const answer = await set('etage', 'target_temperature', 29);
  assert.equal(answer.success, false);
  assert.equal(api.writes.length, 1);
});

test('the commanded values last 3 minutes at most when Remeha never confirms', async () => {
  const { set, settle, state, advance } = await start();
  await set('salon', 'target_temperature', 23);
  await settle();
  await advance(2 * MINUTE);
  assert.equal(state('salon', 'target_temperature'), 23);
  await advance(PENDING_MS);
  assert.equal(state('salon', 'target_temperature'), 20, 'the cloud is right again');
});

test('the mode of a zone: off, manual at the current setpoint, schedule with its program', async () => {
  const { api, set, settle, state } = await start();
  await set('salon', 'mode', THERMOSTAT_MODE.OFF);
  await settle();
  assert.equal(state('salon', 'mode'), THERMOSTAT_MODE.OFF);
  await set('salon', 'mode', THERMOSTAT_MODE.HEATING);
  await settle();
  await set('etage', 'mode', THERMOSTAT_MODE.AUTO);
  await settle();
  assert.deepEqual(api.writes, [
    ['setZoneOff', SALON_ID],
    ['setZoneManual', SALON_ID, 20],
    ['setZoneSchedule', ETAGE_ID, 2],
  ]);
  const cooling = await set('salon', 'mode', THERMOSTAT_MODE.COOLING);
  assert.equal(cooling.success, false);
});

test('the fireplace switch, read-only features refused', async () => {
  const { api, set, settle, state } = await start();
  await set('salon', 'fireplace', 1);
  await settle();
  assert.deepEqual(api.writes, [['setFireplace', SALON_ID, true]]);
  assert.equal(state('salon', 'fireplace'), 1);
  assert.equal((await set('salon', 'temperature', 30)).success, false);
  assert.equal((await set('appliance', 'pressure', 2)).success, false);
});

test('the hot water: modes, boost from another mode, comfort temperature', async () => {
  const { api, set, settle, state, dhw, advance } = await start();
  await set('dhw', 'mode', WATER_HEATER_MODE.ECO);
  await settle();
  assert.equal(state('dhw', 'mode'), WATER_HEATER_MODE.ECO);
  dhw().dhwZoneMode = 'Off';
  await advance(CONFIRM_DELAY_MS);
  await set('dhw', 'mode', WATER_HEATER_MODE.BOOST);
  await settle();
  await set('dhw', 'target_temperature', 58.4);
  await settle();
  assert.deepEqual(api.writes, [
    ['setHotWaterMode', DHW_ID, 'anti-frost'],
    ['setHotWaterMode', DHW_ID, 'schedule'],
    ['setHotWaterMode', DHW_ID, 'boost'],
    ['setHotWaterComfort', DHW_ID, 58],
  ]);
  assert.equal((await set('dhw', 'mode', WATER_HEATER_MODE.AWAY)).success, false);
});

test('a refused command: the commanded values are dropped, the truth comes back', async () => {
  const { api, set, settle, state } = await start();
  api.failOn.setZoneManual = new ApiError(400, 'Invalid');
  await set('etage', 'target_temperature', 21);
  await settle();
  await settle();
  assert.equal(state('etage', 'target_temperature'), 18);
});

test('scene action set_temporary: a duration on a zone that takes an end', async () => {
  const { gladys, api, clock } = await start();
  const answer = await gladys.fake.sceneAction('set_temporary', {
    zone: EXT.salon,
    temperature: 22,
    minutes: 90,
  });
  assert.deepEqual(out(answer), { end: '2026-11-15T11:40' });
  const end = new Date(clock.now + 90 * MINUTE).toISOString().replace(/\.\d{3}Z$/, 'Z');
  assert.deepEqual(api.writes, [['setZoneTemporary', SALON_ID, 22, end]]);
  // A zone that cannot take an end: until the next switch.
  const other = await gladys.fake.sceneAction('set_temporary', {
    zone: EXT.etage,
    temperature: 20,
    minutes: 30,
  });
  assert.deepEqual(out(other), { end: '' });
  assert.deepEqual(api.writes.at(-1), ['setZoneTemporary', ETAGE_ID, 20, null]);
  const wrong = await gladys.fake.sceneAction('set_temporary', { zone: EXT.dhw, temperature: 20 });
  assert.equal(wrong.success, false, 'not a climate zone');
});

test('scene action set_clock_program: every zone, schedule restored where needed', async () => {
  const { gladys, api } = await start();
  const answer = await gladys.fake.sceneAction('set_clock_program', { program: '3' });
  assert.deepEqual(out(answer), { count: 2, failed: 0 });
  assert.deepEqual(api.writes, [
    ['activateProgram', SALON_ID, 3],
    ['activateProgram', ETAGE_ID, 3],
    ['setZoneSchedule', ETAGE_ID, 3],
  ]);
});

test('scene action set_holiday: from today for N days, 0 cancels; no trigger echo', async () => {
  const { gladys, api, advance, raw } = await start();
  const answer = await gladys.fake.sceneAction('set_holiday', { days: 7 });
  assert.deepEqual(out(answer), { count: 1, until: '2026-11-22' });
  assert.deepEqual(api.writes.at(-1), ['setHoliday', APPLIANCE_ID, '2026-11-15', '2026-11-22']);
  raw().holidaySchedule = {
    startTime: '2026-11-15T00:00:01Z',
    endTime: '2026-11-22T00:00:01Z',
    active: true,
  };
  await advance(CONFIRM_DELAY_MS);
  assert.equal(gladys.fake.sceneEvents.filter((e) => e.key === 'holiday_changed').length, 0);
  const cancel = await gladys.fake.sceneAction('set_holiday', { days: 0 });
  assert.deepEqual(out(cancel), { count: 1, until: '' });
  assert.deepEqual(api.writes.at(-1), ['setHoliday', APPLIANCE_ID, null, null]);
});

test('scene action hot_water_boost and refresh', async () => {
  const { gladys, api, clock } = await start();
  assert.deepEqual(out(await gladys.fake.sceneAction('hot_water_boost', {})), {
    count: 1,
    failed: 0,
  });
  assert.deepEqual(api.writes, [['setHotWaterMode', DHW_ID, 'boost']]);
  clock.now += MINUTE;
  assert.deepEqual(out(await gladys.fake.sceneAction('refresh', {})), {
    zones: 2,
    pressure: 1.7,
    outdoor_temperature: 6.5,
    energy_today: 7,
  });
});

test('scene triggers: fault, recovery, low pressure, offline, holiday from the app', async () => {
  const { gladys, advance, raw } = await start();
  raw().errorStatus = 'Locking';
  raw().waterPressureOK = false;
  raw().waterPressure = 0.5;
  await advance(2 * MINUTE);
  raw().errorStatus = 'Running';
  raw().applianceOnline = false;
  raw().holidaySchedule.active = true;
  raw().holidaySchedule.endTime = '2026-11-20T00:00:01Z';
  await advance(2 * MINUTE);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => [
      e.key,
      e.data.device,
      e.data.status ?? e.data.state ?? e.data.pressure,
    ]),
    [
      ['appliance_fault', EXT.appliance, 'Locking'],
      ['water_pressure_low', EXT.appliance, 0.5],
      ['appliance_recovered', EXT.appliance, 'Running'],
      ['connection_changed', EXT.appliance, 'offline'],
      ['holiday_changed', EXT.appliance, 'started'],
    ],
  );
});

test('no trigger for an appliance the user did not add', async () => {
  const { gladys, advance, raw } = await start({ created: false });
  raw().errorStatus = 'Locking';
  await advance(2 * MINUTE);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('refused credentials: status, a pause of 30 minutes, a retry when they change', async () => {
  const api = fakeApi();
  api.failOn.getDashboard = new CredentialsError('BAD_CREDENTIALS', 200);
  const { gladys, advance } = await start({ api });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /refused the e-mail or the password \(BAD_CREDENTIALS\)/,
  );
  api.calls.length = 0;
  await advance(10 * MINUTE);
  assert.deepEqual(api.calls, []);
  await advance(REFUSED_RETRY_MS);
  assert.deepEqual(api.calls, ['getDashboard']);
  delete api.failOn.getDashboard;
  await gladys.fake.configUpdated({ ...CONFIG, password: 'new' });
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('429: readings slow down, then come back', async () => {
  const api = fakeApi();
  const { gladys, advance } = await start({ api });
  api.failNext = new RateLimitError(60 * 1000);
  await advance(2 * MINUTE);
  assert.match(gladys.fake.connectionStatus.message.en, /slow down/);
  api.calls.length = 0;
  await advance(2 * MINUTE);
  assert.deepEqual(api.calls, [], 'paused 4 minutes');
  await advance(3 * MINUTE);
  assert.deepEqual(api.calls, ['getDashboard']);
  assert.match(gladys.fake.connectionStatus.message.en, /^Connected/);
});

test('unreachable: the status, the last values kept', async () => {
  const api = fakeApi();
  const { gladys, advance, state } = await start({ api });
  api.failNext = new NetworkError('ENOTFOUND');
  await advance(2 * MINUTE);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /cannot be reached/);
  assert.equal(state('salon', 'target_temperature'), 20);
});

test('a failing energy or details reading never fails the dashboard', async () => {
  const api = fakeApi();
  api.failOn['getDailyEnergy:2026-11-07:2026-11-15'] = new ApiError(500);
  api.failOn.getTechnicalDetails = new ApiError(404);
  const { gladys } = await start({ api });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.discoveredDevices.at(-1).name, 'Pompe à chaleur (Maison)');
});

test('test the connection: the devices found, in the four languages', async () => {
  const { gladys, clock } = await start();
  clock.now += MINUTE;
  const answer = await gladys.fake.action('test_connection');
  const message = answer.data?.message ?? answer.data ?? answer;
  assert.match(message.fr, /^Connecté\. 4 appareil\(s\) à ajouter dans Découverte/);
  assert.match(message.en, /Salon: Schedule \(5 features\)/);
  assert.match(message.de, /Elga Ace \(Maison\): Online/);
});

test('widgets: content valid, buttons back to schedule, boost and refresh', async () => {
  const { gladys, api, clock } = await start();
  for (const key of ['zones', 'energy', 'status']) {
    for (const language of ['en', 'fr', 'de', 'es']) {
      const answer = await gladys.fake.widgetGet(key, { language });
      assert.deepEqual(validateWidgetContent(answer.data.content), [], `${key} ${language}`);
    }
  }
  const back = await gladys.fake.widgetAction('zones', 'all_schedule');
  assert.match(back.data.message.en, /1 zone\(s\) back to their schedule/);
  assert.deepEqual(api.writes, [['setZoneSchedule', ETAGE_ID, 2]]);
  await gladys.fake.widgetAction('zones', 'boost');
  assert.deepEqual(api.writes.at(-1), ['setHotWaterMode', DHW_ID, 'boost']);
  clock.now += MINUTE;
  const refresh = await gladys.fake.widgetAction('status', 'refresh');
  assert.match(refresh.data.message.fr, /Relevé : 3 zone/);
  // The chosen zones only.
  const chosen = await gladys.fake.widgetGet('zones', { settings: { devices: [EXT.dhw] } });
  const list = chosen.data.content.components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((i) => i.title),
    ['Hot water'],
  );
});

test('the widget language drives the feature names in automatic mode', async () => {
  const { gladys } = await start();
  await gladys.fake.widgetGet('zones', { language: 'de' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gladys.fake.discoveredDevices[0].features[1].name, 'Solltemperatur');
  assert.equal(gladys.fake.discoveredDevices[2].name, 'Warmwasser');
});

test('the state survives a restart: no trigger twice, the index goes on', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'remeha-'));
  const statePath = join(dir, 'state.json');
  const first = await start({ statePath });
  first.raw().errorStatus = 'Locking';
  await first.advance(2 * MINUTE);
  assert.equal(first.gladys.fake.sceneEvents.length, 1);
  await first.gladys.fake.shutdown?.('SIGTERM');
  assert.equal(statSync(statePath).mode & 0o777, 0o600);
  const stored = readFileSync(statePath, 'utf8');
  assert.doesNotMatch(stored, /secret|me@example\.com|access/);
  const api = fakeApi();
  api.dashboard.appliances[0].errorStatus = 'Locking';
  const second = await start({ statePath, api, devices: first.gladys.fake.devices });
  assert.equal(second.gladys.fake.sceneEvents.length, 0, 'already fired before the restart');
  assert.deepEqual(api.calls.includes('getTechnicalDetails'), false, 'model name kept');
  assert.equal(second.state('appliance', 'energy'), 7);
});

test('a scan reads again and offers the devices', async () => {
  const { gladys, api, clock } = await start();
  clock.now += MINUTE;
  api.calls.length = 0;
  await gladys.fake.scanRequest();
  assert.deepEqual(api.calls, ['getDashboard']);
  assert.equal(gladys.fake.discoveredDevices.length, 4);
});

test('the energy figures of the API reach the widget per day', async () => {
  const { gladys } = await start();
  const answer = await gladys.fake.widgetGet('energy', { language: 'en' });
  const chart = answer.data.content.components.find((c) => c.type === 'chart');
  assert.deepEqual(
    chart.series[0].points.map((p) => p.v),
    ENERGY.data.slice(1).map((d) => d.heatingEnergyConsumed),
  );
});
