import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../store/app';
import { BuehnenPlatz } from '../BuehnenSystem';
import { KATEGORIEN, PLAENE, PLAN, UEBUNG, UEBUNGEN } from '../../engine/uebungen';
import { EINHEITEN, MUSKEL } from '../../engine/muskeln';
import { xpFuerNaechstenSatz, e1rm } from '../../engine/xp';
import { Haken, Kreuz, Minus, Plus } from '../teile/Symbole';

type SeiteWahl = 'B' | 'L' | 'R';
const SEITEN_NAME: Record<SeiteWahl, string> = { B: 'Beide', L: 'Links', R: 'Rechts' };

function Stepper({ label, wert, setze, schritt, min = 0, max = 999, einheit, leer }: { label: string; wert: number | null; setze: (v: number | null) => void; schritt: number; min?: number; max?: number; einheit?: string; leer?: string }) {
  const id = `stepper-${label}`;
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="etikett">{label}</label>
      <div className="flex items-center gap-1">
        <button className="knopf p-2 shrink-0" aria-label={`${label} verringern`} onClick={() => setze(Math.max(min, (wert ?? 0) - schritt))}><Minus /></button>
        <input id={id} className="eingabe w-full !px-1 text-center zahl text-lg font-semibold" inputMode="decimal" value={wert ?? ''} placeholder={leer}
          onChange={e => { const v = e.target.value.replace(',', '.'); setze(v === '' ? null : Math.min(max, Math.max(min, Number(v) || 0))); }} />
        <button className="knopf p-2 shrink-0" aria-label={`${label} erhöhen`} onClick={() => setze(Math.min(max, (wert ?? 0) + schritt))}><Plus /></button>
      </div>
      {einheit && <span className="text-[11px] text-text-3 text-center">{einheit}</span>}
    </div>
  );
}

function Katalog({ schliessen, waehle }: { schliessen: () => void; waehle: (id: string) => void }) {
  const [kat, setKat] = useState(KATEGORIEN[0]);
  const geraete = useApp(s => s.profil.geraete);
  return (
    <div className="fixed inset-0 z-40 bg-nacht/95 backdrop-blur flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" role="dialog" aria-label="Übung wählen">
      <div className="seite flex items-center py-3 border-b border-linie">
        <h2 className="titel font-bold text-lg">Übung wählen</h2>
        <button className="ml-auto p-2" onClick={schliessen} aria-label="Schließen"><Kreuz /></button>
      </div>
      <div className="seite flex gap-1.5 overflow-x-auto py-2.5">{KATEGORIEN.map(k => <button key={k} className="chip shrink-0" aria-pressed={k === kat} onClick={() => setKat(k)}>{k}</button>)}</div>
      <div className="seite overflow-y-auto grid gap-2 pb-4">
        {UEBUNGEN.filter(u => u.kategorie === kat).map(u => (
          <button key={u.id} className="karte p-3 text-left flex items-center gap-3" onClick={() => { waehle(u.id); schliessen(); }}>
            <div className="min-w-0">
              <div className="font-semibold">{u.name}{!geraete.includes(u.geraet) && <span className="text-xs text-warn ml-2">({u.geraet} nicht ausgewählt)</span>}</div>
              <div className="text-xs text-text-3 truncate">{u.muskeln.filter(m => m.rolle === 'primär').map(m => MUSKEL[m.muskel].name).join(', ')} · {u.geraet}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Zusammenfassung({ sessionId, schliessen }: { sessionId: string; schliessen: () => void }) {
  const alle = useApp(s => s.saetze), alleXp = useApp(s => s.xp);
  const saetze = useMemo(() => alle.filter(x => x.sessionId === sessionId), [alle, sessionId]);
  const xp = useMemo(() => { const ids = new Set(saetze.map(x => x.id)); return alleXp.filter(e => e.quelle === sessionId || ids.has(e.quelle)); }, [alleXp, saetze, sessionId]);
  const summe = xp.reduce((a, e) => a + e.punkte, 0);
  const muskeln = new Map<string, number>();
  for (const s of saetze) for (const m of UEBUNG[s.exerciseId].muskeln) muskeln.set(m.muskel, (muskeln.get(m.muskel) ?? 0) + m.koeffizient);
  const top = [...muskeln.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <section className="karte p-4 grid gap-3 einblenden border-gut">
      <h2 className="titel font-bold text-lg">Workout abgeschlossen</h2>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><div className="titel text-2xl font-bold zahl">{saetze.length}</div><div className="etikett">Sätze</div></div>
        <div><div className="titel text-2xl font-bold zahl text-gut">+{summe}</div><div className="etikett">XP</div></div>
        <div><div className="titel text-2xl font-bold zahl">{xp.filter(e => e.typ === 'pr').length}</div><div className="etikett">Rekorde</div></div>
      </div>
      <div className="text-sm text-text-2">Am meisten gefordert: {top.map(([id]) => MUSKEL[id].name).join(', ') || '–'}</div>
      <button className="knopf" onClick={schliessen}>Fertig</button>
    </section>
  );
}

export function Training() {
  const aktiv = useApp(s => s.aktiveSession);
  const sessions = useApp(s => s.sessions);
  const alleSaetze = useApp(s => s.saetze);
  const feedback = useApp(s => s.feedback);
  const sessionStarten = useApp(s => s.sessionStarten);
  const sessionBeenden = useApp(s => s.sessionBeenden);
  const satzAbschliessen = useApp(s => s.satzAbschliessen);
  const satzLoeschen = useApp(s => s.satzLoeschen);
  const [zusammenfassung, setZusammenfassung] = useState<string | null>(null);
  const [katalog, setKatalog] = useState(false);
  const [bestaetigen, setBestaetigen] = useState(false);

  const session = sessions.find(s => s.id === aktiv);
  const plan = session ? PLAN[session.planId] ?? PLAN.frei : null;
  const saetze = useMemo(() => alleSaetze.filter(s => s.sessionId === aktiv).sort((a, b) => a.completedAt - b.completedAt), [alleSaetze, aktiv]);

  const [uebungId, setUebungId] = useState<string>(plan?.uebungen[0]?.[0] ?? 'bizepscurl');
  useEffect(() => { if (plan?.uebungen[0]) setUebungId(plan.uebungen[0][0]); }, [plan?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const uebung = UEBUNG[uebungId];
  const letzter = useMemo(() => [...alleSaetze].reverse().find(s => s.exerciseId === uebungId), [alleSaetze, uebungId]);
  const [seite, setSeite] = useState<SeiteWahl>('B');
  const [gewicht, setGewicht] = useState<number | null>(null);
  const [wdh, setWdh] = useState<number | null>(10);
  const [rir, setRir] = useState(2);
  const [schmerz, setSchmerz] = useState(false);
  useEffect(() => {
    setSeite(uebung.einseitig ? 'L' : 'B');
    setGewicht(letzter?.weight ?? null);
    setWdh(letzter?.reps ?? 10);
    setRir(letzter?.rir ?? 2);
    setSchmerz(false);
  }, [uebungId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [blitz, setBlitz] = useState<{ id: string; xp: number } | null>(null);
  const abschliessen = async () => {
    const fb = await satzAbschliessen({ exerciseId: uebungId, reps: wdh ?? 0, weight: gewicht, rir, side: seite, pain: schmerz || undefined });
    setBlitz({ id: fb.id, xp: fb.xp });
    setSchmerz(false);
  };
  const rekordAlt = useMemo(() => Math.max(0, ...alleSaetze.filter(s => s.exerciseId === uebungId && s.weight).map(s => e1rm(s.weight!, s.reps))), [alleSaetze, uebungId]);

  if (!aktiv) {
    return (
      <div className="seite py-4 grid gap-3">
        {zusammenfassung && <Zusammenfassung sessionId={zusammenfassung} schliessen={() => setZusammenfassung(null)} />}
        <h1 className="titel font-bold text-xl">Workout wählen</h1>
        {PLAENE.map(p => (
          <button key={p.id} className="karte p-4 text-left grid gap-1.5" onClick={() => sessionStarten(p.id)}>
            <div className="flex items-baseline gap-2"><span className="titel font-bold text-lg">{p.name}</span><span className="text-xs text-text-3 ml-auto">{p.uebungen.reduce((a, [, n]) => a + n, 0) || 'frei'} Sätze</span></div>
            <div className="text-sm text-text-2">{p.beschreibung}</div>
            {p.uebungen.length > 0 && <div className="text-xs text-text-3">{p.uebungen.map(([u]) => UEBUNG[u].name).join(' · ')}</div>}
          </button>
        ))}
      </div>
    );
  }

  const fertigJe = (id: string) => saetze.filter(s => s.exerciseId === id).length;
  const letzteWirkung = feedback && saetze.some(s => s.id === feedback.id) ? feedback : null;
  const naechsteXp = xpFuerNaechstenSatz(saetze.length);
  const prMoeglich = gewicht && wdh && rekordAlt > 0 && e1rm(gewicht, wdh) > rekordAlt * 1.001;

  return (
    <div className="h-full flex flex-col">
      <BuehnenPlatz className="h-[36vh] min-h-[230px] shrink-0 border-b border-linie">
        {blitz && letzteWirkung && blitz.id === letzteWirkung.id && (
          <div key={blitz.id} className="absolute left-1/2 top-6 -translate-x-1/2 xp-flug pointer-events-none">
            <div className="titel text-3xl font-extrabold text-gut drop-shadow">{blitz.xp > 0 ? `+${blitz.xp} XP` : 'Satz gespeichert'}</div>
          </div>
        )}
        {letzteWirkung && (
          <div className="absolute left-2 bottom-2 grid gap-1 pointer-events-none">
            {[...letzteWirkung.wirkung].sort((a, b) => b.reiz - a.reiz).slice(0, 3).map(w => {
              const e = EINHEITEN[w.einheit - 1];
              return <span key={w.einheit} className="rounded-lg bg-nacht/80 border border-linie px-2 py-0.5 text-[11px] text-text-2 w-fit">
                {MUSKEL[e.id].name} {e.seite === 'L' ? 'links' : 'rechts'} · <b className="text-akzent-hell zahl">Pump {Math.round(w.pumpNachher * 100)} %</b></span>;
            })}
          </div>
        )}
      </BuehnenPlatz>

      <div id="training-liste" className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
      <div className="seite grid gap-3 py-3">
        {plan && plan.uebungen.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Übungen des Plans">
            {plan.uebungen.map(([u, ziel]) => (
              <button key={u} className="chip shrink-0 text-xs" aria-pressed={u === uebungId} onClick={() => setUebungId(u)}>
                {UEBUNG[u].name} <span className="zahl opacity-80">{fertigJe(u)}/{ziel}</span>{fertigJe(u) >= ziel && ' ✓'}
              </button>
            ))}
          </div>
        )}

        <section className="karte p-4 grid gap-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0">
              <div className="etikett">Übung</div>
              <h2 className="titel font-bold text-lg truncate">{uebung.name}</h2>
            </div>
            <button className="knopf ml-auto text-sm" onClick={() => setKatalog(true)}>Wechseln</button>
          </div>
          {uebung.hinweis && <p className="text-xs text-text-3 m-0">{uebung.hinweis}</p>}
          <div className="segment w-fit" role="group" aria-label="Seite">
            {(['B', 'L', 'R'] as SeiteWahl[]).map(s => <button key={s} aria-pressed={seite === s} onClick={() => setSeite(s)}>{SEITEN_NAME[s]}</button>)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stepper label="Gewicht" wert={gewicht} setze={setGewicht} schritt={2.5} max={500} einheit="kg (optional)" leer="–" />
            <Stepper label="Wiederholungen" wert={wdh} setze={setWdh} schritt={1} min={1} max={100} />
          </div>
          <div className="grid gap-1">
            <span className="etikett">Reserve (RIR)</span>
            <div className="flex gap-1.5" role="group" aria-label="Wiederholungen in Reserve">
              {[0, 1, 2, 3, 4].map(r => <button key={r} className="chip flex-1" aria-pressed={rir === r} onClick={() => setRir(r)}>{r === 4 ? '4+' : r}</button>)}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-2">
            <input type="checkbox" checked={schmerz} onChange={e => setSchmerz(e.target.checked)} className="w-5 h-5 accent-[var(--akzent)]" />
            Schmerzen bei diesem Satz
          </label>
          <div className="sticky bottom-2 z-10">
            <button className="knopf knopf-gut w-full py-4 text-lg" onClick={abschliessen} disabled={!wdh}>
              <Haken /> Satz abschließen {naechsteXp > 0 && <span className="text-sm opacity-80">+{naechsteXp} XP</span>}
            </button>
          </div>
          {prMoeglich && <div className="text-xs text-gut text-center">Mit diesem Satz wäre es ein neuer Rekord (geschätztes 1RM).</div>}
        </section>

        <section className="karte p-4 grid gap-2">
          <div className="etikett">Beanspruchte Muskeln (Modellgewichte)</div>
          {[...uebung.muskeln].sort((a, b) => b.koeffizient - a.koeffizient).map(m => (
            <div key={m.muskel} className="grid grid-cols-[minmax(0,1fr)_90px_42px] items-center gap-2 text-sm">
              <span className="truncate">{MUSKEL[m.muskel].name}{!MUSKEL[m.muskel].sichtbar && <span className="text-[10px] text-text-3 ml-1">tief</span>}</span>
              <span className="balken"><i style={{ width: `${m.koeffizient * 100}%`, opacity: m.rolle === 'primär' ? 1 : 0.55 }} /></span>
              <span className="text-right text-text-2 zahl">{Math.round(m.koeffizient * 100)} %</span>
            </div>
          ))}
        </section>

        {saetze.length > 0 && (
          <section className="karte p-4 grid gap-2">
            <div className="etikett">Sätze dieses Workouts</div>
            {[...saetze].reverse().map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <span className="zahl text-text-3 w-6">{saetze.length - i}</span>
                <span className="min-w-0 truncate">{UEBUNG[s.exerciseId].name}{s.side !== 'B' && ` · ${SEITEN_NAME[s.side]}`}</span>
                <span className="ml-auto zahl text-text-2">{s.weight ? `${String(s.weight).replace('.', ',')} kg × ` : ''}{s.reps} · RIR {s.rir}</span>
                <button className="p-1 text-text-3" onClick={() => satzLoeschen(s.id)} aria-label="Satz löschen"><Kreuz /></button>
              </div>
            ))}
          </section>
        )}

        {!bestaetigen ? (
          <div className="grid grid-cols-2 gap-2">
            <button className="knopf" onClick={() => setBestaetigen(true)}>Abbrechen</button>
            <button className="knopf knopf-haupt" onClick={async () => { const id = aktiv; await sessionBeenden(); setZusammenfassung(id); document.getElementById('inhalt')?.scrollTo({ top: 0 }); }}>Workout beenden</button>
          </div>
        ) : (
          <div className="karte p-3 grid gap-2">
            <div className="text-sm text-text-2">Workout abbrechen? Die erfassten Sätze bleiben gespeichert, aber es gibt keinen Workout-Bonus.</div>
            <div className="grid grid-cols-2 gap-2">
              <button className="knopf" onClick={() => setBestaetigen(false)}>Weiter trainieren</button>
              <button className="knopf border-warn" onClick={() => { sessionBeenden(true); setBestaetigen(false); }}>Abbrechen</button>
            </div>
          </div>
        )}
      </div>
      </div>
      {katalog && <Katalog schliessen={() => setKatalog(false)} waehle={setUebungId} />}
    </div>
  );
}
