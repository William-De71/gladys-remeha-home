// -----------------------------------------------------------------------------
// The Gladys devices: one per climate zone, one per hot water zone, one per
// appliance (the boiler or heat pump).
//
// Climate zone (external id `…:zone:<climateZoneId>`), a thermostat:
//
//   key                 category / type                    unit     writable
//   mode                thermostat / mode                  -        yes (off, manual, schedule)
//   target_temperature  thermostat / target-temperature    celsius  yes (zone bounds, 0.5)
//   operating_state     thermostat / operating-state       -        no  (idle, heating, cooling)
//   temperature         temperature-sensor / decimal       celsius  no
//   fireplace           switch / binary                    -        yes (when the zone has it)
//
// Hot water zone (`…:hot_water:<hotWaterZoneId>`), a water heater:
//
//   mode                water-heater / mode                -        yes (schedule, comfort, eco, boost)
//   target_temperature  water-heater / target-temperature  celsius  yes (comfort setpoint, 1)
//   heating             water-heater / heating             -        no
//   temperature         temperature-sensor / decimal       celsius  no  (a tank only)
//
// Appliance (`…:appliance:<applianceId>`):
//
//   pressure            pressure-sensor / decimal          bar      no
//   outdoor_temperature temperature-sensor / decimal       celsius  no
//   energy              energy-sensor / index              kWh      no  (when Remeha measures it)
//
// The feature keys, categories, types, units and bounds are forever (the
// Discovery "Update" button compares them): see test/structure.test.js.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { THERMOSTAT_MODE, THERMOSTAT_OPERATING_STATE, WATER_HEATER_MODE } from './constants.js';
import { KINDS, zoneMode, operatingState, hotWaterMode, hotWaterHeating } from './remeha.js';
import { t, has } from './i18n.js';

const writable = { read_only: false, has_feedback: true };
const readOnly = { read_only: true, has_feedback: false };
// Zone setpoints go by half degrees, hot water by degrees.
const ZONE_STEP = 0.5;
const HOT_WATER_STEP = 1;

const round = (value, digits = 1) =>
  value === null || value === undefined ? null : Math.round(value * 10 ** digits) / 10 ** digits;

const temperatureSensor = (key, min, max, value, present = () => true) => ({
  key,
  category: CATEGORIES.TEMPERATURE_SENSOR,
  type: TYPES.SENSOR.DECIMAL,
  unit: UNITS.CELSIUS,
  min,
  max,
  ...readOnly,
  present,
  value,
});

// Order = order of the features in Gladys. `present` decides from the parsed
// model; `value` gives the state (null: nothing to publish); `options` gives
// the supported options of an enum.
const ZONE_FEATURES = [
  {
    key: 'mode',
    category: CATEGORIES.THERMOSTAT,
    type: TYPES.THERMOSTAT.MODE,
    min: THERMOSTAT_MODE.OFF,
    max: THERMOSTAT_MODE.AUTO,
    ...writable,
    options: (language) => [
      { value: THERMOSTAT_MODE.AUTO, label: t('mode_schedule', language), sort_order: 0 },
      { value: THERMOSTAT_MODE.HEATING, label: t('mode_manual', language), sort_order: 1 },
      { value: THERMOSTAT_MODE.OFF, label: t('mode_off', language), sort_order: 2 },
    ],
    present: () => true,
    value: (zone) => zoneMode(zone),
  },
  {
    key: 'target_temperature',
    category: CATEGORIES.THERMOSTAT,
    type: TYPES.THERMOSTAT.TARGET_TEMPERATURE,
    unit: UNITS.CELSIUS,
    min: (zone) => zone.min,
    max: (zone) => zone.max,
    step: ZONE_STEP,
    ...writable,
    present: () => true,
    value: (zone) => round(zone.setpoint),
  },
  {
    key: 'operating_state',
    category: CATEGORIES.THERMOSTAT,
    type: TYPES.THERMOSTAT.OPERATING_STATE,
    min: THERMOSTAT_OPERATING_STATE.IDLE,
    max: THERMOSTAT_OPERATING_STATE.COOLING,
    ...readOnly,
    present: () => true,
    value: (zone) => operatingState(zone),
  },
  temperatureSensor('temperature', -20, 60, (zone) => round(zone.room)),
  {
    key: 'fireplace',
    category: CATEGORIES.SWITCH,
    type: TYPES.SWITCH.BINARY,
    min: 0,
    max: 1,
    ...writable,
    present: (zone) => zone.canFireplace,
    value: (zone) => (zone.fireplace === null ? null : zone.fireplace ? 1 : 0),
  },
];

const HOT_WATER_FEATURES = [
  {
    key: 'mode',
    category: CATEGORIES.WATER_HEATER,
    type: TYPES.WATER_HEATER.MODE,
    min: WATER_HEATER_MODE.OFF,
    max: WATER_HEATER_MODE.PROGRAM,
    ...writable,
    options: (language, zone) => [
      { value: WATER_HEATER_MODE.PROGRAM, label: t('dhw_schedule', language), sort_order: 0 },
      { value: WATER_HEATER_MODE.MANUAL, label: t('dhw_comfort', language), sort_order: 1 },
      { value: WATER_HEATER_MODE.ECO, label: t('dhw_eco', language), sort_order: 2 },
      ...(zone.canBoost
        ? [{ value: WATER_HEATER_MODE.BOOST, label: t('dhw_boost', language), sort_order: 3 }]
        : []),
    ],
    present: () => true,
    value: (zone) => hotWaterMode(zone),
  },
  {
    key: 'target_temperature',
    category: CATEGORIES.WATER_HEATER,
    type: TYPES.WATER_HEATER.TARGET_TEMPERATURE,
    unit: UNITS.CELSIUS,
    min: (zone) => zone.min,
    max: (zone) => zone.max,
    step: HOT_WATER_STEP,
    ...writable,
    present: () => true,
    value: (zone) => round(zone.comfort),
  },
  {
    key: 'heating',
    category: CATEGORIES.WATER_HEATER,
    type: TYPES.WATER_HEATER.HEATING,
    min: 0,
    max: 1,
    ...readOnly,
    present: () => true,
    value: (zone) => {
      const heating = hotWaterHeating(zone);
      return heating === null ? null : heating ? 1 : 0;
    },
  },
  temperatureSensor(
    'temperature',
    0,
    100,
    (zone) => round(zone.temperature),
    // A combi boiler has no tank to measure (always null).
    (zone) => zone.type === 'Tank' || zone.temperature !== null,
  ),
];

const APPLIANCE_FEATURES = [
  {
    key: 'pressure',
    category: CATEGORIES.PRESSURE_SENSOR,
    type: TYPES.SENSOR.DECIMAL,
    unit: UNITS.BAR,
    min: 0,
    max: 6,
    ...readOnly,
    present: (appliance) => appliance.pressure !== null,
    value: (appliance) => round(appliance.pressure, 2),
  },
  temperatureSensor(
    'outdoor_temperature',
    -50,
    60,
    (appliance) => round(appliance.outdoor),
    (appliance) => appliance.outdoor !== null,
  ),
  {
    key: 'energy',
    category: CATEGORIES.ENERGY_SENSOR,
    type: TYPES.ENERGY_SENSOR.INDEX,
    unit: UNITS.KILOWATT_HOUR,
    min: 0,
    max: 10000000,
    ...readOnly,
    present: (appliance) => appliance.canEnergy,
    value: (appliance) =>
      appliance.energyKwh === null || appliance.energyKwh === undefined
        ? null
        : round(appliance.energyKwh, 3),
  },
];

const FEATURES_OF_KIND = {
  [KINDS.ZONE]: ZONE_FEATURES,
  [KINDS.HOT_WATER]: HOT_WATER_FEATURES,
  [KINDS.APPLIANCE]: APPLIANCE_FEATURES,
};
const FEATURE_KEYS = [
  ...new Set([...ZONE_FEATURES, ...HOT_WATER_FEATURES, ...APPLIANCE_FEATURES].map((f) => f.key)),
];

/**
 * @description The ids of a model. The Remeha ids are UUIDs; they are
 * URI-encoded anyway so a colon could never cut a feature id.
 * @param {object} gladys - The Gladys client (externalIds).
 * @param {object} model - A parsed appliance, zone or hot water zone.
 * @returns {{ device: string, feature: Function }} The ids.
 */
function idsOf(gladys, model) {
  return gladys.externalIds(model.kind, encodeURIComponent(model.id));
}

/**
 * @description The features a model has.
 * @param {object} model - A parsed model.
 * @returns {object[]} The feature specs.
 */
function featuresOf(model) {
  return (FEATURES_OF_KIND[model.kind] ?? []).filter((f) => f.present(model));
}

/**
 * @description The name of a device. Zones carry their own name; the
 * appliance is named after its type and its home.
 * @param {object} model - A parsed model.
 * @param {string} [language] - The language.
 * @returns {string} The name.
 */
function deviceName(model, language = 'en') {
  if (model.kind === KINDS.ZONE) return model.name || t('zoneName', language);
  if (model.kind === KINDS.HOT_WATER) {
    // "DHW" is the default name of the app: a readable name instead.
    return !model.name || /^dhw$/i.test(model.name) ? t('hotWaterName', language) : model.name;
  }
  const type = has(`type_${model.type}`) ? `type_${model.type}` : 'type_other';
  const base = model.model || t(type, language);
  return model.name ? `${base} (${model.name})` : base;
}

/**
 * @description The Discovery payload of a model.
 * @param {object} gladys - The Gladys client.
 * @param {object} model - A parsed model.
 * @param {string} language - Language of the feature names.
 * @returns {object} The device.
 */
function buildDevice(gladys, model, language = 'en') {
  const ids = idsOf(gladys, model);
  const params = [{ name: 'REMEHA_KIND', value: model.kind }];
  if (model.kind !== KINDS.APPLIANCE)
    params.push({ name: 'REMEHA_APPLIANCE', value: model.applianceId });
  if (model.kind === KINDS.APPLIANCE && model.type)
    params.push({ name: 'REMEHA_TYPE', value: model.type });
  if (model.kind === KINDS.HOT_WATER && model.type)
    params.push({ name: 'REMEHA_DHW_TYPE', value: model.type });
  return {
    name: deviceName(model, language),
    external_id: ids.device,
    model: model.kind === KINDS.APPLIANCE ? model.model || 'Remeha' : 'Remeha Home',
    should_poll: false,
    params,
    features: featuresOf(model).map((feature) => {
      // eslint-disable-next-line no-unused-vars
      const { key, present, value, options, min, max, ...fields } = feature;
      return {
        ...fields,
        min: typeof min === 'function' ? min(model) : min,
        max: typeof max === 'function' ? max(model) : max,
        name: t(`feature_${model.kind}_${key}`, language),
        external_id: ids.feature(key),
        ...(options ? { supported_options: options(language, model) } : {}),
      };
    }),
  };
}

/**
 * @description The states of a model.
 * @param {object} gladys - The Gladys client.
 * @param {object} model - A parsed model.
 * @returns {Array<{device_feature_external_id: string, state: number}>} The states.
 */
function buildStates(gladys, model) {
  const ids = idsOf(gladys, model);
  return featuresOf(model).flatMap((feature) => {
    const state = feature.value(model);
    return state === null || state === undefined
      ? []
      : [{ device_feature_external_id: ids.feature(feature.key), state }];
  });
}

/**
 * @description What Discovery would compare: a change republishes the list.
 * @param {object} gladys - The Gladys client.
 * @param {object[]} models - Parsed models.
 * @param {string} language - Language of the feature names.
 * @returns {string} A signature.
 */
function discoverySignature(gladys, models, language) {
  return JSON.stringify(
    models.map((model) => {
      const device = buildDevice(gladys, model, language);
      return [
        device.external_id,
        device.name,
        device.model,
        device.features.map((f) => [f.external_id, f.name, f.min, f.max, f.supported_options]),
      ];
    }),
  );
}

export {
  ZONE_FEATURES,
  HOT_WATER_FEATURES,
  APPLIANCE_FEATURES,
  FEATURE_KEYS,
  ZONE_STEP,
  HOT_WATER_STEP,
  idsOf,
  featuresOf,
  deviceName,
  buildDevice,
  buildStates,
  discoverySignature,
};
