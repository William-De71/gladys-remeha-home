// -----------------------------------------------------------------------------
// Entry point of the Remeha Home external integration.
//
// The heating of a Remeha Home account (boilers, heat pumps and hybrids of
// Remeha, and of Baxi, De Dietrich and Brötje on the same cloud), through the
// e-mail and password of the Remeha Home app:
//   - devices: one thermostat per climate zone (mode, setpoint, heating or
//     not, room temperature, fireplace mode), one water heater per hot water
//     zone (schedule / comfort / eco / boost, comfort temperature, heating or
//     not, tank temperature), and one device per appliance (water pressure,
//     outdoor temperature, energy index), offered on the Discovery screen
//     (see src/device.js);
//   - scene triggers: the appliance reports a fault or recovers, the water
//     pressure gets too low, the appliance goes offline or back online, a
//     holiday starts or ends;
//   - scene actions: a temporary temperature, a clock program, a holiday,
//     a hot water boost, read now;
//   - dashboard widgets: the zones, the energy of the last 7 days, the
//     appliance.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
//   TZ (the timezone of Gladys: the language guess, the days as a fallback)
// The SDK reads the first three: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';
import { createRemehaApi } from './src/remeha-api.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys, { api: createRemehaApi({ userAgent: `gladys-remeha-home/${version}` }) });

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Remeha Home integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
