// Vorschau: wie sich der Körper bei regelmäßigem Training entwickeln würde. Spielt erfundene Sätze nach einem Plan
// durch dieselbe Engine wie echte Sätze – ausgehend vom aktuellen Stand. Nichts davon wird gespeichert.
//
// Körperfett hat kein eigenes Modell: Die Vorschau blendet es linear vom Startwert zum gewählten Zielwert über.
// Das ist eine Annahme zur Veranschaulichung, keine Vorhersage.

import { ansichtZu, muskelZuwachsKg, rekonstruiere, satzAnwenden, type Ansicht, type Optionen, type PerformedSet } from './modell';
import { regionWerte, rang, type RangId } from './archetypen';
import { PLAN } from './uebungen';

const TAG = 86_400_000, MINUTE = 60_000;

// Trainingsprogramm der Vorschau: ein Plan an jedem Trainingstag oder mehrere im Wechsel
export interface SimProgramm { id: string; name: string; plaene: string[] }
export const SIM_PROGRAMME: SimProgramm[] = [
  { id: 'ganzkoerper', name: 'Ganzkörper', plaene: ['ganzkoerper'] },
  { id: 'ppl', name: 'Push · Pull · Legs', plaene: ['push', 'pull', 'beine'] },
  { id: 'ok_uk', name: 'Oberkörper · Unterkörper', plaene: ['oberkoerper', 'unterkoerper'] },
];

// Wochentage (0 = Montag) je Trainingshäufigkeit, mit Ruhetagen dazwischen
const TAGE: Record<number, number[]> = { 1: [2], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };

export interface SimEinstellung { programm: string; tageProWoche: number; wochen: number; wiederholungen?: number; rir?: number }
export interface SimSchritt { woche: number; ansicht: Ansicht; mittel: number; rang: RangId; zuwachsKg: number }

// Synthetische Sätze für die Wochen 1..wochen ab »jetzt« (je Übung die Satzzahl des Plans, 10 Wdh., 2 RIR)
export function simSaetze(e: SimEinstellung, jetzt: number): PerformedSet[] {
  const prog = SIM_PROGRAMME.find(p => p.id === e.programm) ?? SIM_PROGRAMME[0];
  const tage = TAGE[Math.min(6, Math.max(1, Math.round(e.tageProWoche)))];
  const saetze: PerformedSet[] = [];
  let einheit = 0;
  for (let w = 0; w < e.wochen; w++) {
    for (const tag of tage) {
      const plan = PLAN[prog.plaene[einheit % prog.plaene.length]];
      const beginn = jetzt + (w * 7 + tag) * TAG + 18 * 60 * MINUTE;   // abends, damit der erste Tag nach »jetzt« liegt
      let k = 0;
      for (const [uebung, anzahl] of plan.uebungen) {
        for (let s = 0; s < anzahl; s++, k++) {
          saetze.push({ id: `sim-${einheit}-${k}`, sessionId: `sim-${einheit}`, exerciseId: uebung, reps: e.wiederholungen ?? 10, weight: null,
            rir: e.rir ?? 2, side: 'B', completedAt: beginn + k * 3 * MINUTE });
        }
      }
      einheit++;
    }
  }
  return saetze;
}

// Zustand am Ende jeder Woche (Woche 0 = jetzt). Pump bleibt außen vor: die Vorschau zeigt den gesetzten Stand.
export function simuliere(echte: PerformedSet[], o: Optionen, jetzt: number, e: SimEinstellung, geschlecht: 'm' | 'w'): SimSchritt[] {
  const z = rekonstruiere(echte, o);
  const kuenftig = simSaetze(e, jetzt);
  const schritte: SimSchritt[] = [];
  let i = 0, bisher: RangId = 'lauch';
  for (let w = 0; w <= e.wochen; w++) {
    const t = jetzt + w * 7 * TAG;
    while (i < kuenftig.length && kuenftig[i].completedAt <= t) satzAnwenden(z, kuenftig[i++], o);
    const ansicht = ansichtZu(z, t, o);
    ansicht.pump.fill(0);
    const mittel = regionWerte(ansicht, geschlecht).mittel;
    bisher = rang(mittel, bisher);
    schritte.push({ woche: w, ansicht, mittel, rang: bisher, zuwachsKg: muskelZuwachsKg(ansicht, geschlecht) });
  }
  return schritte;
}

// Körperfett-Ziel der Vorschau. Die Fett-Achse ω steuert MakeHumans »Gewicht«: unter 0,5 schrumpft der ganze Körperbau
// samt Muskeln (dünn statt definiert). Die athletische Form liegt bei mittlerem Gewicht (0,5) und hoher Muskulatur –
// »definiert« geht deshalb bis 0,5 und nicht darunter.
export type FettZiel = 'gleich' | 'weniger' | 'definiert';
export const OMEGA_ATHLETISCH = 0.5;
export function simFettZiel(start: number, ziel: FettZiel): number {
  const boden = Math.min(start, OMEGA_ATHLETISCH);
  return ziel === 'gleich' ? start : ziel === 'weniger' ? Math.max(boden, start - (start - boden) / 2) : boden;
}

// Körperfett der Vorschau in Woche w: linear vom Start zum Ziel über den ganzen Zeitraum
export function simFett(start: number, ziel: number, woche: number, wochen: number): number {
  return start + (ziel - start) * Math.min(1, woche / Math.max(1, wochen));
}
