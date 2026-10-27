// Prüfansicht für Entwickler (#labor): Körper, Masken und Formen ohne restliche Oberfläche.
import { useEffect, useMemo, useState } from 'react';
import { AvatarModell, type AvatarZustand, type Darstellung } from '../avatar/AvatarModell';
import { Buehne } from '../avatar/Buehne';
import { ladeKoerper, type Geschlecht, type KoerperDaten } from '../avatar/daten';
import { ANZAHL_EINHEITEN, EINHEITEN } from '../engine/muskeln';
import { atlasFarbe, HAUT_OHNE_MUSKEL } from '../ui/farben';

const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
const zahl = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const auswahlAusUrl = () => { const [id, seite] = (q.get('auswahl') ?? '').split(':'); return EINHEITEN.find(e => e.id === id && e.seite === (seite ?? 'L'))?.index ?? 0; };

function farbeFuer(i: number): [number, number, number] {
  const h = (i * 0.61803) % 1, s = 0.75, l = i % 2 ? 0.55 : 0.42;
  const f = (n: number) => { const k = (n + h * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}

function Ansicht({ g, azimut }: { g: Geschlecht; azimut: number }) {
  const [daten, setDaten] = useState<KoerperDaten>();
  useEffect(() => { ladeKoerper(g).then(setDaten); }, [g]);
  // Kameraziel erst nach dem Aufbau setzen: die Bühne überspringt ein schon beim Aufbau vorhandenes Ziel
  const [schluessel, setSchluessel] = useState(0);
  useEffect(() => { if (daten) { const t = setTimeout(() => setSchluessel(1), 100); return () => clearTimeout(t); } }, [daten]);
  const zustand = useMemo<AvatarZustand>(() => {
    // mus=… : Muskelwert je Einheit (Index 0 = Rest des Körpers), z. B. aus einer Engine-Simulation
    const liste = q.get('mus')?.split(',').map(Number);
    const mu = liste?.length === ANZAHL_EINHEITEN ? Float32Array.from(liste) : new Float32Array(ANZAHL_EINHEITEN).fill(zahl('mu', 0.42));
    const einzel = q.get('einzel');
    if (einzel) for (const e of EINHEITEN) if (e.id === einzel && (!q.get('seite') || q.get('seite') === e.seite)) mu[e.index] = zahl('wert', 1);
    const farbe = new Float32Array(ANZAHL_EINHEITEN * 3);
    // farben=app: Farben wie in der App (Anatomie-Ansicht), sonst Prüffarben je Einheit
    // farben=decke: Muskelabdeckung prüfen – grün = Maske, rot = Lücke
    const wieApp = q.get('farben') === 'app', decke = q.get('farben') === 'decke';
    farbe.set(wieApp ? HAUT_OHNE_MUSKEL.atlas : decke ? [0.9, 0.05, 0.05] : [0.75, 0.72, 0.7]);
    for (let i = 1; i < ANZAHL_EINHEITEN; i++) farbe.set(wieApp ? atlasFarbe(zahl('wert', 0.5)) : decke ? [0.1, 0.55, 0.2] : farbeFuer(i), 3 * i);
    return { mu, muRest: liste ? mu[0] : zahl('mu', 0.42), omega: zahl('omega', g === 'm' ? 0.66 : 0.62), gluehen: new Float32Array(ANZAHL_EINHEITEN), farbe };
  }, [g]);
  if (!daten) return <div className="text-slate-400 p-4">lädt …</div>;
  return (
    <Buehne groesse={daten.groesse} akzent={g === 'm' ? '#2f8bff' : '#ff3fa4'} startAzimut={azimut} abstand={q.has('abstand') ? zahl('abstand', 4) : undefined}
      ziel={q.has('hoehe') ? { hoehe: zahl('hoehe', 1), abstand: zahl('abstand', 4), azimut, schluessel } : undefined} className="w-full h-full">
      <AvatarModell daten={daten} zustand={zustand} darstellung={(q.get('modus') as Darstellung) ?? 'atlas'} auswahl={auswahlAusUrl()} hautton="hell" akzent={g === 'm' ? '#2f8bff' : '#ff3fa4'} gluehStart={-1e9} bewegung={false} pose={q.get('pose') !== '0'} />
    </Buehne>
  );
}

export function Labor() {
  useEffect(() => { const t = setTimeout(() => { (window as unknown as { fertig: boolean }).fertig = true; }, 2500); return () => clearTimeout(t); }, []);
  const alle: [Geschlecht, number][] = [['m', 0], ['m', Math.PI], ['w', 0], ['w', Math.PI]];
  const ansichten = q.has('az') ? (q.get('az')!.split(',').map(a => [(q.get('g') ?? 'm') as Geschlecht, Number(a)]) as [Geschlecht, number][]) : alle;
  return (
    <div className="grid h-screen bg-[#070b16]" style={{ gridTemplateColumns: `repeat(${ansichten.length}, 1fr)` }}>
      {ansichten.map(([g, az], i) => <div key={i} className="h-full"><Ansicht g={g} azimut={az} /></div>)}
    </div>
  );
}
