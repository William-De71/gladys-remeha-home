// -----------------------------------------------------------------------------
// Made-up Remeha Home answers, shaped like the ones the community
// documentation of the API describes (see NOTICE): a hybrid heat pump with two
// climate zones and a hot water tank, its technical details and its daily
// energy. Never a real account.
// -----------------------------------------------------------------------------

import { createRemehaApi } from '../../src/remeha-api.js';

// 10:10 in Paris (UTC+1).
const T0 = Date.parse('2026-11-15T09:10:00Z');
const APPLIANCE_ID = '00000000-0000-0000-0000-00000000a001';
const SALON_ID = '00000000-0000-0000-0000-00000000c001';
const ETAGE_ID = '00000000-0000-0000-0000-00000000c002';
const DHW_ID = '00000000-0000-0000-0000-00000000d001';

const DASHBOARD = {
  appliances: [
    {
      applianceId: APPLIANCE_ID,
      applianceOnline: true,
      applianceConnectionStatus: 'Connected',
      applianceType: 'HeatPump',
      pairingStatus: 'Paired',
      houseName: 'Maison',
      errorStatus: 'Running',
      activeThermalMode: 'HeatingCH',
      operatingMode: 'AutomaticHeating',
      outdoorTemperatureInformation: {
        outdoorTemperatureSource: 'Wired',
        applianceOutdoorTemperature: 6.5,
        cloudOutdoorTemperature: 7,
        cloudOutdoorTemperatureStatus: 'Ok',
      },
      holidaySchedule: {
        startTime: '0001-01-01T00:00:01Z',
        endTime: '0001-01-01T00:00:01Z',
        active: false,
      },
      waterPressure: 1.7,
      waterPressureOK: true,
      capabilityEnergyConsumption: true,
      capabilityCooling: false,
      capabilityPreHeat: true,
      gasCalorificValue: 8.79,
      timeZone: 'Europe/Paris',
      hotWaterZones: [
        {
          hotWaterZoneId: DHW_ID,
          applianceId: APPLIANCE_ID,
          name: 'DHW',
          zoneType: 'DHW',
          dhwZoneMode: 'Scheduling',
          dhwStatus: 'Idle',
          dhwType: 'Tank',
          nextSwitchActivity: 'Comfort',
          capabilityBoostMode: true,
          dhwTemperature: 52.4,
          targetSetpoint: 55,
          reducedSetpoint: 40,
          comfortSetPoint: 55,
          setPointMin: 40,
          setPointMax: 65,
          setPointRanges: {
            comfortSetpointMin: 40,
            comfortSetpointMax: 65,
            reducedSetpointMin: 10,
            reducedSetpointMax: 60,
          },
          boostModeEndTime: null,
          nextSwitchTime: '2026-11-15T17:00:00Z',
          activeDwhTimeProgramNumber: 1,
        },
      ],
      climateZones: [
        {
          climateZoneId: SALON_ID,
          applianceId: APPLIANCE_ID,
          name: 'Salon',
          zoneType: 'CH',
          activeComfortDemand: 'ProducingHeat',
          zoneMode: 'Scheduling',
          controlStrategy: 'Automatic',
          firePlaceModeActive: false,
          capabilityFirePlaceMode: true,
          roomTemperature: 19.6,
          setPoint: 20,
          nextSetpoint: 17,
          nextSwitchTime: '2026-11-15T22:30:00Z',
          setPointMin: 5,
          setPointMax: 30,
          currentScheduleSetPoint: 20,
          activeHeatingClimateTimeProgramNumber: 1,
          capabilityCooling: false,
          capabilityTemporaryOverrideEndTime: true,
          preHeat: { enabled: true, active: false },
          temporaryOverride: { endTime: '0001-01-01T00:00:00Z' },
        },
        {
          climateZoneId: ETAGE_ID,
          applianceId: APPLIANCE_ID,
          name: 'Étage',
          zoneType: 'CH',
          activeComfortDemand: 'Idle',
          zoneMode: 'Manual',
          controlStrategy: 'RoomTemperatureOnly',
          firePlaceModeActive: false,
          capabilityFirePlaceMode: false,
          roomTemperature: 18.2,
          setPoint: 18,
          nextSetpoint: 18,
          nextSwitchTime: '2026-11-15T22:00:00Z',
          setPointMin: 5,
          setPointMax: 28,
          currentScheduleSetPoint: 19,
          activeHeatingClimateTimeProgramNumber: 2,
          capabilityCooling: false,
          capabilityTemporaryOverrideEndTime: false,
          preHeat: { enabled: false, active: false },
          temporaryOverride: { endTime: '0001-01-01T00:00:00Z' },
        },
      ],
      solarThermals: [],
    },
  ],
};

const DETAILS = {
  applianceName: 'Elga Ace',
  internetConnectedGateways: [
    { deviceTypeName: 'RU2', name: 'RU2', softwareVersion: '2.28.6', hardwareVersion: '9' },
  ],
  peripherals: [],
};

const item = (day, heating, hotWater, stamp = `${day}T00:00:00+00:00`) => ({
  isDataReported: true,
  timeStamp: stamp,
  heatingEnergyConsumed: heating,
  hotWaterEnergyConsumed: hotWater,
  coolingEnergyConsumed: 0,
  heatingEnergyDelivered: heating * 3,
  hotWaterEnergyDelivered: 0,
  coolingEnergyDelivered: 0,
});
// Eight days: the running day (15) is stamped with the UTC time of its latest data.
const ENERGY = {
  data: [
    item('2026-11-08', 20, 3),
    item('2026-11-09', 22, 3),
    item('2026-11-10', 18, 2),
    item('2026-11-11', 25, 4),
    item('2026-11-12', 21, 3),
    item('2026-11-13', 19, 3),
    item('2026-11-14', 23, 4),
    item('2026-11-15', 6, 1, '2026-11-15T07:00:00+00:00'),
  ],
};

const copy = (value) => JSON.parse(JSON.stringify(value));

/**
 * @description A deep copy of the dashboard, changed by a function.
 * @param {Function} [change] - `(copy) => void`.
 * @returns {object} The copy.
 */
function variant(change = () => {}) {
  const dashboard = copy(DASHBOARD);
  change(dashboard);
  return dashboard;
}

/**
 * @description A fake Remeha API (no network): the answers it serves, the
 * writes it receives, an error to throw once.
 * @param {object} [options] - Answers to start from.
 * @returns {object} The fake API.
 */
function fakeApi({ dashboard = DASHBOARD, energy = ENERGY } = {}) {
  const fake = {
    dashboard: copy(dashboard),
    energy: copy(energy),
    details: copy(DETAILS),
    calls: [],
    writes: [],
    credentials: null,
    failNext: null,
    // Method name -> error thrown on every call.
    failOn: {},
    setCredentials(email, secret) {
      fake.credentials = email && secret ? { email, secret } : null;
    },
    hasCredentials: () => fake.credentials !== null,
    requestsLastHour: () => fake.calls.length,
    enter(name) {
      fake.calls.push(name);
      if (fake.failOn[name]) throw fake.failOn[name];
      if (fake.failNext) {
        const error = fake.failNext;
        fake.failNext = null;
        throw error;
      }
    },
    async getDashboard() {
      fake.enter('getDashboard');
      return copy(fake.dashboard);
    },
    async getTechnicalDetails() {
      fake.enter('getTechnicalDetails');
      return copy(fake.details);
    },
    async getDailyEnergy(id, from, to) {
      fake.enter(`getDailyEnergy:${from}:${to}`);
      return copy(fake.energy);
    },
  };
  const write = (name) =>
    async function (...args) {
      fake.enter(name);
      fake.writes.push([name, ...args]);
    };
  for (const name of [
    'setHoliday',
    'setZoneSchedule',
    'setZoneTemporary',
    'setZoneManual',
    'setZoneOff',
    'activateProgram',
    'setFireplace',
    'setHotWaterMode',
    'setHotWaterComfort',
  ]) {
    fake[name] = write(name);
  }
  return fake;
}

/**
 * @description A fake `fetch` answering from a handler.
 * @param {Function} handler - `(url, init, n) => { status, body?, text?, headers? }`.
 * @returns {Function & { requests: object[] }} The fetch.
 */
function fakeFetch(handler) {
  const requests = [];
  const impl = async (url, init = {}) => {
    requests.push({ url: String(url), ...init });
    const answer = await handler(String(url), init, requests.length);
    const text = answer.text ?? (answer.body === undefined ? '' : JSON.stringify(answer.body));
    const headers = new Headers();
    for (const [key, value] of Object.entries(answer.headers ?? {})) {
      for (const one of [].concat(value)) headers.append(key, one);
    }
    return { status: answer.status ?? 200, headers, text: async () => text };
  };
  impl.requests = requests;
  return impl;
}

/**
 * @description A real API client on a fake fetch and a fake clock.
 * @param {Function} handler - The fetch handler.
 * @returns {{ api: object, fetch: Function, clock: object }} The client.
 */
function apiWithFetch(handler) {
  const clock = { now: 1_800_000_000_000, slept: [] };
  const fetchImpl = fakeFetch(handler);
  const api = createRemehaApi({
    fetchImpl,
    now: () => clock.now,
    sleep: async (ms) => {
      clock.slept.push(ms);
      clock.now += ms;
    },
    random: (bytes) => Buffer.alloc(bytes, 7),
  });
  return { api, fetch: fetchImpl, clock };
}

// The answers of a login that works (fake values).
const LOGIN_PAGE = {
  status: 200,
  headers: {
    'x-request-id': 'request-1',
    'set-cookie': ['x-ms-cpim-csrf=csrf-1; path=/', 'x-ms-cpim-trans=trans-1; path=/'],
  },
  text: '<script>var SETTINGS = {"csrf":"csrf-1","transId":"StateProperties=abc"};</script>',
};
const LOGIN_OK = { status: 200, body: { status: '200' } };
const LOGIN_CONFIRMED = {
  status: 302,
  headers: { location: 'com.b2c.remehaapp://login-callback?state=x&code=code-1' },
};
const TOKENS = (n = 1) => ({
  status: 200,
  body: {
    access_token: `access-${n}`,
    refresh_token: `refresh-${n}`,
    expires_in: 3600,
    token_type: 'Bearer',
  },
});

/**
 * @description A handler for the login, then `api(url, init, n)` for the API.
 * @param {Function} api - The API handler.
 * @param {object} [login] - Answers to replace (`{ asserted, token }`).
 * @returns {Function} The fetch handler.
 */
function loginThen(api, { asserted = LOGIN_OK, token = TOKENS() } = {}) {
  return (url, init, n) => {
    if (url.includes('/oauth2/v2.0/authorize')) return LOGIN_PAGE;
    if (url.includes('/SelfAsserted')) return asserted;
    if (url.includes('/confirmed')) return LOGIN_CONFIRMED;
    if (url.includes('/oauth2/v2.0/token'))
      return typeof token === 'function' ? token(init) : token;
    return api(url, init, n);
  };
}

// Ids of the fake Gladys (selector "test-integration").
const fakeGladys = {
  externalIds: (type, id) => {
    const device = `ext:test-integration:${type}:${id}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
};

export {
  T0,
  APPLIANCE_ID,
  SALON_ID,
  ETAGE_ID,
  DHW_ID,
  DASHBOARD,
  DETAILS,
  ENERGY,
  item,
  variant,
  fakeApi,
  fakeFetch,
  apiWithFetch,
  LOGIN_PAGE,
  LOGIN_OK,
  LOGIN_CONFIRMED,
  TOKENS,
  loginThen,
  fakeGladys,
};
