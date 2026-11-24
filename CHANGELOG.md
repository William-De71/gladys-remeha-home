# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.1] - 2026-11-24

- Maintenance release.

## [0.1.0] - 2026-11-22

### Added

- The heating of a Remeha Home account (Remeha boilers, heat pumps and hybrids; Baxi, De Dietrich and Brötje on the same cloud) through the service of the Remeha Home app, with the e-mail and the password of the account; every zone read in one request every 1, 2, 5 or 10 minutes, a "Test the connection" button.
- One thermostat per climate zone: mode schedule, manual or off; setpoint within the bounds of the zone by half degrees (a temporary override on a zone that follows its schedule); heating demand; room temperature; fireplace mode when the zone has one.
- One water heater per hot water zone: schedule, comfort, eco or boost; comfort temperature; heating or not; water temperature of a tank.
- One device per appliance: water pressure, outdoor temperature and an energy index from the daily estimate of Remeha, that Gladys turns into a consumption and a cost.
- Commands shown at once and confirmed by the next reading.
- Scene triggers: the appliance reports a fault or is back to normal, the water pressure gets too low, the appliance goes offline or back online, a holiday starts or ends; each one filtered by appliance.
- Scene actions: set a temporary temperature for a duration or until the next switch, choose a clock program, set or cancel the holiday mode, start a hot water boost, read Remeha Home now.
- Dashboard widgets: the zones and the hot water ("Back to schedule" and "Hot water boost"), the energy of the last 7 days by use, and the appliance (pressure, outdoor temperature, connection, status, holiday).
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.1.1]: https://github.com/William-De71/gladys-remeha-home/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/William-De71/gladys-remeha-home/releases/tag/v0.1.0
