// Evolution (Lauch → Adonis → Beast) und Körper-Archetypen aus der relativen Muskelentwicklung.
// Beide wechseln nur mit Hysterese, damit nichts täglich hin- und herspringt.

import { ansichtZu, satzAnwenden, leererZustand, type Ansicht, type Optionen, type PerformedSet } from './modell';
import { EINHEITEN, MUSKEL, muskelMasse, type Region } from './muskeln';

export type RangId = 'lauch' | 'adonis' | 'beast';
export type ArchetypId = RangId | 'popeye' | 'discopumper' | 'beast_strauss' | 'trex' | 'legday' | 'balanced';

export interface Archetyp { id: ArchetypId; name: string; beschreibung: string }
export const ARCHETYPEN: Archetyp[] = [
  { id: 'lauch', name: 'Lauch', beschreibung: 'Der untrainierte Startcharakter. Alles ist möglich.' },
  { id: 'adonis', name: 'Adonis', beschreibung: 'Athletisch und sichtbar trainiert.' },
  { id: 'beast', name: 'Beast', beschreibung: 'Sehr muskulös – stilisiert.' },
  { id: 'popeye', name: 'Popeye', beschreibung: 'Überproportionale Unterarme, schlankere Oberarme.' },
  { id: 'discopumper', name: 'Discopumper', beschreibung: 'Brust, Schultern und Arme stark, Beine im Rückstand.' },
  { id: 'beast_strauss', name: 'Beast & Strauß', beschreibung: 'Sehr massiver Oberkörper auf sehr dünnen Beinen.' },
  { id: 'trex', name: 'T-Rex', beschreibung: 'Kräftiger Rumpf, kleine Arme.' },
  { id: 'legday', name: 'Leg Day Monster', beschreibung: 'Die Beine dominieren.' },
  { id: 'balanced', name: 'Balanced Beast', beschreibung: 'Gleichmäßig entwickelte Muskulatur.' },
];
export const ARCHETYP = Object.fromEntries(ARCHETYPEN.map(a => [a.id, a])) as Record<ArchetypId, Archetyp>;

export function regionWerte(a: Ansicht, geschlecht: 'm' | 'w'): Record<Region, number> & { mittel: number } {
  const summe: Record<string, [number, number]> = {};
  let gs = 0, gw = 0;
  for (const e of EINHEITEN) {
    const m = MUSKEL[e.id], w = muskelMasse(e.id, geschlecht), v = Math.max(0, a.entwicklung[e.index]) / (m.amax ?? 1);
    const s = summe[m.region] ?? [0, 0];
    s[0] += w * v; s[1] += w;
    summe[m.region] = s;
    gs += w * v; gw += w;
  }
  const r = Object.fromEntries(Object.entries(summe).map(([k, [s, w]]) => [k, s / w])) as Record<Region, number>;
  return { ...r, mittel: gs / gw };
}

const mean = (...x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;

export const RANG_GRENZEN = { adonis: 0.12, beast: 0.45 };
const HYSTERESE = 0.03;

export function rang(mittel: number, bisher: RangId = 'lauch'): RangId {
  const roh: RangId = mittel >= RANG_GRENZEN.beast ? 'beast' : mittel >= RANG_GRENZEN.adonis ? 'adonis' : 'lauch';
  const stufe = { lauch: 0, adonis: 1, beast: 2 };
  if (stufe[roh] > stufe[bisher]) {
    const grenze = roh === 'beast' ? RANG_GRENZEN.beast : RANG_GRENZEN.adonis;
    return mittel >= grenze + HYSTERESE ? roh : bisher;
  }
  if (stufe[roh] < stufe[bisher]) {
    const grenze = bisher === 'beast' ? RANG_GRENZEN.beast : RANG_GRENZEN.adonis;
    return mittel < grenze - HYSTERESE ? roh : bisher;
  }
  return roh;
}

// Archetyp-Kandidat aus den Regionswerten
export function kandidat(r: ReturnType<typeof regionWerte>, rangJetzt: RangId): ArchetypId {
  const arme = r.oberarm, unterarme = r.unterarm;
  const oben = mean(r.brust, r.schulter, r.oberarm, r.ruecken);
  const beine = mean(r.oberschenkel, r.waden, r.gesaess);
  const rumpf = mean(r.brust, r.ruecken, r.bauch);
  // Jede Regel hat ihre eigene Mindestentwicklung der betroffenen Region
  if (unterarme >= 0.15 && unterarme > 1.6 * arme) return 'popeye';
  if (oben >= 0.4 && beine < 0.25 * oben) return 'beast_strauss';
  if (oben >= 0.15 && beine < 0.5 * oben) return 'discopumper';
  if (rumpf >= 0.15 && arme < 0.45 * rumpf) return 'trex';
  if (beine >= 0.15 && oben < 0.5 * beine) return 'legday';
  const werte = [r.brust, r.schulter, r.oberarm, r.ruecken, r.bauch, r.gesaess, r.oberschenkel, r.waden];
  if (r.mittel >= 0.3 && Math.max(...werte) < 1.5 * Math.min(...werte)) return 'balanced';
  return rangJetzt;
}

export interface EvolutionsStand {
  rang: RangId;
  archetyp: ArchetypId;
  kandidat: ArchetypId;
  kandidatSeit: number | null;
  freigeschaltet: ArchetypId[];
  verlauf: { t: number; mittel: number; rang: RangId; archetyp: ArchetypId }[];
}

const TAG = 86_400_000;
export const ARCHETYP_HALTETAGE = 7;

// Spielt die Historie tageweise ab: Rang mit Hysterese, Archetyp erst nach 7 Tagen stabilem Kandidaten
export function evolution(saetze: PerformedSet[], o: Optionen, jetzt: number, geschlecht: 'm' | 'w'): EvolutionsStand {
  const z = leererZustand(o.profilStart);
  const sortiert = [...new Map(saetze.map(s => [s.id, s])).values()].sort((a, b) => a.completedAt - b.completedAt);
  let rangJetzt: RangId = 'lauch', archetyp: ArchetypId = 'lauch', kand: ArchetypId = 'lauch', seit: number | null = null;
  const frei = new Set<ArchetypId>(['lauch']);
  const verlauf: EvolutionsStand['verlauf'] = [];
  const pruefe = (t: number) => {
    const r = regionWerte(ansichtZu(z, t, o), geschlecht);
    rangJetzt = rang(r.mittel, rangJetzt);
    const k = kandidat(r, rangJetzt);
    if (k !== kand) { kand = k; seit = t; }
    const istRang = (x: ArchetypId) => x === 'lauch' || x === 'adonis' || x === 'beast';
    if (k !== archetyp) {
      if (istRang(k) && istRang(archetyp)) archetyp = k;
      else if (seit !== null && t - seit >= ARCHETYP_HALTETAGE * TAG) archetyp = k;
    }
    if (istRang(archetyp) && archetyp !== rangJetzt) archetyp = rangJetzt;
    frei.add(rangJetzt); frei.add(archetyp);
    verlauf.push({ t, mittel: r.mittel, rang: rangJetzt, archetyp });
  };
  if (sortiert.length) {
    let tag = Math.floor(sortiert[0].completedAt / TAG);
    let i = 0;
    const ende = Math.floor(jetzt / TAG);
    while (tag <= ende) {
      const grenze = (tag + 1) * TAG;
      while (i < sortiert.length && sortiert[i].completedAt < grenze) satzAnwenden(z, sortiert[i++], o);
      pruefe(Math.min(grenze - 1, jetzt));
      tag++;
      if (verlauf.length > 4000) break;
    }
  } else pruefe(jetzt);
  return { rang: rangJetzt, archetyp, kandidat: kand, kandidatSeit: seit, freigeschaltet: [...frei], verlauf };
}
