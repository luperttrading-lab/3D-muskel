import { useMemo } from 'react';
import { useApp, optionen } from '../../store/app';
import { BuehnenPlatz } from '../BuehnenSystem';
import { useNavigation } from '../navigation';
import { empfehlungen } from '../../engine/coach';
import { PLAN, UEBUNG } from '../../engine/uebungen';
import { muskelZuwachsKg } from '../../engine/modell';
import { isoWoche } from '../../engine/xp';
import { ARCHETYP } from '../../engine/archetypen';
import { EINHEITEN, MUSKEL } from '../../engine/muskeln';
import { rangName } from '../App';
import { Mond } from '../teile/Symbole';

export function useCoach() {
  const saetze = useApp(s => s.saetze), zustand = useApp(s => s.muskelZustand), ansicht = useApp(s => s.ansicht);
  const profil = useApp(s => s.profil), jetzt = useApp(s => s.jetzt), sessions = useApp(s => s.sessions);
  return useMemo(() => {
    const woche = isoWoche(jetzt);
    const workouts = sessions.filter(se => se.status === 'beendet' && isoWoche(se.finishedAt ?? se.startedAt) === woche).length;
    return {
      workouts,
      liste: empfehlungen({ saetze, zustand, ansicht, optionen: optionen(profil), jetzt, trainingstage: profil.trainingstage, stil: profil.coachStil, workoutsDieseWoche: workouts }),
    };
  }, [saetze, zustand, ansicht, profil, jetzt, sessions]);
}

export function Home() {
  const profil = useApp(s => s.profil);
  const evo = useApp(s => s.evolution);
  const ansicht = useApp(s => s.ansicht);
  const sessionStarten = useApp(s => s.sessionStarten);
  const ruhetag = useApp(s => s.ruhetagMarkieren);
  const aktiv = useApp(s => s.aktiveSession);
  const geheZu = useNavigation(s => s.geheZu);
  const coach = useCoach();
  const planEmpf = coach.liste.find(e => e.aktion?.typ === 'plan');
  const plan = PLAN[(planEmpf?.aktion as { planId: string } | undefined)?.planId ?? 'ganzkoerper'];
  const hinweis = coach.liste.find(e => e.id !== planEmpf?.id) ?? coach.liste[0];
  const pumpend = EINHEITEN.filter(e => ansicht.pump[e.index] > 0.05).map(e => MUSKEL[e.id].name);
  const kg = muskelZuwachsKg(ansicht, profil.geschlecht);
  const anzahlSaetze = useApp(s => s.saetze.length);

  return (
    <div className="pb-6">
      <BuehnenPlatz className="h-[56vh] min-h-[340px]">
        <div className="absolute left-3 top-3 karte px-3 py-2 pointer-events-none">
          <div className="etikett">Rang</div>
          <div className="titel font-bold text-lg">{rangName(evo.rang, profil.neutralerStartname)}</div>
          {evo.archetyp !== evo.rang && <div className="text-xs text-akzent-hell">{ARCHETYP[evo.archetyp].name}</div>}
        </div>
        {pumpend.length > 0 && (
          <div className="absolute right-3 top-3 karte px-3 py-2 text-xs max-w-[46%] pointer-events-none">
            <div className="etikett text-akzent-hell">Pump aktiv</div>
            <div className="text-text-2">{[...new Set(pumpend)].slice(0, 4).join(', ')}</div>
          </div>
        )}
        <div className="absolute bottom-2 inset-x-0 text-center text-[11px] text-text-3 pointer-events-none">Ziehen dreht · zwei Finger zoomen · Muskel antippen</div>
      </BuehnenPlatz>

      <div className="seite grid gap-3 -mt-2 relative">
        <section className="karte p-4 grid gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="titel font-bold text-lg">{aktiv ? 'Workout läuft' : 'Nächstes Training'}</h2>
            <span className="ml-auto text-xs text-text-3 zahl">{coach.workouts}/{profil.trainingstage} diese Woche</span>
          </div>
          {!aktiv && <>
            <div className="text-text-2 text-sm"><b className="text-text">{plan.name}</b> · {plan.beschreibung}</div>
            <div className="flex flex-wrap gap-1.5">{plan.uebungen.slice(0, 6).map(([u, n]) => <span key={u} className="chip text-xs font-medium">{UEBUNG[u].name} · {n}</span>)}</div>
          </>}
          <button className="knopf knopf-haupt w-full py-3.5 text-base" onClick={async () => { if (!aktiv) await sessionStarten(plan.id); geheZu('training'); }}>
            {aktiv ? 'Zum Workout' : `${plan.name} starten`}
          </button>
        </section>

        {hinweis && (
          <section className="karte p-4 grid gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full grid place-items-center bg-akzent/20 text-akzent titel font-bold">A</div>
              <div><div className="titel font-bold">ATLAS</div><div className="text-xs text-text-3">{hinweis.titel}</div></div>
            </div>
            <p className="text-sm text-text-2 m-0">{hinweis.text}</p>
            <button className="text-left text-sm text-akzent-hell font-semibold" onClick={() => geheZu('coach')}>Alle Empfehlungen →</button>
          </section>
        )}

        <section className="grid grid-cols-3 gap-2">
          <div className="karte p-3"><div className="etikett">Muskel</div><div className="titel font-bold text-lg zahl">+{kg.toFixed(2).replace('.', ',')} kg</div><div className="text-[11px] text-text-3">virtuell seit Start</div></div>
          <div className="karte p-3"><div className="etikett">Sätze</div><div className="titel font-bold text-lg zahl">{anzahlSaetze}</div><div className="text-[11px] text-text-3">gesamt</div></div>
          <div className="karte p-3"><div className="etikett">Modus</div><div className="titel font-bold text-lg">{profil.modus === 'arcade' ? 'Arcade' : 'Realismus'}</div><div className="text-[11px] text-text-3">umstellbar</div></div>
        </section>

        <button className="knopf w-full" onClick={ruhetag}><Mond /> Heute Ruhetag eintragen</button>
      </div>
    </div>
  );
}
