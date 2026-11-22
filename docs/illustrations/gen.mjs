// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The three widgets on a made-up home, on a fixed morning (Sunday 15 November
// 2026, 8:42 in Paris): a hybrid heat pump with a living room heating on its
// schedule, a bedroom at a temporary temperature, an attic switched off, a
// hot water tank on its schedule with a command being sent; the energy of the
// last 7 days (more for heating on the cold days), and the appliance.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildZonesWidget, buildEnergyWidget, buildStatusWidget } = await load('src/widgets.js');
const { parseDashboard, accountDays } = await load('src/remeha.js');
const { deviceName } = await load('src/device.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

const NOW = Date.parse('2026-11-15T07:42:00Z');
const TIMEZONE = 'Europe/Paris';
const zone = (id, fields) => ({
  climateZoneId: id,
  zoneType: 'CH',
  activeComfortDemand: 'Idle',
  zoneMode: 'Scheduling',
  capabilityFirePlaceMode: false,
  firePlaceModeActive: false,
  setPointMin: 5,
  setPointMax: 30,
  activeHeatingClimateTimeProgramNumber: 1,
  capabilityTemporaryOverrideEndTime: true,
  temporaryOverride: { endTime: '0001-01-01T00:00:00Z' },
  preHeat: { enabled: true, active: false },
  ...fields,
});
const DASHBOARD = {
  appliances: [
    {
      applianceId: 'a1',
      applianceOnline: true,
      applianceType: 'HeatPump',
      houseName: '',
      errorStatus: 'Running',
      activeThermalMode: 'HeatingCH',
      outdoorTemperatureInformation: { applianceOutdoorTemperature: 4.5 },
      holidaySchedule: {
        startTime: '2026-12-21T00:00:01Z',
        endTime: '2027-01-03T00:00:01Z',
        active: false,
      },
      waterPressure: 1.6,
      waterPressureOK: true,
      capabilityEnergyConsumption: true,
      timeZone: TIMEZONE,
      climateZones: [
        zone('living', {
          activeComfortDemand: 'ProducingHeat',
          roomTemperature: 19.4,
          setPoint: 20.5,
          nextSetpoint: 18,
          nextSwitchTime: '2026-11-15T22:30:00Z',
          capabilityFirePlaceMode: true,
        }),
        zone('bedroom', {
          zoneMode: 'TemporaryOverride',
          roomTemperature: 18.1,
          setPoint: 19,
          nextSetpoint: 17,
          nextSwitchTime: '2026-11-15T10:00:00Z',
          temporaryOverride: { endTime: '2026-11-15T09:00:00Z' },
          activeHeatingClimateTimeProgramNumber: 2,
        }),
        zone('attic', { zoneMode: 'FrostProtection', roomTemperature: 12.3, setPoint: 6 }),
      ],
      hotWaterZones: [
        {
          hotWaterZoneId: 'dhw',
          name: 'DHW',
          dhwZoneMode: 'Scheduling',
          dhwStatus: 'Idle',
          dhwType: 'Tank',
          dhwTemperature: 48.6,
          comfortSetPoint: 55,
          reducedSetpoint: 40,
          capabilityBoostMode: true,
          nextSwitchActivity: 'Reduced',
          nextSwitchTime: '2026-11-15T09:00:00Z',
        },
      ],
    },
  ],
};
const NAMES = {
  en: ['Living room', 'Bedroom', 'Attic'],
  fr: ['Salon', 'Chambre', 'Combles'],
  de: ['Wohnzimmer', 'Schlafzimmer', 'Dachboden'],
  es: ['Salón', 'Dormitorio', 'Desván'],
};
const WAITING = new Set(['dhw']);

// Eight days of energy: heating follows the cold, hot water stays steady; the
// running day so far.
const HEATING = [18, 22, 27, 24, 19, 21, 25, 7];
const HOT_WATER = [4, 3, 4, 4, 3, 5, 4, 1];
const days = HEATING.map((heating, i) => {
  const day = new Date(Date.parse('2026-11-08T12:00:00Z') + i * 86400000)
    .toISOString()
    .slice(0, 10);
  return {
    timeStamp: i === 7 ? '2026-11-15T05:00:00+00:00' : `${day}T00:00:00+00:00`,
    heatingEnergyConsumed: heating,
    hotWaterEnergyConsumed: HOT_WATER[i],
    coolingEnergyConsumed: 0,
  };
});
const record = accountDays(null, days, TIMEZONE, '2026-11-15').record;

const contents = {};
for (const language of LANGUAGES) {
  const parsed = parseDashboard(DASHBOARD);
  const zones = parsed.zones.map((model, i) => ({ ...model, name: NAMES[language][i] }));
  const list = [...zones, ...parsed.hotWaters].map((model) => ({
    model,
    name: deviceName(model, language),
    waiting: WAITING.has(model.id),
  }));
  const appliance = { ...parsed.appliances[0], model: 'Elga Ace' };
  contents[language] = {
    zones: buildZonesWidget({
      zones: list,
      connection: 'ok',
      lastSuccessAt: NOW - 60 * 1000,
      language,
      units: 'metric',
      timezone: TIMEZONE,
      now: NOW,
    }),
    energy: buildEnergyWidget({
      records: [record],
      connection: 'ok',
      language,
      timezone: TIMEZONE,
      now: NOW,
    }),
    status: buildStatusWidget({
      appliance,
      name: deviceName(appliance, language),
      connection: 'ok',
      lastSuccessAt: NOW - 60 * 1000,
      language,
      units: 'metric',
      now: NOW,
    }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
