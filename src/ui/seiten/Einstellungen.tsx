import { useRef, useState, type ReactNode } from 'react';
import { useApp, jetztFuer } from '../../store/app';
import { useDiagnose } from '../../store/diagnose';
import { AKZENTE, KOERPERFORMEN, type Hautton, type Koerperform, type Akzent, type Profil } from '../../store/profil';
import { GERAETE } from '../../engine/uebungen';
import { REGELN } from '../../engine/modell';
import { APP_VERSION, pruefeUpdate } from '../../pwa';

const Abschnitt = ({ titel, children }: { titel: string; children: ReactNode }) => (
  <section className="karte p-4 grid gap-3"><h2 className="titel font-bold">{titel}</h2>{children}</section>
);
function Wahl<T extends string>({ label, wert, optionen, setze }: { label: string; wert: T; optionen: [T, string][]; setze: (v: T) => void }) {
  return (
    <div className="grid gap-1.5">
      <span className="etikett">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>{optionen.map(([v, n]) => <button key={v} className="chip" aria-pressed={wert === v} onClick={() => setze(v)}>{n}</button>)}</div>
    </div>
  );
}
function Schalter({ label, an, setze, hinweis }: { label: string; an: boolean; setze: (v: boolean) => void; hinweis?: string }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" className="w-5 h-5 mt-0.5 accent-[var(--akzent)]" checked={an} onChange={e => setze(e.target.checked)} />
      <span><span className="font-semibold">{label}</span>{hinweis && <span className="block text-xs text-text-3">{hinweis}</span>}</span>
    </label>
  );
}

function Diagnose() {
  const d = useDiagnose();
  const speicherArt = useApp(s => s.speicherArt);
  const [sw, setSw] = useState<string>('–');
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && sw === '–') navigator.serviceWorker.getRegistration().then(r => setSw(r?.active ? 'aktiv' : 'nicht registriert')).catch(() => setSw('nicht verfügbar'));
  const zeile = (k: string, v: ReactNode, ok?: boolean) => (
    <div key={k} className="grid grid-cols-[130px_minmax(0,1fr)] gap-2 text-sm"><span className="text-text-3">{k}</span><span className={`min-w-0 break-words ${ok === false ? 'text-krit' : ok ? 'text-gut' : ''}`}>{v}</span></div>
  );
  return (
    <div className="grid gap-1.5">
      {zeile('JavaScript', 'läuft', true)}
      {zeile('Version', APP_VERSION)}
      {zeile('Verbindung', location.protocol === 'https:' ? 'HTTPS' : location.protocol.replace(':', '').toUpperCase(), location.protocol === 'https:' || location.hostname === 'localhost')}
      {zeile('WebGL', d.webglFehler ?? d.webgl?.version ?? 'unbekannt', !d.webglFehler)}
      {d.webgl && zeile('Grafik', d.webgl.renderer)}
      {zeile('Speicher', speicherArt, speicherArt === 'IndexedDB')}
      {zeile('Service Worker', sw)}
      {zeile('Morph-Zeit', `${d.morphMs} ms je Bild`)}
      {Object.entries(d.assets).map(([k, a]) => zeile(k, `${a.status}${a.ms ? ` · ${a.ms} ms` : ''}${a.info ? ` · ${a.info}` : ''}`, a.status === 'ok' ? true : a.status === 'fehler' ? false : undefined))}
      <details className="text-xs">
        <summary className="cursor-pointer text-text-2">Protokoll ({d.log.length})</summary>
        <div className="grid gap-1 mt-2 max-h-56 overflow-y-auto">
          {[...d.log].reverse().map((l, i) => <div key={i} className={l.art === 'fehler' ? 'text-krit' : l.art === 'warnung' ? 'text-warn' : 'text-text-2'}>{new Date(l.zeit).toLocaleTimeString('de-DE')} {l.text}</div>)}
        </div>
      </details>
      <div className="text-[11px] text-text-3 break-words">{navigator.userAgent}</div>
    </div>
  );
}

export function Einstellungen() {
  const p = useApp(s => s.profil), aendern = useApp(s => s.profilAendern);
  const exportieren = useApp(s => s.exportieren), importieren = useApp(s => s.importieren), allesLoeschen = useApp(s => s.allesLoeschen), zeige = useApp(s => s.zeige);
  const [loeschen, setLoeschen] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  const datei = useRef<HTMLInputElement>(null);
  const setze = (t: Partial<Profil>) => aendern(t);

  const exportDatei = () => {
    const text = JSON.stringify(exportieren(), null, 1);
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = `muscleatlas-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch { /* manche Vorschauumgebungen blockieren Downloads */ }
    setExportText(text);
  };

  return (
    <div className="seite py-4 grid gap-3">
      <h1 className="titel font-bold text-xl">Einstellungen</h1>
      <Abschnitt titel="Körper">
        <Wahl label="Körpermodell" wert={p.geschlecht} optionen={[['m', 'Männlich'], ['w', 'Weiblich']]} setze={v => setze({ geschlecht: v })} />
        <Wahl<Hautton> label="Hautton" wert={p.hautton} optionen={[['hell', 'Hell'], ['mittel', 'Mittel'], ['dunkel', 'Dunkel']]} setze={v => setze({ hautton: v })} />
        <Wahl<Koerperform> label="Körperform (Startfett)" wert={p.koerperform} optionen={Object.entries(KOERPERFORMEN).map(([k, v]) => [k as Koerperform, v.name])} setze={v => setze({ koerperform: v })} />
        <p className="text-xs text-text-3 m-0">Körperfett ist eine eigene Achse: Krafttraining allein lässt den Avatar nicht automatisch abnehmen.</p>
        <Wahl<Akzent> label="Akzentfarbe" wert={p.akzent} optionen={Object.entries(AKZENTE).map(([k, v]) => [k as Akzent, v.name])} setze={v => setze({ akzent: v })} />
      </Abschnitt>
      <Abschnitt titel="Training">
        <div className="grid gap-1.5">
          <span className="etikett">Geplante Trainingstage pro Woche</span>
          <div className="flex gap-1.5" role="group" aria-label="Trainingstage">{[1, 2, 3, 4, 5, 6].map(n => <button key={n} className="chip flex-1" aria-pressed={p.trainingstage === n} onClick={() => setze({ trainingstage: n })}>{n}</button>)}</div>
        </div>
        <Wahl label="Ziel" wert={p.ziel} optionen={[['muskelaufbau', 'Muskelaufbau'], ['fitness', 'Fitness'], ['kraft', 'Kraft'], ['gesundheit', 'Gesundheit']]} setze={v => setze({ ziel: v })} />
        <Wahl label="Erfahrung" wert={p.erfahrung} optionen={[['einsteiger', 'Einsteiger'], ['fortgeschritten', 'Fortgeschritten'], ['erfahren', 'Erfahren']]} setze={v => setze({ erfahrung: v })} />
        <div className="grid gap-1.5">
          <span className="etikett">Verfügbare Geräte</span>
          <div className="flex flex-wrap gap-1.5">{GERAETE.map(g => <button key={g} className="chip" aria-pressed={p.geraete.includes(g)} onClick={() => setze({ geraete: p.geraete.includes(g) ? p.geraete.filter(x => x !== g) : [...p.geraete, g] })}>{g}</button>)}</div>
        </div>
      </Abschnitt>
      <Abschnitt titel="Spielregeln">
        <Wahl label="Modus" wert={p.modus} optionen={[['arcade', 'Arcade'], ['realismus', 'Realismus']]} setze={v => setze({ modus: v })} />
        <p className="text-xs text-text-3 m-0">{p.modus === 'arcade'
          ? `Sichtbar schneller Aufbau. Abbau erst nach ${REGELN.arcade.gnadeTage} Tagen ohne Reiz, Halbwertszeit ${REGELN.arcade.halbwertTage} Tage.`
          : `Langsamer Aufbau mit Sättigung. Abbau nach ${REGELN.realismus.gnadeTage} Tagen ohne Reiz, Halbwertszeit ${REGELN.realismus.halbwertTage} Tage.`} Dieselben Trainingsdaten, nur andere Regeln.</p>
        <Schalter label="Unter den Startkörper schrumpfen erlauben" an={p.unterStart} setze={v => setze({ unterStart: v })} hinweis="Standard: aus. Der Start bleibt die Untergrenze – kein Bestrafen von Pausen." />
        <Schalter label="Neutraler Startname" an={p.neutralerStartname} setze={v => setze({ neutralerStartname: v })} hinweis="»Starter« statt »Lauch«" />
        <Schalter label="Animationen" an={p.animationen} setze={v => setze({ animationen: v })} hinweis="Kamerafahrten, Glühen und weiche Übergänge. Folgt außerdem der Systemeinstellung »Bewegung reduzieren«." />
      </Abschnitt>
      <Abschnitt titel="Testmodus: Zeitreise">
        <p className="text-xs text-text-3 m-0">Verschiebt »jetzt«, um Pump-Abfall, Abbau und Muskelgedächtnis zu prüfen. Neue Sätze werden mit dem verschobenen Datum gespeichert.</p>
        <div className="text-sm">Simuliertes Datum: <b className="zahl">{new Date(jetztFuer(p)).toLocaleDateString('de-DE')}</b> ({p.zeitversatzTage >= 0 ? '+' : ''}{p.zeitversatzTage} Tage)</div>
        <div className="grid grid-cols-4 gap-1.5">
          {[[1, '+1 T.'], [7, '+1 Wo.'], [28, '+4 Wo.'], [84, '+12 Wo.']].map(([n, l]) => <button key={n} className="knopf text-sm px-2" onClick={() => setze({ zeitversatzTage: p.zeitversatzTage + (n as number) })}>{l}</button>)}
        </div>
        <button className="knopf text-sm" onClick={() => setze({ zeitversatzTage: 0 })}>Auf heute zurücksetzen</button>
      </Abschnitt>
      <Abschnitt titel="Daten">
        <p className="text-xs text-text-3 m-0">Alle Daten bleiben auf diesem Gerät. Export und Import als JSON-Datei.</p>
        <div className="grid grid-cols-2 gap-2">
          <button className="knopf" onClick={exportDatei}>Exportieren</button>
          <button className="knopf" onClick={() => datei.current?.click()}>Importieren</button>
        </div>
        <input ref={datei} type="file" accept="application/json,.json" className="hidden" onChange={async e => {
          const f = e.target.files?.[0];
          if (!f) return;
          try { await importieren(JSON.parse(await f.text())); } catch (err) { zeige((err as Error).message, 'fehler'); }
          e.target.value = '';
        }} />
        {exportText && (
          <div className="grid gap-1.5">
            <span className="text-xs text-text-3">Falls der Download blockiert ist: Text kopieren und sichern.</span>
            <textarea readOnly className="eingabe h-24 text-xs font-mono" value={exportText} onFocus={e => e.target.select()} />
            <button className="knopf text-sm" onClick={() => navigator.clipboard?.writeText(exportText).then(() => zeige('Kopiert')).catch(() => zeige('Kopieren nicht möglich – Text markieren', 'fehler'))}>In die Zwischenablage</button>
          </div>
        )}
        {!loeschen ? <button className="knopf border-krit/60 text-krit" onClick={() => setLoeschen(true)}>Alle Daten löschen</button> : (
          <div className="grid gap-2">
            <span className="text-sm text-text-2">Wirklich alle Trainingsdaten, XP und das Profil löschen?</span>
            <div className="grid grid-cols-2 gap-2">
              <button className="knopf" onClick={() => setLoeschen(false)}>Behalten</button>
              <button className="knopf border-krit text-krit" onClick={async () => { await allesLoeschen(); setLoeschen(false); }}>Endgültig löschen</button>
            </div>
          </div>
        )}
      </Abschnitt>
      <Abschnitt titel="Diagnose"><Diagnose /></Abschnitt>
      <Abschnitt titel="Über">
        <div className="text-sm">MuscleAtlas 3D <button className="underline decoration-dotted underline-offset-4 text-akzent-hell" onClick={e => pruefeUpdate(true, e.currentTarget)}>Version {APP_VERSION}</button> <span className="text-xs text-text-3">(antippen prüft auf Updates)</span></div>
        <p className="text-xs text-text-3 m-0">3D-Körper, Hauttexturen, Augen, Brauen und Haare: MakeHuman-Assets (CC0, makehumancommunity.org). Muskelwerte, Übungsgewichte, Abbaukurven und XP sind Designvorschläge, keine medizinischen oder sportwissenschaftlichen Messwerte.</p>
      </Abschnitt>
    </div>
  );
}
