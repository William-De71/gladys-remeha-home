# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for Remeha Home: a Node.js service
(Node 22+, ESM, no build step) that runs in its own sandboxed Docker container
and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. The heating comes from the cloud of BDR Thermea
behind the Remeha Home app (`https://api.bdrthermea.net/Mobile/api`, login
`https://remehalogin.bdrthermea.net`, Azure AD B2C with PKCE), with the e-mail
and the password of the account. BDR Thermea does **not document** this API:
the routes are the ones the community integration for Home Assistant uses and
documents (see NOTICE), and it was never tried on a real account. Transport:
cloud.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run coverage                          # tests with the coverage of node --test
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the clock
                        (tick), the readings (dashboard, then the slower
                        energy and technical details), the commands, the
                        commanded values shown until confirmed, the errors
                        (refused credentials, 429), the status
src/remeha-api.js       the HTTP client: the login of the app (cookies, CSRF,
                        PKCE, code), tokens in memory (refresh, new login),
                        one renewal on a 401, requests spaced, error classes;
                        never logs a secret
src/remeha.js           the Remeha data model: dashboard -> appliances, zones,
                        hot water zones; the times of the API; the Gladys
                        values of the modes; setpoints; daily energy -> index
src/device.js           one Gladys device per zone, per hot water zone and per
                        appliance, their features and states
src/constants.js        Gladys core values the SDK does not export (thermostat
                        mode / operating state, water heater mode)
src/events.js           scene trigger detection (transitions), action keys and
                        the parsing of the action fields
src/widgets.js          zones, energy and status dashboard widgets
src/state.js            /data/state.json: trigger snapshots, energy records,
                        model names (never a token)
src/config.js           configuration (e-mail, password, interval, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: the device
  external ids `ext:<selector>:zone:<climateZoneId>`,
  `ext:<selector>:hot_water:<hotWaterZoneId>` and
  `ext:<selector>:appliance:<applianceId>` (Remeha UUIDs, URI-encoded, never a
  name), the feature keys (`mode`, `target_temperature`, `operating_state`,
  `temperature`, `fireplace`, `heating`, `pressure`, `outdoor_temperature`,
  `energy`), feature `category` / `type` / `unit` / `step`, the keys of
  `config_schema`, `actions`, the select values (`1`, `2`, `5`, `10`,
  `auto`…), the widgets and their settings, the widget button actions
  (`all_schedule`, `boost`, `refresh`), the scene triggers (fields, options,
  variables) and scene actions (fields, options, outputs).
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration. The setpoint `min` / `max` come
  from the zone (`setPointMin` / `setPointMax`, `setPointRanges`).
- **The API is undocumented.** Never invent a route or a field: the ones used
  are listed at the top of `src/remeha-api.js` and come from the projects in
  NOTICE (their documentation/api.md). Every answer is parsed defensively (a
  missing field is `null`, a wrong shape an empty list), and a secondary
  reading that fails (energy, technical details) never fails the dashboard.
- **Times**: `nextSwitchTime` is a LOCAL time of the appliance written with a
  `Z` (show its wall clock, never convert it); `temporaryOverride.endTime` and
  `boostModeEndTime` are real UTC; a year 1 means "not set". The energy routes
  take `YYYY-MM-DD HH:mm:ss.000Z` read as local days.
- **One device per climate zone, per hot water zone, per appliance.**
  Features follow what the zone reports: `fireplace` only with
  `capabilityFirePlaceMode`, the water `temperature` only for a tank (or a
  measured value), the boost option only with `capabilityBoostMode`, the
  energy index only with `capabilityEnergyConsumption`.
- **Category / type pairs** come from the SDK constants and the core 5.3.0:
  `thermostat` / `mode` (AUTO = Scheduling or TemporaryOverride, HEATING =
  Manual, OFF = FrostProtection), `target-temperature`, `operating-state`;
  `water-heater` / `mode` (PROGRAM = Scheduling, MANUAL = ContinuousComfort,
  ECO = Off, BOOST = Boost), `target-temperature` (comfort setpoint),
  `heating`; `temperature-sensor` / `pressure-sensor` / `decimal`;
  `switch` / `binary`; `energy-sensor` / `index` (kilowatt-hour).
- **Writes**: a setpoint on a zone that follows its schedule is a
  `temporary-override` (until the next switch, as the app), on a manual or
  frost-protected zone a `manual` setpoint. A hot water boost is only
  accepted from `Scheduling`: switch to the schedule first. The eco setpoint
  of the hot water (tank only) is not written.
- **Energy**: Remeha gives one figure per day (heating + hot water + cooling
  consumed, kWh), about 2 hours late; the running day is stamped with the UTC
  time of its latest data. `accountDays` adds only the increase of each day,
  ignores lower figures and more than 1 000 kWh a day, starts at today's
  energy, and the record lives in /data. Never publish a daily value as an
  index.
- **`should_poll` stays false**: one `GET /homes/dashboard` reads every zone
  on the integration's own clock (1, 2, 5 or 10 minutes); the energy every 15
  minutes, the technical details once per appliance (kept in /data). Never add
  a request per zone at each reading.
- **A command never waits in `onSetValue`** (5 s ack): it is checked, shown at
  once and sent without awaiting; one reading follows 8 s later. The
  commanded values win over the cloud for 3 minutes at most. A 429 slows the
  readings down (the interval doubles, up to 30 minutes); refused credentials
  are tried again every 30 minutes or as soon as they change.
- **The password and the tokens** live in memory only: never logged, never
  in /data, never in a scene variable nor an error message; neither is the
  e-mail. After a restart the integration logs in again.
- **Scene events**: one per transition between two readings of an appliance
  the user added (baseline at the first reading, kept in /data across
  restarts); "holiday changed" never fires within 10 minutes of the
  `set_holiday` action on that appliance.
- **Gladys does not pass DEBUG / LOG_LEVEL to the container**: never tell a
  store user to set them; "Test the connection" is the diagnostic button.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **No copied code.** The protocol facts come from the community integration
  for Home Assistant (no license file), credited in NOTICE; no code is copied
  from it.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. `>=5.3.0` for `keywords`; no `countries` (Remeha Home is used across
  Europe); no permission. Transport: `["cloud"]`.
- **CI smoke test.** `ci.yml` counts the features of a zone with a fireplace
  (5), of a hot water tank (4) and of the appliance (3) in the Docker image:
  update it with the features.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
