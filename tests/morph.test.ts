// Prüft die Körperform: Muskelzuwachs bleibt sichtbar, auch wenn gleichzeitig Fett abgebaut wird.
import { describe, expect, test } from 'vitest';
import { entpacke } from '../src/avatar/daten';
import { Verformer } from '../src/avatar/morph';
import roh from '../public/modelle/koerper-m.json?raw';

const daten = entpacke(JSON.parse(roh));
const G = daten.gelenke, n = daten.koerper.punkte;
const START = { mu: 0.42, omega: 0.76 };

// Mittlerer Abstand der Oberarmpunkte von der Armachse (Schulter → Ellbogen), in der Armmitte
function oberarmRadius(P: Float32Array) {
  const a = G['l-shoulder'], b = G['l-elbow'], u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(u[0], u[1], u[2]);
  let s = 0, k = 0;
  for (let i = 0; i < n; i++) {
    const d = [P[3 * i] - a[0], P[3 * i + 1] - a[1], P[3 * i + 2] - a[2]];
    const t = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / (l * l);
    if (t < 0.45 || t > 0.65) continue;
    const r = Math.hypot(d[0] - u[0] * t, d[1] - u[1] * t, d[2] - u[2] * t);
    if (r < 0.08) { s += r; k++; }
  }
  return s / k;
}
// halbe Taillenbreite auf Nabelhöhe
function taille(P: Float32Array) {
  const y = G['pelvis'][1] + 0.12;
  let m = 0;
  for (let i = 0; i < n; i++) if (Math.abs(P[3 * i + 1] - y) < 0.01 && Math.abs(P[3 * i]) < 0.2) m = Math.max(m, Math.abs(P[3 * i]));
  return m;
}
const form = (mu: number, omega: number, bezug?: { mu: number; omega: number }) => {
  const v = new Verformer(daten.koerper);
  v.verforme(() => mu, omega, bezug);
  return v.ruhe.slice();
};

describe('Muskel und Fett getrennt', () => {
  test('ohne Fettänderung ist die getrennte Rechnung identisch', () => {
    const a = form(1.05, 0.76), b = form(1.05, 0.76, START);
    let max = 0;
    for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
    expect(max).toBeLessThan(1e-6);
  });

  test('Training mit Fettabbau: Oberarm dicker als am Start, Taille schmaler', () => {
    const start = form(START.mu, START.omega), nachher = form(1.05, 0.5, START);
    expect(oberarmRadius(nachher)).toBeGreaterThan(oberarmRadius(start) * 1.08);
    expect(taille(nachher)).toBeLessThan(taille(start) * 0.95);
  });

  test('ohne Trennung frisst der Fettabbau den Muskelzuwachs (der behobene Fehler)', () => {
    const start = form(START.mu, START.omega), alt = form(1.05, 0.5);
    expect(oberarmRadius(alt)).toBeLessThan(oberarmRadius(start) * 1.03);
  });
});
