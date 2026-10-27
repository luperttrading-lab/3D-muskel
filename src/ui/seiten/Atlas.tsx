import { useMemo, useState } from 'react';
import { useApp, optionen } from '../../store/app';
import { BuehnenPlatz } from '../BuehnenSystem';
import { EINHEITEN, MUSKEL, MUSKELN, amax, einheit, einheitIndex, type Seite } from '../../engine/muskeln';
import { UEBUNGEN } from '../../engine/uebungen';
import { erhaltung, REGELN } from '../../engine/modell';
import { ENTWICKLUNG_STOPS } from '../farben';
import { useNavigation } from '../navigation';

const prozent = (v: number) => `${Math.round(v * 100)} %`;
const STATUS = { untrainiert: 'untrainiert', aktiv: 'aktiv trainiert', schonfrist: 'Schonfrist', abbau: 'baut langsam ab' } as const;

export function MuskelDetail({ index, schliessen }: { index: number; schliessen?: () => void }) {
  const ansicht = useApp(s => s.ansicht), zustand = useApp(s => s.muskelZustand), profil = useApp(s => s.profil), jetzt = useApp(s => s.jetzt);
  const waehle = useApp(s => s.waehle);
  const geheZu = useNavigation(s => s.geheZu);
  const e = einheit(index);
  if (!e) return null;
  const m = MUSKEL[e.id];
  const r = REGELN[profil.modus];
  const uebungen = UEBUNGEN.filter(u => u.muskeln.some(x => x.muskel === m.id)).map(u => ({ u, k: u.muskeln.find(x => x.muskel === m.id)!.koeffizient })).sort((a, b) => b.k - a.k).slice(0, 5);
  const seiteKarte = (s: Seite) => {
    const i = einheitIndex(m.id, s), z = zustand[i];
    const er = z ? erhaltung(z, jetzt, optionen(profil)) : null;
    return (
      <button className={`karte p-3 text-left grid gap-1 ${s === e.seite ? 'border-akzent' : ''}`} onClick={() => waehle(i)} aria-pressed={s === e.seite}>
        <div className="etikett">{s === 'L' ? 'Links' : 'Rechts'}</div>
        <div className="titel text-2xl font-bold zahl">{prozent(Math.max(0, ansicht.entwicklung[i]) / amax(m.id))}</div>
        <div className="balken"><i style={{ width: `${Math.min(100, 100 * Math.max(0, ansicht.entwicklung[i]) / amax(m.id))}%` }} /></div>
        <div className="text-[11px] text-text-3">Höchststand {prozent(ansicht.peak[i] / amax(m.id))} · Pump {prozent(ansicht.pump[i])}</div>
        {er && <div className={`text-[11px] font-semibold ${er.status === 'abbau' ? 'text-warn' : er.status === 'untrainiert' ? 'text-text-3' : 'text-gut'}`}>
          {STATUS[er.status]}{er.status === 'schonfrist' && ` (noch ${Math.ceil(er.tageBisAbbau)} T.)`}{er.status === 'aktiv' && er.tageBisAbbau > 0 && ` · Schonfrist ${r.gnadeTage} T.`}
        </div>}
      </button>
    );
  };
  return (
    <section className="karte p-4 grid gap-3 einblenden" aria-live="polite">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <h2 className="titel font-bold text-xl">{m.name}</h2>
          <div className="text-xs text-text-3 italic">{m.latein}</div>
        </div>
        {schliessen && <button className="ml-auto text-sm text-text-3" onClick={schliessen}>Schließen</button>}
      </div>
      {!m.sichtbar && <p className="text-xs text-text-2 m-0">Tiefer Muskel: wird einzeln berechnet, verformt aber keine eigene Oberfläche.</p>}
      <div className="grid grid-cols-2 gap-2">{seiteKarte('L')}{seiteKarte('R')}</div>
      <div className="grid gap-1.5">
        <div className="etikett">Übungen für diesen Muskel</div>
        {uebungen.map(({ u, k }) => (
          <div key={u.id} className="flex items-center gap-2 text-sm">
            <span className="truncate">{u.name}</span><span className="ml-auto text-text-3 zahl">{Math.round(k * 100)} %</span>
          </div>
        ))}
        <button className="knopf mt-1" onClick={() => geheZu('training')}>Zum Training</button>
      </div>
    </section>
  );
}

const ANSICHTEN: [string, number][] = [['Vorne', 0], ['Links', Math.PI / 2], ['Hinten', Math.PI], ['Rechts', -Math.PI / 2]];

export function Atlas() {
  const darstellung = useApp(s => s.darstellung), setzeDarstellung = useApp(s => s.setzeDarstellung);
  const auswahl = useApp(s => s.auswahl), waehle = useApp(s => s.waehle), fahreZu = useApp(s => s.fahreZu);
  const ansicht = useApp(s => s.ansicht);
  const [offen, setOffen] = useState<string | null>('Arme');
  const gruppen = useMemo(() => [...new Set(MUSKELN.map(m => m.gruppe))], []);
  return (
    <div className="pb-6">
      <BuehnenPlatz className="h-[58vh] min-h-[360px]" startAzimut={0} abstandFaktor={1.08}>
        <div className="absolute top-2 left-2 segment" role="group" aria-label="Darstellung">
          {([['haut', 'Haut'], ['entwicklung', 'Entwicklung'], ['atlas', 'Anatomie']] as const).map(([d, n]) =>
            <button key={d} aria-pressed={darstellung === d} onClick={() => setzeDarstellung(d)}>{n}</button>)}
        </div>
        <div className="absolute bottom-2 right-2 segment" role="group" aria-label="Blickrichtung">
          {ANSICHTEN.map(([n, az]) => <button key={n} onClick={() => fahreZu({ azimut: az, hoehe: 0.95, abstand: 4.3 })}>{n}</button>)}
        </div>
        {darstellung === 'entwicklung' && (
          <div className="absolute top-12 left-2 karte px-3 py-2 text-[11px] text-text-2 pointer-events-none">
            Entwicklung
            <div className="w-32 h-2 rounded mt-1" style={{ background: `linear-gradient(90deg, ${ENTWICKLUNG_STOPS.map(([p, c]) => `${c} ${p * 100}%`).join(',')})` }} />
            <div className="flex justify-between"><span>0 %</span><span>100 %</span></div>
          </div>
        )}
        {!auswahl && <div className="absolute bottom-12 right-3 text-[11px] text-text-3 pointer-events-none">Muskel antippen für Details</div>}
      </BuehnenPlatz>
      <div className="seite grid gap-3 mt-3">
        {auswahl > 0 && <MuskelDetail index={auswahl} schliessen={() => waehle(0, false)} />}
        <section className="karte p-2">
          {gruppen.map(g => (
            <div key={g} className="border-b border-linie last:border-0">
              <button className="w-full flex items-center p-2.5 titel font-bold" onClick={() => setOffen(offen === g ? null : g)} aria-expanded={offen === g}>
                {g}<span className="ml-auto text-text-3">{offen === g ? '−' : '+'}</span>
              </button>
              {offen === g && (
                <div className="grid gap-1 pb-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] gap-2 px-2.5 etikett"><span>Muskel</span><span className="text-right">Links</span><span className="text-right">Rechts</span></div>
                  {MUSKELN.filter(m => m.gruppe === g).map(m => {
                    const l = einheitIndex(m.id, 'L'), r = einheitIndex(m.id, 'R');
                    const vl = Math.max(0, ansicht.entwicklung[l]) / amax(m.id), vr = Math.max(0, ansicht.entwicklung[r]) / amax(m.id);
                    return (
                      <button key={m.id} className={`grid grid-cols-[minmax(0,1fr)_64px_64px] gap-2 items-center px-2.5 py-1.5 rounded-lg text-left text-sm ${EINHEITEN[auswahl - 1]?.id === m.id ? 'bg-flaeche-2' : ''}`}
                        onClick={() => waehle(vr > vl ? r : l)}>
                        <span className="truncate">{m.name}{!m.sichtbar && <span className="text-[10px] text-text-3 ml-1 border border-linie rounded px-1">tief</span>}</span>
                        <span className="grid gap-0.5 text-right zahl text-xs">{prozent(vl)}<span className="balken"><i style={{ width: `${Math.min(100, vl * 100)}%` }} /></span></span>
                        <span className="grid gap-0.5 text-right zahl text-xs">{prozent(vr)}<span className="balken"><i style={{ width: `${Math.min(100, vr * 100)}%` }} /></span></span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
