// Prüft die Muskel-Engine gegen die Akzeptanzkriterien der Spezifikation.
import { describe, expect, test } from 'vitest';
import { ansichtZu, rekonstruiere, satzAnwenden, leererZustand, erhaltung, REGELN, type Optionen, type PerformedSet } from '../src/engine/modell';
import { einheitIndex, EINHEITEN } from '../src/engine/muskeln';
import { xpEreignisse, level, type Session } from '../src/engine/xp';
import { evolution } from '../src/engine/archetypen';

const TAG = 86_400_000, MIN = 60_000;
const T0 = Date.UTC(2026, 0, 5, 18);   // Montag
const opt = (modus: 'arcade' | 'realismus' = 'arcade', unterStart = false): Optionen => ({ modus, unterStart, profilStart: T0 - TAG });
let n = 0;
const satz = (exerciseId: string, t: number, extra: Partial<PerformedSet> = {}): PerformedSet =>
  ({ id: `s${++n}`, sessionId: extra.sessionId ?? `w${Math.floor(t / TAG)}`, exerciseId, reps: 10, weight: 12, rir: 1, side: 'B', completedAt: t, ...extra });
const E = (id: string, seite: 'L' | 'R' = 'L') => einheitIndex(id, seite);

describe('Satz → Muskeln', () => {
  test('Bizepscurl: Bizeps > Brachialis > Brachioradialis > Unterarmbeuger, keine Beine', () => {
    const z = leererZustand(T0 - TAG);
    const w = satzAnwenden(z, satz('bizepscurl', T0), opt());
    const reiz = (id: string) => w.find(x => x.einheit === E(id))?.reiz ?? 0;
    expect(reiz('bizeps')).toBeGreaterThan(reiz('brachialis'));
    expect(reiz('brachialis')).toBeGreaterThan(reiz('brachiorad'));
    expect(reiz('brachiorad')).toBeGreaterThan(reiz('ua_beuger'));
    expect(w.some(x => EINHEITEN[x.einheit - 1].id.startsWith('vast'))).toBe(false);
    expect(z[E('bizeps')].pump).toBeGreaterThan(0);
  });

  test('Hammer-Curls verteilen anders als klassische Curls', () => {
    const z = leererZustand(T0 - TAG);
    const w = satzAnwenden(z, satz('hammercurl', T0), opt());
    const reiz = (id: string) => w.find(x => x.einheit === E(id))!.reiz;
    expect(reiz('brachialis')).toBeGreaterThan(reiz('bizeps'));
    expect(reiz('brachiorad')).toBeGreaterThan(reiz('bizeps'));
  });

  test('Einseitig links: rechter Bizeps bleibt unverändert', () => {
    const z = leererZustand(T0 - TAG);
    satzAnwenden(z, satz('konzcurl', T0, { side: 'L' }), opt());
    expect(z[E('bizeps', 'L')].development).toBeGreaterThan(0);
    expect(z[E('bizeps', 'R')].development).toBe(0);
    expect(z[E('bizeps', 'R')].pump).toBe(0);
  });

  test('Fünf Sätze: jeder Satz wirkt sofort, der Grenznutzen sinkt', () => {
    const z = leererZustand(T0 - TAG), pumpe: number[] = [], zuwachs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const w = satzAnwenden(z, satz('bizepscurl', T0 + i * 3 * MIN), opt()).find(x => x.einheit === E('bizeps'))!;
      pumpe.push(w.pumpNachher - w.pumpVorher);
      zuwachs.push(w.entwicklungNachher - w.entwicklungVorher);
    }
    for (let i = 1; i < 5; i++) {
      expect(pumpe[i]).toBeGreaterThan(0);
      expect(zuwachs[i]).toBeGreaterThan(0);
      expect(zuwachs[i]).toBeLessThan(zuwachs[i - 1]);
    }
  });

  test('Unbegrenzt viele Sätze: Zuwachs je Einheit bleibt begrenzt', () => {
    const nach = (n: number) => {
      const z = leererZustand(T0 - TAG);
      for (let i = 0; i < n; i++) satzAnwenden(z, satz('bizepscurl', T0 + i * MIN), opt());
      return z[E('bizeps')].development;
    };
    // Eine Einheit kann nie mehr als die Wachstumsrate r bringen; 200 Sätze kaum mehr als 12
    expect(nach(200)).toBeLessThan(REGELN.arcade.r);
    expect(nach(200)).toBeLessThan(1.25 * nach(12));
  });
});

describe('Pump, Abbau, Muskelgedächtnis', () => {
  const training = (wochen: number, start = T0) => {
    const s: PerformedSet[] = [];
    for (let w = 0; w < wochen; w++) for (const d of [0, 3]) for (let k = 0; k < 3; k++) s.push(satz('bizepscurl', start + (w * 7 + d) * TAG + k * 3 * MIN));
    return s;
  };

  test('Pump fällt in Ruhe ab, Entwicklung bleibt', () => {
    const z = rekonstruiere(training(1), opt());
    const ende = T0 + 3 * TAG + 10 * MIN;
    const sofort = ansichtZu(z, ende, opt()), spaeter = ansichtZu(z, ende + 3 * 3_600_000, opt());
    expect(sofort.pump[E('bizeps')]).toBeGreaterThan(0.3);
    expect(spaeter.pump[E('bizeps')]).toBeLessThan(0.02);
    expect(spaeter.entwicklung[E('bizeps')]).toBeCloseTo(sofort.entwicklung[E('bizeps')], 6);
  });

  test('Inaktivität: 1 Woche kein Verlust, danach gradueller Rückgang; Höchststand bleibt', () => {
    for (const modus of ['arcade', 'realismus'] as const) {
      const s = training(8, T0), z = rekonstruiere(s, opt(modus));
      const letzte = s[s.length - 1].completedAt;
      const wert = (tage: number) => ansichtZu(z, letzte + tage * TAG, opt(modus)).entwicklung[E('bizeps')];
      const start = wert(0);
      expect(wert(7)).toBeCloseTo(start, 6);
      expect(wert(28)).toBeLessThan(start);
      expect(wert(56)).toBeLessThan(wert(28));
      expect(wert(84)).toBeLessThan(wert(56));
      expect(wert(84)).toBeGreaterThan(0);
      expect(ansichtZu(z, letzte + 84 * TAG, opt(modus)).peak[E('bizeps')]).toBeCloseTo(start, 6);
      expect(erhaltung(z[E('bizeps')], letzte + 84 * TAG, opt(modus)).status).toBe('abbau');
    }
  });

  test('Standard: nie unter den Startkörper; optional darunter', () => {
    const s = training(4), z = rekonstruiere(s, opt()), zU = rekonstruiere(s, opt('arcade', true));
    const spaet = s[s.length - 1].completedAt + 3 * 365 * TAG;
    expect(ansichtZu(z, spaet, opt()).entwicklung[E('bizeps')]).toBeGreaterThanOrEqual(0);
    expect(ansichtZu(zU, spaet, opt('arcade', true)).entwicklung[E('bizeps')]).toBeLessThan(0);
  });

  test('Muskelgedächtnis: Wiederaufbau bis zum alten Höchststand schneller als der Erstaufbau', () => {
    const wochenBis = (s: PerformedSet[], ziel: number, ab: number) => {
      for (let w = 1; w <= 52; w++) {
        const z = rekonstruiere(s.concat(training(w, ab)), opt());
        if (ansichtZu(z, ab + w * 7 * TAG, opt()).entwicklung[E('bizeps')] >= ziel) return w;
      }
      return 99;
    };
    const erst = training(6), z = rekonstruiere(erst, opt());
    const peak = z[E('bizeps')].peak;
    const erstWochen = wochenBis([], peak, T0);
    const pauseEnde = T0 + (6 * 7 + 120) * TAG;
    expect(ansichtZu(z, pauseEnde, opt()).entwicklung[E('bizeps')]).toBeLessThan(peak * 0.5);
    expect(wochenBis(erst, peak, pauseEnde)).toBeLessThan(erstWochen);
  });
});

describe('Determinismus und XP', () => {
  test('Reihenfolge und Duplikate ändern nichts', () => {
    const s = [satz('bankdruecken', T0), satz('rudern', T0 + 5 * MIN), satz('kniebeuge', T0 + 10 * MIN)];
    const a = rekonstruiere(s, opt()), b = rekonstruiere([s[2], s[0], s[1], s[0], s[2]], opt());
    expect(b.map(x => x.development)).toEqual(a.map(x => x.development));
  });

  test('XP: Duplikate zählen nicht, Sätze gedeckelt, Workout und Wochenziel einmal', () => {
    const sid = 'w1';
    const s = Array.from({ length: 40 }, (_, i) => satz('bankdruecken', T0 + i * MIN, { sessionId: sid }));
    const sessions: Session[] = [{ id: sid, planId: 'push', startedAt: T0, finishedAt: T0 + 50 * MIN, status: 'beendet' }];
    const ev = xpEreignisse([...s, ...s], sessions, [], 1);
    const satzXp = ev.filter(e => e.typ === 'satz').reduce((a, e) => a + e.punkte, 0);
    expect(satzXp).toBe(15 * 10 + 10 * 5);
    expect(ev.filter(e => e.typ === 'workout')).toHaveLength(1);
    expect(ev.filter(e => e.typ === 'wochenziel')).toHaveLength(1);
    expect(new Set(ev.map(e => e.schluessel)).size).toBe(ev.length);
  });

  test('Rekord erst ab dem zweiten Eintrag, Level steigt', () => {
    const s = [satz('bankdruecken', T0, { weight: 60 }), satz('bankdruecken', T0 + 2 * TAG, { weight: 65 })];
    const ev = xpEreignisse(s, [], [], 3);
    expect(ev.filter(e => e.typ === 'pr')).toHaveLength(1);
    expect(level(0).level).toBe(1);
    expect(level(100).level).toBe(2);
    expect(level(299).level).toBe(2);
  });
});

describe('Archetypen', () => {
  test('Unterarmtraining über mehrere Zyklen führt zu Popeye', () => {
    const s: PerformedSet[] = [];
    for (let w = 0; w < 10; w++) for (const d of [0, 2, 4]) for (const u of ['handgelenkcurl', 'reverse_curl', 'handgelenk_reverse', 'farmers_walk'])
      for (let k = 0; k < 3; k++) s.push(satz(u, T0 + (w * 7 + d) * TAG + k * 2 * MIN));
    const ev = evolution(s, opt(), T0 + 80 * TAG, 'm');
    expect(ev.archetyp).toBe('popeye');
  });

  test('Ohne Training bleibt der Startcharakter', () => {
    expect(evolution([], opt(), T0, 'm').archetyp).toBe('lauch');
  });
});
