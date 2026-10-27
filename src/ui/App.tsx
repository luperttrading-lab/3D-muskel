// App-Rahmen: Kopf, Inhalt, Tab-Leiste, Hinweise, Onboarding.
import { useEffect, useState } from 'react';
import { useApp } from '../store/app';
import { level } from '../engine/xp';
import { ARCHETYP } from '../engine/archetypen';
import { useNavigation, type SeiteId } from './navigation';
import { BuehnenWurzel } from './BuehnenSystem';
import { Haus, Figur, Hantel, Kurve, Sprechblase, Zahnrad } from './teile/Symbole';
import { Home } from './seiten/Home';
import { Atlas } from './seiten/Atlas';
import { Training } from './seiten/Training';
import { Evolution } from './seiten/Evolution';
import { Coach } from './seiten/Coach';
import { Einstellungen } from './seiten/Einstellungen';
import { Onboarding } from './seiten/Onboarding';
import { UpdateBanner } from './teile/UpdateBanner';

const TABS: { id: SeiteId; name: string; Icon: () => React.JSX.Element }[] = [
  { id: 'home', name: 'Home', Icon: Haus },
  { id: 'atlas', name: 'Muskelatlas', Icon: Figur },
  { id: 'training', name: 'Training', Icon: Hantel },
  { id: 'evolution', name: 'Evolution', Icon: Kurve },
  { id: 'coach', name: 'Coach', Icon: Sprechblase },
];

export function rangName(id: string, neutral: boolean) {
  return id === 'lauch' && neutral ? 'Starter' : ARCHETYP[id as keyof typeof ARCHETYP]?.name ?? id;
}

function Kopf() {
  const xp = useApp(s => s.xpGesamt);
  const evo = useApp(s => s.evolution);
  const neutral = useApp(s => s.profil.neutralerStartname);
  const geheZu = useNavigation(s => s.geheZu);
  const l = level(xp);
  return (
    <header className="seite flex items-center gap-3 pt-[max(10px,env(safe-area-inset-top))] pb-2.5 border-b border-linie bg-nacht/80 backdrop-blur z-10">
      <div className="min-w-0">
        <div className="titel font-extrabold text-[19px] leading-none bg-gradient-to-r from-akzent-hell to-akzent bg-clip-text text-transparent">MUSCLEATLAS 3D</div>
        <div className="text-[12px] text-text-3 mt-1 truncate">{rangName(evo.archetyp, neutral)} · Level {l.level}</div>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="w-24 text-right">
          <div className="text-[11px] text-text-2 zahl">{l.xpImLevel} / {l.xpFuerNaechstes} XP</div>
          <div className="balken mt-1"><i style={{ width: `${(100 * l.xpImLevel) / l.xpFuerNaechstes}%` }} /></div>
        </div>
        <button className="p-2 rounded-full border border-linie bg-flaeche text-text-2" onClick={() => geheZu('einstellungen')} aria-label="Einstellungen und Diagnose"><Zahnrad /></button>
      </div>
    </header>
  );
}

function Leiste() {
  const seite = useNavigation(s => s.seite);
  const geheZu = useNavigation(s => s.geheZu);
  const aktiv = useApp(s => s.aktiveSession);
  return (
    <nav className="grid grid-cols-5 border-t border-linie bg-nacht/90 backdrop-blur pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 px-[max(6px,env(safe-area-inset-left))] z-10" aria-label="Hauptnavigation">
      {TABS.map(({ id, name, Icon }) => (
        <button key={id} onClick={() => geheZu(id)} aria-current={seite === id ? 'page' : undefined}
          className={`relative grid justify-items-center gap-0.5 py-1.5 text-[11px] font-semibold ${seite === id ? 'text-akzent' : 'text-text-3'}`}>
          <Icon />{name}
          {id === 'training' && aktiv && <span className="absolute top-1 right-[calc(50%-18px)] w-2 h-2 rounded-full bg-gut" aria-label="Workout läuft" />}
        </button>
      ))}
    </nav>
  );
}

function Hinweis() {
  const h = useApp(s => s.hinweis);
  const [sichtbar, setSichtbar] = useState(false);
  useEffect(() => {
    if (!h) return;
    setSichtbar(true);
    const t = setTimeout(() => setSichtbar(false), h.art === 'fehler' ? 5000 : 2600);
    return () => clearTimeout(t);
  }, [h]);
  if (!h || !sichtbar) return null;
  const farbe = h.art === 'xp' ? 'bg-gut text-[#04210f]' : h.art === 'fehler' ? 'bg-krit text-white' : 'bg-flaeche-2 text-text';
  return (
    <div role="status" className={`fixed left-1/2 -translate-x-1/2 top-[max(64px,calc(env(safe-area-inset-top)+56px))] z-30 px-4 py-2.5 rounded-2xl font-semibold shadow-2xl einblenden ${farbe}`}>{h.text}</div>
  );
}

export function App() {
  const bereit = useApp(s => s.bereit);
  const onboarding = useApp(s => s.profil.onboardingFertig);
  const akzent = useApp(s => s.profil.akzent);
  const seite = useNavigation(s => s.seite);
  const start = useApp(s => s.start);
  const neuBerechnen = useApp(s => s.neuBerechnen);
  useEffect(() => { start(); }, [start]);
  useEffect(() => { document.documentElement.dataset.akzent = akzent; }, [akzent]);
  // Pump und Abbau hängen an der Uhr: regelmäßig neu ableiten
  useEffect(() => { const t = setInterval(neuBerechnen, 60_000); return () => clearInterval(t); }, [neuBerechnen]);

  if (!bereit) return <div className="h-full grid place-items-center text-text-2">MuscleAtlas 3D wird geladen …</div>;
  return (
    <BuehnenWurzel>
      <UpdateBanner />
      <Hinweis />
      {!onboarding ? <Onboarding /> : (
        <div className="h-full grid grid-rows-[auto_minmax(0,1fr)_auto]">
          <Kopf />
          <main id="inhalt" className="overflow-y-auto overscroll-contain">
            {seite === 'home' && <Home />}
            {seite === 'atlas' && <Atlas />}
            {seite === 'training' && <Training />}
            {seite === 'evolution' && <Evolution />}
            {seite === 'coach' && <Coach />}
            {seite === 'einstellungen' && <Einstellungen />}
          </main>
          <Leiste />
        </div>
      )}
    </BuehnenWurzel>
  );
}
