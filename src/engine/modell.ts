// Muskel-Engine: Satz → Reiz → Pump und Entwicklung; Abbau und Muskelgedächtnis aus Zeitstempeln.
//
// Der Zustand entsteht deterministisch durch Abspielen aller gespeicherten Sätze. Zwischen zwei Ereignissen
// wird nur in geschlossener Form gerechnet (keine Hintergrundprozesse nötig).
// Alle Zahlen sind Spielregeln (Designvorschläge), keine medizinischen Messwerte.

import { ANZAHL_EINHEITEN, EINHEITEN, MUSKEL, amax, einheitIndex, muskelMasse, type Seite } from './muskeln';
import { UEBUNG } from './uebungen';

export type Modus = 'arcade' | 'realismus';
const TAG = 86_400_000, MINUTE = 60_000, STUNDE = 3_600_000;

export interface Regeln {
  name: string;
  r: number;              // Entwicklungszuwachs je voller Einheit am Start
  d0: number;             // Sättigung innerhalb einer Einheit: S = 1 − e^(−Dosis/d0)
  wocheD: number;         // Grenznutzen über die Woche: Faktor e^(−Wochenlast/wocheD)
  gnadeTage: number;      // Schonfrist ohne Abbau
  rampeTage: number;      // weicher Übergang in den Abbau
  halbwertTage: number;   // Halbwertszeit der Entwicklung danach
  kappa: number;          // Muskelgedächtnis: bis (1 + κ)-fach schnellerer Wiederaufbau
  pumpStaerke: number;
  pumpHalbwertMin: number;
  muMax: number;          // Muskulatur bei Entwicklung 1 (1 = MakeHuman-Max, darüber stilisiert)
  pumpMu: number;         // zusätzliche Muskulatur bei vollem Pump
}

export const REGELN: Record<Modus, Regeln> = {
  arcade: { name: 'Arcade', r: 0.05, d0: 4, wocheD: 18, gnadeTage: 10, rampeTage: 7, halbwertTage: 35, kappa: 3, pumpStaerke: 0.42, pumpHalbwertMin: 25, muMax: 1.3, pumpMu: 0.24 },
  realismus: { name: 'Realismus', r: 0.008, d0: 4, wocheD: 18, gnadeTage: 21, rampeTage: 7, halbwertTage: 84, kappa: 2, pumpStaerke: 0.34, pumpHalbwertMin: 25, muMax: 1.0, pumpMu: 0.16 },
};

// Schwelle der Einheits-Dosis, ab der ein Muskel als »trainiert« gilt (setzt die Schonfrist zurück)
export const ERHALT_SCHWELLE = 0.5;
// Einheit gilt als beendet nach dieser Pause
export const EINHEIT_LUECKE = 3 * STUNDE;

export interface PerformedSet {
  id: string;
  sessionId: string;
  exerciseId: string;
  reps: number;
  weight: number | null;
  rir: number;
  side: 'B' | Seite;      // B = beidseitig
  completedAt: number;    // ms seit Epoche
  pain?: boolean;
}

export interface MuskelZustand {
  development: number;        // Wert zum Zeitpunkt devAt
  devAt: number;
  peak: number;
  pump: number;
  pumpAt: number;
  lastStimulusAt: number;     // Referenz für die Schonfrist (Profilstart, solange nie trainiert)
  session: number;            // Dosis der laufenden Einheit
  sessionAt: number;
  last: number;               // gleitende Wochenlast
  lastAt: number;
}

export interface Optionen { modus: Modus; unterStart: boolean; profilStart: number }
export const UNTERGRENZE_UNTER_START = -0.12;

export function leererZustand(profilStart: number): MuskelZustand[] {
  return Array.from({ length: ANZAHL_EINHEITEN }, () => ({
    development: 0, devAt: profilStart, peak: 0, pump: 0, pumpAt: profilStart, lastStimulusAt: profilStart,
    session: 0, sessionAt: 0, last: 0, lastAt: profilStart,
  }));
}

// Satzqualität aus Nähe zum Muskelversagen (RIR) und Wiederholungsbereich. Das Gewicht geht bewusst nicht ein.
export function satzQualitaet(reps: number, rir: number): number {
  const qRir = rir <= 1 ? 1 : Math.max(0.3, 1 - 0.15 * (rir - 1));
  const qWdh = reps < 3 ? 0.5 : reps < 5 ? 0.75 : reps <= 30 ? 1 : 0.8;
  return qRir * qWdh;
}

// Weicher Abbau-Takt: 0 bis zur Schonfrist, dann quadratischer Anlauf über die Rampe, danach linear
function abbauZeit(tage: number, r: Regeln): number {
  const x = tage - r.gnadeTage;
  if (x <= 0) return 0;
  if (x < r.rampeTage) return x * x / (2 * r.rampeTage);
  return x - r.rampeTage / 2;
}

export function untergrenze(o: Optionen) { return o.unterStart ? UNTERGRENZE_UNTER_START : 0; }

// Entwicklung zum Zeitpunkt t (ohne Zustand zu ändern)
export function entwicklungZu(z: MuskelZustand, t: number, r: Regeln, o: Optionen): number {
  const boden = untergrenze(o);
  if (z.development <= boden) return z.development;
  const e = abbauZeit((t - z.lastStimulusAt) / TAG, r) - abbauZeit((z.devAt - z.lastStimulusAt) / TAG, r);
  if (e <= 0) return z.development;
  return boden + (z.development - boden) * Math.pow(2, -e / r.halbwertTage);
}
export function pumpZu(z: MuskelZustand, t: number, r: Regeln): number {
  return z.pump * Math.pow(2, -Math.max(0, t - z.pumpAt) / (r.pumpHalbwertMin * MINUTE));
}

// Dosis je Einheit für einen Satz
export function satzDosis(s: PerformedSet): Map<number, number> {
  const u = UEBUNG[s.exerciseId];
  const d = new Map<number, number>();
  if (!u) return d;
  const q = satzQualitaet(s.reps, s.rir);
  const seiten: Seite[] = s.side === 'B' ? ['L', 'R'] : [s.side];
  for (const m of u.muskeln) for (const seite of seiten) d.set(einheitIndex(m.muskel, seite), m.koeffizient * q);
  return d;
}

export interface SatzWirkung {
  einheit: number;
  reiz: number;            // Grenzreiz dieses Satzes (0..1)
  pumpVorher: number; pumpNachher: number;
  entwicklungVorher: number; entwicklungNachher: number;
}

// Wendet einen Satz an (verändert z) und liefert die Wirkung je Einheit
export function satzAnwenden(zustand: MuskelZustand[], s: PerformedSet, o: Optionen): SatzWirkung[] {
  const r = REGELN[o.modus];
  const t = s.completedAt;
  const wirkung: SatzWirkung[] = [];
  for (const [e, dosis] of satzDosis(s)) {
    const z = zustand[e];
    const id = EINHEITEN[e - 1].id;
    const dev = entwicklungZu(z, t, r, o);
    const pumpVorher = pumpZu(z, t, r);
    if (t - z.sessionAt > EINHEIT_LUECKE) z.session = 0;
    const last = z.last * Math.exp(-(t - z.lastAt) / (7 * TAG));
    const S = (x: number) => 1 - Math.exp(-x / r.d0);
    const reiz = S(z.session + dosis) - S(z.session);
    const satt = Math.max(0, 1 - dev / amax(id)) ** 2;
    const gedaechtnis = z.peak > dev && z.peak > 0 ? 1 + r.kappa * (z.peak - dev) / z.peak : 1;
    const zuwachs = r.r * reiz * Math.exp(-last / r.wocheD) * satt * gedaechtnis;
    z.development = dev + zuwachs;
    z.devAt = t;
    z.peak = Math.max(z.peak, z.development);
    z.session += dosis;
    z.sessionAt = t;
    z.last = last + dosis;
    z.lastAt = t;
    if (z.session >= ERHALT_SCHWELLE) z.lastStimulusAt = t;
    z.pump = Math.min(1, pumpVorher + r.pumpStaerke * Math.min(1, dosis) * (1 - pumpVorher));
    z.pumpAt = t;
    wirkung.push({ einheit: e, reiz, pumpVorher, pumpNachher: z.pump, entwicklungVorher: dev, entwicklungNachher: z.development });
  }
  return wirkung;
}

// Zustand aus der vollständigen Satzliste (deterministisch, unabhängig von Speicherreihenfolge)
export function rekonstruiere(saetze: PerformedSet[], o: Optionen): MuskelZustand[] {
  const z = leererZustand(o.profilStart);
  const sortiert = [...saetze].sort((a, b) => a.completedAt - b.completedAt || a.id.localeCompare(b.id));
  const gesehen = new Set<string>();
  for (const s of sortiert) {
    if (gesehen.has(s.id)) continue;      // doppelte Ereignisse wirken nur einmal
    gesehen.add(s.id);
    satzAnwenden(z, s, o);
  }
  return z;
}

// Momentaufnahme zum Zeitpunkt t
export interface Ansicht { entwicklung: Float32Array; pump: Float32Array; peak: Float32Array; lastStimulusAt: Float64Array; trainiert: Uint8Array }
export function ansichtZu(zustand: MuskelZustand[], t: number, o: Optionen): Ansicht {
  const r = REGELN[o.modus];
  const n = zustand.length;
  const a: Ansicht = { entwicklung: new Float32Array(n), pump: new Float32Array(n), peak: new Float32Array(n), lastStimulusAt: new Float64Array(n), trainiert: new Uint8Array(n) };
  for (let i = 1; i < n; i++) {
    const z = zustand[i];
    a.entwicklung[i] = entwicklungZu(z, t, r, o);
    a.pump[i] = pumpZu(z, t, r);
    a.peak[i] = z.peak;
    a.lastStimulusAt[i] = z.lastStimulusAt;
    a.trainiert[i] = z.peak > 0 ? 1 : 0;
  }
  return a;
}

// Status eines Muskels für die Anzeige
export type Erhaltung = 'untrainiert' | 'aktiv' | 'schonfrist' | 'abbau';
export function erhaltung(z: MuskelZustand, t: number, o: Optionen): { status: Erhaltung; tageSeitReiz: number; tageBisAbbau: number } {
  const r = REGELN[o.modus];
  const tage = (t - z.lastStimulusAt) / TAG;
  if (z.peak <= 0) return { status: 'untrainiert', tageSeitReiz: tage, tageBisAbbau: r.gnadeTage - tage };
  if (tage < 7) return { status: 'aktiv', tageSeitReiz: tage, tageBisAbbau: r.gnadeTage - tage };
  if (tage < r.gnadeTage) return { status: 'schonfrist', tageSeitReiz: tage, tageBisAbbau: r.gnadeTage - tage };
  return { status: 'abbau', tageSeitReiz: tage, tageBisAbbau: 0 };
}

// Muskulatur für die Darstellung: Start-μ plus Entwicklung plus Pump
export function muskulatur(entwicklung: number, pump: number, mu0: number, o: Optionen): number {
  const r = REGELN[o.modus];
  return mu0 + (r.muMax - mu0) * entwicklung + r.pumpMu * pump;
}

// Zusätzliche Muskelmasse gegenüber dem Start (grobe Modellannahme: Entwicklung 1 ≈ Verdopplung)
export function muskelZuwachsKg(ansicht: Ansicht, geschlecht: 'm' | 'w'): number {
  let kg = 0;
  for (const e of EINHEITEN) kg += muskelMasse(e.id, geschlecht) * Math.max(0, ansicht.entwicklung[e.index]) / (MUSKEL[e.id].amax ?? 1);
  return kg;
}

// Verlauf einzelner Einheiten über die Zeit (für Diagramme), gleichmäßig abgetastet
export function verlauf(saetze: PerformedSet[], o: Optionen, einheiten: number[], jetzt: number, schritte = 80): { t: number; werte: number[] }[] {
  const r = REGELN[o.modus];
  const sortiert = [...new Map(saetze.map(s => [s.id, s])).values()].sort((a, b) => a.completedAt - b.completedAt);
  if (!sortiert.length) return [];
  const z = leererZustand(o.profilStart);
  const t0 = sortiert[0].completedAt - TAG, t1 = Math.max(jetzt, t0 + TAG);
  const out: { t: number; werte: number[] }[] = [];
  let i = 0;
  for (let k = 0; k <= schritte; k++) {
    const t = t0 + (t1 - t0) * k / schritte;
    while (i < sortiert.length && sortiert[i].completedAt <= t) satzAnwenden(z, sortiert[i++], o);
    out.push({ t, werte: einheiten.map(e => entwicklungZu(z[e], t, r, o)) });
  }
  return out;
}
