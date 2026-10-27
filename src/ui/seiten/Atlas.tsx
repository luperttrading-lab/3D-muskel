import { useEffect, useMemo } from 'react';
import { useApp, optionen } from '../../store/app';
import { BuehnenPlatz } from '../BuehnenSystem';
import { ATLAS_GRUPPEN, MUSKEL, amax, einheit, einheitIndex, type Seite } from '../../engine/muskeln';
import { UEBUNGEN } from '../../engine/uebungen';
import { erhaltung, REGELN } from '../../engine/modell';
import { ENTWICKLUNG_STOPS } from '../farben';
import { useNavigation } from '../navigation';

const prozent = (v: number) => `${Math.round(v * 100)} %`;
const STATUS = { untrainiert: 'untrainiert', aktiv: 'aktiv trainiert', schonfrist: 'Schonfrist', abbau: 'baut langsam ab' } as const;
const ANSICHTEN: [string, number][] = [['Vorne', 0], ['Hinten', Math.PI], ['Seite', Math.PI / 2]];

// Entwicklung einer Einheit relativ zu ihrem Maximum (0..1)
function useAnteil() {
  const ansicht = useApp(s => s.ansicht);
  return (id: string, s: Seite) => Math.max(0, ansicht.entwicklung[einheitIndex(id, s)]) / amax(id);
}

export function MuskelDetail({ index, schliessen }: { index: number; schliessen?: () => void }) {
  const ansicht = useApp(s => s.ansicht), zustand = useApp(s => s.muskelZustand), profil = useApp(s => s.profil), jetzt = useApp(s => s.jetzt);
  const waehle = useApp(s => s.waehle);
  const geheZu = useNavigation(s => s.geheZu);
  const anteil = useAnteil();
  const e = einheit(index);
  if (!e) return null;
  const m = MUSKEL[e.id];
  const r = REGELN[profil.modus];
  const z = zustand[index], er = z ? erhaltung(z, jetzt, optionen(profil)) : null;
  const wert = anteil(m.id, e.seite), andere = anteil(m.id, e.seite === 'L' ? 'R' : 'L');
  const unterschied = Math.max(wert, andere) > 0.02 ? Math.round(100 * (wert - andere) / Math.max(wert, andere)) : 0;
  const uebungen = UEBUNGEN.map(u => ({ u, mm: u.muskeln.find(x => x.muskel === m.id) })).filter(x => x.mm).sort((a, b) => b.mm!.koeffizient - a.mm!.koeffizient).slice(0, 5);
  return (
    <section className="karte p-4 grid gap-3 einblenden" aria-live="polite">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <h2 className="titel font-bold text-xl leading-tight">{m.name}</h2>
          <div className="text-xs text-text-3 italic">{m.latein}</div>
        </div>
        {schliessen && <button className="ml-auto text-sm text-text-3 shrink-0" onClick={schliessen}>Schließen</button>}
      </div>
      <div className="grid gap-0.5 text-sm">
        <div><span className="text-text-3">Primär: </span>{m.funktion[0]}</div>
        {m.funktion[1] && <div><span className="text-text-3">Sekundär: </span>{m.funktion[1]}</div>}
      </div>
      {!m.sichtbar && <p className="text-xs text-text-2 m-0">Tiefer Muskel: wird einzeln berechnet, verformt aber keine eigene Oberfläche.</p>}
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <div className="etikett">Entwicklungsstand</div>
          <div className="segment ml-auto" role="group" aria-label="Körperseite">
            {(['L', 'R'] as const).map(s => (
              <button key={s} aria-pressed={e.seite === s} onClick={() => waehle(einheitIndex(m.id, s), false)}>{s === 'L' ? 'Links' : 'Rechts'}</button>
            ))}
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="titel text-3xl font-bold zahl">{prozent(wert)}</span>
          <span className={`text-xs ${Math.abs(unterschied) > 20 ? 'text-warn' : 'text-text-3'}`}>
            {e.seite === 'L' ? 'rechts' : 'links'} {prozent(andere)}{Math.abs(unterschied) > 20 && andere > 0.02 && wert > 0.02 ? ` · ${Math.abs(unterschied)} % Unterschied` : ''}
          </span>
        </div>
        <div className="balken h-2.5"><i style={{ width: `${Math.min(100, 100 * wert)}%`, background: 'var(--color-gut)' }} /></div>
        <div className="text-[11px] text-text-3">Höchststand {prozent(ansicht.peak[index] / amax(m.id))} · Pump {prozent(ansicht.pump[index])}</div>
        {er && <div className={`text-[11px] font-semibold ${er.status === 'abbau' ? 'text-warn' : er.status === 'untrainiert' ? 'text-text-3' : 'text-gut'}`}>
          {STATUS[er.status]}{er.status === 'schonfrist' && ` (noch ${Math.ceil(er.tageBisAbbau)} T.)`}{er.status === 'aktiv' && er.tageBisAbbau > 0 && ` · Schonfrist ${r.gnadeTage} T.`}
        </div>}
      </div>
      <div className="grid gap-1.5">
        <div className="etikett">Beteiligte Übungen</div>
        {uebungen.length === 0 && <div className="text-sm text-text-3">Noch keine Übung im Katalog.</div>}
        {uebungen.map(({ u, mm }) => (
          <div key={u.id} className="grid grid-cols-[minmax(0,1fr)_72px] gap-x-2 items-center text-sm">
            <span className="truncate">{u.name} <span className="text-[10px] text-text-3">{mm!.rolle}</span></span>
            <span className="grid gap-0.5 text-right text-xs text-text-3 zahl">{Math.round(mm!.koeffizient * 100)} %<span className="balken"><i style={{ width: `${mm!.koeffizient * 100}%` }} /></span></span>
          </div>
        ))}
        <button className="knopf mt-1" onClick={() => geheZu('training')}>Zum Training</button>
      </div>
    </section>
  );
}

function GruppenDetail({ id }: { id: string }) {
  const g = ATLAS_GRUPPEN.find(x => x.id === id);
  const waehle = useApp(s => s.waehle), waehleGruppe = useApp(s => s.waehleGruppe);
  const anteil = useAnteil();
  if (!g) return null;
  return (
    <section className="karte p-4 grid gap-2 einblenden">
      <div className="flex items-center">
        <h2 className="titel font-bold text-xl">{g.name}</h2>
        <button className="ml-auto text-sm text-text-3" onClick={() => waehleGruppe(null)}>Schließen</button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] gap-2 etikett"><span>Muskel</span><span className="text-right">Links</span><span className="text-right">Rechts</span></div>
      {g.muskeln.map(mid => {
        const m = MUSKEL[mid], vl = anteil(mid, 'L'), vr = anteil(mid, 'R');
        return (
          <button key={mid} className="grid grid-cols-[minmax(0,1fr)_64px_64px] gap-2 items-center py-1.5 text-left text-sm" onClick={() => waehle(einheitIndex(mid, vr > vl ? 'R' : 'L'))}>
            <span className="truncate">{m.name}{!m.sichtbar && <span className="text-[10px] text-text-3 ml-1 border border-linie rounded px-1">tief</span>}</span>
            <span className="grid gap-0.5 text-right zahl text-xs">{prozent(vl)}<span className="balken"><i style={{ width: `${Math.min(100, vl * 100)}%` }} /></span></span>
            <span className="grid gap-0.5 text-right zahl text-xs">{prozent(vr)}<span className="balken"><i style={{ width: `${Math.min(100, vr * 100)}%` }} /></span></span>
          </button>
        );
      })}
      <p className="text-xs text-text-3 m-0">Muskel antippen – am Körper oder hier in der Liste – für Funktion, Seitenvergleich und Übungen.</p>
    </section>
  );
}

function Uebersicht() {
  const waehleGruppe = useApp(s => s.waehleGruppe);
  const anteil = useAnteil();
  return (
    <section className="karte p-4 grid gap-2">
      <div className="etikett">Entwicklung nach Gruppen</div>
      {ATLAS_GRUPPEN.map(g => {
        const sicht = g.muskeln.filter(m => MUSKEL[m].sichtbar);
        const l = sicht.reduce((a, m) => a + anteil(m, 'L'), 0) / sicht.length, r = sicht.reduce((a, m) => a + anteil(m, 'R'), 0) / sicht.length;
        return (
          <button key={g.id} className="grid grid-cols-[minmax(0,1fr)_64px_64px] gap-2 items-center py-1 text-left text-sm" onClick={() => waehleGruppe(g.id)}>
            <span className="truncate font-semibold">{g.name}</span>
            <span className="grid gap-0.5 text-right zahl text-xs">{prozent(l)}<span className="balken"><i style={{ width: `${Math.min(100, l * 100)}%` }} /></span></span>
            <span className="grid gap-0.5 text-right zahl text-xs">{prozent(r)}<span className="balken"><i style={{ width: `${Math.min(100, r * 100)}%` }} /></span></span>
          </button>
        );
      })}
    </section>
  );
}

export function Atlas() {
  const darstellung = useApp(s => s.darstellung), setzeDarstellung = useApp(s => s.setzeDarstellung);
  const auswahl = useApp(s => s.auswahl), auswahlGruppe = useApp(s => s.auswahlGruppe);
  const waehle = useApp(s => s.waehle), waehleGruppe = useApp(s => s.waehleGruppe), fahreZu = useApp(s => s.fahreZu);
  const geheZu = useNavigation(s => s.geheZu);
  const anteil = useAnteil();
  // Der Atlas zeigt standardmäßig die Anatomie; beim Verlassen kehren die anderen Seiten zur Haut zurück
  useEffect(() => {
    if (useApp.getState().darstellung === 'haut') setzeDarstellung('atlas');
    return () => { setzeDarstellung('haut'); useApp.setState({ auswahl: 0, auswahlGruppe: null }); };
  }, [setzeDarstellung]);
  const gruppenWert = useMemo(() => Object.fromEntries(ATLAS_GRUPPEN.map(g => {
    const sicht = g.muskeln.filter(m => MUSKEL[m].sichtbar);
    return [g.id, sicht.reduce((a, m) => a + anteil(m, 'L') + anteil(m, 'R'), 0) / (2 * sicht.length)];
  })), [anteil]);
  return (
    <div className="pb-6">
      <BuehnenPlatz className="h-[64vh] min-h-[400px]" startAzimut={0} abstandFaktor={1.1} versatzX={34}>
        <div className="absolute top-2 inset-x-2 flex justify-center">
          <div className="segment" role="group" aria-label="Blickrichtung">
            {ANSICHTEN.map(([n, az]) => <button key={n} className="!px-5" onClick={() => fahreZu({ azimut: az, hoehe: 0.95, abstand: 4.4, seitlich: 0 })}>{n}</button>)}
          </div>
        </div>
        <nav className="absolute left-2 top-14 bottom-14 w-[94px] overflow-y-auto grid content-start gap-1.5 pr-1" aria-label="Muskelgruppen">
          {ATLAS_GRUPPEN.map(g => {
            const aktiv = auswahlGruppe === g.id;
            return (
              <button key={g.id} aria-pressed={aktiv} onClick={() => aktiv && !auswahl ? waehleGruppe(null) : waehleGruppe(g.id)}
                className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-left text-[13px] font-semibold backdrop-blur ${aktiv ? 'border-akzent bg-akzent/25 text-text shadow-[0_0_14px_var(--akzent-glut)]' : 'border-linie bg-nacht/70 text-text-2'}`}>
                <span className="size-2 rounded-full shrink-0" style={{ background: `color-mix(in srgb, var(--color-gut) ${Math.round(20 + 80 * Math.min(1, gruppenWert[g.id] * 2))}%, #34405e)` }} />
                <span className="truncate">{g.name}</span>
              </button>
            );
          })}
        </nav>
        <div className="absolute bottom-2 right-2 segment" role="group" aria-label="Darstellung">
          {([['haut', 'Haut'], ['entwicklung', 'Entwicklung'], ['atlas', 'Anatomie']] as const).map(([d, n]) =>
            <button key={d} aria-pressed={darstellung === d} onClick={() => setzeDarstellung(d)}>{n}</button>)}
        </div>
        {darstellung === 'entwicklung' && (
          <div className="absolute top-14 right-2 karte px-3 py-2 text-[11px] text-text-2 pointer-events-none">
            Entwicklung
            <div className="w-28 h-2 rounded mt-1" style={{ background: `linear-gradient(90deg, ${ENTWICKLUNG_STOPS.map(([p, c]) => `${c} ${p * 100}%`).join(',')})` }} />
            <div className="flex justify-between"><span>0 %</span><span>100 %</span></div>
          </div>
        )}
      </BuehnenPlatz>
      <div className="seite grid gap-3 mt-3">
        {auswahl > 0 ? <MuskelDetail index={auswahl} schliessen={() => waehle(0, false)} />
          : auswahlGruppe ? <GruppenDetail id={auswahlGruppe} /> : <Uebersicht />}
        <button className="knopf justify-between" onClick={() => geheZu('evolution')}>
          <span>Fortschritt – Vorher / Nachher</span><span aria-hidden>›</span>
        </button>
      </div>
    </div>
  );
}
