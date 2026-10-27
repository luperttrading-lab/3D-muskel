// Eine einzige 3D-Bühne für die ganze App. Ihr DOM-Container wandert in den »Platz« der aktuellen Seite –
// so bleibt der WebGL-Kontext beim Seitenwechsel erhalten (iOS Safari begrenzt die Zahl der Kontexte).
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AvatarModell, type AvatarZustand } from '../avatar/AvatarModell';
import { Buehne } from '../avatar/Buehne';
import { ladeKoerper, type KoerperDaten } from '../avatar/daten';
import type { Masken } from '../avatar/masken';
import { ANZAHL_EINHEITEN, EINHEITEN, amax } from '../engine/muskeln';
import { muskulatur, REGELN } from '../engine/modell';
import { useApp } from '../store/app';
import { AKZENTE, KOERPERFORMEN, MU_START } from '../store/profil';
import { assetStatus, protokoll, useDiagnose } from '../store/diagnose';
import { atlasFarbe, entwicklungsFarbe, HAUT_OHNE_MUSKEL } from './farben';

interface PlatzOptionen { vergleich?: boolean; startAzimut?: number; abstandFaktor?: number }
const Kontext = createContext<{ container: HTMLDivElement; setOptionen: (o: PlatzOptionen) => void } | null>(null);

export function useReduzierteBewegung() {
  const animationen = useApp(s => s.profil.animationen);
  const [sys, setSys] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const f = () => setSys(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return !animationen || sys;
}

function useKoerper() {
  const g = useApp(s => s.profil.geschlecht);
  const [daten, setDaten] = useState<KoerperDaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    let ab = false;
    setFehler(null);
    const t0 = performance.now();
    assetStatus(`koerper-${g}`, 'lädt');
    ladeKoerper(g).then(d => {
      if (ab) return;
      setDaten(d);
      assetStatus(`koerper-${g}`, 'ok', Math.round(performance.now() - t0), `${d.koerper.punkte} Punkte`);
    }).catch(e => {
      if (ab) return;
      setFehler((e as Error).message);
      assetStatus(`koerper-${g}`, 'fehler', undefined, (e as Error).message);
      protokoll('fehler', 'Körperdaten: ' + (e as Error).message);
    });
    return () => { ab = true; };
  }, [g]);
  return { daten: daten?.geschlecht === g ? daten : null, fehler };
}

function zustandAus(entwicklung: Float32Array, pump: Float32Array, mu0: number, omega: number, modus: 'arcade' | 'realismus', darstellung: string, gluehen: Float32Array, unterStart: boolean): AvatarZustand {
  const o = { modus, unterStart, profilStart: 0 };
  const mu = new Float32Array(ANZAHL_EINHEITEN), farbe = new Float32Array(ANZAHL_EINHEITEN * 3);
  let summe = 0, anzahl = 0;
  for (const e of EINHEITEN) {
    const dev = entwicklung[e.index];
    mu[e.index] = muskulatur(dev, pump[e.index], mu0, o);
    summe += Math.max(0, dev); anzahl++;
    const v = Math.max(0, dev) / amax(e.id);
    farbe.set(darstellung === 'atlas' ? atlasFarbe(v) : entwicklungsFarbe(v), 3 * e.index);
  }
  farbe.set(darstellung === 'atlas' ? HAUT_OHNE_MUSKEL.atlas : HAUT_OHNE_MUSKEL.entwicklung, 0);
  const muRest = mu0 + (REGELN[modus].muMax - mu0) * 0.5 * (summe / anzahl);
  return { mu, muRest, omega, gluehen, farbe };
}

function Szene({ vergleich }: { vergleich: boolean }) {
  const { daten } = useKoerper();
  const profil = useApp(s => s.profil);
  const ansicht = useApp(s => s.ansicht);
  const feedback = useApp(s => s.feedback);
  const darstellung = useApp(s => s.darstellung);
  const auswahl = useApp(s => s.auswahl);
  const waehle = useApp(s => s.waehle);
  const setzeMuskelMitten = useApp(s => s.setzeMuskelMitten);
  const ohneBewegung = useReduzierteBewegung();
  const omega = KOERPERFORMEN[profil.koerperform].omega[profil.geschlecht];
  const akzent = AKZENTE[profil.akzent].farbe;

  const gluehen = useMemo(() => {
    const g = new Float32Array(ANZAHL_EINHEITEN);
    if (!feedback) return g;
    const max = Math.max(1e-6, ...feedback.wirkung.map(w => w.reiz));
    for (const w of feedback.wirkung) g[w.einheit] = Math.min(1, 0.25 + 0.75 * w.reiz / max);
    return g;
  }, [feedback]);
  const zustand = useMemo(() => zustandAus(ansicht.entwicklung, ansicht.pump, MU_START, omega, profil.modus, darstellung, gluehen, profil.unterStart),
    [ansicht, omega, profil.modus, profil.unterStart, darstellung, gluehen]);
  const start = useMemo(() => zustandAus(new Float32Array(ANZAHL_EINHEITEN), new Float32Array(ANZAHL_EINHEITEN), MU_START, omega, profil.modus, darstellung, new Float32Array(ANZAHL_EINHEITEN), false),
    [omega, profil.modus, darstellung]);
  const beiMasken = useCallback((_: Masken, mitten: Map<number, [number, number, number]>) => setzeMuskelMitten(mitten), [setzeMuskelMitten]);
  const morphMs = useCallback((ms: number) => { useDiagnose.setState({ morphMs: Math.round(ms * 10) / 10 }); }, []);
  if (!daten) return null;
  const versatz = 0.42 * daten.groesse / 1.79;
  return (
    <>
      {vergleich && (
        <AvatarModell daten={daten} zustand={start} darstellung={darstellung} auswahl={0} hautton={profil.hautton} akzent={akzent}
          gluehStart={-1e9} bewegung={!ohneBewegung} position={[-versatz, 0, 0]} />
      )}
      <AvatarModell daten={daten} zustand={zustand} darstellung={darstellung} auswahl={auswahl} hautton={profil.hautton} akzent={akzent}
        gluehStart={feedback?.zeit ?? -1e9} bewegung={!ohneBewegung} position={vergleich ? [versatz, 0, 0] : undefined}
        onWahl={e => waehle(e)} onMasken={beiMasken} onMorphMs={morphMs} />
    </>
  );
}

function BuehnenInhalt({ opt }: { opt: PlatzOptionen }) {
  const profil = useApp(s => s.profil);
  const kamera = useApp(s => s.kamera);
  const waehle = useApp(s => s.waehle);
  const ohneBewegung = useReduzierteBewegung();
  const { fehler } = useKoerper();
  const groesse = profil.geschlecht === 'm' ? 1.79 : 1.66;
  const vergleich = !!opt.vergleich;
  if (fehler) return <div className="absolute inset-0 grid place-items-center p-6 text-center text-text-2">3D-Körper konnte nicht geladen werden: {fehler}</div>;
  return (
    <Buehne key={`${profil.geschlecht}-${vergleich}`} groesse={groesse} akzent={AKZENTE[profil.akzent].farbe} ziel={kamera} bewegung={!ohneBewegung}
      startAzimut={vergleich ? 0 : opt.startAzimut ?? 0.3} abstand={groesse * (vergleich ? 3.0 : 2.3) * (opt.abstandFaktor ?? 1)}
      onFehler={m => protokoll('warnung', m)} onDaneben={() => waehle(0, false)} className="!absolute inset-0">
      <Szene vergleich={vergleich} />
    </Buehne>
  );
}

export function BuehnenWurzel({ children }: { children: ReactNode }) {
  const container = useMemo(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;inset:0;';
    return d;
  }, []);
  const [opt, setOpt] = useState<PlatzOptionen>({});
  const webglFehler = useDiagnose(s => s.webglFehler);
  const setOptionen = useCallback((o: PlatzOptionen) => setOpt(alt => (JSON.stringify(alt) === JSON.stringify(o) ? alt : o)), []);
  return (
    <Kontext.Provider value={{ container, setOptionen }}>
      {children}
      {!webglFehler && createPortal(<BuehnenInhalt opt={opt} />, container)}
    </Kontext.Provider>
  );
}

// Platz für die 3D-Bühne innerhalb einer Seite; Overlays als children
export function BuehnenPlatz({ className = '', children, vergleich, startAzimut, abstandFaktor }: { className?: string; children?: ReactNode } & PlatzOptionen) {
  const k = useContext(Kontext);
  const ref = useRef<HTMLDivElement>(null);
  const webglFehler = useDiagnose(s => s.webglFehler);
  useLayoutEffect(() => {
    if (!k || !ref.current) return;
    ref.current.prepend(k.container);
    return () => { if (k.container.parentElement === ref.current) k.container.remove(); };
  }, [k]);
  useEffect(() => { k?.setOptionen({ vergleich, startAzimut, abstandFaktor }); }, [k, vergleich, startAzimut, abstandFaktor]);
  return (
    <div ref={ref} className={`relative overflow-hidden touch-none ${className}`}>
      {webglFehler && <Ersatz2D grund={webglFehler} />}
      {children}
    </div>
  );
}

// Notfall-Darstellung ohne WebGL: klare Meldung statt leerer Fläche
function Ersatz2D({ grund }: { grund: string }) {
  const ansicht = useApp(s => s.ansicht);
  const werte = useMemo(() => {
    const regionen: [string, string[], number, number, number, number][] = [
      ['Schultern', ['delt_v', 'delt_s', 'delt_h'], 50, 62, 50, 12], ['Brust', ['brust_o', 'brust_u'], 60, 70, 30, 14],
      ['Arme', ['bizeps', 'trizeps', 'brachialis'], 30, 85, 12, 30], ['Bauch', ['bauch_g', 'bauch_s'], 63, 96, 24, 30],
      ['Beine', ['vast_lat', 'vast_med', 'rect_fem', 'hamstrings'], 58, 140, 34, 50], ['Waden', ['gastro', 'soleus'], 60, 200, 30, 30],
    ];
    return regionen.map(([name, ids, x, y, w, h]) => {
      const v = ids.flatMap(id => EINHEITEN.filter(e => e.id === id).map(e => ansicht.entwicklung[e.index])).reduce((a, b) => a + b, 0) / (ids.length * 2);
      return { name, x, y, w, h, v };
    });
  }, [ansicht]);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
      <svg viewBox="0 0 150 250" className="h-2/3 max-h-80" role="img" aria-label="Vereinfachte Körperdarstellung">
        <circle cx="75" cy="30" r="18" fill="#2a3552" />
        {werte.map(r => <rect key={r.name} x={r.x} y={r.y} width={r.w} height={r.h} rx="8" fill={`rgb(${Math.round(60 + 190 * Math.min(1, r.v * 2))} ${Math.round(80 + 60 * (1 - r.v))} ${Math.round(140 - 100 * Math.min(1, r.v * 2))})`} />)}
      </svg>
      <p className="text-sm text-text-2 max-w-xs">3D nicht verfügbar: {grund} Die Werte werden weiter berechnet und gespeichert.</p>
    </div>
  );
}

