import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { TRIGGERS, SCENE_ACTIONS, MAX_TEMPORARY_MINUTES, MAX_HOLIDAY_DAYS } from '../src/events.js';
import { ACTIONS } from '../src/app.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import { REFRESH_MINUTES, AUTO_LANGUAGE } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const REPO = 'William-De71/gladys-remeha-home';

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.name, 'Remeha Home');
  assert.equal(manifest.version, pkg.version);
  assert.match(pkg.version, /^0\./);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-remeha-home:${pkg.version}`);
  assert.equal(manifest.cover_image, `https://raw.githubusercontent.com/${REPO}/main/cover.jpg`);
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-remeha-home');
});

test('declares the cloud transport: the Remeha Home API only, never a local device', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  const api = source('../src/remeha-api.js');
  assert.match(api, /https:\/\/api\.bdrthermea\.net\/Mobile\/api/);
  assert.match(api, /https:\/\/remehalogin\.bdrthermea\.net/);
  for (const file of ['remeha', 'app', 'device', 'events', 'widgets', 'state', 'config', 'i18n']) {
    assert.doesNotMatch(
      source(`../src/${file}.js`),
      /fetch\(|node:https?|node:net|node:dgram/,
      file,
    );
  }
  // A single channel: no transport to publish per device.
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
});

test('Gladys 5.3.0 for the catalog keywords; no widget form; no permission', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.doesNotMatch(source('../src/widgets.js'), /fields:/, 'no button form');
  assert.deepEqual(manifest.categories, ['climate', 'energy']);
  for (const key of ['location', 'network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
  const config = byKey(manifest.config_schema);
  assert.deepEqual([config.get('email').type, config.get('email').required], ['string', true]);
  assert.deepEqual(
    [config.get('password').type, config.get('password').required],
    ['secret', true],
  );
  assert.equal(config.get('password').default, undefined);
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  const app = source('../src/app.js');
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key),
    Object.values(TRIGGERS),
  );
  assert.deepEqual(
    manifest.scene_actions.map((a) => a.key),
    Object.values(SCENE_ACTIONS),
  );
  assert.deepEqual(
    manifest.widgets.map((w) => w.key),
    Object.values(WIDGETS),
  );
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
    assert.match(app, new RegExp(`onWidgetAction\\(WIDGETS\\.${key}`), key);
  }
  assert.deepEqual(Object.values(WIDGET_ACTIONS), ['all_schedule', 'boost', 'refresh']);
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  assert.deepEqual(
    manifest.actions.map((a) => a.key),
    Object.values(ACTIONS),
  );
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
  // Every trigger filters by device; the fields are keys of the event data.
  for (const trigger of manifest.scene_triggers) {
    const device = trigger.fields[0];
    assert.deepEqual([device.key, device.type, device.source], ['device', 'select', 'devices']);
    assert.ok(!device.required, `${trigger.key}: empty = every device`);
    const variables = trigger.variables.map((v) => v.key);
    assert.deepEqual(variables.slice(0, 2), ['device', 'device_name'], trigger.key);
  }
});

test('the scene actions mirror the code: zones, bounds, outputs', () => {
  const actions = byKey(manifest.scene_actions);
  const temporary = byKey(actions.get('set_temporary').fields);
  assert.deepEqual(
    [temporary.get('zone').source, temporary.get('zone').required],
    ['devices', true],
  );
  assert.ok(temporary.get('temperature').required && temporary.get('temperature').default);
  assert.equal(temporary.get('minutes').max, MAX_TEMPORARY_MINUTES);
  assert.ok(!temporary.get('minutes').required, 'empty = until the next switch');
  assert.deepEqual(
    actions.get('set_temporary').outputs.map((o) => [o.key, o.type]),
    [['end', 'string']],
  );
  const program = byKey(actions.get('set_clock_program').fields);
  assert.ok(!program.get('zone').required, 'empty = every zone');
  assert.deepEqual(values(program.get('program')), ['1', '2', '3']);
  assert.ok(program.get('program').default);
  const holiday = byKey(actions.get('set_holiday').fields);
  assert.ok(!holiday.get('appliance').required, 'empty = every appliance');
  assert.deepEqual([holiday.get('days').min, holiday.get('days').max], [0, MAX_HOLIDAY_DAYS]);
  assert.ok(holiday.get('days').default !== undefined, 'a required field has a default');
  assert.deepEqual(
    actions.get('set_holiday').outputs.map((o) => [o.key, o.type]),
    [
      ['count', 'number'],
      ['until', 'string'],
    ],
  );
  for (const key of ['set_clock_program', 'hot_water_boost']) {
    assert.deepEqual(
      actions.get(key).outputs.map((o) => [o.key, o.type]),
      [
        ['count', 'number'],
        ['failed', 'number'],
      ],
    );
  }
  assert.deepEqual(
    actions.get('refresh').outputs.map((o) => o.key),
    ['zones', 'pressure', 'outdoor_temperature', 'energy_today'],
  );
  // The state fields filter by the values of the event data.
  const triggers = byKey(manifest.scene_triggers);
  assert.deepEqual(values(byKey(triggers.get('connection_changed').fields).get('state')), [
    'offline',
    'online',
  ]);
  assert.deepEqual(values(byKey(triggers.get('holiday_changed').fields).get('state')), [
    'started',
    'ended',
  ]);
});

test('the configuration mirrors the code', () => {
  const config = byKey(manifest.config_schema);
  const minutes = config.get('refresh_minutes');
  assert.deepEqual(values(minutes), REFRESH_MINUTES.options.map(String));
  assert.equal(minutes.default, String(REFRESH_MINUTES.default));
  const language = config.get('language');
  assert.deepEqual(values(language), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(language.default, AUTO_LANGUAGE);
  const intro = config.get('intro');
  assert.equal(intro.type, 'section');
  assert.ok(intro.links.every((link) => link.url.startsWith('https://')));
  assert.match(intro.description.en, /Remeha Home app/);
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.actions.length <= 10);
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20 && manifest.scene_actions.length <= 20);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
    assert.ok(trigger.key.length <= 40);
  }
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
  }
  for (const widget of manifest.widgets) {
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('catalog keywords of Gladys 5.3.0; every country (Remeha Home is sold across Europe)', () => {
  const keywords = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.ok(keywords.length >= 1 && keywords.length <= 10, 'one to ten keywords');
  keywords.forEach((keyword) => assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword));
  assert.equal(new Set(keywords).size, keywords.length, 'unique once trimmed and lowercased');
  assert.equal(manifest.countries, undefined);
});
