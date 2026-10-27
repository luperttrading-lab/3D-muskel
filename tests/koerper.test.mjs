// Prüft den prozeduralen Körper: geschlossenes Netz, Muskelzuordnung, Wachstum und Seitentrennung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { koerperBauen, vernetzen } from '../js/koerper.js';
import { MUSKELN, einheitIndex } from '../js/modell.js';

const netz = (param) => vernetzen(koerperBauen(param), { h: 0.01 });

function kantenGezaehlt(idx) {
  const k = new Map();
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = idx[t + e], b = idx[t + (e + 1) % 3];
    const s = a < b ? a * 1e7 + b : b * 1e7 + a;
    k.set(s, (k.get(s) ?? 0) + 1);
  }
  return k;
}

for (const g of ['m', 'w']) {
  test(`Startkörper ${g}: geschlossenes Netz mit Muskelzuordnung`, () => {
    const n = netz({ geschlecht: g, ff: 1 });
    const offen = [...kantenGezaehlt(n.idx).values()].filter(c => c === 1).length;
    assert.equal(offen, 0, 'offene Kanten');
    const sichtbar = MUSKELN.filter(m => m.sichtbar).length * 2;
    assert.ok(new Set(n.mid).size - 1 >= sichtbar * 0.9, `zugeordnete Einheiten: ${new Set(n.mid).size - 1} von ${sichtbar}`);
    for (const v of n.pos) assert.ok(Number.isFinite(v));
  });
}

test('Größe passt zum Durchschnitt (Mann ≈ 1,79 m, Frau ≈ 1,66 m)', () => {
  for (const [g, soll] of [['m', 1.79], ['w', 1.66]]) {
    const n = netz({ geschlecht: g, ff: 1 });
    let max = 0;
    for (let i = 1; i < n.pos.length; i += 3) max = Math.max(max, n.pos[i]);
    assert.ok(Math.abs(max - soll) < 0.04, `${g}: ${max.toFixed(3)} m`);
  }
});

test('Nur der rechte Bizeps wächst: rechter Oberarm wird dicker, linker bleibt gleich', () => {
  const breite = (n, seite) => {
    // Ausdehnung der Bizeps-Punkte nach vorn (z) – rechte Seite liegt bei x < 0
    const id = einheitIndex('bizeps', seite);
    let max = -1;
    for (let i = 0; i < n.mid.length; i++) if (n.mid[i] === id) max = Math.max(max, n.pos[3 * i + 2]);
    return max;
  };
  const a = netz({ geschlecht: 'm', ff: 0.5 });
  const b = netz({ geschlecht: 'm', ff: 0.5, faktoren: { 'bizeps:R': 1.6 } });
  assert.ok(breite(b, 'R') - breite(a, 'R') > 0.003, 'rechts dicker');
  assert.ok(Math.abs(breite(b, 'L') - breite(a, 'L')) < 0.002, 'links unverändert');
});

test('Weniger Körperfett macht den Bauch flacher', () => {
  const vorn = n => { let max = -1; for (let i = 0; i < n.pos.length; i += 3) if (Math.abs(n.pos[i + 1] - 1.07) < 0.02 && Math.abs(n.pos[i]) < 0.05) max = Math.max(max, n.pos[i + 2]); return max; };
  assert.ok(vorn(netz({ geschlecht: 'm', ff: 1 })) - vorn(netz({ geschlecht: 'm', ff: 0.1 })) > 0.03);
});
