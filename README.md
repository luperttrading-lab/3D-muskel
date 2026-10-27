# MuscleAtlas 3D

Prototyp einer Fitness-App, in der ein 3D-Avatar aus deinem eigenen Training entsteht. Jeder Muskel wird
**links und rechts getrennt** berechnet. Ohne Training baut er langsam ab, beim Wiedereinstieg greift ein
Muskelgedächtnis.

Der Start ist der **untrainierte Durchschnittskörper**: kein Sixpack, weiche Arme, Bauch.
Mann 1,79 m / 86,5 kg / 27 % Körperfett, Frau 1,66 m / 69,7 kg / 38 % Körperfett.

## Starten

Reine statische Web-App ohne Build-Schritt und ohne Abhängigkeiten. Wegen der ES-Module über einen
Webserver öffnen, nicht per Doppelklick:

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

Auf GitHub Pages läuft sie direkt; auf dem iPhone über *Teilen → Zum Home-Bildschirm* installierbar
(Service Worker „Netz zuerst“, Versionsprüfung beim Zurückholen, Tipp auf die Versionsnummer prüft von Hand).
Bei jeder Änderung `APP_VERSION` in `index.html` hochzählen.

## Tests

```sh
npm test        # = node --test tests/
```

## Aufbau

| Datei | Inhalt |
|---|---|
| `js/modell.js` | Muskelmodell: 33 Muskeln × 2 Seiten, 40 Übungen mit Gewichten, Wachstum, Abbau, Muskelgedächtnis, Körperfett. Reine Rechenlogik, läuft auch unter Node. |
| `js/koerper.js` | Prozeduraler Körper als Signed-Distance-Field (Grundkörper + Muskeln + Fett), vernetzt mit Surface Nets. |
| `js/netz-worker.js` | Rechnet den Körper im Hintergrund. |
| `js/render.js` | WebGL-Darstellung, Drehen/Zoomen, Muskelauswahl per Strahltest. |
| `js/app.js` | Oberfläche, Zustand (localStorage), Simulation. |
| `sw.js`, `manifest.webmanifest` | Installation und Updates auf dem Telefon. |

## Modell in Kürze

- Satzqualität aus RIR und Wiederholungen; das Gewicht in kg geht nicht in den Reiz ein.
- Dosis je Muskel = Σ Übungsgewicht × Satzqualität, Reiz einer Einheit S = 1 − e^(−Dosis/4).
- Zuwachs Δa = r · S · (1 − a/A_max)² · Muskelgedächtnis · Ernährung.
- Erhalt über einen exponentiell geglätteten Reiz; darunter Abbau a ← a · e^(−λ·…), exponentiell Richtung Start, nie darunter.
- Definition = Glättungsradius der Muskelverschmelzung, wächst mit dem Körperfett.

Alle Raten und Übungsgewichte sind **Modellannahmen**, an Größenordnungen aus der Literatur angelehnt,
nicht gemessen. Belege und Annahmen stehen in der App im Tab „Modell“.
