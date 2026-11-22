// The widgets pass validateWidgetContent (what the core would keep) in every
// language, every connection state and every shape of data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { parseDashboard, accountDays } from '../src/remeha.js';
import {
  buildZonesWidget,
  buildEnergyWidget,
  buildStatusWidget,
  energySummary,
  formatTemperature,
  shortTime,
  shortUtc,
  zoneItem,
  hotWaterItem,
  WIDGET_ACTIONS,
  MAX_ITEMS,
  CHART_DAYS,
} from '../src/widgets.js';
import { LANGUAGES } from '../src/i18n.js';
import { deviceName } from '../src/device.js';
import { DASHBOARD, ENERGY, item } from './helpers/fixtures.js';

const TZ = 'Europe/Paris';
// 11:42 in Paris.
const NOW = Date.parse('2026-11-15T10:42:00Z');
const STATES = ['ok', 'unknown', 'unconfigured', 'refused', 'rate_limited', 'error'];
const parsed = parseDashboard(DASHBOARD);
const [SALON, ETAGE] = parsed.zones;
const [TANK] = parsed.hotWaters;
const [APPLIANCE] = parsed.appliances;
const RECORD = accountDays(null, ENERGY.data, TZ, '2026-11-15').record;
const entry = (model, waiting = false) => ({ model, name: deviceName(model, 'en'), waiting });
const zones = (overrides = {}) =>
  buildZonesWidget({
    zones: [entry(ETAGE), entry(SALON), entry(TANK)],
    connection: 'ok',
    lastSuccessAt: NOW - 60000,
    language: 'en',
    timezone: TZ,
    now: NOW,
    ...overrides,
  });
const valid = (content, what) => assert.deepEqual(validateWidgetContent(content), [], what);
const options = (language = 'en') => ({
  name: 'Salon',
  waiting: false,
  units: 'metric',
  language,
  timezone: TZ,
  now: NOW,
});

test('every widget is valid in every language and every connection state', () => {
  for (const language of LANGUAGES) {
    for (const connection of STATES) {
      valid(zones({ language, connection }), `zones ${language} ${connection}`);
      valid(zones({ language, connection, zones: [] }), `zones empty ${language} ${connection}`);
      valid(
        buildEnergyWidget({ records: [RECORD], connection, language, timezone: TZ, now: NOW }),
        `energy ${language} ${connection}`,
      );
      valid(
        buildEnergyWidget({ records: [], connection, language, timezone: TZ, now: NOW }),
        `energy empty ${language} ${connection}`,
      );
      valid(
        buildStatusWidget({
          appliance: APPLIANCE,
          name: 'Elga Ace (Maison)',
          connection,
          lastSuccessAt: NOW - 120000,
          pausedUntil: connection === 'rate_limited' ? NOW + 300000 : 0,
          language,
          now: NOW,
        }),
        `status ${language} ${connection}`,
      );
      valid(
        buildStatusWidget({ appliance: null, connection, lastSuccessAt: 0, language, now: NOW }),
        'none',
      );
    }
  }
});

test('zones: one row each, the badges, the buttons for what can be done', () => {
  const content = zones();
  const list = content.components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((i) => [i.title, i.subtitle, i.badge?.text]),
    [
      ['Étage', '18.2 °C → 18 °C · Manual', undefined],
      ['Salon', '19.6 °C → 20 °C · Schedule', 'Heating'],
      ['Hot water', '52.4 °C · Schedule · Comfort 55 °C', undefined],
    ],
  );
  const buttons = content.components.filter((c) => c.type === 'button').map((c) => c.action.key);
  assert.deepEqual(buttons, [
    WIDGET_ACTIONS.ALL_SCHEDULE,
    WIDGET_ACTIONS.BOOST,
    WIDGET_ACTIONS.REFRESH,
  ]);
  // Hot water without boost, no zone: only refresh.
  const only = zones({ zones: [entry({ ...TANK, canBoost: false })] });
  assert.deepEqual(
    only.components.filter((c) => c.type === 'button').map((c) => c.action.key),
    [WIDGET_ACTIONS.REFRESH],
  );
  // A waiting command wins over the other badges.
  assert.equal(zoneItem(SALON, { ...options(), waiting: true }).badge.text, 'Sending…');
  assert.equal(
    zones({ hidden: 3 }).components[0].text,
    'Read 1 min ago · 3 more: choose the zones',
  );
  assert.equal(MAX_ITEMS, 8);
});

test('a zone row: the next switch, a temporary temperature, off', () => {
  const salon = zoneItem(SALON, options('fr'));
  assert.match(salon.description, /Ensuite : 17 °C à 22:30/);
  assert.match(salon.description, /Programme : n° 1/);
  const temporary = zoneItem(
    { ...SALON, mode: 'TemporaryOverride', setpoint: 22, overrideEnd: '2026-11-15T12:00:00Z' },
    options('en'),
  );
  assert.equal(temporary.badge.text, 'Heating', 'heating wins over temporary');
  assert.match(temporary.description, /Until: 13:00/, 'UTC shown on site');
  const nextSwitch = zoneItem(
    { ...SALON, mode: 'TemporaryOverride', demand: 'Idle' },
    options('en'),
  );
  assert.equal(nextSwitch.badge, undefined, 'the mode already says it');
  assert.match(nextSwitch.subtitle, /Temporary$/);
  assert.match(nextSwitch.description, /Until: the next switch of the schedule/);
  const off = zoneItem({ ...SALON, mode: 'FrostProtection', demand: 'Idle' }, options('de'));
  assert.equal(off.subtitle, '19,6 °C · Aus (Frostschutz)');
  assert.doesNotMatch(off.description, /Solltemperatur/);
  const cooling = zoneItem({ ...SALON, demand: 'ProducingCold' }, options('es'));
  assert.equal(cooling.badge.text, 'Enfriando');
});

test('a hot water row: boost and its end, the next activity', () => {
  const boost = hotWaterItem(
    { ...TANK, mode: 'Boost', boostEnd: '2026-11-15T11:12:00Z' },
    { ...options('fr'), name: 'Eau chaude' },
  );
  assert.equal(boost.badge, undefined, 'the mode already says it');
  assert.match(boost.subtitle, /Boost/);
  assert.match(boost.description, /Jusqu’à : 12:12/);
  const scheduled = hotWaterItem(TANK, { ...options('en'), name: 'Hot water' });
  assert.match(scheduled.description, /Next: comfort at 17:00/);
  assert.match(scheduled.description, /Eco: 40 °C/, 'a tank has an eco setpoint');
  const combi = hotWaterItem(
    { ...TANK, type: 'Combi', temperature: null },
    { ...options('en'), name: 'Hot water' },
  );
  assert.equal(combi.subtitle, 'Schedule · Comfort 55 °C');
  assert.doesNotMatch(combi.description, /Eco:|Water:/);
});

test('energy: today, yesterday, 7 days by use, gaps left at zero', () => {
  const summary = energySummary([RECORD], NOW, TZ);
  assert.equal(summary.today, 7);
  assert.equal(summary.yesterday, 27);
  assert.equal(summary.days.length, CHART_DAYS);
  assert.deepEqual(summary.days.at(-1), { day: '2026-11-15', heating: 6, hotWater: 1, cooling: 0 });
  const content = buildEnergyWidget({
    records: [RECORD],
    connection: 'ok',
    language: 'en',
    timezone: TZ,
    now: NOW,
  });
  const chart = content.components.find((c) => c.type === 'chart');
  assert.deepEqual(
    chart.series.map((s) => s.name),
    ['Heating', 'Hot water'],
    'no cooling',
  );
  assert.equal(chart.series[0].points.length, 7);
  // Two appliances add up; cooling appears when there is some.
  const cooler = accountDays(
    null,
    [{ ...item('2026-11-15', 0, 0, '2026-11-15T09:00:00+00:00'), coolingEnergyConsumed: 4 }],
    TZ,
    '2026-11-15',
  ).record;
  const both = buildEnergyWidget({
    records: [RECORD, cooler],
    connection: 'ok',
    language: 'en',
    timezone: TZ,
    now: NOW,
  });
  assert.equal(both.components[0].value, 11);
  assert.equal(both.components.find((c) => c.type === 'chart').series.length, 3);
  // A day without any figure: no tile value.
  const empty = energySummary([{ days: {} }], NOW, TZ);
  assert.deepEqual([empty.today, empty.yesterday], [null, null]);
  const noEnergy = buildEnergyWidget({
    records: [],
    connection: 'ok',
    measured: false,
    language: 'fr',
    timezone: TZ,
    now: NOW,
  });
  assert.match(noEnergy.components[0].text, /ne transmet pas/);
});

test('status: pressure, outdoor, the appliance, holiday, a low pressure explained', () => {
  const content = buildStatusWidget({
    appliance: APPLIANCE,
    name: 'Elga Ace (Maison)',
    connection: 'ok',
    lastSuccessAt: NOW - 120000,
    language: 'fr',
    now: NOW,
  });
  assert.deepEqual(
    content.components.filter((c) => c.type === 'value').map((c) => [c.label, c.value, c.unit]),
    [
      ['Pression', 1.7, 'bar'],
      ['Extérieur', '6,5 °C', undefined],
    ],
  );
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((r) => [r.label, r.value]),
    [
      ['Remeha Home', 'Connecté'],
      ['Elga Ace (Maison)', 'En ligne'],
      ['État', 'Normal'],
      ['En ce moment', 'Chauffage'],
      ['Dernier relevé', 'il y a 2 min'],
    ],
  );
  const trouble = buildStatusWidget({
    appliance: {
      ...APPLIANCE,
      pressureOk: false,
      errorStatus: 'Locking',
      thermalMode: 'SomethingNew',
      holidayActive: true,
      holidayEnd: '2026-11-22T00:00:01Z',
    },
    connection: 'ok',
    lastSuccessAt: NOW,
    language: 'en',
    now: NOW,
  });
  const items = trouble.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    items.slice(2, 5).map((r) => r.value),
    ['Locking', 'SomethingNew', 'until Nov 22, 2026'],
  );
  assert.equal(trouble.components[0].color, 'danger');
  assert.match(trouble.components.find((c) => c.type === 'text').text, /water pressure too low/);
  const planned = buildStatusWidget({
    appliance: {
      ...APPLIANCE,
      holidayStart: '2026-12-20T00:00:01Z',
      holidayEnd: '2027-01-03T00:00:01Z',
    },
    connection: 'ok',
    lastSuccessAt: NOW,
    language: 'en',
    now: NOW,
  });
  assert.ok(
    planned.components
      .find((c) => c.type === 'status')
      .items.some((r) => r.value === 'planned from Dec 20, 2026'),
  );
});

test('temperatures in the unit of the user, times on site', () => {
  assert.equal(formatTemperature(20, 'us', 'en'), '68 °F');
  assert.equal(formatTemperature(20.5, 'metric', 'fr'), '20,5 °C');
  assert.equal(formatTemperature(null, 'metric', 'fr'), '—');
  assert.equal(shortTime('2026-11-15T22:30', '2026-11-15'), '22:30');
  assert.equal(shortTime('2026-11-16T06:00', '2026-11-15'), '16/11 06:00');
  assert.equal(shortTime(null, '2026-11-15'), null);
  assert.equal(shortUtc('2026-11-15T20:00:00Z', TZ, NOW), '21:00');
  assert.equal(shortUtc('nope', TZ, NOW), null);
});
