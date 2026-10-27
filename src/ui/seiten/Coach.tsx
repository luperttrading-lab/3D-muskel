import { useApp } from '../../store/app';
import { COACH_STILE } from '../../engine/coach';
import { PLAN } from '../../engine/uebungen';
import { useNavigation } from '../navigation';
import { useCoach } from './Home';

export function Coach() {
  const stil = useApp(s => s.profil.coachStil);
  const profilAendern = useApp(s => s.profilAendern);
  const sessionStarten = useApp(s => s.sessionStarten);
  const ruhetag = useApp(s => s.ruhetagMarkieren);
  const geheZu = useNavigation(s => s.geheZu);
  const { liste } = useCoach();
  return (
    <div className="seite py-4 grid gap-3">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full grid place-items-center bg-akzent/20 text-akzent titel font-extrabold text-xl">A</div>
        <div><h1 className="titel font-bold text-xl">ATLAS</h1><div className="text-xs text-text-3">Dein Coach – regelbasiert, ohne Diagnosen</div></div>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Coach-Stil">
        {COACH_STILE.map(s => <button key={s.id} className="chip" aria-pressed={stil === s.id} onClick={() => profilAendern({ coachStil: s.id })}>{s.name}</button>)}
      </div>
      {liste.map(e => (
        <section key={e.id} className="karte p-4 grid gap-2 einblenden">
          <h2 className="titel font-bold">{e.titel}</h2>
          <p className="text-sm text-text-2 m-0">{e.text}</p>
          <p className="text-[11px] text-text-3 m-0">Warum: {e.begruendung}</p>
          {e.sicherheit && <p className="text-[11px] text-warn m-0">{e.sicherheit}</p>}
          {e.aktion?.typ === 'plan' && (
            <button className="knopf knopf-haupt" onClick={async () => { await sessionStarten((e.aktion as { planId: string }).planId); geheZu('training'); }}>
              {PLAN[(e.aktion as { planId: string }).planId]?.name ?? 'Training'} starten
            </button>
          )}
          {e.aktion?.typ === 'ruhetag' && <button className="knopf" onClick={ruhetag}>Ruhetag eintragen</button>}
        </section>
      ))}
      <p className="text-xs text-text-3">ATLAS gibt allgemeine Trainingshinweise und ersetzt keine ärztliche oder physiotherapeutische Beratung. Muskelwerte, Abbau und XP sind Spielregeln, keine Messungen.</p>
    </div>
  );
}
