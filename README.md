# MuscleAtlas 3D

Web-App, in der ein realistischer 3D-Avatar aus deinem eigenen Training entsteht. Jeder abgeschlossene Satz
verändert sofort die beteiligten Muskeln (Pump, Glühen, Kamerafahrt). Daraus wächst langfristig Muskelmasse,
die bei Pausen langsam abbaut und beim Wiedereinstieg über das Muskelgedächtnis schneller zurückkommt.
Alle 34 Muskeln werden **links und rechts getrennt** berechnet (68 Einheiten).

Der Start ist ein **untrainierter Durchschnittskörper**, Mann wie Frau: kein Sixpack, weiche Arme, etwas Bauch.

## Starten

Voraussetzung: Node.js ≥ 20.19 (getestet mit 22).

```sh
npm install          # .npmrc setzt legacy-peer-deps
npm run dev          # http://localhost:5173 (auch im WLAN erreichbar, aber ohne HTTPS)
npm run build        # Typprüfung + Produktions-Build nach dist/
npm run preview      # dist/ lokal ausliefern
npm test             # Engine-Tests (Vitest)
```

Rauchtest im echten Browser (Chromium mit iPhone-Maßen, Playwright muss installiert sein):

```sh
node e2e/rauchtest.cjs http://localhost:4173/ test-results
```

Er geht Onboarding → Bizepscurls links → Satz → sichtbare Änderung → Reload durch und prüft,
dass XP und Sätze erhalten bleiben und keine Konsolenfehler auftreten. Die Bilder landen in `test-results/`.

## Auf dem iPhone testen (HTTPS)

Safari braucht HTTPS für Service Worker und »Zum Home-Bildschirm« als App. Zwei fertige Wege:

- **GitHub Pages:** Einmalig *Settings → Pages → Source: GitHub Actions* wählen. Jeder Push auf `main`
  läuft durch `.github/workflows/pages.yml` (Tests, Build, Veröffentlichung).
- **Netlify:** Repository verbinden; `netlify.toml` setzt Build-Befehl, `dist/` und die Cache-Header.

Bei jeder Änderung `APP_VERSION` in `index.html` hochzählen. Die App prüft beim Öffnen und beim Zurückholen
in den Vordergrund, ob eine neue Fassung da ist; ein Tipp auf die gepunktete Versionsnummer unter
*Einstellungen → Über* prüft von Hand. Nach einem Update erscheint einmal »Version X ist geladen«.

## Was die App kann

| Bereich | Inhalt |
|---|---|
| Avatar | MakeHuman-Körper (Mann 1,79 m, Frau 1,66 m), Haut in drei Tönen, Haare, Augen, Brauen, Wimpern; Shorts bzw. Shorts + Bustier per Shader; lockere Haltung über ein vereinfachtes MakeHuman-Skelett (Linear Blend Skinning nach der Muskelverformung) |
| Verformung | je Muskel und Seite eigene Maske; Mischung aus 3 × 3 Muskel-/Fett-Formen; Pump als kurzzeitiger Zuschlag |
| Training | Pläne (Ganzkörper, Push, Pull, Legs, …), 43 Übungen mit Muskelkoeffizienten, Seite (beide/links/rechts), Gewicht, Wiederholungen, RIR, Schmerz-Markierung |
| Muskelatlas | Tabs Vorne/Hinten/Seite, Gruppenleiste (Brust bis Waden), Darstellungen *Haut*, *Entwicklung* (Farbskala), *Anatomie* (gebackenes Texturpaket: Muskelformen, Faserverlauf, Faszienlinien, Sehnenplatten, Relief); Muskel antippen → Funktion primär/sekundär, Entwicklungsstand links/rechts, beteiligte Übungen |
| Evolution | Vorher/Nachher-Vergleich, Rang (Lauch → Adonis → Beast), Archetypen mit Hysterese, Verläufe je Muskel; **Vorschau**: Plan (Ganzkörper, Push/Pull/Legs, Ober-/Unterkörper) 2–5× pro Woche über 12–52 Wochen durch die Engine spielen und den Körper Woche für Woche mitwachsen lassen – ab dem echten Stand, ohne zu speichern. Körperfett ist dabei eine eingestellte Annahme (bleibt / weniger / definiert), kein Modell |
| Coach ATLAS | regelbasiert, vier Stile (Kumpel, Drill, Wissenschaftler, Game-Master); stellt keine Diagnosen |
| Daten | IndexedDB (Dexie), Rückfall auf localStorage; Export/Import als JSON; alles bleibt auf dem Gerät |
| Sonstiges | reduzierte Bewegung, 2D-Ersatz ohne WebGL, Diagnose-Ansicht, Zeitreise-Testmodus für Abbau und Gedächtnis |

## Das Modell in Kürze

Der Zustand wird bei jedem Start **deterministisch aus den gespeicherten Sätzen** nachgerechnet; doppelte
Satz-IDs zählen nur einmal, XP-Ereignisse haben eindeutige Schlüssel.

- **Reiz je Einheit:** Dosis = Koeffizient × Satzqualität (Wiederholungen, RIR). Innerhalb einer Einheit sättigt
  er als `S = 1 − e^(−D/4)`, über die Woche zusätzlich mit `e^(−Last/18)`. Unbegrenzt viele Sätze bringen
  daher nicht unbegrenzt Zuwachs.
- **Wachstum:** `Δ = r · ΔS · Wochenfaktor · (1 − Entwicklung/aMax)² · Gedächtnis`. Gedächtnis =
  `1 + κ · (Höchststand − aktuell)/Höchststand`.
- **Abbau:** zuerst eine Schonfrist, dann eine weiche Rampe und danach exponentieller Abbau mit Halbwertszeit.
  Der Höchststand bleibt als Grundlage für das Muskelgedächtnis erhalten.
- **Pump:** sättigend, Halbwertszeit 25 Minuten, ändert die Entwicklung nicht.

| Regel | Arcade | Realismus |
|---|---|---|
| Wachstumsrate r je Einheit | 0,05 | 0,008 |
| Schonfrist | 10 Tage | 21 Tage |
| Halbwertszeit Abbau | 35 Tage | 84 Tage |
| Gedächtnis κ | 3 | 2 |

Diese Zahlen sind **Spielannahmen**, keine physiologischen Messwerte. Arcade ist auf sichtbaren Fortschritt in
Wochen ausgelegt, Realismus auf Monate.

## Aufbau

```
src/engine/    Muskeln, Übungen, Modell (Wachstum/Abbau/Pump), XP, Archetypen, Coach – ohne UI, getestet
src/avatar/    Körperdaten laden, Muskelmasken, Verformung, Shader, 3D-Bühne
src/store/     Zustand (Zustand-Store), Speicher (Dexie), Profil, Diagnose
src/ui/        Seiten und Bausteine; eine einzige WebGL-Leinwand wandert zwischen den Seiten
src/labor/     Entwicklungsansicht: index.html#labor?modus=haut&g=w&einzel=bizeps&seite=L&wert=1
tools/         Asset-Pipeline (MakeHuman → public/modelle)
public/        Service Worker, Manifest, Icons, erzeugte Modelle und Texturen
tests/         Engine-Tests (Vitest)
e2e/           Rauchtest mit Playwright
```

## Assets neu erzeugen

Die Dateien in `public/modelle/` sind bereits erzeugt und eingecheckt. Neu bauen nur bei Änderungen an der
Pipeline:

```sh
MH_DATA=/pfad/makehuman/data MH_SYSTEM=/pfad/makehuman-system-assets npm run assets
```

`MH_DATA` ist der `data`-Ordner aus dem MakeHuman-Repository (Basisnetz `hm08`, Targets, Hilfsgruppen,
`rigs/default.mhskel` und `rigs/default_weights.mhw` für die Haltung),
`MH_SYSTEM` das System-Asset-Paket (Haut, Haare, Augen, Brauen, Wimpern).

### Anatomie-Texturpaket

Die Anatomie-Ansicht nutzt je Geschlecht drei Texturen in `public/modelle/` (`anatomie-{m,w}-farbe.jpg`,
`-hoehe.png`, `-karte.png`). Sie werden ohne Grafikprogramm aus dem Körpernetz und den Muskelmasken gebacken:

```sh
npm run anatomie     # tools/anatomie-backen.mjs, etwa 30 s je Geschlecht, braucht python3 mit Pillow
```

`tools/anatomie-kern.ts` wertet je Texel die Masken aus und schneidet die sichtbaren Muskeln nach ihrer echten Form zu
(Brust, Trapez, Lat, Beckenkamm, Leistenband, Gesäß, Deltamuskel, Wade …). Die Karte trägt je Texel die Einheit;
zur Laufzeit färbt die App darüber Entwicklung und Auswahl, und ein Tipp trifft den Muskel texelgenau.
Muskelgrenzen sind Furchen im Relief statt gezeichneter Linien; helle Faszie gibt es nur an Linea alba, Mittellinien und den
Sehnenzügen des Sixpacks. Fasern sind gezeichnete Stränge mit eigener Helligkeit (in der Farbe, nicht im Relief, damit sie
nicht glitzern; wo die Textur zu grob ist, doppelt so breit), Sehnenübergänge fiedern aus. Die Reliefkarte trägt im
Grünkanal die Furchentiefe, damit Furchen kein Glanzlicht fangen.
An den Gliedmaßen folgt der Faserverlauf dem Muskelbau: Spindel (Bizeps, Unterarm, Beinbeuger), Fächer zum Ansatz
(Deltamuskel), gefiedert (gerader Quadrizeps mit Mittelsehne, seitlicher und innerer Quadrizeps, Wade). Muskelgewebe bekommt im
Shader einen feuchten Glanz, Sehnen bleiben seidenmatt.

## Lizenz der Körpermodelle

Basisnetz, Targets, Skelett mit Gewichten, Proxies und System-Assets stammen von [MakeHuman](https://static.makehumancommunity.org/makehuman/faq/are_makehuman_files_free.html)
und stehen unter **CC0**. Die Software-Werkzeuge von MakeHuman (AGPL) werden nicht verwendet; die Pipeline in
`tools/` ist eigenständig.
