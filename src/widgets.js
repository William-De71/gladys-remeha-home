// -----------------------------------------------------------------------------
// Dashboard widgets, built from the last reading (no request to Remeha).
//
//   - zones:  the climate zones and hot water zones (or the ones chosen in the
//             widget settings) as a list — temperature, setpoint, mode, the
//             next switch of the clock program, a badge (heating, cooling,
//             command waiting), the details on tap — and the buttons
//             "Back to schedule", "Hot water boost" and "Refresh";
//   - energy: the energy Remeha estimates for today and yesterday, and the
//             last 7 days by use (heating, hot water, cooling);
//   - status: the appliance — water pressure, outdoor temperature, connection
//             to Remeha, status, holiday — and "Refresh".
//
// The content stays within the budget of the core (8 components, 1 focal,
// 6 tiles, 2 texts, 1 status, 4 buttons) and every text exists in the four
// languages (test/widgets.test.js runs validateWidgetContent on them).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import {
  KINDS,
  DAY_MS,
  localStamp,
  localDay,
  daysBefore,
  zoneState,
  hotWaterState,
  hotWaterHeating,
  operatingState,
} from './remeha.js';
import { THERMOSTAT_OPERATING_STATE } from './constants.js';
import { t, ago, formatNumber, LANGUAGES } from './i18n.js';

const WIDGETS = { ZONES: 'zones', ENERGY: 'energy', STATUS: 'status' };
const WIDGET_ACTIONS = { ALL_SCHEDULE: 'all_schedule', BOOST: 'boost', REFRESH: 'refresh' };
// A list card holds 8 rows at most.
const MAX_ITEMS = 8;
const TTL_SECONDS = 60;
const CHART_DAYS = 7;

const isFahrenheit = (units) => units === 'us' || units === 'imperial';
// French typography: a (non-breaking) space before the colon.
const colon = (language) => (language === 'fr' ? ' : ' : ': ');

/**
 * @description A temperature in the unit of the user: "20.5 °C", "68.9 °F".
 * @param {number|null} celsius - The temperature.
 * @param {string} units - metric or us.
 * @param {string} language - The language.
 * @returns {string} The text ("—" when unknown).
 */
function formatTemperature(celsius, units, language) {
  if (celsius === null || celsius === undefined) return '—';
  if (isFahrenheit(units)) return `${formatNumber((celsius * 9) / 5 + 32, language)} °F`;
  return `${formatNumber(celsius, language)} °C`;
}

/**
 * @description A time on site, short: "17:30" today, "24/11 06:00" another day.
 * @param {string|null} stamp - `YYYY-MM-DDTHH:mm` on site.
 * @param {string} today - The day on site.
 * @returns {string|null} The text.
 */
function shortTime(stamp, today) {
  if (!stamp) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(stamp);
  if (!match) return null;
  return stamp.slice(0, 10) === today ? match[4] : `${match[3]}/${match[2]} ${match[4]}`;
}

/**
 * @description A real UTC time of the API on site, short.
 * @param {string|null} iso - The UTC time.
 * @param {string} timezone - IANA timezone of the appliance.
 * @param {number} now - Now (ms).
 * @returns {string|null} The text.
 */
function shortUtc(iso, timezone, now) {
  const ms = Date.parse(iso ?? '');
  if (Number.isNaN(ms)) return null;
  return shortTime(localStamp(ms, timezone).slice(0, 16), localDay(now, timezone));
}

/**
 * @description A day of the API in the language of the user: "21 déc. 2026".
 * @param {string|null} stamp - `YYYY-MM-DD…`.
 * @param {string} language - The language.
 * @returns {string} The text ('' when none).
 */
function formatDay(stamp, language) {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(stamp ?? '')?.[0];
  if (!day) return '';
  return new Intl.DateTimeFormat(LANGUAGES.includes(language) ? language : 'en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.parse(`${day}T12:00:00Z`));
}

/**
 * @description The badge of a climate zone.
 * @param {object} zone - A parsed zone.
 * @param {boolean} waiting - A command is not confirmed yet.
 * @param {string} language - The language.
 * @returns {{text: string, color: string}|undefined} The badge.
 */
function zoneBadge(zone, waiting, language) {
  if (waiting) return { text: t('badgeWaiting', language), color: WIDGET_COLORS.WARNING };
  const state = operatingState(zone);
  if (state === THERMOSTAT_OPERATING_STATE.HEATING) {
    return { text: t('badgeHeating', language), color: WIDGET_COLORS.DANGER };
  }
  if (state === THERMOSTAT_OPERATING_STATE.COOLING) {
    return { text: t('badgeCooling', language), color: WIDGET_COLORS.INFO };
  }
  return undefined;
}

/**
 * @description The badge of a hot water zone.
 * @param {object} zone - A parsed hot water zone.
 * @param {boolean} waiting - A command is not confirmed yet.
 * @param {string} language - The language.
 * @returns {{text: string, color: string}|undefined} The badge.
 */
function hotWaterBadge(zone, waiting, language) {
  if (waiting) return { text: t('badgeWaiting', language), color: WIDGET_COLORS.WARNING };
  if (hotWaterHeating(zone))
    return { text: t('badgeHeating', language), color: WIDGET_COLORS.DANGER };
  return undefined;
}

/**
 * @description The list row of a climate zone.
 * @param {object} zone - A parsed zone.
 * @param {object} options - `{ name, waiting, units, language, timezone, now }`.
 * @returns {object} The card-list item.
 */
function zoneItem(zone, { name, waiting, units, language, timezone, now }) {
  const today = localDay(now, timezone);
  const state = zoneState(zone);
  const mode = t(`mode_${state ?? 'unknown'}`, language);
  const lines = [];
  const line = (key, value) => value && lines.push(`${t(key, language)}${colon(language)}${value}`);
  line('detailMode', mode);
  line('detailRoom', formatTemperature(zone.room, units, language));
  if (state !== 'off') line('detailSetpoint', formatTemperature(zone.setpoint, units, language));
  if (zone.mode === 'TemporaryOverride') {
    line(
      'detailUntil',
      shortUtc(zone.overrideEnd, timezone, now) ?? t('untilNextSwitch', language),
    );
  }
  if (zone.nextSwitch && zone.nextSetpoint !== null && state !== 'manual' && state !== 'off') {
    line(
      'detailNext',
      t('nextAt', language, {
        temperature: formatTemperature(zone.nextSetpoint, units, language),
        time: shortTime(zone.nextSwitch, today),
      }),
    );
  }
  line('detailProgram', t('programN', language, { n: zone.program }));
  if (zone.fireplace) line('detailFireplace', t('on', language));
  if (zone.preHeat) line('detailPreHeat', t('on', language));
  const badge = zoneBadge(zone, waiting, language);
  const room = formatTemperature(zone.room, units, language);
  return {
    title: name.slice(0, 60),
    subtitle:
      state === 'off'
        ? `${room} · ${mode}`
        : `${room} → ${formatTemperature(zone.setpoint, units, language)} · ${mode}`,
    ...(badge ? { badge } : {}),
    description: lines.join('\n'),
  };
}

/**
 * @description The list row of a hot water zone.
 * @param {object} zone - A parsed hot water zone.
 * @param {object} options - `{ name, waiting, units, language, timezone, now }`.
 * @returns {object} The card-list item.
 */
function hotWaterItem(zone, { name, waiting, units, language, timezone, now }) {
  const today = localDay(now, timezone);
  const mode = t(`dhw_${hotWaterState(zone) ?? 'unknown'}`, language);
  const lines = [];
  const line = (key, value) => value && lines.push(`${t(key, language)}${colon(language)}${value}`);
  line('detailMode', mode);
  line('detailComfort', formatTemperature(zone.comfort, units, language));
  if (zone.type === 'Tank') line('detailEco', formatTemperature(zone.reduced, units, language));
  if (zone.temperature !== null)
    line('detailWater', formatTemperature(zone.temperature, units, language));
  if (zone.mode === 'Boost') line('detailUntil', shortUtc(zone.boostEnd, timezone, now));
  if (zone.mode === 'Scheduling' && zone.nextSwitch && zone.nextActivity) {
    line(
      'detailNext',
      t('nextActivityAt', language, {
        activity: t(`activity_${zone.nextActivity === 'Comfort' ? 'comfort' : 'eco'}`, language),
        time: shortTime(zone.nextSwitch, today),
      }),
    );
  }
  const badge = hotWaterBadge(zone, waiting, language);
  const water =
    zone.temperature !== null ? `${formatTemperature(zone.temperature, units, language)} · ` : '';
  return {
    title: name.slice(0, 60),
    subtitle: `${water}${mode} · ${t('dhw_comfort', language)} ${formatTemperature(zone.comfort, units, language)}`,
    ...(badge ? { badge } : {}),
    description: lines.join('\n'),
  };
}

/**
 * @description The zones widget.
 * @param {object} options - Options.
 * @param {Array<{model: object, name: string, waiting: boolean}>} options.zones - Zones and hot water zones.
 * @param {number} options.hidden - Zones left out (more than 8).
 * @param {string} options.connection - ok, unconfigured, refused, rate_limited, error, unknown.
 * @param {number} options.lastSuccessAt - Last successful reading (ms, 0: never).
 * @param {string} options.language - The language.
 * @param {string} [options.units] - metric or us.
 * @param {string} options.timezone - IANA timezone of the appliance.
 * @param {number} options.now - Now (ms).
 * @returns {object} The content.
 */
function buildZonesWidget({
  zones,
  hidden = 0,
  connection,
  lastSuccessAt,
  language,
  units = 'metric',
  timezone,
  now,
}) {
  const components = [];
  if (lastSuccessAt) {
    components.push({
      type: 'text',
      variant: 'caption',
      text:
        hidden > 0
          ? t('captionUpdatedHidden', language, {
              ago: ago(lastSuccessAt, now, language),
              n: hidden,
            })
          : t('captionUpdated', language, { ago: ago(lastSuccessAt, now, language) }),
    });
  }
  if (zones.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: zones.slice(0, MAX_ITEMS).map(({ model, name, waiting }) => {
        const options = { name, waiting, units, language, timezone, now };
        return model.kind === KINDS.HOT_WATER
          ? hotWaterItem(model, options)
          : zoneItem(model, options);
      }),
    });
    if (zones.some(({ model }) => model.kind === KINDS.ZONE)) {
      components.push({
        type: 'button',
        label: t('buttonAllSchedule', language),
        icon: 'calendar',
        style: 'primary',
        action: { key: WIDGET_ACTIONS.ALL_SCHEDULE, confirm: true },
      });
    }
    if (zones.some(({ model }) => model.kind === KINDS.HOT_WATER && model.canBoost)) {
      components.push({
        type: 'button',
        label: t('buttonBoost', language),
        icon: 'droplet',
        style: 'secondary',
        action: { key: WIDGET_ACTIONS.BOOST, confirm: true },
      });
    }
  } else {
    const key = connection === 'ok' ? 'emptyZones' : `connection_${connection}_hint`;
    components.push({ type: 'text', variant: 'body', text: t(key, language) });
  }
  components.push({
    type: 'button',
    label: t('buttonRefresh', language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.REFRESH },
  });
  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The energy of the last days, summed over appliances.
 * @param {object[]} records - Energy records (`{ days: { day: figures } }`).
 * @param {number} now - Now (ms).
 * @param {string} timezone - IANA timezone of the appliances.
 * @returns {{ today: number|null, yesterday: number|null, days: Array<{day: string,
 *   heating: number, hotWater: number, cooling: number}> }} The summary (kWh).
 */
function energySummary(records, now, timezone) {
  const today = localDay(now, timezone);
  const days = [];
  for (let back = CHART_DAYS - 1; back >= 0; back -= 1) {
    const day = daysBefore(today, back);
    const sum = { day, heating: 0, hotWater: 0, cooling: 0, known: false };
    for (const record of records) {
      const figures = record?.days?.[day];
      if (!figures) continue;
      sum.known = true;
      sum.heating += Number(figures.heating) || 0;
      sum.hotWater += Number(figures.hotWater) || 0;
      sum.cooling += Number(figures.cooling) || 0;
    }
    days.push(sum);
  }
  const total = (entry) =>
    entry?.known ? Math.round((entry.heating + entry.hotWater + entry.cooling) * 100) / 100 : null;
  return {
    today: total(days[days.length - 1]),
    yesterday: total(days[days.length - 2]),
    days: days.map(({ day, heating, hotWater, cooling }) => ({ day, heating, hotWater, cooling })),
  };
}

/**
 * @description The energy widget.
 * @param {object} options - Options.
 * @param {object[]} options.records - The energy records of the appliances shown.
 * @param {string} options.connection - The connection state.
 * @param {boolean} options.measured - At least one appliance reports its energy.
 * @param {string} options.language - The language.
 * @param {string} options.timezone - IANA timezone of the appliances.
 * @param {number} options.now - Now (ms).
 * @returns {object} The content.
 */
function buildEnergyWidget({ records, connection, measured = true, language, timezone, now }) {
  const known = records.some((record) => Object.keys(record?.days ?? {}).length > 0);
  if (!known) {
    let key = `connection_${connection}_hint`;
    if (connection === 'ok') key = measured ? 'emptyEnergy' : 'noEnergy';
    return {
      ttl_seconds: TTL_SECONDS,
      components: [{ type: 'text', variant: 'body', text: t(key, language) }],
    };
  }
  const summary = energySummary(records, now, timezone);
  const point = (field) =>
    summary.days.map((entry) => ({
      t: `${entry.day}T12:00:00.000Z`,
      v: Math.round(entry[field] * 100) / 100,
    }));
  const series = [
    { name: t('seriesHeating', language), points: point('heating') },
    { name: t('seriesHotWater', language), points: point('hotWater') },
  ];
  if (summary.days.some((entry) => entry.cooling > 0)) {
    series.push({ name: t('seriesCooling', language), points: point('cooling') });
  }
  const tile = (value, label, icon, color) => ({
    type: 'value',
    value: value ?? '—',
    ...(value === null ? {} : { unit: 'kWh' }),
    label: t(label, language),
    icon,
    ...(color ? { color } : {}),
  });
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      tile(summary.today, 'tileToday', 'zap', WIDGET_COLORS.PRIMARY),
      tile(summary.yesterday, 'tileYesterday', 'calendar'),
      {
        type: 'chart',
        chart_type: 'bar',
        title: t('chartTitle', language),
        unit: 'kWh',
        series,
      },
      { type: 'text', variant: 'caption', text: t('energyCaption', language) },
    ],
  };
}

/**
 * @description What the appliance does now ("Heating", "Hot water"), or the
 * value of Remeha when it is not a known one.
 * @param {string} thermalMode - activeThermalMode.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function thermalLabel(thermalMode, language) {
  const key = `thermal_${thermalMode}`;
  const label = t(key, language);
  return label === key ? thermalMode.slice(0, 40) : label;
}

const CONNECTION_COLOR = {
  ok: WIDGET_COLORS.SUCCESS,
  unconfigured: WIDGET_COLORS.WARNING,
  refused: WIDGET_COLORS.DANGER,
  rate_limited: WIDGET_COLORS.WARNING,
  error: WIDGET_COLORS.DANGER,
  unknown: WIDGET_COLORS.NEUTRAL,
};

/**
 * @description The status widget.
 * @param {object} options - Options.
 * @param {object|null} options.appliance - The parsed appliance (null: none yet).
 * @param {string} options.name - Its name.
 * @param {string} options.connection - ok, unconfigured, refused, rate_limited, error, unknown.
 * @param {number} options.lastSuccessAt - Last successful reading (ms, 0: never).
 * @param {number} options.pausedUntil - End of a slow-down (ms, 0: none).
 * @param {string} options.language - The language.
 * @param {string} [options.units] - metric or us.
 * @param {number} options.now - Now (ms).
 * @returns {object} The content.
 */
function buildStatusWidget({
  appliance,
  name = '',
  connection,
  lastSuccessAt,
  pausedUntil = 0,
  language,
  units = 'metric',
  now,
}) {
  const components = [];
  if (appliance) {
    if (appliance.pressure !== null) {
      components.push({
        type: 'value',
        value: Math.round(appliance.pressure * 10) / 10,
        unit: 'bar',
        label: t('tilePressure', language),
        icon: 'droplet',
        color: appliance.pressureOk === false ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
      });
    }
    if (appliance.outdoor !== null) {
      components.push({
        type: 'value',
        value: formatTemperature(appliance.outdoor, units, language),
        label: t('tileOutdoor', language),
        icon: 'sun',
      });
    }
  }
  const rows = [
    {
      label: t('rowConnection', language),
      value: t(`connection_${connection}`, language),
      color: CONNECTION_COLOR[connection] ?? WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (appliance) {
    if (appliance.online !== null) {
      rows.push({
        label: name.slice(0, 40) || t('rowAppliance', language),
        value: t(appliance.online ? 'online' : 'offline', language),
        color: appliance.online ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
      });
    }
    if (appliance.errorStatus) {
      const running = appliance.errorStatus.toLowerCase() === 'running';
      rows.push({
        label: t('rowStatus', language),
        value: running ? t('statusRunning', language) : appliance.errorStatus.slice(0, 40),
        color: running ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
      });
    }
    if (appliance.thermalMode) {
      rows.push({
        label: t('rowActivity', language),
        value: thermalLabel(appliance.thermalMode, language),
        color: /idle|standby/i.test(appliance.thermalMode)
          ? WIDGET_COLORS.NEUTRAL
          : WIDGET_COLORS.INFO,
      });
    }
    if (appliance.holidayActive || appliance.holidayEnd) {
      const end = formatDay(appliance.holidayEnd, language);
      rows.push({
        label: t('rowHoliday', language),
        value: appliance.holidayActive
          ? t('holidayUntil', language, { end })
          : t('holidayPlanned', language, {
              start: formatDay(appliance.holidayStart, language),
            }),
        color: appliance.holidayActive ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
      });
    }
  }
  rows.push({
    label: t('rowLastReading', language),
    value: ago(lastSuccessAt, now, language),
    color: WIDGET_COLORS.NEUTRAL,
  });
  if (pausedUntil > now) {
    rows.push({
      label: t('rowPaused', language),
      value: t('inMinutes', language, { n: Math.ceil((pausedUntil - now) / 60000) }),
      color: WIDGET_COLORS.WARNING,
    });
  }
  components.push({ type: 'status', items: rows });
  if (connection !== 'ok' && connection !== 'unknown') {
    components.push({
      type: 'text',
      variant: 'body',
      text: t(`connection_${connection}_hint`, language),
    });
  } else if (appliance?.pressureOk === false) {
    components.push({ type: 'text', variant: 'body', text: t('pressureLowHint', language) });
  }
  components.push({
    type: 'button',
    label: t('buttonRefresh', language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.REFRESH },
  });
  return { ttl_seconds: TTL_SECONDS, components };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  MAX_ITEMS,
  CHART_DAYS,
  DAY_MS,
  formatTemperature,
  shortTime,
  shortUtc,
  formatDay,
  zoneBadge,
  hotWaterBadge,
  zoneItem,
  hotWaterItem,
  energySummary,
  buildZonesWidget,
  buildEnergyWidget,
  buildStatusWidget,
};
