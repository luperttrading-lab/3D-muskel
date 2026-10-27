// XP aus den gespeicherten Daten ableiten. Jedes Ereignis hat einen eindeutigen Schlüssel (Typ + Quelle):
// doppelt gespeicherte Sätze oder erneutes Abspielen erzeugen keine doppelten Punkte.
// Gedeckelt: keine endlosen XP durch zusätzliche Sätze, keine Streak-Strafen, Ruhetage zählen.

import { satzDosis, type PerformedSet } from './modell';
import { EINHEITEN } from './muskeln';

export type XpTyp = 'satz' | 'workout' | 'wochenziel' | 'pr' | 'balance' | 'ruhetag';
export interface XpEreignis { schluessel: string; typ: XpTyp; quelle: string; punkte: number; zeit: number; text: string }
export interface Session { id: string; planId: string; startedAt: number; finishedAt?: number; status: 'aktiv' | 'beendet' | 'abgebrochen' }
export interface Ruhetag { datum: string; markiertAm: number }

export const XP_WERTE = { satz: 10, satzReduziert: 5, workout: 100, wochenziel: 150, pr: 40, balance: 30, ruhetag: 25 };
const VOLLE_SAETZE = 15, REDUZIERTE_SAETZE = 10;
const MIN_SAETZE_WORKOUT = 3;

export function isoWoche(t: number): string {
  const d = new Date(t);
  const tag = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const wt = tag.getUTCDay() || 7;
  tag.setUTCDate(tag.getUTCDate() + 4 - wt);
  const jahrStart = new Date(Date.UTC(tag.getUTCFullYear(), 0, 1));
  const woche = Math.ceil(((+tag - +jahrStart) / 86_400_000 + 1) / 7);
  return `${tag.getUTCFullYear()}-W${String(woche).padStart(2, '0')}`;
}
export function datum(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const e1rm = (kg: number, wdh: number) => kg * (1 + wdh / 30);   // Epley-Schätzung

const PUSH = new Set(['brust_o', 'brust_u', 'delt_v', 'trizeps']);
const PULL = new Set(['lat', 'trapez_m', 'delt_h', 'bizeps']);

export function xpEreignisse(saetze: PerformedSet[], sessions: Session[], ruhetage: Ruhetag[], trainingstage: number): XpEreignis[] {
  const ev = new Map<string, XpEreignis>();
  const add = (typ: XpTyp, quelle: string, punkte: number, zeit: number, text: string) => {
    const schluessel = `${typ}:${quelle}`;
    if (!ev.has(schluessel) && punkte > 0) ev.set(schluessel, { schluessel, typ, quelle, punkte, zeit, text });
  };
  const eindeutig = [...new Map(saetze.map(s => [s.id, s])).values()].sort((a, b) => a.completedAt - b.completedAt);

  // Sätze: je Einheit die ersten 15 voll, die nächsten 10 halb, danach nichts mehr
  const jeSession = new Map<string, PerformedSet[]>();
  for (const s of eindeutig) (jeSession.get(s.sessionId) ?? jeSession.set(s.sessionId, []).get(s.sessionId)!).push(s);
  for (const liste of jeSession.values()) liste.forEach((s, k) => {
    const p = k < VOLLE_SAETZE ? XP_WERTE.satz : k < VOLLE_SAETZE + REDUZIERTE_SAETZE ? XP_WERTE.satzReduziert : 0;
    add('satz', s.id, p, s.completedAt, 'Satz abgeschlossen');
  });

  // Workouts und Wochenziel
  const gueltig = sessions.filter(se => se.status === 'beendet' && (jeSession.get(se.id)?.length ?? 0) >= MIN_SAETZE_WORKOUT)
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  const jeWoche = new Map<string, number>();
  for (const se of gueltig) {
    const t = se.finishedAt ?? se.startedAt;
    add('workout', se.id, XP_WERTE.workout, t, 'Workout abgeschlossen');
    const w = isoWoche(t), n = (jeWoche.get(w) ?? 0) + 1;
    jeWoche.set(w, n);
    if (n === Math.max(1, trainingstage)) add('wochenziel', w, XP_WERTE.wochenziel, t, `Wochenziel erreicht (${n} Workouts)`);
  }

  // Persönliche Rekorde (geschätztes 1RM), höchstens einer je Übung und Tag; der erste Eintrag ist kein Rekord
  const bestwert = new Map<string, number>();
  for (const s of eindeutig) {
    if (!s.weight || s.weight <= 0) continue;
    const wert = e1rm(s.weight, s.reps), alt = bestwert.get(s.exerciseId);
    if (alt !== undefined && wert > alt * 1.001) add('pr', `${s.exerciseId}:${datum(s.completedAt)}`, XP_WERTE.pr, s.completedAt, 'Neuer Rekord');
    if (alt === undefined || wert > alt) bestwert.set(s.exerciseId, wert);
  }

  // Balance je Woche: Drücken/Ziehen und links/rechts ausgewogen, mindestens zwei Workouts
  const wochen = new Map<string, { push: number; pull: number; l: number; r: number; t: number }>();
  for (const s of eindeutig) {
    const w = isoWoche(s.completedAt);
    const b = wochen.get(w) ?? { push: 0, pull: 0, l: 0, r: 0, t: 0 };
    for (const [e, d] of satzDosis(s)) {
      const einheit = EINHEITEN[e - 1];
      if (PUSH.has(einheit.id)) b.push += d;
      if (PULL.has(einheit.id)) b.pull += d;
      if (einheit.seite === 'L') b.l += d; else b.r += d;
    }
    b.t = s.completedAt;
    wochen.set(w, b);
  }
  for (const [w, b] of wochen) {
    if ((jeWoche.get(w) ?? 0) < 2) continue;
    const verhaeltnis = b.pull > 0 ? b.push / b.pull : Infinity;
    const seiten = Math.abs(b.l - b.r) / Math.max(1e-9, (b.l + b.r) / 2);
    if (verhaeltnis >= 0.6 && verhaeltnis <= 1.67 && seiten < 0.15) add('balance', w, XP_WERTE.balance, b.t, 'Ausgewogene Trainingswoche');
  }

  // Geplante Ruhetage (nicht an Trainingstagen, höchstens 7 − Trainingstage je Woche)
  const trainingsTage = new Set(eindeutig.map(s => datum(s.completedAt)));
  const ruheJeWoche = new Map<string, number>();
  for (const r of [...ruhetage].sort((a, b) => a.markiertAm - b.markiertAm)) {
    if (trainingsTage.has(r.datum)) continue;
    const w = isoWoche(new Date(r.datum + 'T12:00:00').getTime()), n = ruheJeWoche.get(w) ?? 0;
    if (n >= Math.max(0, 7 - trainingstage)) continue;
    ruheJeWoche.set(w, n + 1);
    add('ruhetag', r.datum, XP_WERTE.ruhetag, r.markiertAm, 'Ruhetag eingehalten');
  }
  return [...ev.values()].sort((a, b) => a.zeit - b.zeit);
}

// Level: Level L braucht insgesamt 50 · L · (L − 1) XP
export function level(xp: number) {
  let l = 1;
  while (50 * (l + 1) * l <= xp) l++;
  const basis = 50 * l * (l - 1), naechste = 50 * (l + 1) * l;
  return { level: l, xpImLevel: xp - basis, xpFuerNaechstes: naechste - basis };
}

// XP, die der nächste Satz in dieser Einheit bringt (für die Vorschau in der Oberfläche)
export function xpFuerNaechstenSatz(saetzeInSession: number): number {
  return saetzeInSession < VOLLE_SAETZE ? XP_WERTE.satz : saetzeInSession < VOLLE_SAETZE + REDUZIERTE_SAETZE ? XP_WERTE.satzReduziert : 0;
}
