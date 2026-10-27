import { useMemo, useState } from 'react';
import { useApp, optionen } from '../../store/app';
import { BuehnenPlatz } from '../BuehnenSystem';
import { ARCHETYPEN, ARCHETYP, RANG_GRENZEN, regionWerte } from '../../engine/archetypen';
import { MUSKELN, MUSKEL, einheitIndex, amax } from '../../engine/muskeln';
import { verlauf } from '../../engine/modell';
import { Diagramm } from '../teile/Diagramm';
import { rangName } from '../App';

const TAG = 86_400_000;
const datum = (t: number) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
const REGIONEN: [string, string][] = [['brust', 'Brust'], ['schulter', 'Schultern'], ['oberarm', 'Oberarme'], ['unterarm', 'Unterarme'], ['ruecken', 'Rücken'], ['bauch', 'Bauch'], ['gesaess', 'Gesäß'], ['oberschenkel', 'Oberschenkel'], ['waden', 'Waden']];

export function Evolution() {
  const evo = useApp(s => s.evolution), ansicht = useApp(s => s.ansicht), profil = useApp(s => s.profil), saetze = useApp(s => s.saetze), jetzt = useApp(s => s.jetzt);
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
        {vergleich && <div className="absolute bottom-2 inset-x-0 flex justify-around titel text-sm text-text-2 pointer-events-none"><span>Start</span><span>Jetzt</span></div>}
      </BuehnenPlatz>
      <div className="seite grid gap-3 mt-3">
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
