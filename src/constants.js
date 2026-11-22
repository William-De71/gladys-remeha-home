// -----------------------------------------------------------------------------
// Values of the Gladys core the SDK does not export (server/utils/constants.js
// of Gladys 5.3.0). They are stored in device states and in users' scenes, and
// the core never changes the meaning of an existing value.
// -----------------------------------------------------------------------------

// What a thermostat is set to do (thermostat/mode).
const THERMOSTAT_MODE = { OFF: 0, HEATING: 1, COOLING: 2, AUTO: 3 };

// What it does right now (thermostat/operating-state).
const THERMOSTAT_OPERATING_STATE = { IDLE: 0, HEATING: 1, COOLING: 2 };

// The operating mode of a water heater (water-heater/mode).
const WATER_HEATER_MODE = { OFF: 0, AUTO: 1, ECO: 2, BOOST: 3, MANUAL: 4, AWAY: 5, PROGRAM: 6 };

export { THERMOSTAT_MODE, THERMOSTAT_OPERATING_STATE, WATER_HEATER_MODE };
