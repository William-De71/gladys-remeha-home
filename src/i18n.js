// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: feature names, widget contents, toasts, messages of the
// Configuration screen. Vocabulary of the Gladys interface: appareil / Gerät /
// dispositivo, scène / Szene / escena, consigne / Solltemperatur / consigna;
// and of the Remeha Home app: programme horaire / Zeitprogramm / programa
// horario, Confort, Éco, Boost, hors-gel, mode cheminée.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // device names
  zoneName: {
    en: 'Heating zone',
    fr: 'Zone de chauffage',
    de: 'Heizzone',
    es: 'Zona de calefacción',
  },
  hotWaterName: { en: 'Hot water', fr: 'Eau chaude', de: 'Warmwasser', es: 'Agua caliente' },
  type_Boiler: { en: 'Boiler', fr: 'Chaudière', de: 'Heizkessel', es: 'Caldera' },
  type_HeatPump: { en: 'Heat pump', fr: 'Pompe à chaleur', de: 'Wärmepumpe', es: 'Bomba de calor' },
  type_other: {
    en: 'Remeha appliance',
    fr: 'Générateur Remeha',
    de: 'Remeha-Gerät',
    es: 'Equipo Remeha',
  },

  // feature names (Discovery, device page)
  feature_zone_mode: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
  feature_zone_target_temperature: {
    en: 'Setpoint',
    fr: 'Consigne',
    de: 'Solltemperatur',
    es: 'Consigna',
  },
  feature_zone_operating_state: {
    en: 'Heating demand',
    fr: 'Demande de chauffe',
    de: 'Wärmeanforderung',
    es: 'Demanda de calor',
  },
  feature_zone_temperature: {
    en: 'Room temperature',
    fr: 'Température de la pièce',
    de: 'Raumtemperatur',
    es: 'Temperatura ambiente',
  },
  feature_zone_fireplace: {
    en: 'Fireplace mode',
    fr: 'Mode cheminée',
    de: 'Kaminmodus',
    es: 'Modo chimenea',
  },
  feature_hot_water_mode: {
    en: 'Hot water mode',
    fr: 'Mode eau chaude',
    de: 'Warmwassermodus',
    es: 'Modo agua caliente',
  },
  feature_hot_water_target_temperature: {
    en: 'Comfort temperature',
    fr: 'Température confort',
    de: 'Komforttemperatur',
    es: 'Temperatura confort',
  },
  feature_hot_water_heating: {
    en: 'Heating water',
    fr: 'Chauffe de l’eau',
    de: 'Wasser wird erwärmt',
    es: 'Calentando agua',
  },
  feature_hot_water_temperature: {
    en: 'Water temperature',
    fr: 'Température de l’eau',
    de: 'Wassertemperatur',
    es: 'Temperatura del agua',
  },
  feature_appliance_pressure: {
    en: 'Water pressure',
    fr: 'Pression d’eau',
    de: 'Wasserdruck',
    es: 'Presión del agua',
  },
  feature_appliance_outdoor_temperature: {
    en: 'Outdoor temperature',
    fr: 'Température extérieure',
    de: 'Außentemperatur',
    es: 'Temperatura exterior',
  },
  feature_appliance_energy: {
    en: 'Energy consumed',
    fr: 'Énergie consommée',
    de: 'Verbrauchte Energie',
    es: 'Energía consumida',
  },

  // climate zone modes
  mode_schedule: {
    en: 'Schedule',
    fr: 'Programme horaire',
    de: 'Zeitprogramm',
    es: 'Programa horario',
  },
  mode_override: {
    en: 'Temporary',
    fr: 'Temporaire',
    de: 'Vorübergehend',
    es: 'Temporal',
  },
  mode_manual: { en: 'Manual', fr: 'Manuel', de: 'Manuell', es: 'Manual' },
  mode_off: {
    en: 'Off (frost protection)',
    fr: 'Arrêt (hors-gel)',
    de: 'Aus (Frostschutz)',
    es: 'Apagado (antihielo)',
  },
  mode_unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },

  // hot water modes
  dhw_schedule: {
    en: 'Schedule',
    fr: 'Programme horaire',
    de: 'Zeitprogramm',
    es: 'Programa horario',
  },
  dhw_comfort: { en: 'Comfort', fr: 'Confort', de: 'Komfort', es: 'Confort' },
  dhw_eco: { en: 'Eco', fr: 'Éco', de: 'Eco', es: 'Eco' },
  dhw_boost: { en: 'Boost', fr: 'Boost', de: 'Boost', es: 'Boost' },
  dhw_unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  activity_comfort: { en: 'comfort', fr: 'confort', de: 'Komfort', es: 'confort' },
  activity_eco: { en: 'eco', fr: 'éco', de: 'Eco', es: 'eco' },

  // widget: zones
  badgeWaiting: { en: 'Sending…', fr: 'Envoi…', de: 'Wird gesendet', es: 'Enviando…' },
  badgeHeating: { en: 'Heating', fr: 'Chauffe', de: 'Heizt', es: 'Calentando' },
  badgeCooling: { en: 'Cooling', fr: 'Rafraîchit', de: 'Kühlt', es: 'Enfriando' },
  detailMode: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
  detailRoom: { en: 'Room', fr: 'Pièce', de: 'Raum', es: 'Estancia' },
  detailSetpoint: { en: 'Setpoint', fr: 'Consigne', de: 'Solltemperatur', es: 'Consigna' },
  detailUntil: { en: 'Until', fr: 'Jusqu’à', de: 'Bis', es: 'Hasta' },
  untilNextSwitch: {
    en: 'the next switch of the schedule',
    fr: 'la prochaine étape du programme',
    de: 'zum nächsten Schaltpunkt',
    es: 'el próximo cambio del programa',
  },
  detailNext: { en: 'Next', fr: 'Ensuite', de: 'Danach', es: 'Después' },
  nextAt: {
    en: '{temperature} at {time}',
    fr: '{temperature} à {time}',
    de: '{temperature} um {time}',
    es: '{temperature} a las {time}',
  },
  nextActivityAt: {
    en: '{activity} at {time}',
    fr: '{activity} à {time}',
    de: '{activity} um {time}',
    es: '{activity} a las {time}',
  },
  detailProgram: { en: 'Clock program', fr: 'Programme', de: 'Zeitprogramm', es: 'Programa' },
  programN: { en: 'no. {n}', fr: 'n° {n}', de: 'Nr. {n}', es: 'n.º {n}' },
  detailFireplace: {
    en: 'Fireplace mode',
    fr: 'Mode cheminée',
    de: 'Kaminmodus',
    es: 'Modo chimenea',
  },
  detailPreHeat: { en: 'Pre-heating', fr: 'Préchauffage', de: 'Vorheizen', es: 'Precalentamiento' },
  on: { en: 'on', fr: 'actif', de: 'an', es: 'activo' },
  detailComfort: { en: 'Comfort', fr: 'Confort', de: 'Komfort', es: 'Confort' },
  detailEco: { en: 'Eco', fr: 'Éco', de: 'Eco', es: 'Eco' },
  detailWater: { en: 'Water', fr: 'Eau', de: 'Wasser', es: 'Agua' },
  captionUpdated: { en: 'Read {ago}', fr: 'Relevé {ago}', de: 'Gelesen {ago}', es: 'Leído {ago}' },
  captionUpdatedHidden: {
    en: 'Read {ago} · {n} more: choose the zones',
    fr: 'Relevé {ago} · {n} de plus : choisissez les zones',
    de: 'Gelesen {ago} · {n} weitere: Zonen wählen',
    es: 'Leído {ago} · {n} más: elija las zonas',
  },
  buttonAllSchedule: {
    en: 'Back to schedule',
    fr: 'Retour au programme',
    de: 'Zurück zum Programm',
    es: 'Volver al programa',
  },
  buttonBoost: {
    en: 'Hot water boost',
    fr: 'Boost eau chaude',
    de: 'Warmwasser-Boost',
    es: 'Boost agua caliente',
  },
  buttonRefresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  emptyZones: {
    en: 'No zone in this Remeha Home account.',
    fr: 'Aucune zone dans ce compte Remeha Home.',
    de: 'Keine Zone in diesem Remeha-Home-Konto.',
    es: 'Ninguna zona en esta cuenta Remeha Home.',
  },

  // widget: energy
  tileToday: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  tileYesterday: { en: 'Yesterday', fr: 'Hier', de: 'Gestern', es: 'Ayer' },
  chartTitle: {
    en: 'Last 7 days',
    fr: '7 derniers jours',
    de: 'Letzte 7 Tage',
    es: 'Últimos 7 días',
  },
  seriesHeating: { en: 'Heating', fr: 'Chauffage', de: 'Heizung', es: 'Calefacción' },
  seriesHotWater: { en: 'Hot water', fr: 'Eau chaude', de: 'Warmwasser', es: 'Agua caliente' },
  seriesCooling: { en: 'Cooling', fr: 'Rafraîchissement', de: 'Kühlung', es: 'Refrigeración' },
  energyCaption: {
    en: 'Remeha estimate, about 2 hours late.',
    fr: 'Estimation Remeha, environ 2 h de retard.',
    de: 'Schätzung von Remeha, ca. 2 Std. verzögert.',
    es: 'Estimación de Remeha, unas 2 h de retraso.',
  },
  emptyEnergy: {
    en: 'No energy figure yet: Remeha reports it about 2 hours late.',
    fr: 'Aucun chiffre d’énergie pour l’instant : Remeha le fournit avec environ 2 heures de retard.',
    de: 'Noch keine Energiewerte: Remeha liefert sie etwa 2 Stunden verzögert.',
    es: 'Aún no hay cifras de energía: Remeha las da con unas 2 horas de retraso.',
  },
  noEnergy: {
    en: 'This appliance does not report its energy to Remeha.',
    fr: 'Ce générateur ne transmet pas son énergie à Remeha.',
    de: 'Dieses Gerät meldet seine Energie nicht an Remeha.',
    es: 'Este equipo no transmite su energía a Remeha.',
  },

  // widget: status
  tilePressure: { en: 'Pressure', fr: 'Pression', de: 'Druck', es: 'Presión' },
  tileOutdoor: { en: 'Outdoor', fr: 'Extérieur', de: 'Außen', es: 'Exterior' },
  rowConnection: { en: 'Remeha Home', fr: 'Remeha Home', de: 'Remeha Home', es: 'Remeha Home' },
  rowAppliance: { en: 'Appliance', fr: 'Générateur', de: 'Gerät', es: 'Equipo' },
  online: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  rowStatus: { en: 'Status', fr: 'État', de: 'Status', es: 'Estado' },
  statusRunning: { en: 'Normal', fr: 'Normal', de: 'Normal', es: 'Normal' },
  rowActivity: { en: 'Now', fr: 'En ce moment', de: 'Gerade', es: 'Ahora' },
  thermal_Idle: { en: 'Idle', fr: 'Au repos', de: 'Ruhe', es: 'En reposo' },
  thermal_Standby: { en: 'Standby', fr: 'En veille', de: 'Bereitschaft', es: 'En espera' },
  thermal_HeatingCH: { en: 'Heating', fr: 'Chauffage', de: 'Heizung', es: 'Calefacción' },
  thermal_HeatingDHW: { en: 'Hot water', fr: 'Eau chaude', de: 'Warmwasser', es: 'Agua caliente' },
  thermal_Cooling: { en: 'Cooling', fr: 'Rafraîchissement', de: 'Kühlung', es: 'Refrigeración' },
  rowHoliday: { en: 'Holiday', fr: 'Vacances', de: 'Urlaub', es: 'Vacaciones' },
  holidayUntil: { en: 'until {end}', fr: 'jusqu’au {end}', de: 'bis {end}', es: 'hasta el {end}' },
  holidayPlanned: {
    en: 'planned from {start}',
    fr: 'prévues dès le {start}',
    de: 'geplant ab {start}',
    es: 'previstas desde el {start}',
  },
  rowLastReading: {
    en: 'Last reading',
    fr: 'Dernier relevé',
    de: 'Letzte Abfrage',
    es: 'Última lectura',
  },
  rowPaused: {
    en: 'Slowed down, next try',
    fr: 'Ralenti, prochain essai',
    de: 'Gedrosselt, nächster Versuch',
    es: 'Ralentizado, próximo intento',
  },
  inMinutes: { en: 'in {n} min', fr: 'dans {n} min', de: 'in {n} Min.', es: 'en {n} min' },
  pressureLowHint: {
    en: 'Remeha reports a water pressure too low: top up the heating circuit as the manual of the appliance says.',
    fr: 'Remeha signale une pression d’eau trop basse : remettez le circuit de chauffage en pression comme l’indique la notice du générateur.',
    de: 'Remeha meldet einen zu niedrigen Wasserdruck: Füllen Sie den Heizkreis nach der Anleitung des Geräts nach.',
    es: 'Remeha indica una presión del agua demasiado baja: rellene el circuito de calefacción según el manual del equipo.',
  },

  // connection
  connection_ok: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  connection_unknown: { en: 'Starting', fr: 'Démarrage', de: 'Startet', es: 'Iniciando' },
  connection_unconfigured: {
    en: 'Not configured',
    fr: 'Non configuré',
    de: 'Nicht eingerichtet',
    es: 'Sin configurar',
  },
  connection_refused: {
    en: 'Credentials refused',
    fr: 'Identifiants refusés',
    de: 'Zugangsdaten abgelehnt',
    es: 'Credenciales rechazadas',
  },
  connection_rate_limited: {
    en: 'Too many requests',
    fr: 'Trop de requêtes',
    de: 'Zu viele Anfragen',
    es: 'Demasiadas peticiones',
  },
  connection_error: {
    en: 'Unreachable',
    fr: 'Injoignable',
    de: 'Nicht erreichbar',
    es: 'Inaccesible',
  },
  connection_ok_hint: {
    en: 'Connected to Remeha Home.',
    fr: 'Connecté à Remeha Home.',
    de: 'Mit Remeha Home verbunden.',
    es: 'Conectado a Remeha Home.',
  },
  connection_unknown_hint: {
    en: 'Waiting for the first reading of Remeha Home.',
    fr: 'En attente du premier relevé Remeha Home.',
    de: 'Warten auf die erste Abfrage von Remeha Home.',
    es: 'Esperando la primera lectura de Remeha Home.',
  },
  connection_unconfigured_hint: {
    en: 'Enter the e-mail and the password of your Remeha Home account in the configuration of the integration.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre compte Remeha Home dans la configuration de l’intégration.',
    de: 'Geben Sie E-Mail und Passwort Ihres Remeha-Home-Kontos in der Konfiguration der Integration ein.',
    es: 'Introduzca el correo y la contraseña de su cuenta Remeha Home en la configuración de la integración.',
  },
  connection_refused_hint: {
    en: 'Remeha refuses the e-mail or the password. Check them by signing in to the Remeha Home app.',
    fr: 'Remeha refuse l’e-mail ou le mot de passe. Vérifiez-les en vous connectant à l’application Remeha Home.',
    de: 'Remeha lehnt E-Mail oder Passwort ab. Prüfen Sie beides durch Anmelden in der Remeha-Home-App.',
    es: 'Remeha rechaza el correo o la contraseña. Compruébelos iniciando sesión en la app Remeha Home.',
  },
  connection_rate_limited_hint: {
    en: 'Remeha asks to slow down: the integration waits longer between two readings, then goes back to normal by itself.',
    fr: 'Remeha demande de ralentir : l’intégration espace ses relevés, puis revient d’elle-même au rythme normal.',
    de: 'Remeha bittet um weniger Anfragen: Die Integration fragt seltener ab und kehrt dann von selbst zum normalen Takt zurück.',
    es: 'Remeha pide reducir el ritmo: la integración espacia sus lecturas y vuelve sola al ritmo normal.',
  },
  connection_error_hint: {
    en: 'Remeha Home does not answer. Check the Internet connection of Gladys; the integration tries again at every reading.',
    fr: 'Remeha Home ne répond pas. Vérifiez la connexion Internet de Gladys ; l’intégration réessaie à chaque relevé.',
    de: 'Remeha Home antwortet nicht. Prüfen Sie die Internetverbindung von Gladys; die Integration versucht es bei jeder Abfrage erneut.',
    es: 'Remeha Home no responde. Compruebe la conexión a Internet de Gladys; la integración lo reintenta en cada lectura.',
  },
  never: { en: 'never', fr: 'jamais', de: 'nie', es: 'nunca' },
  justNow: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  minutesAgo: { en: '{n} min ago', fr: 'il y a {n} min', de: 'vor {n} Min.', es: 'hace {n} min' },
  hoursAgo: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  daysAgo: { en: '{n} days ago', fr: 'il y a {n} jours', de: 'vor {n} Tagen', es: 'hace {n} días' },

  // Configuration screen (setConnectionStatus) and its button
  statusUnconfigured: {
    en: 'Enter the e-mail and the password of your Remeha Home account.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre compte Remeha Home.',
    de: 'Geben Sie E-Mail und Passwort Ihres Remeha-Home-Kontos ein.',
    es: 'Introduzca el correo y la contraseña de su cuenta Remeha Home.',
  },
  statusRefused: {
    en: 'Remeha refused the e-mail or the password ({reason}). Check them in the Remeha Home app; the integration tries again every 30 minutes or as soon as they change.',
    fr: 'Remeha a refusé l’e-mail ou le mot de passe ({reason}). Vérifiez-les dans l’application Remeha Home ; l’intégration réessaie toutes les 30 minutes ou dès qu’ils changent.',
    de: 'Remeha hat E-Mail oder Passwort abgelehnt ({reason}). Prüfen Sie sie in der Remeha-Home-App; die Integration versucht es alle 30 Minuten oder sobald sie sich ändern.',
    es: 'Remeha rechazó el correo o la contraseña ({reason}). Compruébelos en la app Remeha Home; la integración lo reintenta cada 30 minutos o en cuanto cambian.',
  },
  statusRateLimited: {
    en: 'Remeha asks to slow down: next reading in {n} min.',
    fr: 'Remeha demande de ralentir : prochain relevé dans {n} min.',
    de: 'Remeha bittet um weniger Anfragen: nächste Abfrage in {n} Min.',
    es: 'Remeha pide reducir el ritmo: próxima lectura en {n} min.',
  },
  statusError: {
    en: 'Remeha Home cannot be reached ({error}). The integration tries again at every reading.',
    fr: 'Remeha Home est injoignable ({error}). L’intégration réessaie à chaque relevé.',
    de: 'Remeha Home ist nicht erreichbar ({error}). Die Integration versucht es bei jeder Abfrage erneut.',
    es: 'Remeha Home no está accesible ({error}). La integración lo reintenta en cada lectura.',
  },
  statusNoAppliance: {
    en: 'Connected, but this Remeha Home account has no appliance. Pair your thermostat in the Remeha Home app first.',
    fr: 'Connecté, mais ce compte Remeha Home n’a aucun générateur. Associez d’abord votre thermostat dans l’application Remeha Home.',
    de: 'Verbunden, aber dieses Remeha-Home-Konto hat kein Gerät. Koppeln Sie zuerst Ihr Thermostat in der Remeha-Home-App.',
    es: 'Conectado, pero esta cuenta Remeha Home no tiene ningún equipo. Vincule primero su termostato en la app Remeha Home.',
  },
  statusOk: {
    en: 'Connected: {count} appliance(s), {zones} zone(s), read every {minutes} min.',
    fr: 'Connecté : {count} générateur(s), {zones} zone(s), relevés toutes les {minutes} min.',
    de: 'Verbunden: {count} Gerät(e), {zones} Zone(n), Abfrage alle {minutes} Min.',
    es: 'Conectado: {count} equipo(s), {zones} zona(s), lectura cada {minutes} min.',
  },
  testItem: {
    en: '{name}: {what} ({features} features)',
    fr: '{name} : {what} ({features} fonctionnalités)',
    de: '{name}: {what} ({features} Funktionen)',
    es: '{name}: {what} ({features} funciones)',
  },
  testOk: {
    en: 'Connected. {count} device(s) to add in Discovery: {list}',
    fr: 'Connecté. {count} appareil(s) à ajouter dans Découverte : {list}',
    de: 'Verbunden. {count} Gerät(e) zum Hinzufügen unter Entdecken: {list}',
    es: 'Conectado. {count} dispositivo(s) para añadir en Descubrir: {list}',
  },

  // toasts of the widget buttons
  toastAllSchedule: {
    en: '{n} zone(s) back to their schedule.',
    fr: '{n} zone(s) revenue(s) au programme.',
    de: '{n} Zone(n) zurück im Zeitprogramm.',
    es: '{n} zona(s) de vuelta a su programa.',
  },
  toastBoost: {
    en: 'Hot water boost started ({n}).',
    fr: 'Boost d’eau chaude lancé ({n}).',
    de: 'Warmwasser-Boost gestartet ({n}).',
    es: 'Boost de agua caliente iniciado ({n}).',
  },
  toastNoBoost: {
    en: 'No hot water to boost (already in boost, or no boost).',
    fr: 'Aucune eau chaude à booster (déjà en boost, ou sans boost).',
    de: 'Kein Warmwasser für Boost (schon im Boost oder ohne Boost).',
    es: 'Ningún agua caliente para boost (ya en boost o sin boost).',
  },
  toastPartial: {
    en: 'Done for {n} zone(s), refused for {failed}.',
    fr: 'Fait pour {n} zone(s), refusé pour {failed}.',
    de: 'Für {n} Zone(n) erledigt, für {failed} abgelehnt.',
    es: 'Hecho en {n} zona(s), rechazado en {failed}.',
  },
  toastFailed: {
    en: 'Remeha Home: {error}',
    fr: 'Remeha Home : {error}',
    de: 'Remeha Home: {error}',
    es: 'Remeha Home: {error}',
  },
  toastRefreshed: {
    en: 'Read: {n} zone(s).',
    fr: 'Relevé : {n} zone(s).',
    de: 'Gelesen: {n} Zone(n).',
    es: 'Leído: {n} zona(s).',
  },
};

const isLanguage = (language) => LANGUAGES.includes(language);

/**
 * @description Whether a text exists.
 * @param {string} key - The TEXTS key.
 * @returns {boolean} It exists.
 */
const has = (key) => Object.hasOwn(TEXTS, key);

/**
 * @description A text in a language, with its `{name}` placeholders replaced.
 * @param {string} key - The TEXTS key.
 * @param {string} language - en, fr, de or es (English otherwise).
 * @param {object} [values] - The substitutions.
 * @returns {string} The text (the key itself when unknown).
 * @example
 * t('minutesAgo', 'fr', { n: 3 }); // -> 'il y a 3 min'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) return key;
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string|Function} key - The TEXTS key, or `(language) => string`.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      typeof key === 'function' ? key(language) : t(key, language, values),
    ]),
  );
}

const locale = (language) => (isLanguage(language) ? language : 'en');

/**
 * @description A number written in a language ("20,5", "20.5").
 * @param {number} n - The number.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
const formatNumber = (n, language) =>
  new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1 }).format(n);

/**
 * @description How long ago an instant was: "just now", "12 min ago".
 * @param {number} at - The instant, in ms (0: never).
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function ago(at, now, language) {
  if (!at) return t('never', language);
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) return t('justNow', language);
  if (minutes < 60) return t('minutesAgo', language, { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t('hoursAgo', language, { n: hours });
  return t('daysAgo', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, has, t, all, formatNumber, ago };
