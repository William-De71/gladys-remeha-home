# Remeha Home

## Überblick

Diese Integration bringt die mit der **Remeha-Home**-App verbundene Heizung in Gladys: Remeha-Heizkessel, Wärmepumpen und Hybride mit einem vernetzten Thermostat (eTwist, Smart Thermostat…). Sie meldet sich wie die App mit E-Mail und Passwort Ihres Remeha-Home-Kontos an. Konten von Baxi, De Dietrich und Brötje in derselben BDR-Thermea-Cloud können ebenfalls funktionieren.

- Ein **Thermostat** pro Heizzone: Modus (Zeitprogramm, manuell, aus), Solltemperatur, Wärmeanforderung, Raumtemperatur, Kaminmodus, wenn die Zone ihn hat.
- Ein **Warmwasserbereiter** pro Warmwasserzone: Zeitprogramm, Komfort, Eco oder Boost, Komforttemperatur, Erwärmung ja oder nein, Wassertemperatur eines Speichers.
- Ein Gerät für den **Wärmeerzeuger**: Wasserdruck, Außentemperatur und ein Energiezähler für das Energie-Dashboard von Gladys.
- Szenen-Auslöser (Störung, wieder in Ordnung, Druck zu niedrig, offline, Urlaub) und Szenen-Aktionen (vorübergehende Temperatur, Zeitprogramm, Urlaub, Warmwasser-Boost, jetzt abfragen).
- Drei Dashboard-Widgets: die Zonen, die Energie der letzten 7 Tage und das Gerät.

**Transport: Cloud.** Gladys spricht nie direkt mit Ihrem Kessel: Sie liest und schreibt die Remeha-Cloud, die Änderungen an das Gateway des Thermostats weitergibt. Eine Änderung in Gladys erscheint sofort und wird einige Sekunden später bestätigt; eine Änderung in der App oder durch das Zeitprogramm erreicht Gladys bei der nächsten Abfrage. Ihre Daten verlassen Ihr Zuhause (wie schon mit der App).

Nicht mit Remeha oder BDR Thermea verbunden. Der genutzte Dienst ist der der Remeha-Home-App; BDR Thermea **dokumentiert ihn nicht** und kann ihn ohne Vorankündigung ändern. Die Anfragen sind die der Community-Integration Remeha Home für Home Assistant ([msvisser/remeha_home](https://github.com/msvisser/remeha_home) und ihr gepflegter Fork). Noch nicht mit einem echten Konto getestet: Sagen Sie uns, was funktioniert und was nicht.

![Generierte Illustration der drei Widgets: die Remeha-Zonen (Temperatur, Sollwert, Modus, nächster Schaltpunkt, Schaltflächen Zurück zum Programm und Warmwasser-Boost), die Energie der letzten 7 Tage nach Nutzung und das Gerät (Druck, Außen, Verbindung) — kein Screenshot](https://raw.githubusercontent.com/William-De71/gladys-remeha-home/main/docs/assets/widgets.de.png)

## Voraussetzungen

- Gladys Assistant **5.3.0** oder neuer.
- Ein Remeha-Gerät (oder Baxi, De Dietrich, Brötje), bereits installiert und in der **Remeha-Home**-App sichtbar, mit seinem vernetzten Thermostat.
- Das **Remeha-Home-Konto**: Prüfen Sie, dass Sie sich mit E-Mail und Passwort in der App anmelden können. BDR Thermea bietet keinen separaten Zugang für Dritte: Die Integration nutzt das Passwort Ihres Kontos.

## Konfiguration

Öffnen Sie in Gladys **Integrationen → Remeha Home**:

| Feld                    | Beschreibung                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| E-Mail                  | Die E-Mail Ihres Remeha-Home-Kontos.                                                                  |
| Passwort                | Sein Passwort: nur an Remeha gesendet, im Speicher gehalten, nie wieder angezeigt oder protokolliert. |
| Abfrageintervall        | Alle 1, 2, 5 oder 10 Minuten (standardmäßig 2). Eine Anfrage liest alle Zonen.                        |
| Sprache der Gerätetexte | Namen der Funktionen und Meldungen der Schaltfläche; standardmäßig automatisch.                       |

Klicken Sie auf **Verbindung testen**: Die Integration meldet sich an und listet die gefundenen Zonen, das Warmwasser und die Geräte auf. Öffnen Sie dann den Reiter **Entdecken** und fügen Sie die gewünschten Geräte hinzu: Ohne Sie wird nichts angelegt.

## Verwendung

### Geräte

| Gerät      | Funktionen                                                          | Hinweise                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zone       | Modus, Solltemperatur, Wärmeanforderung, Raumtemperatur, Kaminmodus | Modus: Auto = Zeitprogramm, Heizen = manuell (fester Sollwert), Aus = Frostschutz. Den Sollwert einer Zone im Zeitprogramm zu ändern setzt wie die App eine vorübergehende Temperatur bis zum nächsten Schaltpunkt; manuell oder aus einen festen Sollwert. |
| Warmwasser | Warmwassermodus, Komforttemperatur, Erwärmung, Wassertemperatur     | Modi: Programm (Zeitprogramm), manuell (dauerhaft Komfort), Eco, Boost. Ein Boost wechselt bei Bedarf zuerst ins Zeitprogramm (Remeha verlangt es). Wassertemperatur: nur Speicher.                                                                         |
| Gerät      | Wasserdruck (bar), Außentemperatur, verbrauchte Energie (kWh)       | Außentemperatur: der Fühler des Geräts, sonst der Wetterdienst von Remeha. Energie: ein kumulierter Zähler aus der täglichen Schätzung von Remeha.                                                                                                          |

Remeha liefert die Energie **Tag für Tag, etwa 2 Stunden verzögert**: Der Zähler steigt in Stufen und holt nach Mitternacht das Ende des Vortags nach. Er beginnt mit der Energie des Tages, an dem das Gerät zum ersten Mal gelesen wird: Gladys nutzt nur seine Zunahmen. Bei einem Hybrid addiert der Zähler wie Remeha Gas und Strom.

### Dashboard-Widgets

- **Remeha-Zonen**: jede Zone und das Warmwasser mit Temperatur, Sollwert, Modus und einem Abzeichen (heizt, kühlt, Befehl wird gesendet). Tippen Sie auf eine Zeile für Details: nächster Schaltpunkt, Programmnummer, Ende einer vorübergehenden Temperatur. **Zurück zum Programm** setzt manuelle oder vorübergehende Zonen ins Zeitprogramm zurück, **Warmwasser-Boost** startet einen Boost, beide nach Bestätigung; **Aktualisieren** fragt jetzt ab. Wählen Sie die Zonen in den Widget-Einstellungen (höchstens 8).
- **Remeha-Energie**: die Energie von heute und gestern und ein Balkendiagramm der letzten 7 Tage nach Nutzung (Heizung, Warmwasser, Kühlung, falls vorhanden).
- **Remeha-Gerät**: der Wasserdruck (rot, wenn Remeha ihn zu niedrig findet), die Außentemperatur, die Verbindung, der Status des Geräts, was es gerade tut, der Urlaub, eine Schaltfläche **Aktualisieren**.

### Szenen

Auslöser (jeder kann auf ein Gerät beschränkt werden):

- **Das Gerät meldet eine Störung** / **ist wieder in Ordnung**: Der von Remeha gemeldete Status verlässt „Running“ oder kehrt dorthin zurück.
- **Der Wasserdruck wird zu niedrig**: Remeha hält ihn nicht mehr für korrekt; der Druck ist eine Variable.
- **Das Gerät geht offline oder wieder online** mit der Remeha-Cloud (auf eines von beiden filterbar).
- **Der Urlaub beginnt oder endet**: der in der App eingestellte Urlaubsmodus (nie durch die Aktion der Integration); der Rückkehrtag ist eine Variable.

Aktionen:

- **Vorübergehende Temperatur setzen**: eine Zone, eine Temperatur, eine Dauer in Minuten (leer: bis zum nächsten Schaltpunkt). Ausgabe: die Endzeit. Manche Thermostate können sie nur bis zum nächsten Schaltpunkt halten.
- **Zeitprogramm wählen**: 1, 2 oder 3, für eine Zone oder alle; eine manuelle Zone kehrt ins Zeitprogramm zurück.
- **Urlaubsmodus einstellen**: ab heute für eine Anzahl Tage, oder 0 zum Abbrechen. Remeha speichert ganze Tage.
- **Warmwasser-Boost starten**: etwa 30 Minuten auf Komforttemperatur.
- **Remeha Home jetzt abfragen**: gibt die Anzahl der Zonen, den Druck, die Außentemperatur und die Energie von heute zurück.

Beispiele:

- Wenn jemand früher heimkommt → Wohnzimmer für 120 Minuten auf 21 °C.
- Wenn der Wasserdruck zu niedrig wird → Benachrichtigung „Druck {{triggerEvent.data.pressure}} bar“ senden.
- Bei Urlaubsbeginn → Urlaubsmodus 7 Tage; am Tag vor der Rückkehr → abbrechen.

### Transport

Der Katalog zeigt das Abzeichen **Cloud**: Die Anmeldung geht an `remehalogin.bdrthermea.net` und jede Anfrage an `api.bdrthermea.net`, mit Ihrem Remeha-Home-Konto. Die App bietet keinen lokalen Zugang.

## Fehlerbehebung

- **„Remeha hat E-Mail oder Passwort abgelehnt“**: Prüfen Sie beides in der Remeha-Home-App. Die Integration versucht es alle 30 Minuten erneut oder sobald Sie sie ändern.
- **Verbunden, aber kein Gerät**: Koppeln Sie zuerst das Thermostat in der Remeha-Home-App.
- **Keine Wassertemperatur**: Ein Kombikessel (ohne Speicher) misst sie nicht.
- **Die vorübergehende Temperatur endet am nächsten Schaltpunkt statt nach der gewünschten Dauer**: Dieses Thermostat kennt keine Endzeit.
- **Die Energie bleibt leer oder verzögert**: Remeha liefert sie etwa 2 Stunden verzögert und in den ersten 45 Minuten nach Mitternacht gar nicht.
- **Ein Befehl wird nach einigen Minuten rückgängig gemacht**: Remeha hat ihn nicht angewendet; das Dashboard zeigt wieder den Stand der Cloud.
- **Nach einem Update der App funktioniert nichts mehr**: Der undokumentierte Dienst hat sich vielleicht geändert; melden Sie es.
- Melden Sie ein Problem auf [GitHub](https://github.com/William-De71/gladys-remeha-home/issues) mit Ihrer Gladys-Version, der Version der Integration, dem Gerätemodell und dem Ergebnis von „Verbindung testen“.
