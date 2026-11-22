// -----------------------------------------------------------------------------
// The Remeha Home integration: every handler, registered on a Gladys client.
//
//   - one request, `GET /homes/dashboard`, reads every appliance, climate zone
//     and hot water zone at the chosen interval (1, 2, 5 or 10 minutes) on the
//     integration's own clock: the devices are never polled by Gladys
//     (`should_poll: false`). The energy of the last days is read every 15
//     minutes (Remeha fills it about 2 hours late), the technical details of
//     an appliance once;
//   - one Gladys device per climate zone (thermostat), per hot water zone
//     (water heater) and per appliance (device.js); only the changed states
//     are published (publishChangedStates, with a 30-minute heartbeat); the
//     daily energy is cumulated into an index (remeha.js);
//   - a command (a feature, a scene action, a widget button) is shown at once
//     and sent without waiting; one reading follows to confirm it. Meanwhile,
//     and for 3 minutes at most, the commanded values win over what the cloud
//     still returns;
//   - scene triggers on transitions of the appliance (events.js), scene
//     actions, three widgets (widgets.js), one configuration button ("Test
//     the connection").
//
// Transport: cloud (Remeha Home API). index.js only creates the SDK client;
// the tests drive this module with the fake Gladys of the SDK and a fake API.
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  readLanguage,
  guessLanguage,
  resolveTimezone,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
} from './config.js';
import {
  KINDS,
  HOUR_MS,
  parseDashboard,
  checkSetpoint,
  accountDays,
  localDay,
  localStamp,
  daysBefore,
  zoneState,
  hotWaterState,
  HOT_WATER_MODE_REQUEST,
  HOT_WATER_MODE_OF_REQUEST,
  KEPT_DAYS,
} from './remeha.js';
import { createRemehaApi, CredentialsError, RateLimitError, ApiError } from './remeha-api.js';
import {
  buildDevice,
  buildStates,
  featuresOf,
  idsOf,
  deviceName,
  discoverySignature,
  ZONE_STEP,
  HOT_WATER_STEP,
} from './device.js';
import { THERMOSTAT_MODE, WATER_HEATER_MODE } from './constants.js';
import {
  TRIGGERS,
  SCENE_ACTIONS,
  detectEvents,
  temporaryChange,
  clockProgram,
  holidayDays,
} from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  MAX_ITEMS,
  buildZonesWidget,
  buildEnergyWidget,
  buildStatusWidget,
  energySummary,
} from './widgets.js';
import { createState, DEFAULT_PATH } from './state.js';
import { t, all, isLanguage } from './i18n.js';

const ACTIONS = { TEST: 'test_connection' };
// The clock: the due readings are checked this often.
const TICK_MS = 10 * 1000;
// The reading that confirms a command comes this long after it (Remeha shows a
// change a few seconds late).
const CONFIRM_DELAY_MS = 8 * 1000;
// The commanded values win over the cloud answers this long at most.
const PENDING_MS = 3 * 60 * 1000;
// A holiday the integration set never fires "holiday changed" within this delay.
const EXPECTED_MS = 10 * 60 * 1000;
// A refresh button or action reads again only past this delay.
const MIN_MANUAL_GAP_MS = 30 * 1000;
// The energy of the last days is read this often.
const ENERGY_MS = 15 * 60 * 1000;
// The technical details of an appliance are asked again this often.
const DETAILS_MS = 7 * 24 * HOUR_MS;
// Refused credentials are tried again this often.
const REFUSED_RETRY_MS = 30 * 60 * 1000;
// Slow-down after a 429: the interval doubles each time, up to this.
const MAX_PAUSE_MS = 30 * 60 * 1000;
// requestWidgetRefresh: at most once every 10 s per widget.
const WIDGET_REFRESH_GAP_MS = 10 * 1000;
// publishChangedStates also re-sends an unchanged value this old.
const HEARTBEAT_MS = 30 * 60 * 1000;
// The fields a command can change before the cloud confirms them.
const PENDING_KEYS = ['mode', 'setpoint', 'program', 'fireplace', 'comfort'];

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {object} [options.api] - A Remeha API client (tests).
 * @param {Function} [options.now] - `() => ms` (tests).
 * @param {string|null} [options.statePath] - File of the state (null: memory).
 * @param {number} [options.tickMs] - Clock period, 0 for none (tests).
 * @param {string} [options.timezone] - IANA timezone of Gladys (language
 *   guess, and the days when Remeha gives no timezone for the appliance).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    api = createRemehaApi(),
    now = () => Date.now(),
    statePath = DEFAULT_PATH,
    tickMs = TICK_MS,
    timezone = resolveTimezone(),
    logger = sdkLogger,
  } = {},
) {
  const state = createState({ path: statePath, logger });
  let config = normalizeConfig({});
  let language = null;
  // id -> parsed model as the cloud returned it. What Gladys sees is this
  // with the commanded values on top (view()).
  let cloud = new Map();
  let energyAt = -Infinity;
  const detailsAt = new Map();
  let lastDiscovery = null;
  let connection = 'unknown';
  let connectionDetail = null;
  let lastSuccessAt = 0;
  let lastAttemptAt = 0;
  let nextPollAt = 0;
  let pausedUntil = 0;
  let backoff = 0;
  let lastStatus = null;
  let polling = null;
  let timer = null;
  let running = Promise.resolve();
  // id -> { mode?, setpoint?, program?, fireplace?, comfort?, until }.
  const pending = new Map();
  // appliance id -> until: a holiday the integration set.
  const expectedHoliday = new Map();
  const widgetRefreshedAt = new Map();

  const textLanguage = () =>
    config.language !== AUTO_LANGUAGE ? config.language : (language ?? guessLanguage(timezone));
  const intervalMs = () => config.refreshMinutes * 60 * 1000;
  const all_ = () => [...cloud.values()].map(view);
  const ofKind = (kind) => all_().filter((model) => model.kind === kind);
  const appliances = () => ofKind(KINDS.APPLIANCE);
  const zones = () => ofKind(KINDS.ZONE);
  const hotWaters = () => ofKind(KINDS.HOT_WATER);
  const modelOf = (id) => (cloud.has(id) ? view(cloud.get(id)) : null);
  const timezoneOf = (model) => {
    const owner = model?.kind === KINDS.APPLIANCE ? model : cloud.get(model?.applianceId);
    return owner?.timezone || timezone;
  };
  const nameOf = (model) => deviceName(model, textLanguage());
  const createdIds = () => new Set((gladys.devices ?? []).map((device) => device.external_id));
  const externalIdOf = (model) => idsOf(gladys, model).device;
  const byExternalId = (externalId) =>
    all_().find((model) => externalIdOf(model) === externalId) ?? null;
  const sortByName = (list) => list.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  // --- Publishing ---------------------------------------------------------------

  /** @description Offer every appliance and zone on the Discovery screen. */
  async function publishDiscovery({ force = false } = {}) {
    if (!gladys.connected) return;
    const list = all_();
    const signature = discoverySignature(gladys, list, textLanguage());
    if (!force && signature === lastDiscovery) return;
    try {
      await gladys.publishDiscoveredDevices(
        list.map((model) => buildDevice(gladys, model, textLanguage())),
      );
      lastDiscovery = signature;
    } catch (err) {
      logger.error('Unable to publish the discovered devices', err);
    }
  }

  /**
   * @description Publish the changed states of the devices the user created.
   * @param {object[]} list - Parsed models.
   */
  async function publishStates(list) {
    if (!gladys.connected) return;
    const created = createdIds();
    const states = list
      .filter((model) => created.has(externalIdOf(model)))
      .flatMap((model) => buildStates(gladys, model));
    if (states.length === 0) return;
    try {
      await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    } catch (err) {
      logger.error('Unable to publish the states', err);
    }
  }

  /** @description Ask Gladys to fetch the widgets again (10 s apart at least). */
  function refreshWidgets() {
    if (!gladys.connected) return;
    Object.values(WIDGETS).forEach((key) => {
      const last = widgetRefreshedAt.get(key) ?? -Infinity;
      if (now() - last < WIDGET_REFRESH_GAP_MS) return;
      widgetRefreshedAt.set(key, now());
      try {
        gladys.requestWidgetRefresh(key);
      } catch (err) {
        logger.warn(`Unable to refresh the widget ${key}: ${err.message}`);
      }
    });
  }

  /**
   * @description The message of the current connection state.
   * @returns {{connected: boolean, message: object}|null} The status (null: unknown yet).
   */
  function statusMessage() {
    if (connection === 'unconfigured') {
      return { connected: false, message: all('statusUnconfigured') };
    }
    if (connection === 'refused') {
      return {
        connected: false,
        message: all('statusRefused', { reason: connectionDetail ?? 'BAD_CREDENTIALS' }),
      };
    }
    if (connection === 'rate_limited') {
      return {
        connected: true,
        message: all('statusRateLimited', {
          n: Math.max(1, Math.ceil((pausedUntil - now()) / 60000)),
        }),
      };
    }
    if (connection === 'error') {
      return {
        connected: false,
        message: all('statusError', { error: connectionDetail ?? 'network' }),
      };
    }
    if (connection === 'ok' && appliances().length === 0) {
      return { connected: true, message: all('statusNoAppliance') };
    }
    if (connection === 'ok') {
      return {
        connected: true,
        message: all('statusOk', {
          count: appliances().length,
          zones: zones().length + hotWaters().length,
          minutes: config.refreshMinutes,
        }),
      };
    }
    return null;
  }

  /** @description Show the state of the connection in the Configuration screen. */
  async function reportStatus() {
    const status = statusMessage();
    if (!status) return;
    const signature = JSON.stringify(status);
    if (!gladys.connected || signature === lastStatus) return;
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(status.connected, status.message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the status', err);
    }
  }

  /**
   * @description Fire a scene event; a refusal is logged, never thrown.
   * @param {string} key - The trigger.
   * @param {object} data - Its data.
   */
  async function fire(key, data) {
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Readings -----------------------------------------------------------------

  /**
   * @description A model with the values commanded but not confirmed yet on
   * top of the cloud values (never changes `pending`).
   * @param {object} model - The model as the cloud returned it.
   * @returns {object} The model Gladys sees.
   */
  function view(model) {
    const entry = pending.get(model.id);
    if (!entry || now() >= entry.until) return model;
    const result = { ...model };
    for (const key of PENDING_KEYS) {
      if (key in entry) result[key] = entry[key];
    }
    return result;
  }

  /**
   * @description Drop the commanded values a new reading confirms, and the
   * late ones: from then on the cloud is right.
   * @param {object} model - The model as the cloud returned it.
   */
  function confirmPending(model) {
    const entry = pending.get(model.id);
    if (!entry) return;
    if (now() >= entry.until) {
      pending.delete(model.id);
      return;
    }
    for (const key of PENDING_KEYS) {
      if (key in entry && model[key] === entry[key]) delete entry[key];
    }
    if (!PENDING_KEYS.some((key) => key in entry)) pending.delete(model.id);
  }

  /**
   * @description Run a secondary reading: a failure keeps the previous value,
   * unless Remeha refuses the account or asks to slow down.
   * @param {string} what - Its name, for the log.
   * @param {Function} task - `() => Promise`.
   * @param {unknown} fallback - The value kept on failure.
   * @returns {Promise<unknown>} The result.
   */
  async function secondary(what, task, fallback) {
    try {
      return await task();
    } catch (err) {
      if (err instanceof CredentialsError || err instanceof RateLimitError) throw err;
      logger.warn(`Remeha ${what} not read: ${err.message}`);
      return fallback;
    }
  }

  /**
   * @description Read the model name of the appliances that have none yet.
   * @param {object[]} list - Parsed appliances.
   */
  async function readDetails(list) {
    for (const appliance of list) {
      const last = detailsAt.get(appliance.id) ?? -Infinity;
      if (state.model(appliance.id) !== null && now() - last < DETAILS_MS) continue;
      if (state.model(appliance.id) !== null && last === -Infinity) {
        // Known from an earlier run: asked again only after a week.
        detailsAt.set(appliance.id, now());
        continue;
      }
      const details = await secondary(
        'technical details',
        () => api.getTechnicalDetails(appliance.id),
        null,
      );
      detailsAt.set(appliance.id, now());
      const name = typeof details?.applianceName === 'string' ? details.applianceName.trim() : '';
      if (details) state.setModel(appliance.id, name.slice(0, 60));
    }
  }

  /**
   * @description Read the energy of the last days of the appliances that
   * measure it, and cumulate it.
   * @param {object[]} list - Parsed appliances.
   */
  async function readEnergy(list) {
    for (const appliance of list.filter((item) => item.canEnergy)) {
      const zone = timezoneOf(appliance);
      const today = localDay(now(), zone);
      const answer = await secondary(
        'energy',
        () => api.getDailyEnergy(appliance.id, daysBefore(today, KEPT_DAYS - 2), today),
        null,
      );
      if (!answer) continue;
      const result = accountDays(state.energy(appliance.id), answer.data, zone, today);
      state.setEnergy(appliance.id, result.record);
    }
    energyAt = now();
  }

  /**
   * @description Take a new dashboard in: parse, detect the scene events,
   * remember the snapshots.
   * @param {object} parsed - `{ appliances, zones, hotWaters }`.
   * @returns {Promise<void>}
   */
  async function ingest(parsed) {
    const events = [];
    const created = createdIds();
    const next = new Map();
    for (const item of [...parsed.zones, ...parsed.hotWaters]) {
      confirmPending(item);
      next.set(item.id, item);
    }
    for (const item of parsed.appliances) {
      const model = {
        ...item,
        model: state.model(item.id),
        energyKwh: state.energy(item.id)?.kwh ?? null,
      };
      next.set(item.id, model);
      const result = detectEvents(state.snapshot(item.id), model, {
        device: externalIdOf(model),
        name: deviceName(model),
      });
      state.setSnapshot(item.id, result.snapshot);
      const quiet = now() < (expectedHoliday.get(item.id) ?? 0);
      if (created.has(externalIdOf(model))) {
        events.push(
          ...result.events.filter((event) => !(quiet && event.key === TRIGGERS.HOLIDAY_CHANGED)),
        );
      }
    }
    cloud = next;
    // An empty answer never wipes the energy indexes.
    if (parsed.appliances.length > 0) state.keep(parsed.appliances.map((item) => item.id));
    state.save();
    for (const event of events) await fire(event.key, event.data);
  }

  /**
   * @description Read the dashboard, and the slower readings that are due.
   * @param {string} reason - timer, manual, scan, connected, confirm.
   * @returns {Promise<boolean>} The reading worked.
   */
  function poll(reason = 'timer') {
    if (polling) return polling;
    polling = (async () => {
      lastAttemptAt = now();
      nextPollAt = now() + intervalMs();
      if (!api.hasCredentials()) {
        connection = 'unconfigured';
        await reportStatus();
        refreshWidgets();
        return false;
      }
      try {
        const parsed = parseDashboard(await api.getDashboard());
        await readDetails(parsed.appliances);
        if (now() - energyAt >= ENERGY_MS) await readEnergy(parsed.appliances);
        connection = 'ok';
        connectionDetail = null;
        backoff = 0;
        pausedUntil = 0;
        lastSuccessAt = now();
        nextPollAt = now() + intervalMs();
        await ingest(parsed);
        logger.debug?.(
          `Read ${parsed.appliances.length} appliance(s), ${parsed.zones.length} zone(s), ${parsed.hotWaters.length} hot water zone(s) (${reason})`,
        );
        await publishDiscovery();
        await publishStates(all_());
        return true;
      } catch (err) {
        handleError(err);
        return false;
      } finally {
        await reportStatus();
        refreshWidgets();
      }
    })().finally(() => {
      polling = null;
    });
    return polling;
  }

  /**
   * @description Record an API failure: refused credentials, slow-down or
   * unreachable API.
   * @param {Error} err - The error.
   */
  function handleError(err) {
    if (err instanceof CredentialsError) {
      connection = err.reason === 'MISSING' ? 'unconfigured' : 'refused';
      connectionDetail = err.reason;
      pausedUntil = now() + REFUSED_RETRY_MS;
      nextPollAt = pausedUntil;
      logger.warn(`Remeha refused the credentials (${err.reason})`);
    } else if (err instanceof RateLimitError) {
      backoff += 1;
      const pause = Math.min(MAX_PAUSE_MS, Math.max(err.retryAfterMs, intervalMs() * 2 ** backoff));
      connection = 'rate_limited';
      pausedUntil = now() + pause;
      nextPollAt = pausedUntil;
      logger.warn(`Remeha limits the requests: next reading in ${Math.round(pause / 60000)} min`);
    } else {
      connection = 'error';
      connectionDetail = err instanceof ApiError ? `HTTP ${err.status}` : err.message?.slice(0, 80);
      logger.warn(`Remeha reading failed: ${err.message}`);
    }
  }

  /** @description The clock: the due reading. */
  async function tick() {
    if (!gladys.connected) return;
    if (now() >= nextPollAt && now() >= pausedUntil) await poll('timer');
  }

  // --- Commands -----------------------------------------------------------------

  /**
   * @description Publish the models touched by a command.
   * @param {string[]} ids - Model ids.
   */
  async function afterCommand(ids) {
    await publishStates(ids.map(modelOf).filter(Boolean));
    refreshWidgets();
  }

  /**
   * @description Show a command at once and return the function that sends it.
   * @param {object} model - The parsed zone.
   * @param {object} shown - The values to show until confirmed.
   * @param {Function} request - `() => Promise`: the requests to Remeha.
   * @returns {Function} `() => Promise<void>`: sends it.
   */
  function prepare(model, shown, request) {
    if (!api.hasCredentials()) throw new Error('Remeha Home is not configured');
    pending.set(model.id, {
      ...(pending.get(model.id) ?? {}),
      ...shown,
      until: now() + PENDING_MS,
    });
    return async () => {
      try {
        await request();
        // One reading confirms the command.
        nextPollAt = Math.min(nextPollAt, now() + CONFIRM_DELAY_MS);
      } catch (err) {
        // The commanded values are dropped: the next reading shows the truth.
        pending.delete(model.id);
        if (err instanceof RateLimitError || err instanceof CredentialsError) handleError(err);
        await afterCommand([model.id]);
        throw err;
      }
    };
  }

  /**
   * @description A command on a climate zone.
   * @param {object} zone - The parsed zone (as Gladys sees it).
   * @param {object} change - `{ mode }`, `{ setpoint }`, `{ fireplace }`,
   *   `{ temporary: { setpoint, minutes } }` or `{ program }`.
   * @returns {{ send: Function, end: string }} The sender, and the end of a temporary temperature.
   */
  function zoneCommand(zone, change) {
    const fallback = zone.setpoint ?? zone.scheduleSetpoint ?? 20;
    if ('mode' in change) {
      if (change.mode === THERMOSTAT_MODE.OFF) {
        return { send: prepare(zone, { mode: 'FrostProtection' }, () => api.setZoneOff(zone.id)) };
      }
      if (change.mode === THERMOSTAT_MODE.HEATING) {
        return {
          send: prepare(zone, { mode: 'Manual', setpoint: fallback }, () =>
            api.setZoneManual(zone.id, fallback),
          ),
        };
      }
      if (change.mode === THERMOSTAT_MODE.AUTO) {
        return {
          send: prepare(zone, { mode: 'Scheduling' }, () =>
            api.setZoneSchedule(zone.id, zone.program),
          ),
        };
      }
      throw new RangeError(`Mode ${change.mode} is not available on Remeha`);
    }
    if ('setpoint' in change) {
      const setpoint = checkSetpoint(change.setpoint, zone, ZONE_STEP);
      // Manual or off: a fixed temperature; following the schedule: until its
      // next switch, as in the app.
      if (zone.mode === 'Manual' || zone.mode === 'FrostProtection' || !zone.mode) {
        return {
          send: prepare(zone, { mode: 'Manual', setpoint }, () =>
            api.setZoneManual(zone.id, setpoint),
          ),
        };
      }
      return {
        send: prepare(zone, { mode: 'TemporaryOverride', setpoint }, () =>
          api.setZoneTemporary(zone.id, setpoint),
        ),
      };
    }
    if ('fireplace' in change) {
      if (!zone.canFireplace) throw new Error(`${nameOf(zone)} has no fireplace mode`);
      const fireplace = Boolean(change.fireplace);
      return {
        send: prepare(zone, { fireplace }, () => api.setFireplace(zone.id, fireplace)),
      };
    }
    if ('temporary' in change) {
      const { setpoint, minutes } = change.temporary;
      const timed = minutes > 0 && zone.canOverrideEnd;
      const endMs = now() + minutes * 60 * 1000;
      const send = prepare(zone, { mode: 'TemporaryOverride', setpoint }, () =>
        api.setZoneTemporary(
          zone.id,
          setpoint,
          timed ? new Date(endMs).toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
        ),
      );
      return { send, end: timed ? localStamp(endMs, timezoneOf(zone)).slice(0, 16) : '' };
    }
    if ('program' in change) {
      const program = change.program;
      const toSchedule = zone.mode !== 'Scheduling';
      return {
        send: prepare(zone, { program, mode: 'Scheduling' }, async () => {
          await api.activateProgram(zone.id, program);
          // Selecting a program does not leave a manual mode by itself.
          if (toSchedule) await api.setZoneSchedule(zone.id, program);
        }),
      };
    }
    throw new Error('Unknown command');
  }

  /**
   * @description A command on a hot water zone.
   * @param {object} zone - The parsed hot water zone (as Gladys sees it).
   * @param {object} change - `{ mode }` (WATER_HEATER_MODE) or `{ comfort }`.
   * @returns {{ send: Function }} The sender.
   */
  function hotWaterCommand(zone, change) {
    if ('mode' in change) {
      const request = HOT_WATER_MODE_REQUEST[change.mode];
      if (!request) throw new RangeError(`Mode ${change.mode} is not available on Remeha`);
      if (request === 'boost' && !zone.canBoost) throw new Error(`${nameOf(zone)} has no boost`);
      const fromSchedule = zone.mode === 'Scheduling';
      return {
        send: prepare(zone, { mode: HOT_WATER_MODE_OF_REQUEST[request] }, async () => {
          // Remeha accepts a boost only while the zone follows its schedule.
          if (request === 'boost' && !fromSchedule) await api.setHotWaterMode(zone.id, 'schedule');
          await api.setHotWaterMode(zone.id, request);
        }),
      };
    }
    if ('comfort' in change) {
      const comfort = checkSetpoint(change.comfort, zone, HOT_WATER_STEP);
      return {
        send: prepare(zone, { comfort }, () => api.setHotWaterComfort(zone.id, comfort)),
      };
    }
    throw new Error('Unknown command');
  }

  /**
   * @description The same command on several zones, one after the other.
   * @param {object[]} list - Parsed zones.
   * @param {Function} build - `(zone) => { send }`.
   * @returns {Promise<{count: number, failed: number}>} The outcome.
   */
  async function commandMany(list, build) {
    let count = 0;
    let failed = 0;
    for (const zone of list) {
      try {
        const { send } = build(zone);
        await afterCommand([zone.id]);
        await send();
        count += 1;
      } catch (err) {
        // One zone chosen: its error is the error of the action.
        if (list.length === 1) throw err;
        failed += 1;
        logger.warn(`Command for ${nameOf(zone)} failed: ${err.message}`);
      }
    }
    return { count, failed };
  }

  /**
   * @description A model chosen in a scene action or a widget.
   * @param {string} externalId - The Gladys external id.
   * @param {string} kind - The kind wanted.
   * @returns {object} The parsed model.
   */
  function requireModel(externalId, kind) {
    const model = byExternalId(externalId);
    if (!model || model.kind !== kind) {
      throw new Error(`Unknown Remeha ${kind.replace('_', ' ')}: choose it again in the scene`);
    }
    return model;
  }

  gladys.onSetValue(async (device, deviceFeature, value) => {
    const model = byExternalId(device.external_id);
    if (!model) throw new Error('Unknown Remeha device: read the devices again');
    const key = String(deviceFeature.external_id).slice(device.external_id.length + 1);
    let command;
    if (model.kind === KINDS.ZONE && key === 'mode') {
      command = zoneCommand(model, { mode: Number(value) });
    } else if (model.kind === KINDS.ZONE && key === 'target_temperature') {
      command = zoneCommand(model, { setpoint: value });
    } else if (model.kind === KINDS.ZONE && key === 'fireplace') {
      command = zoneCommand(model, { fireplace: Number(value) === 1 });
    } else if (model.kind === KINDS.HOT_WATER && key === 'mode') {
      command = hotWaterCommand(model, { mode: Number(value) });
    } else if (model.kind === KINDS.HOT_WATER && key === 'target_temperature') {
      command = hotWaterCommand(model, { comfort: value });
    } else {
      throw new Error(`The feature ${key} is read-only`);
    }
    // The answer of Gladys is awaited 5 s: the command is shown at once and
    // sent without waiting for Remeha.
    await afterCommand([model.id]);
    command
      .send()
      .catch((err) => logger.warn(`Command for ${nameOf(model)} failed: ${err.message}`));
  });

  // --- Scene actions ----------------------------------------------------------------

  gladys.onSceneAction(SCENE_ACTIONS.SET_TEMPORARY, async (fields = {}) => {
    const zone = requireModel(fields.zone, KINDS.ZONE);
    const { send, end } = zoneCommand(zone, { temporary: temporaryChange(fields, zone) });
    await afterCommand([zone.id]);
    await send();
    return { end };
  });

  gladys.onSceneAction(SCENE_ACTIONS.SET_CLOCK_PROGRAM, async (fields = {}) => {
    const program = clockProgram(fields.program);
    const list = fields.zone ? [requireModel(fields.zone, KINDS.ZONE)] : zones();
    return commandMany(list, (zone) => zoneCommand(zone, { program }));
  });

  gladys.onSceneAction(SCENE_ACTIONS.SET_HOLIDAY, async (fields = {}) => {
    if (!api.hasCredentials()) throw new Error('Remeha Home is not configured');
    const days = holidayDays(fields.days);
    const list = fields.appliance
      ? [requireModel(fields.appliance, KINDS.APPLIANCE)]
      : appliances();
    if (list.length === 0) throw new Error('No Remeha appliance read yet');
    let until = '';
    for (const appliance of list) {
      const today = localDay(now(), timezoneOf(appliance));
      until = days > 0 ? daysBefore(today, -days) : '';
      expectedHoliday.set(appliance.id, now() + EXPECTED_MS);
      await api.setHoliday(appliance.id, days > 0 ? today : null, days > 0 ? until : null);
    }
    nextPollAt = Math.min(nextPollAt, now() + CONFIRM_DELAY_MS);
    return { count: list.length, until };
  });

  gladys.onSceneAction(SCENE_ACTIONS.HOT_WATER_BOOST, async (fields = {}) => {
    const list = fields.zone
      ? [requireModel(fields.zone, KINDS.HOT_WATER)]
      : hotWaters().filter((zone) => zone.canBoost && zone.mode !== 'Boost');
    return commandMany(list, (zone) => hotWaterCommand(zone, { mode: WATER_HEATER_MODE.BOOST }));
  });

  gladys.onSceneAction(SCENE_ACTIONS.REFRESH, async () => {
    if (now() - lastAttemptAt >= MIN_MANUAL_GAP_MS || !lastSuccessAt) {
      const ok = await poll('manual');
      if (!ok) throw new Error(`Remeha reading failed (${connection})`);
    }
    const first = appliances()[0] ?? null;
    const summary = energySummary(
      appliances().map((appliance) => state.energy(appliance.id)),
      now(),
      timezoneOf(first),
    );
    return {
      zones: zones().length,
      pressure: first?.pressure ?? 0,
      outdoor_temperature: first?.outdoor ?? 0,
      energy_today: summary.today ?? 0,
    };
  });

  // --- Configuration button ----------------------------------------------------------

  gladys.onAction(ACTIONS.TEST, async () => {
    if (!api.hasCredentials()) return all('statusUnconfigured');
    const ok = await poll('manual');
    if (!ok) return statusMessage()?.message ?? all('statusError', { error: 'network' });
    if (appliances().length === 0) return all('statusNoAppliance');
    return all((lang) => {
      const list = sortByName(all_())
        .map((model) => {
          let what;
          if (model.kind === KINDS.ZONE) {
            what = t(`mode_${zoneState(model) ?? 'unknown'}`, lang);
          } else if (model.kind === KINDS.HOT_WATER) {
            what = t(`dhw_${hotWaterState(model) ?? 'unknown'}`, lang);
          } else {
            what = model.online === false ? t('offline', lang) : t('online', lang);
          }
          return t('testItem', lang, {
            name: deviceName(model, lang),
            what,
            features: featuresOf(model).length,
          });
        })
        .join(' · ');
      return t('testOk', lang, { count: cloud.size, list }).slice(0, 2000);
    });
  });

  // --- Widgets ------------------------------------------------------------------------

  /**
   * @description Remember the language of the last widget request (the
   * feature names follow it when the configuration says "automatic").
   * @param {string} lang - The language of the request.
   */
  function rememberLanguage(lang) {
    if (!isLanguage(lang) || lang === language) return;
    const before = textLanguage();
    language = lang;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: lang })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
    if (textLanguage() !== before) publishDiscovery();
  }

  /**
   * @description The models chosen in the settings of a widget (all of the
   * kinds when none is chosen).
   * @param {unknown} wanted - External ids.
   * @param {string[]} kinds - The kinds offered.
   * @returns {object[]} The models, zones first, sorted by name.
   */
  function chosen(wanted, kinds) {
    const ids = Array.isArray(wanted) ? wanted : wanted ? [wanted] : [];
    const list = kinds.flatMap((kind) => sortByName(ofKind(kind)));
    const picked = list.filter((model) => ids.includes(externalIdOf(model)));
    return picked.length > 0 ? picked : list;
  }

  gladys.onWidgetGet(WIDGETS.ZONES, async (request = {}) => {
    const { settings: s = {}, language: lang, units } = request;
    rememberLanguage(lang);
    const list = chosen(s.devices, [KINDS.ZONE, KINDS.HOT_WATER]);
    return buildZonesWidget({
      zones: list.slice(0, MAX_ITEMS).map((model) => ({
        model,
        name: nameOf(model),
        waiting: pending.has(model.id),
      })),
      hidden: Math.max(0, list.length - MAX_ITEMS),
      connection,
      lastSuccessAt,
      language: isLanguage(lang) ? lang : textLanguage(),
      units,
      timezone: timezoneOf(list[0]),
      now: now(),
    });
  });

  gladys.onWidgetGet(WIDGETS.ENERGY, async ({ settings: s = {}, language: lang } = {}) => {
    rememberLanguage(lang);
    const list = chosen(s.devices, [KINDS.APPLIANCE]);
    return buildEnergyWidget({
      records: list.map((appliance) => state.energy(appliance.id)).filter(Boolean),
      connection,
      measured: list.some((appliance) => appliance.canEnergy),
      language: isLanguage(lang) ? lang : textLanguage(),
      timezone: timezoneOf(list[0]),
      now: now(),
    });
  });

  gladys.onWidgetGet(WIDGETS.STATUS, async ({ settings: s = {}, language: lang, units } = {}) => {
    rememberLanguage(lang);
    const appliance = chosen(s.device, [KINDS.APPLIANCE])[0] ?? null;
    const shown = isLanguage(lang) ? lang : textLanguage();
    return buildStatusWidget({
      appliance,
      name: appliance ? deviceName(appliance, shown) : '',
      connection,
      lastSuccessAt,
      pausedUntil,
      language: shown,
      units,
      now: now(),
    });
  });

  /**
   * @description The buttons of the widgets.
   * @param {string} actionKey - The button.
   * @param {object} [_params] - Its params (none).
   * @param {object} [context] - `{ settings }` of the widget.
   * @returns {Promise<object>} The toast.
   */
  async function widgetAction(actionKey, _params = {}, { settings: s = {} } = {}) {
    if (actionKey === WIDGET_ACTIONS.ALL_SCHEDULE || actionKey === WIDGET_ACTIONS.BOOST) {
      const boost = actionKey === WIDGET_ACTIONS.BOOST;
      const list = boost
        ? chosen(s.devices, [KINDS.HOT_WATER]).filter(
            (zone) => zone.canBoost && zone.mode !== 'Boost',
          )
        : chosen(s.devices, [KINDS.ZONE]).filter((zone) =>
            ['Manual', 'TemporaryOverride'].includes(zone.mode),
          );
      if (list.length === 0) return all(boost ? 'toastNoBoost' : 'toastAllSchedule', { n: 0 });
      let outcome;
      try {
        outcome = await commandMany(list, (zone) =>
          boost
            ? hotWaterCommand(zone, { mode: WATER_HEATER_MODE.BOOST })
            : zoneCommand(zone, { mode: THERMOSTAT_MODE.AUTO }),
        );
      } catch (err) {
        logger.warn(`Widget command failed: ${err.message}`);
        outcome = { count: 0, failed: list.length };
      }
      return all((lang) =>
        t(outcome.failed ? 'toastPartial' : boost ? 'toastBoost' : 'toastAllSchedule', lang, {
          n: outcome.count,
          failed: outcome.failed,
        }),
      );
    }
    if (actionKey === WIDGET_ACTIONS.REFRESH) {
      if (now() - lastAttemptAt >= MIN_MANUAL_GAP_MS || !lastSuccessAt) {
        const ok = await poll('manual');
        if (!ok) {
          return all((lang) =>
            t('toastFailed', lang, { error: t(`connection_${connection}`, lang) }),
          );
        }
      }
      return all('toastRefreshed', { n: zones().length + hotWaters().length });
    }
    throw new Error(`Unknown button ${actionKey}`);
  }
  gladys.onWidgetAction(WIDGETS.ZONES, widgetAction);
  gladys.onWidgetAction(WIDGETS.ENERGY, widgetAction);
  gladys.onWidgetAction(WIDGETS.STATUS, widgetAction);

  // --- Devices and configuration --------------------------------------------------

  gladys.onScanRequest(async () => {
    await poll('scan');
    await publishDiscovery({ force: true });
  });

  gladys.onDeviceCreated(async (device) => {
    const model = byExternalId(device.external_id);
    if (model) await publishStates([model]);
    refreshWidgets();
  });

  gladys.onDeviceUpdated(async (device) => {
    const model = byExternalId(device.external_id);
    if (model) await publishStates([model]);
  });

  /** @description Forget what was read with other credentials. */
  function resetReadings() {
    connection = 'unknown';
    connectionDetail = null;
    pausedUntil = 0;
    backoff = 0;
    lastStatus = null;
    energyAt = -Infinity;
    detailsAt.clear();
  }

  gladys.onConfigUpdated(async (raw) => {
    const previous = { ...config, language: textLanguage() };
    config = normalizeConfig(raw);
    language = readLanguage(raw, language);
    api.setCredentials(config.email, config.password);
    const credentialsChanged =
      config.email !== previous.email || config.password !== previous.password;
    if (credentialsChanged) resetReadings();
    if (textLanguage() !== previous.language) await publishDiscovery();
    if (credentialsChanged || config.refreshMinutes !== previous.refreshMinutes) {
      nextPollAt = 0;
      if (credentialsChanged) pausedUntil = 0;
      await tick();
    } else {
      refreshWidgets();
    }
  });

  gladys.on('connected', async () => {
    const raw = gladys.config ?? {};
    config = normalizeConfig(raw);
    language = readLanguage(raw, language);
    api.setCredentials(config.email, config.password);
    lastStatus = null;
    lastDiscovery = null;
    nextPollAt = 0;
    running = poll('connected');
    await running;
    if (tickMs > 0 && timer === null) {
      timer = setInterval(() => {
        running = tick().catch((err) => logger.error('Tick failed', err));
      }, tickMs);
      timer.unref?.();
    }
  });

  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stop();
    await running;
    state.save();
  });

  return {
    poll,
    tick,
    stop,
    state,
    models: all_,
    zones,
    hotWaters,
    appliances,
    connection: () => connection,
    pending,
  };
}

export {
  ACTIONS,
  TICK_MS,
  CONFIRM_DELAY_MS,
  PENDING_MS,
  MIN_MANUAL_GAP_MS,
  ENERGY_MS,
  REFUSED_RETRY_MS,
  MAX_PAUSE_MS,
  TRIGGERS,
  createApp,
};
