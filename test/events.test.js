// Scene triggers fire on transitions only, with flat data within the limits
// of the core; the fields of the scene actions are checked.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRIGGERS,
  detectEvents,
  snapshotOf,
  temporaryChange,
  clockProgram,
  holidayDays,
  wholeNumber,
  MAX_TEMPORARY_MINUTES,
} from '../src/events.js';
import { parseDashboard } from '../src/remeha.js';
import { DASHBOARD } from './helpers/fixtures.js';

const [appliance] = parseDashboard(DASHBOARD).appliances;
const [salon, etage] = parseDashboard(DASHBOARD).zones;
const context = { device: 'ext:test-integration:appliance:a1', name: 'Elga Ace (Maison)' };
const run = (before, after) => detectEvents(snapshotOf(before), after, context).events;

test('the first reading only sets the baseline', () => {
  const { events, snapshot } = detectEvents(null, { ...appliance, errorStatus: 'Error' }, context);
  assert.deepEqual(events, []);
  assert.deepEqual(snapshot, { status: 'error', pressureOk: true, online: true, holiday: false });
});

test('nothing changes, nothing fires', () => {
  assert.deepEqual(run(appliance, appliance), []);
});

test('a fault, then the recovery', () => {
  const fault = run(appliance, { ...appliance, errorStatus: 'Locking' });
  assert.deepEqual(fault, [
    {
      key: TRIGGERS.APPLIANCE_FAULT,
      data: {
        device: context.device,
        device_name: context.name,
        status: 'Locking',
        previous_status: 'running',
      },
    },
  ]);
  const back = run({ ...appliance, errorStatus: 'Locking' }, appliance);
  assert.equal(back[0].key, TRIGGERS.APPLIANCE_RECOVERED);
  assert.equal(back[0].data.status, 'Running');
  // From one fault to another: neither a new fault nor a recovery.
  assert.deepEqual(
    run({ ...appliance, errorStatus: 'Locking' }, { ...appliance, errorStatus: 'Blocking' }),
    [],
  );
});

test('the water pressure gets too low (not when it comes back)', () => {
  const low = run(appliance, { ...appliance, pressure: 0.6, pressureOk: false });
  assert.deepEqual(
    low.map((e) => [e.key, e.data.pressure]),
    [[TRIGGERS.WATER_PRESSURE_LOW, 0.6]],
  );
  assert.deepEqual(run({ ...appliance, pressureOk: false }, appliance), []);
});

test('offline, back online', () => {
  const off = run(appliance, { ...appliance, online: false });
  assert.deepEqual(
    off.map((e) => [e.key, e.data.state]),
    [[TRIGGERS.CONNECTION_CHANGED, 'offline']],
  );
  const on = run({ ...appliance, online: false }, appliance);
  assert.deepEqual(
    on.map((e) => [e.key, e.data.state]),
    [[TRIGGERS.CONNECTION_CHANGED, 'online']],
  );
});

test('a holiday starts with its day of return, then ends', () => {
  const holiday = { ...appliance, holidayActive: true, holidayEnd: '2026-11-22T00:00:01Z' };
  const start = run(appliance, holiday);
  assert.deepEqual(
    start.map((e) => [e.key, e.data.state, e.data.end]),
    [[TRIGGERS.HOLIDAY_CHANGED, 'started', '2026-11-22']],
  );
  const end = run(holiday, appliance);
  assert.deepEqual(
    end.map((e) => [e.data.state, e.data.end]),
    [['ended', '']],
  );
});

test('an unknown value keeps the last known one: no transition through null', () => {
  const before = snapshotOf(appliance);
  const blind = detectEvents(
    before,
    { ...appliance, errorStatus: null, pressureOk: null, online: null },
    context,
  );
  assert.deepEqual(blind.events, []);
  assert.deepEqual(blind.snapshot, before);
});

test('the data stays flat: scalars, 30 keys at most', () => {
  const events = run(appliance, {
    ...appliance,
    errorStatus: 'Error',
    pressureOk: false,
    online: false,
    holidayActive: true,
  });
  assert.equal(events.length, 4);
  for (const { data } of events) {
    assert.ok(Object.keys(data).length <= 30);
    for (const value of Object.values(data)) {
      assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
    }
  }
});

test('set_temporary: the temperature within the zone, a duration or the next switch', () => {
  assert.deepEqual(temporaryChange({ temperature: 21.3 }, salon), { setpoint: 21.5, minutes: 0 });
  assert.deepEqual(temporaryChange({ temperature: '22', minutes: '90' }, salon), {
    setpoint: 22,
    minutes: 90,
  });
  assert.deepEqual(temporaryChange({ temperature: 20, minutes: '' }, salon).minutes, 0);
  assert.throws(() => temporaryChange({}, salon), /temperature/);
  assert.throws(() => temporaryChange({ temperature: 29 }, etage), RangeError, 'max 28 here');
  assert.throws(
    () => temporaryChange({ temperature: 20, minutes: MAX_TEMPORARY_MINUTES + 1 }, salon),
    RangeError,
  );
});

test('clock program 1 to 3, holiday 0 to 365 days', () => {
  assert.equal(clockProgram('2'), 2);
  assert.throws(() => clockProgram('4'), RangeError);
  assert.throws(() => clockProgram(undefined), RangeError);
  assert.equal(holidayDays('7'), 7);
  assert.equal(holidayDays(0), 0);
  assert.throws(() => holidayDays(''), RangeError);
  assert.throws(() => holidayDays(400), RangeError);
  assert.equal(wholeNumber('2.4', 0, 5, 'x'), 2);
});
