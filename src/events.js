// -----------------------------------------------------------------------------
// Scene triggers and scene actions.
//
// Triggers fire on a TRANSITION between two readings of an appliance, never on
// a snapshot: the first reading only sets the baseline. The last values are
// kept in /data across restarts (state.js), so a change that happened while
// the integration restarted still fires once, and nothing fires twice. They
// tell what the appliance itself reports (a fault, the water pressure, the
// connection to the Remeha cloud, a holiday): no command of the integration
// can cause them, so a scene bound to them cannot loop.
// -----------------------------------------------------------------------------

import { checkSetpoint } from './remeha.js';
import { ZONE_STEP } from './device.js';

const TRIGGERS = {
  APPLIANCE_FAULT: 'appliance_fault',
  APPLIANCE_RECOVERED: 'appliance_recovered',
  WATER_PRESSURE_LOW: 'water_pressure_low',
  CONNECTION_CHANGED: 'connection_changed',
  HOLIDAY_CHANGED: 'holiday_changed',
};

const SCENE_ACTIONS = {
  SET_TEMPORARY: 'set_temporary',
  SET_CLOCK_PROGRAM: 'set_clock_program',
  SET_HOLIDAY: 'set_holiday',
  HOT_WATER_BOOST: 'hot_water_boost',
  REFRESH: 'refresh',
};

// The status of an appliance that runs normally.
const RUNNING = 'running';
// A temporary temperature lasts this long at most (minutes).
const MAX_TEMPORARY_MINUTES = 7 * 24 * 60;
// A holiday lasts this long at most (days).
const MAX_HOLIDAY_DAYS = 365;

const given = (value) => value !== undefined && value !== null && value !== '';

/**
 * @description What is remembered of an appliance between two readings.
 * @param {object} appliance - A parsed appliance.
 * @returns {{ status: string|null, pressureOk: boolean|null, online: boolean|null,
 *   holiday: boolean }} The snapshot.
 */
function snapshotOf(appliance) {
  return {
    status: appliance.errorStatus ? appliance.errorStatus.toLowerCase() : null,
    pressureOk: appliance.pressureOk,
    online: appliance.online,
    holiday: appliance.holidayActive,
  };
}

/**
 * @description The scene events of a new reading of an appliance.
 * @param {object|null} previous - The snapshot of the previous reading (null:
 *   first reading, nothing fires).
 * @param {object} appliance - The parsed appliance.
 * @param {object} context - Context.
 * @param {string} context.device - The Gladys external id of the appliance.
 * @param {string} context.name - Its name.
 * @returns {{ events: Array<{key: string, data: object}>, snapshot: object }} The events.
 */
function detectEvents(previous, appliance, context) {
  const snapshot = snapshotOf(appliance);
  // An unknown value keeps the last known one: no reading, no transition.
  for (const key of ['status', 'pressureOk', 'online']) {
    if (snapshot[key] === null && previous && previous[key] !== null) snapshot[key] = previous[key];
  }
  const events = [];
  if (!previous) return { events, snapshot };
  const base = { device: context.device, device_name: context.name };

  if (previous.status && snapshot.status && previous.status !== snapshot.status) {
    if (previous.status === RUNNING) {
      events.push({
        key: TRIGGERS.APPLIANCE_FAULT,
        data: { ...base, status: appliance.errorStatus, previous_status: previous.status },
      });
    } else if (snapshot.status === RUNNING) {
      events.push({
        key: TRIGGERS.APPLIANCE_RECOVERED,
        data: { ...base, status: appliance.errorStatus, previous_status: previous.status },
      });
    }
  }
  if (previous.pressureOk === true && snapshot.pressureOk === false) {
    events.push({
      key: TRIGGERS.WATER_PRESSURE_LOW,
      data: { ...base, pressure: appliance.pressure },
    });
  }
  if (
    typeof previous.online === 'boolean' &&
    typeof snapshot.online === 'boolean' &&
    previous.online !== snapshot.online
  ) {
    events.push({
      key: TRIGGERS.CONNECTION_CHANGED,
      data: { ...base, state: snapshot.online ? 'online' : 'offline' },
    });
  }
  if (Boolean(previous.holiday) !== snapshot.holiday) {
    events.push({
      key: TRIGGERS.HOLIDAY_CHANGED,
      data: {
        ...base,
        state: snapshot.holiday ? 'started' : 'ended',
        end: snapshot.holiday ? (appliance.holidayEnd ?? '').slice(0, 10) : '',
      },
    });
  }
  return { events, snapshot };
}

/**
 * @description Read a whole number field of a scene action.
 * @param {unknown} raw - The resolved value.
 * @param {number} min - Lowest value.
 * @param {number} max - Highest value.
 * @param {string} what - Its name, for the error.
 * @returns {number} The value.
 * @throws {RangeError} Not a number, or out of the bounds.
 */
function wholeNumber(raw, min, max, what) {
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.round(value) < min || Math.round(value) > max) {
    throw new RangeError(`${what} must be between ${min} and ${max}`);
  }
  return Math.round(value);
}

/**
 * @description The fields of set_temporary.
 * @param {object} fields - `{ temperature, minutes? }`.
 * @param {object} zone - The parsed zone (its bounds).
 * @returns {{ setpoint: number, minutes: number }} minutes 0: until the next switch.
 */
function temporaryChange(fields, zone) {
  if (!given(fields.temperature)) throw new RangeError('Give the temperature');
  return {
    setpoint: checkSetpoint(fields.temperature, zone, ZONE_STEP),
    minutes: given(fields.minutes)
      ? wholeNumber(fields.minutes, 0, MAX_TEMPORARY_MINUTES, 'The duration')
      : 0,
  };
}

/**
 * @description The clock program of set_clock_program.
 * @param {unknown} raw - "1", "2" or "3".
 * @returns {number} The program.
 */
const clockProgram = (raw) => wholeNumber(raw, 1, 3, 'The clock program');

/**
 * @description The number of days of set_holiday (0: cancel).
 * @param {unknown} raw - The resolved value.
 * @returns {number} Days.
 */
const holidayDays = (raw) =>
  wholeNumber(given(raw) ? raw : NaN, 0, MAX_HOLIDAY_DAYS, 'The number of days');

export {
  TRIGGERS,
  SCENE_ACTIONS,
  RUNNING,
  MAX_TEMPORARY_MINUTES,
  MAX_HOLIDAY_DAYS,
  snapshotOf,
  detectEvents,
  wholeNumber,
  temporaryChange,
  clockProgram,
  holidayDays,
};
