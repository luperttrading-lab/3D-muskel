import { useState } from 'react';
import { useApp } from '../../store/app';
import { BuehnenPlatz } from '../BuehnenSystem';
import { KOERPERFORMEN, AKZENTE, type Hautton, type Koerperform, type Akzent } from '../../store/profil';

export function Onboarding() {
  const p = useApp(s => s.profil), aendern = useApp(s => s.profilAendern);
  const [schritt, setSchritt] = useState(0);
  const SCHRITTE = 4;
  const weiter = () => (schritt < SCHRITTE - 1 ? setSchritt(schritt + 1) : aendern({ onboardingFertig: true }));
  return (
    <div className="h-full grid grid-rows-[auto_minmax(0,1fr)_auto] pt-[env(safe-area-inset-top)] pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="seite pt-3 flex items-center gap-2">
        <div className="titel font-extrabold text-lg bg-gradient-to-r from-akzent-hell to-akzent bg-clip-text text-transparent">MUSCLEATLAS 3D</div>
        <div className="ml-auto flex gap-1" aria-label={`Schritt ${schritt + 1} von ${SCHRITTE}`}>{Array.from({ length: SCHRITTE }, (_, i) => <span key={i} className={`w-6 h-1.5 rounded-full ${i <= schritt ? 'bg-akzent' : 'bg-linie'}`} />)}</div>
      </div>
      <BuehnenPlatz className="min-h-[260px]" startAzimut={0.25} abstandFaktor={1.05} />
      <div className="seite grid gap-3 pt-2">
        {schritt === 0 && <>
          <h1 className="titel font-bold text-2xl">Dein Körper, geformt von deinem Training</h1>
          <p className="text-text-2 m-0">Jeder Satz verändert sofort die beanspruchten Muskeln – links und rechts getrennt. Du startest mit einem durchschnittlichen, untrainierten Körper.</p>
        </>}
        {schritt === 1 && <>
          <h1 className="titel font-bold text-xl">Körpermodell</h1>
          <div className="grid grid-cols-2 gap-2">
            {([['m', 'Männlich'], ['w', 'Weiblich']] as const).map(([g, n]) => <button key={g} className="chip py-3 text-base" aria-pressed={p.geschlecht === g} onClick={() => aendern({ geschlecht: g })}>{n}</button>)}
          </div>
          <p className="text-xs text-text-3 m-0">Weitere Körpermodelle sind geplant.</p>
        </>}
        {schritt === 2 && <>
          <h1 className="titel font-bold text-xl">Aussehen</h1>
          <div className="grid gap-1.5"><span className="etikett">Hautton</span>
            <div className="flex gap-1.5">{([['hell', 'Hell'], ['mittel', 'Mittel'], ['dunkel', 'Dunkel']] as [Hautton, string][]).map(([v, n]) => <button key={v} className="chip flex-1" aria-pressed={p.hautton === v} onClick={() => aendern({ hautton: v })}>{n}</button>)}</div></div>
          <div className="grid gap-1.5"><span className="etikett">Körperform</span>
            <div className="flex gap-1.5">{(Object.entries(KOERPERFORMEN) as [Koerperform, { name: string }][]).map(([v, k]) => <button key={v} className="chip flex-1" aria-pressed={p.koerperform === v} onClick={() => aendern({ koerperform: v })}>{k.name}</button>)}</div></div>
          <div className="grid gap-1.5"><span className="etikett">Akzentfarbe</span>
            <div className="flex gap-1.5">{(Object.entries(AKZENTE) as [Akzent, { name: string }][]).map(([v, a]) => <button key={v} className="chip flex-1" aria-pressed={p.akzent === v} onClick={() => aendern({ akzent: v })}>{a.name}</button>)}</div></div>
        </>}
        {schritt === 3 && <>
          <h1 className="titel font-bold text-xl">Training</h1>
          <div className="grid gap-1.5"><span className="etikett">Trainingstage pro Woche</span>
            <div className="flex gap-1.5">{[1, 2, 3, 4, 5, 6].map(n => <button key={n} className="chip flex-1" aria-pressed={p.trainingstage === n} onClick={() => aendern({ trainingstage: n })}>{n}</button>)}</div></div>
          <div className="grid gap-1.5"><span className="etikett">Spielmodus</span>
            <div className="flex gap-1.5">
              <button className="chip flex-1" aria-pressed={p.modus === 'arcade'} onClick={() => aendern({ modus: 'arcade' })}>Arcade</button>
              <button className="chip flex-1" aria-pressed={p.modus === 'realismus'} onClick={() => aendern({ modus: 'realismus' })}>Realismus</button>
            </div>
            <span className="text-xs text-text-3">Arcade: sichtbar schneller Aufbau. Realismus: langsam, mit Sättigung. Jederzeit umstellbar.</span></div>
        </>}
        <button className="knopf knopf-haupt w-full py-3.5 text-base" onClick={weiter}>{schritt < SCHRITTE - 1 ? 'Weiter' : 'Los geht’s'}</button>
        {schritt > 0 && <button className="text-sm text-text-3" onClick={() => setSchritt(schritt - 1)}>Zurück</button>}
      </div>
    </div>
  );
}
