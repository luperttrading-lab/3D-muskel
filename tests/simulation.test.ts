// Prüft die Körper-Vorschau: wächst mit dem Training, sättigt, speichert nichts, Fett nur als Überblendung.
import { describe, expect, test } from 'vitest';
import { simFett, simFettZiel, simSaetze, simuliere } from '../src/engine/simulation';
import { einheitIndex } from '../src/engine/muskeln';
import type { Optionen, PerformedSet } from '../src/engine/modell';

const TAG = 86_400_000;
const T0 = Date.UTC(2026, 0, 5, 9);
const opt = (modus: 'arcade' | 'realismus' = 'arcade'): Optionen => ({ modus, unterStart: false, profilStart: T0 - TAG });

describe('Körper-Vorschau', () => {
  test('Sätze liegen nach »jetzt«, Anzahl passt zu Plan und Häufigkeit', () => {
    const s = simSaetze({ programm: 'ganzkoerper', tageProWoche: 3, wochen: 4 }, T0);
    expect(s.every(x => x.completedAt > T0)).toBe(true);
    expect(s.length).toBe(4 * 3 * 17);   // Ganzkörper: 3+3+3+2+2+2+2 Sätze
    expect(new Set(s.map(x => x.id)).size).toBe(s.length);
  });

  test('Entwicklung wächst Woche für Woche und sättigt', () => {
    const w = simuliere([], opt(), T0, { programm: 'ganzkoerper', tageProWoche: 3, wochen: 52 }, 'm');
    expect(w).toHaveLength(53);
    expect(w[0].mittel).toBe(0);
    for (let i = 1; i < w.length; i++) expect(w[i].mittel).toBeGreaterThanOrEqual(w[i - 1].mittel - 1e-9);
    const frueh = w[4].mittel - w[0].mittel, spaet = w[52].mittel - w[48].mittel;
    expect(frueh).toBeGreaterThan(spaet);                 // abnehmender Zuwachs
    expect(w[52].zuwachsKg).toBeGreaterThan(w[12].zuwachsKg);
  });

  test('Realismus wächst langsamer als Arcade', () => {
    const e = { programm: 'ganzkoerper', tageProWoche: 3, wochen: 12 };
    const a = simuliere([], opt('arcade'), T0, e, 'm'), r = simuliere([], opt('realismus'), T0, e, 'm');
    expect(r[12].mittel).toBeLessThan(a[12].mittel);
  });

  test('Plan bestimmt, welche Muskeln wachsen; echte Sätze bleiben unverändert', () => {
    const echte: PerformedSet[] = [{ id: 'x', sessionId: 'a', exerciseId: 'bizepscurl', reps: 10, weight: 10, rir: 1, side: 'L', completedAt: T0 - 2 * TAG }];
    const kopie = JSON.stringify(echte);
    const w = simuliere(echte, opt(), T0, { programm: 'ppl', tageProWoche: 3, wochen: 8 }, 'm');
    expect(JSON.stringify(echte)).toBe(kopie);
    expect(w[0].ansicht.entwicklung[einheitIndex('bizeps', 'L')]).toBeGreaterThan(w[0].ansicht.entwicklung[einheitIndex('bizeps', 'R')]);
    expect(w[8].ansicht.entwicklung[einheitIndex('vast_lat', 'L')]).toBeGreaterThan(0);
    expect(w[8].ansicht.pump[einheitIndex('bizeps', 'L')]).toBe(0);
  });

  test('Fettziele gehen nie unter die athletische Form (sonst schrumpft der Körperbau)', () => {
    expect(simFettZiel(0.76, 'gleich')).toBeCloseTo(0.76);
    expect(simFettZiel(0.76, 'weniger')).toBeCloseTo(0.63);
    expect(simFettZiel(0.76, 'definiert')).toBeCloseTo(0.5);
    expect(simFettZiel(0.45, 'definiert')).toBeCloseTo(0.45);   // schon schlank: nicht weiter abmagern
  });

  test('Fett blendet linear zum Ziel und bleibt dort', () => {
    expect(simFett(0.76, 0.3, 0, 12)).toBeCloseTo(0.76);
    expect(simFett(0.76, 0.3, 6, 12)).toBeCloseTo(0.53);
    expect(simFett(0.76, 0.3, 12, 12)).toBeCloseTo(0.3);
  });
});
