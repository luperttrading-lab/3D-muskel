// Prüft das Muskelmodell: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  neuerZustand, einheitEintragen, tageVergehen, planSimulieren, vorlageEintraege,
  koerperwerte, kfaSetzen, fettFaktor, MUSKELN, UEBUNGEN, MUSKEL, VORLAGEN, START,
} from '../js/modell.js';

const curls = (uebung, n = 3, seite = 'B') => [{ uebung, seite, saetze: Array.from({ length: n }, () => ({ kg: 12, wdh: 10, rir: 1 })) }];

test('Start ist der untrainierte Durchschnittskörper', () => {
  for (const g of ['m', 'w']) {
    const z = neuerZustand(g);
    const k = koerperwerte(z);
    assert.ok(Math.abs(k.gewicht - START[g].gewicht) < 1e-9);
    assert.ok(Math.abs(k.kfa - START[g].kfa) < 1e-9);
    assert.equal(fettFaktor(z), 1);
    for (const m of MUSKELN) assert.equal(z.muskeln[m.id].L.a, 0);
  }
});

test('Alle Übungen und Vorlagen verweisen auf bekannte Muskeln', () => {
  for (const u of UEBUNGEN) for (const id of Object.keys(u.w)) assert.ok(MUSKEL[id], `${u.id} → ${id}`);
  for (const v of VORLAGEN) for (const [u] of v.items) assert.ok(UEBUNGEN.find(x => x.id === u), `${v.id} → ${u}`);
});

test('Bizepscurls: Reihenfolge Bizeps > Brachialis > Brachioradialis > Unterarmbeuger', () => {
  const z = neuerZustand('m');
  const d = einheitEintragen(z, curls('bizepscurl'));
  assert.ok(d.bizeps.L > d.brachialis.L && d.brachialis.L > d.brachiorad.L && d.brachiorad.L > d.ua_beuger.L);
  assert.equal(d.trizeps, undefined);
});

test('Hammer-Curls gewichten Brachialis vor Bizeps', () => {
  const z = neuerZustand('m');
  const d = einheitEintragen(z, curls('hammercurl'));
  assert.ok(d.brachialis.L > d.bizeps.L);
});

test('Sechs Monate nur rechts: rechter Bizeps wächst, linker bleibt am Start', () => {
  const z = neuerZustand('m');
  planSimulieren(z, curls('konzcurl', 4, 'R'), 3, 26);
  assert.ok(z.muskeln.bizeps.R.a > 0.1, `R = ${z.muskeln.bizeps.R.a}`);
  assert.equal(z.muskeln.bizeps.L.a, 0);
});

test('Nie unter den Startkörper: lange Pause endet bei a ≥ 0', () => {
  for (const modus of ['realismus', 'arcade']) {
    const z = neuerZustand('m'); z.modus = modus;
    planSimulieren(z, vorlageEintraege('ganzkoerper'), 3, 12);
    tageVergehen(z, 3 * 365);
    for (const m of MUSKELN) for (const s of ['L', 'R']) assert.ok(z.muskeln[m.id][s].a >= 0);
    assert.ok(z.muskeln.bizeps.L.a < 0.01);
  }
});

test('Eine Woche Urlaub kostet in beiden Modi höchstens 2 % des Zuwachses', () => {
  for (const modus of ['realismus', 'arcade']) {
    const z = neuerZustand('m'); z.modus = modus;
    planSimulieren(z, vorlageEintraege('ganzkoerper'), 2, 12);
    const vorher = z.muskeln.bizeps.L.a;
    tageVergehen(z, 7);
    assert.ok(z.muskeln.bizeps.L.a / vorher > 0.98, `${modus}: ${z.muskeln.bizeps.L.a / vorher}`);
  }
});

test('Muskelgedächtnis: Wiederaufbau geht schneller als der erste Aufbau', () => {
  const z = neuerZustand('m');
  let wochen1 = 0;
  while (z.muskeln.bizeps.L.a < 0.08) { planSimulieren(z, vorlageEintraege('ganzkoerper'), 2, 1); wochen1++; }
  tageVergehen(z, 7 * 24);
  const ziel = z.muskeln.bizeps.L.peak;
  let wochen2 = 0;
  while (z.muskeln.bizeps.L.a < ziel) { planSimulieren(z, vorlageEintraege('ganzkoerper'), 2, 1); wochen2++; }
  assert.ok(wochen2 < wochen1, `erster Aufbau ${wochen1} Wo., Wiederaufbau ${wochen2} Wo.`);
});

test('Gewicht = Magermasse + Fett, Körperfett lässt sich setzen', () => {
  const z = neuerZustand('w');
  planSimulieren(z, vorlageEintraege('unterkoerper'), 3, 8);
  kfaSetzen(z, 0.25);
  const k = koerperwerte(z);
  assert.ok(Math.abs(k.gewicht - (k.mager + k.fettKg)) < 1e-9);
  assert.ok(Math.abs(k.kfa - 0.25) < 1e-9);
  assert.ok(k.muskelZuwachsKg > 0);
});

test('Defizit senkt das Körperfett, aber nicht unter die Untergrenze', () => {
  const z = neuerZustand('m'); z.ernaehrung = 'defizit';
  tageVergehen(z, 7 * 200);
  assert.ok(Math.abs(koerperwerte(z).kfa - START.m.kfaMin) < 1e-6);
});
