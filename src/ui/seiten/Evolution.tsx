import { useEffect, useMemo, useState } from 'react';
import { useApp, optionen } from '../../store/app';
import { BuehnenPlatz, useReduzierteBewegung } from '../BuehnenSystem';
import { ARCHETYPEN, ARCHETYP, RANG_GRENZEN, regionWerte } from '../../engine/archetypen';
import { MUSKELN, MUSKEL, einheitIndex, amax } from '../../engine/muskeln';
import { verlauf, REGELN } from '../../engine/modell';
import { SIM_PROGRAMME, simFett, simuliere } from '../../engine/simulation';
import { KOERPERFORMEN } from '../../store/profil';
import { Diagramm } from '../teile/Diagramm';
import { rangName } from '../App';

const TAG = 86_400_000;
const datum = (t: number) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
const REGIONEN: [string, string][] = [['brust', 'Brust'], ['schulter', 'Schultern'], ['oberarm', 'Oberarme'], ['unterarm', 'Unterarme'], ['ruecken', 'Rücken'], ['bauch', 'Bauch'], ['gesaess', 'Gesäß'], ['oberschenkel', 'Oberschenkel'], ['waden', 'Waden']];

type FettZiel = 'gleich' | 'weniger' | 'definiert';
const FETT_ZIELE: [FettZiel, string][] = [['gleich', 'bleibt'], ['weniger', 'weniger'], ['definiert', 'definiert']];

// Vorschau: Trainingsplan über Wochen durch die Engine spielen und den Körper mitwachsen lassen (nichts wird gespeichert)
function useVorschau() {
  const profil = useApp(s => s.profil), saetze = useApp(s => s.saetze), jetzt = useApp(s => s.jetzt);
  const setzeVorschau = useApp(s => s.setzeVorschau), setzeDarstellung = useApp(s => s.setzeDarstellung);
  const ohneBewegung = useReduzierteBewegung();
  const [programm, setProgramm] = useState('ganzkoerper');
  const [tage, setTage] = useState(Math.min(5, Math.max(2, profil.trainingstage)));
  const [wochen, setWochenRoh] = useState(26);
  const [fett, setFett] = useState<FettZiel>('gleich');
  const [woche, setWoche] = useState(0);
  const [aktiv, setAktiv] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const schritte = useMemo(() => simuliere(saetze, optionen(profil), jetzt, { programm, tageProWoche: tage, wochen }, profil.geschlecht),
    [saetze, profil, jetzt, programm, tage, wochen]);
  const omega0 = KOERPERFORMEN[profil.koerperform].omega[profil.geschlecht];
  const omegaZiel = fett === 'gleich' ? omega0 : fett === 'weniger' ? Math.max(0.3, omega0 - 0.22) : 0.3;
  const w = Math.min(woche, wochen), schritt = schritte[w];
  const omega = simFett(omega0, omegaZiel, w, wochen);

  // Bühne mitführen; beim Verlassen der Seite wieder den echten Stand zeigen
  useEffect(() => { setzeVorschau(aktiv ? { entwicklung: schritt.ansicht.entwicklung, omega, woche: w } : null); }, [aktiv, schritt, omega, w, setzeVorschau]);
  useEffect(() => () => { setzeVorschau(null); setzeDarstellung('haut'); }, [setzeVorschau, setzeDarstellung]);
  useEffect(() => {
    if (!laeuft) return;
    if (ohneBewegung) { setWoche(wochen); setLaeuft(false); return; }
    const id = setInterval(() => setWoche(x => {
      if (x >= wochen) { setLaeuft(false); return x; }
      return x + 1;
    }), wochen <= 12 ? 320 : wochen <= 26 ? 220 : 150);
    return () => clearInterval(id);
  }, [laeuft, wochen, ohneBewegung]);

  return {
    programm, setProgramm, tage, setTage, wochen, fett, setFett, w, schritt, aktiv, laeuft,
    setWochen: (n: number) => { setWochenRoh(n); setWoche(x => Math.min(x, n)); },
    abspielen: () => { setAktiv(true); if (woche >= wochen) setWoche(0); setLaeuft(true); },
    anhalten: () => setLaeuft(false),
    springe: (n: number) => { setLaeuft(false); setAktiv(true); setWoche(n); },
    zuruecksetzen: () => { setLaeuft(false); setAktiv(false); setWoche(0); },
  };
}
type Vorschau = ReturnType<typeof useVorschau>;

// Steuerleiste direkt unter der Bühne: so bleibt die Figur beim Abspielen im Blick
function VorschauLeiste({ v }: { v: Vorschau }) {
  if (!v.aktiv) {
    return (
      <div className="seite mt-2 flex justify-center">
        <button className="knopf knopf-haupt text-sm py-2 px-4 rounded-full" onClick={v.abspielen}>▶ Körper simulieren</button>
      </div>
    );
  }
  return (
    <div className="seite mt-2"><div className="flex items-center gap-2 rounded-full bg-tiefe border border-linie px-2 py-1.5" role="group" aria-label="Vorschau abspielen">
      <button className="knopf knopf-haupt w-9 h-9 p-0 rounded-full text-sm shrink-0" onClick={v.laeuft ? v.anhalten : v.abspielen}
        aria-label={v.laeuft ? 'Anhalten' : v.w >= v.wochen ? 'Nochmal' : 'Weiter abspielen'}>{v.laeuft ? '❚❚' : v.w >= v.wochen ? '↻' : '▶'}</button>
      <input type="range" className="regler min-w-0 flex-1" min={0} max={v.wochen} step={1} value={v.w} aria-label="Woche"
        onChange={e => v.springe(Number(e.target.value))} />
      <span className="zahl text-xs text-text-2 w-[52px] text-right shrink-0">Wo. {v.w}</span>
      <button className="w-8 h-8 rounded-full text-text-2 shrink-0" onClick={v.zuruecksetzen} aria-label="Zurück zu jetzt">✕</button>
    </div></div>
  );
}

function VorschauKarte({ v }: { v: Vorschau }) {
  const profil = useApp(s => s.profil), darstellung = useApp(s => s.darstellung), setzeDarstellung = useApp(s => s.setzeDarstellung);
  const kg = v.schritt.zuwachsKg.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  // vor dem Start nach oben, damit die Figur sichtbar ist
  const starten = () => { document.getElementById('inhalt')?.scrollTo({ top: 0, behavior: 'smooth' }); v.abspielen(); };
  return (
    <section className="karte p-4 grid gap-3" aria-label="Körper-Vorschau">
      <div className="flex items-center gap-2">
        <span className="etikett">Vorschau: Körper simulieren</span>
        <span className="ml-auto text-[11px] text-text-3">Testphase</span>
      </div>
      <div className="grid gap-2 text-sm">
        <label className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2"><span className="text-text-2">Plan</span>
          <select className="eingabe py-1.5 text-sm" value={v.programm} onChange={e => v.setProgramm(e.target.value)}>
            {SIM_PROGRAMME.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2"><span className="text-text-2">Pro Woche</span>
          <div className="segment" role="group" aria-label="Trainingstage pro Woche">
            {[2, 3, 4, 5].map(n => <button key={n} aria-pressed={v.tage === n} onClick={() => v.setTage(n)}>{n}×</button>)}
          </div>
        </div>
        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2"><span className="text-text-2">Zeitraum</span>
          <div className="segment" role="group" aria-label="Zeitraum">
            {[12, 26, 52].map(n => <button key={n} aria-pressed={v.wochen === n} onClick={() => v.setWochen(n)}>{n} Wo.</button>)}
          </div>
        </div>
        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2"><span className="text-text-2">Körperfett</span>
          <div className="segment" role="group" aria-label="Körperfett am Ende">
            {FETT_ZIELE.map(([id, n]) => <button key={id} aria-pressed={v.fett === id} onClick={() => v.setFett(id)}>{n}</button>)}
          </div>
        </div>
        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2"><span className="text-text-2">Ansicht</span>
          <div className="segment" role="group" aria-label="Darstellung">
            <button aria-pressed={darstellung !== 'atlas'} onClick={() => setzeDarstellung('haut')}>Haut</button>
            <button aria-pressed={darstellung === 'atlas'} onClick={() => setzeDarstellung('atlas')}>Anatomie</button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="knopf knopf-haupt" onClick={v.laeuft ? v.anhalten : starten}>{v.laeuft ? '❚❚ Anhalten' : v.w >= v.wochen && v.aktiv ? '↻ Nochmal' : '▶ Simulieren'}</button>
        <button className="knopf" onClick={v.zuruecksetzen} disabled={!v.aktiv}>Zurück zu jetzt</button>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <span className="text-text-2">Woche</span><b className="zahl text-right">{v.w} / {v.wochen}</b>
        <span className="text-text-2">Ø Entwicklung</span><b className="zahl text-right">{Math.round(v.schritt.mittel * 100)} %</b>
        <span className="text-text-2">Rang</span><b className="text-right">{rangName(v.schritt.rang, profil.neutralerStartname)}</b>
        <span className="text-text-2">Muskel (Modell)</span><b className="zahl text-right">+{kg} kg</b>
      </div>
      <p className="text-xs text-text-3 m-0">
        Spielt {v.tage}× pro Woche den Plan mit 10 Wiederholungen und 2 RIR durch die Engine ({REGELN[profil.modus].name}-Regeln), ausgehend von deinem
        jetzigen Stand. Muskelzuwachs kommt aus dem Modell; das Körperfett ist eine Annahme (linear bis zum Ende), kein Modell. Nichts wird gespeichert.
      </p>
    </section>
  );
}

export function Evolution() {
  const evo = useApp(s => s.evolution), ansicht = useApp(s => s.ansicht), profil = useApp(s => s.profil), saetze = useApp(s => s.saetze), jetzt = useApp(s => s.jetzt);
  const vorschau = useApp(s => s.vorschau);
  const v = useVorschau();
  const [muskel, setMuskel] = useState('bizeps');
  const [vergleich, setVergleich] = useState(true);
  const r = regionWerte(ansicht, profil.geschlecht);
  const kurve = useMemo(() => {
    const l = einheitIndex(muskel, 'L'), rr = einheitIndex(muskel, 'R');
    const v = verlauf(saetze, optionen(profil), [l, rr], jetzt);
    const a = amax(muskel);
    return { l: v.map(p => [p.t, Math.max(0, p.werte[0]) / a] as [number, number]), r: v.map(p => [p.t, Math.max(0, p.werte[1]) / a] as [number, number]) };
  }, [saetze, profil, jetzt, muskel]);
  const gesamt = evo.verlauf.map(p => [p.t, p.mittel] as [number, number]);
  const naechste = evo.rang === 'lauch' ? RANG_GRENZEN.adonis : evo.rang === 'adonis' ? RANG_GRENZEN.beast : 1;
  const tageKandidat = evo.kandidatSeit ? Math.floor((jetzt - evo.kandidatSeit) / TAG) : 0;

  return (
    <div className="pb-6">
      <div className="seite pt-3 flex items-center gap-2">
        <h1 className="titel font-bold text-xl">Evolution</h1>
        <div className="segment ml-auto" role="group" aria-label="Ansicht">
          <button aria-pressed={vergleich} onClick={() => setVergleich(true)}>Start ⇄ Jetzt</button>
          <button aria-pressed={!vergleich} onClick={() => setVergleich(false)}>Jetzt</button>
        </div>
      </div>
      <BuehnenPlatz className="h-[46vh] min-h-[300px]" vergleich={vergleich} startAzimut={0}>
        {vergleich && <div className="absolute bottom-2 inset-x-0 flex justify-around titel text-sm text-text-2 pointer-events-none"><span>Start</span><span className={vorschau ? 'text-akzent-hell' : ''}>{vorschau ? `Woche ${vorschau.woche}` : 'Jetzt'}</span></div>}
        {!vergleich && vorschau && <div className="absolute bottom-2 inset-x-0 text-center titel text-sm text-akzent-hell pointer-events-none">Vorschau · Woche {vorschau.woche}</div>}
      </BuehnenPlatz>
      <VorschauLeiste v={v} />
      <div className="seite grid gap-3 mt-3">
        <VorschauKarte v={v} />
        <section className="karte p-4 grid gap-3">
          <div className="etikett">Rang</div>
          <div className="flex items-center gap-2">
            {(['lauch', 'adonis', 'beast'] as const).map((id, i) => (
              <div key={id} className="flex items-center gap-2 flex-1">
                <div className={`flex-1 text-center rounded-xl py-2 titel font-bold ${evo.rang === id ? 'bg-akzent text-white' : 'bg-tiefe text-text-3'}`}>{rangName(id, profil.neutralerStartname)}</div>
                {i < 2 && <span className="text-text-3">→</span>}
              </div>
            ))}
          </div>
          <div className="text-sm text-text-2">Durchschnittliche Entwicklung <b className="text-text zahl">{Math.round(r.mittel * 100)} %</b>{evo.rang !== 'beast' && <> · nächster Rang ab {Math.round(naechste * 100)} %</>}</div>
          <div className="balken"><i style={{ width: `${Math.min(100, (r.mittel / naechste) * 100)}%` }} /></div>
        </section>

        <section className="karte p-4 grid gap-3">
          <div className="etikett">Archetyp</div>
          <div><div className="titel font-bold text-2xl">{rangName(evo.archetyp, profil.neutralerStartname)}</div><div className="text-sm text-text-2">{ARCHETYP[evo.archetyp].beschreibung}</div></div>
          {evo.kandidat !== evo.archetyp && <div className="text-xs text-akzent-hell">Auf dem Weg zu {ARCHETYP[evo.kandidat].name} – seit {tageKandidat} Tag{tageKandidat === 1 ? '' : 'en'} (Wechsel nach 7 stabilen Tagen)</div>}
          <div className="grid grid-cols-3 gap-2">
            {ARCHETYPEN.map(a => {
              const frei = evo.freigeschaltet.includes(a.id);
              return (
                <div key={a.id} className={`rounded-xl p-2 text-center border ${a.id === evo.archetyp ? 'border-akzent bg-akzent/10' : 'border-linie bg-tiefe'} ${frei ? '' : 'opacity-45'}`}>
                  <div className="titel text-sm font-bold">{rangName(a.id, profil.neutralerStartname)}</div>
                  <div className="text-[10px] text-text-3">{frei ? 'freigeschaltet' : 'gesperrt'}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="karte p-4 grid gap-2">
          <div className="etikett">Regionen</div>
          {REGIONEN.map(([id, name]) => (
            <div key={id} className="grid grid-cols-[110px_minmax(0,1fr)_40px] items-center gap-2 text-sm">
              <span>{name}</span><span className="balken"><i style={{ width: `${Math.min(100, (r as unknown as Record<string, number>)[id] * 100)}%` }} /></span>
              <span className="text-right zahl text-text-2">{Math.round((r as unknown as Record<string, number>)[id] * 100)}</span>
            </div>
          ))}
        </section>

        <section className="karte p-4 grid gap-2">
          <div className="etikett">Gesamtentwicklung</div>
          <Diagramm serien={[{ name: 'Durchschnitt', farbe: 'var(--akzent)', punkte: gesamt }]} xFormat={datum} />
        </section>

        <section className="karte p-4 grid gap-2">
          <div className="flex items-center gap-2">
            <span className="etikett">Muskel im Verlauf</span>
            <select className="eingabe ml-auto py-1.5 text-sm" value={muskel} onChange={e => setMuskel(e.target.value)} aria-label="Muskel wählen">
              {MUSKELN.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3 text-xs text-text-2"><span><span style={{ color: '#3a87ec' }}>■</span> Links</span><span><span style={{ color: '#c27d22' }}>■</span> Rechts</span></div>
          <Diagramm serien={[{ name: `${MUSKEL[muskel].name} links`, farbe: '#3a87ec', punkte: kurve.l }, { name: `${MUSKEL[muskel].name} rechts`, farbe: '#c27d22', punkte: kurve.r }]} xFormat={datum} />
          <p className="text-xs text-text-3 m-0">Nach einer Schonfrist sinkt die Entwicklung langsam; der Höchststand bleibt gespeichert und beschleunigt den Wiederaufbau.</p>
        </section>
      </div>
    </div>
  );
}
