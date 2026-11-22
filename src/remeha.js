// -----------------------------------------------------------------------------
// The Remeha Home data model: the dashboard parsed into appliances, climate
// zones and hot water zones; the times of the API; the energy of each day
// cumulated into an index.
//
// Every field is read defensively: the fields differ per appliance (gas
// boiler, heat pump, hybrid), a missing one is `null`, a wrong shape is an
// empty list. The facts below come from the community documentation of the
// API (see NOTICE):
//   - most times are LOCAL times of the appliance written with a `Z`
//     (`nextSwitchTime`); `temporaryOverride.endTime` and `boostModeEndTime`
//     are real UTC; a time in the year 1 means "not set";
//   - `zoneMode`: Scheduling, TemporaryOverride, Manual, FrostProtection;
//   - `dhwZoneMode`: Scheduling, ContinuousComfort, Off (Eco in the app), Boost;
//   - the daily energy: one item per day of the appliance, the running day
//     stamped with the UTC time of its latest data; a day only goes up, and
//     its last hours may still arrive after midnight.
// -----------------------------------------------------------------------------

import { THERMOSTAT_MODE, THERMOSTAT_OPERATING_STATE, WATER_HEATER_MODE } from './constants.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const KINDS = { APPLIANCE: 'appliance', ZONE: 'zone', HOT_WATER: 'hot_water' };
// Days of energy kept per appliance (the widget shows 7, yesterday may still grow).
const KEPT_DAYS = 10;
// More than this in one day of one appliance is a wrong figure, not energy.
const MAX_DAY_KWH = 1000;

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const num = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const bool = (value) => (typeof value === 'boolean' ? value : null);
const list = (value) => (Array.isArray(value) ? value : []);
const id = (value) =>
  value === null || value === undefined || value === '' ? null : String(value);

/**
 * @description A time of the API, or null when not set (year 1, or unreadable).
 * @param {unknown} raw - The time.
 * @returns {string|null} The time as written.
 */
function setTime(raw) {
  const value = text(raw);
  const year = Number(value.slice(0, 4));
  if (!value || !Number.isFinite(year) || year < 1000 || Number.isNaN(Date.parse(value))) {
    return null;
  }
  return value;
}

/**
 * @description The wall-clock part of a local time written with a Z:
 * `2026-10-22T22:00:00Z` -> `2026-10-22T22:00`.
 * @param {unknown} raw - The time.
 * @returns {string|null} `YYYY-MM-DDTHH:mm`, or null.
 */
function wallClock(raw) {
  const value = setTime(raw);
  return value ? value.slice(0, 16) : null;
}

/**
 * @description The time on site of an instant: `YYYY-MM-DDTHH:mm:00`.
 * @param {number} ms - The instant.
 * @param {string} timezone - IANA timezone.
 * @returns {string} The local time.
 */
function localStamp(ms, timezone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(ms);
  } catch {
    return `${new Date(ms).toISOString().slice(0, 16)}:00`;
  }
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00`;
}

/** @description The day on site of an instant, `YYYY-MM-DD`. */
const localDay = (ms, timezone) => localStamp(ms, timezone).slice(0, 10);

/**
 * @description The day `n` days before a day.
 * @param {string} day - `YYYY-MM-DD`.
 * @param {number} n - Days back.
 * @returns {string} `YYYY-MM-DD`.
 */
const daysBefore = (day, n) =>
  new Date(Date.parse(`${day}T12:00:00Z`) - n * DAY_MS).toISOString().slice(0, 10);

/**
 * @description Parse a climate zone.
 * @param {object} raw - A climate zone of the dashboard.
 * @param {object} appliance - Its parsed appliance.
 * @returns {object|null} The zone.
 */
function parseZone(raw, appliance) {
  const zoneId = id(raw?.climateZoneId);
  if (!zoneId) return null;
  const canFireplace = raw.capabilityFirePlaceMode === true;
  return {
    kind: KINDS.ZONE,
    id: zoneId,
    applianceId: appliance.id,
    house: appliance.name,
    name: text(raw.name),
    mode: text(raw.zoneMode) || null,
    demand: text(raw.activeComfortDemand) || null,
    room: num(raw.roomTemperature),
    setpoint: num(raw.setPoint),
    min: num(raw.setPointMin) ?? 5,
    max: num(raw.setPointMax) ?? 30,
    nextSetpoint: num(raw.nextSetpoint),
    nextSwitch: wallClock(raw.nextSwitchTime),
    scheduleSetpoint: num(raw.currentScheduleSetPoint),
    program: [1, 2, 3].includes(num(raw.activeHeatingClimateTimeProgramNumber))
      ? num(raw.activeHeatingClimateTimeProgramNumber)
      : 1,
    canFireplace,
    fireplace: canFireplace ? bool(raw.firePlaceModeActive) : null,
    canOverrideEnd: raw.capabilityTemporaryOverrideEndTime === true,
    overrideEnd: setTime(raw.temporaryOverride?.endTime),
    preHeat: bool(raw.preHeat?.active),
    canCool: raw.capabilityCooling === true || appliance.canCool,
  };
}

/**
 * @description Parse a hot water zone.
 * @param {object} raw - A hot water zone of the dashboard.
 * @param {object} appliance - Its parsed appliance.
 * @returns {object|null} The zone.
 */
function parseHotWater(raw, appliance) {
  const zoneId = id(raw?.hotWaterZoneId);
  if (!zoneId) return null;
  const ranges = raw.setPointRanges ?? {};
  return {
    kind: KINDS.HOT_WATER,
    id: zoneId,
    applianceId: appliance.id,
    house: appliance.name,
    name: text(raw.name),
    mode: text(raw.dhwZoneMode) || null,
    status: text(raw.dhwStatus) || null,
    type: text(raw.dhwType) || null,
    temperature: num(raw.dhwTemperature),
    comfort: num(raw.comfortSetPoint),
    reduced: num(raw.reducedSetpoint),
    target: num(raw.targetSetpoint),
    min: num(ranges.comfortSetpointMin) ?? num(raw.setPointMin) ?? 40,
    max: num(ranges.comfortSetpointMax) ?? num(raw.setPointMax) ?? 65,
    nextSwitch: wallClock(raw.nextSwitchTime),
    nextActivity: text(raw.nextSwitchActivity) || null,
    canBoost: raw.capabilityBoostMode === true,
    boostEnd: setTime(raw.boostModeEndTime),
  };
}

/**
 * @description Parse the dashboard.
 * @param {object} body - The answer of GET /homes/dashboard.
 * @returns {{ appliances: object[], zones: object[], hotWaters: object[] }} The models.
 */
function parseDashboard(body) {
  const appliances = [];
  const zones = [];
  const hotWaters = [];
  for (const raw of list(body?.appliances)) {
    const applianceId = id(raw?.applianceId);
    if (!applianceId) continue;
    const outdoor = raw.outdoorTemperatureInformation ?? {};
    const local = num(outdoor.applianceOutdoorTemperature);
    const cloud = num(outdoor.cloudOutdoorTemperature);
    const holiday = raw.holidaySchedule ?? {};
    const appliance = {
      kind: KINDS.APPLIANCE,
      id: applianceId,
      name: text(raw.houseName),
      type: text(raw.applianceType) || null,
      online: bool(raw.applianceOnline),
      errorStatus: text(raw.errorStatus) || null,
      operatingMode: text(raw.operatingMode) || null,
      thermalMode: text(raw.activeThermalMode) || null,
      pressure: num(raw.waterPressure),
      pressureOk: bool(raw.waterPressureOK),
      outdoor: local ?? cloud,
      outdoorSource: local !== null ? 'appliance' : cloud !== null ? 'cloud' : null,
      holidayActive: holiday.active === true,
      holidayStart: setTime(holiday.startTime),
      holidayEnd: setTime(holiday.endTime),
      canEnergy: raw.capabilityEnergyConsumption === true,
      canCool: raw.capabilityCooling === true,
      timezone: text(raw.timeZone) || null,
    };
    appliances.push(appliance);
    for (const zone of list(raw.climateZones)) {
      const parsed = parseZone(zone, appliance);
      if (parsed) zones.push(parsed);
    }
    for (const zone of list(raw.hotWaterZones)) {
      const parsed = parseHotWater(zone, appliance);
      if (parsed) hotWaters.push(parsed);
    }
  }
  return { appliances, zones, hotWaters };
}

// --- Gladys values ---------------------------------------------------------------

const ZONE_MODE_TO_GLADYS = {
  Scheduling: THERMOSTAT_MODE.AUTO,
  TemporaryOverride: THERMOSTAT_MODE.AUTO,
  Manual: THERMOSTAT_MODE.HEATING,
  FrostProtection: THERMOSTAT_MODE.OFF,
};

/** @description thermostat/mode of a zone (null: unknown). */
const zoneMode = (zone) => ZONE_MODE_TO_GLADYS[zone.mode] ?? null;

/**
 * @description thermostat/operating-state of a zone.
 * @param {object} zone - A parsed zone.
 * @returns {number|null} IDLE, HEATING or COOLING.
 */
function operatingState(zone) {
  if (!zone.demand) return null;
  if (/heat/i.test(zone.demand)) return THERMOSTAT_OPERATING_STATE.HEATING;
  if (/cold|cool/i.test(zone.demand)) return THERMOSTAT_OPERATING_STATE.COOLING;
  return THERMOSTAT_OPERATING_STATE.IDLE;
}

const HOT_WATER_MODE_TO_GLADYS = {
  Scheduling: WATER_HEATER_MODE.PROGRAM,
  ContinuousComfort: WATER_HEATER_MODE.MANUAL,
  Off: WATER_HEATER_MODE.ECO,
  Boost: WATER_HEATER_MODE.BOOST,
};
// The request that sets each Gladys water heater mode.
const HOT_WATER_MODE_REQUEST = {
  [WATER_HEATER_MODE.PROGRAM]: 'schedule',
  [WATER_HEATER_MODE.MANUAL]: 'continuous-comfort',
  [WATER_HEATER_MODE.ECO]: 'anti-frost',
  [WATER_HEATER_MODE.BOOST]: 'boost',
};
// The dhwZoneMode each request leads to.
const HOT_WATER_MODE_OF_REQUEST = {
  schedule: 'Scheduling',
  'continuous-comfort': 'ContinuousComfort',
  'anti-frost': 'Off',
  boost: 'Boost',
};

/** @description water-heater/mode of a hot water zone (null: unknown). */
const hotWaterMode = (zone) => HOT_WATER_MODE_TO_GLADYS[zone.mode] ?? null;

/** @description Whether the water is being heated (null: unknown). */
const hotWaterHeating = (zone) =>
  zone.status ? /heat/i.test(zone.status) && !/low/i.test(zone.status) : null;

/**
 * @description A short word for what a zone does, used by triggers and widgets:
 * schedule, override, manual, off.
 * @param {object} zone - A parsed zone.
 * @returns {string|null} The word.
 */
function zoneState(zone) {
  return (
    {
      Scheduling: 'schedule',
      TemporaryOverride: 'override',
      Manual: 'manual',
      FrostProtection: 'off',
    }[zone.mode] ?? null
  );
}

/**
 * @description A short word for the hot water mode: schedule, comfort, eco, boost.
 * @param {object} zone - A parsed hot water zone.
 * @returns {string|null} The word.
 */
function hotWaterState(zone) {
  return (
    { Scheduling: 'schedule', ContinuousComfort: 'comfort', Off: 'eco', Boost: 'boost' }[
      zone.mode
    ] ?? null
  );
}

/**
 * @description Round a setpoint to its step and check it against the bounds.
 * @param {unknown} raw - The value asked for.
 * @param {{min: number, max: number}} range - The bounds.
 * @param {number} step - The step.
 * @returns {number} The setpoint.
 * @throws {RangeError} Not a number, or out of the bounds.
 */
function checkSetpoint(raw, { min, max }, step) {
  const value = num(raw);
  if (value === null) throw new RangeError(`"${String(raw).slice(0, 20)}" is not a temperature`);
  const rounded = Math.round(value / step) * step;
  if (rounded < min || rounded > max) {
    throw new RangeError(`${rounded} °C is outside ${min} to ${max} °C`);
  }
  return Math.round(rounded * 10) / 10;
}

// --- Energy ------------------------------------------------------------------------

/**
 * @description The day of an item of the daily energy. A completed day is
 * stamped `<day>T00:00:00+00:00`; the running day carries the UTC time of its
 * latest data, whose day is read on site (after midnight it can still show
 * yesterday's date in UTC).
 * @param {unknown} stamp - `timeStamp` of the item.
 * @param {string} timezone - IANA timezone of the appliance.
 * @returns {string|null} `YYYY-MM-DD`.
 */
function energyDay(stamp, timezone) {
  const value = text(stamp);
  const ms = Date.parse(value);
  if (!value || Number.isNaN(ms)) return null;
  if (/T00:00:00(\.0+)?(Z|\+00:00)$/.test(value)) return value.slice(0, 10);
  return localDay(ms, timezone);
}

/**
 * @description The figures of one day: kWh consumed for heating, hot water,
 * cooling, and their total (null when the item carries none).
 * @param {object} item - An item of the daily energy.
 * @returns {{ heating: number, hotWater: number, cooling: number, total: number }|null} The figures.
 */
function dayFigures(item) {
  const heating = num(item?.heatingEnergyConsumed);
  const hotWater = num(item?.hotWaterEnergyConsumed);
  const cooling = num(item?.coolingEnergyConsumed);
  if (heating === null && hotWater === null && cooling === null) return null;
  const figures = { heating: heating ?? 0, hotWater: hotWater ?? 0, cooling: cooling ?? 0 };
  return { ...figures, total: figures.heating + figures.hotWater + figures.cooling };
}

/**
 * @description Cumulate the daily energy into an index. A day only goes up:
 * only the increase over what was already counted for that day is added; a
 * lower figure (the zeros right after midnight) is ignored. The first reading
 * starts the index at the energy of today and counts nothing of the past.
 * @param {object|null} record - `{ kwh, days: { day: figures } }` (null: none yet).
 * @param {object[]} items - `data` of the daily energy.
 * @param {string} timezone - IANA timezone of the appliance.
 * @param {string} today - The day on site.
 * @returns {{ record: object, deltaKwh: number }} The new record.
 */
function accountDays(record, items, timezone, today) {
  const first = !record || typeof record !== 'object' || !Number.isFinite(record.kwh);
  const days = first ? {} : { ...(record.days ?? {}) };
  let kwh = first ? 0 : record.kwh;
  let deltaKwh = 0;
  for (const item of list(items)) {
    const day = energyDay(item?.timeStamp, timezone);
    const figures = dayFigures(item);
    if (!day || !figures || figures.total < 0 || figures.total > MAX_DAY_KWH) continue;
    const before = days[day];
    const counted = before?.total ?? null;
    if (counted !== null && figures.total <= counted) continue;
    if (first) {
      if (day === today) kwh += figures.total;
    } else {
      const added = figures.total - (counted ?? 0);
      // A day older than the record itself: its energy belongs to the past.
      if (counted !== null || day >= (record.since ?? '')) {
        kwh += added;
        deltaKwh += added;
      }
    }
    days[day] = figures;
  }
  const kept = Object.keys(days).sort().slice(-KEPT_DAYS);
  return {
    record: {
      kwh: Math.round(kwh * 1000) / 1000,
      since: first ? today : (record.since ?? today),
      days: Object.fromEntries(kept.map((day) => [day, days[day]])),
    },
    deltaKwh: Math.round(deltaKwh * 1000) / 1000,
  };
}

export {
  HOUR_MS,
  DAY_MS,
  KINDS,
  KEPT_DAYS,
  MAX_DAY_KWH,
  setTime,
  wallClock,
  localStamp,
  localDay,
  daysBefore,
  parseDashboard,
  zoneMode,
  operatingState,
  hotWaterMode,
  hotWaterHeating,
  zoneState,
  hotWaterState,
  checkSetpoint,
  HOT_WATER_MODE_REQUEST,
  HOT_WATER_MODE_OF_REQUEST,
  energyDay,
  dayFigures,
  accountDays,
};
