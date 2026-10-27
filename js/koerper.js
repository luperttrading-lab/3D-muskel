// Prozeduraler 3D-Körper von MuscleAtlas 3D.
//
// Der Körper ist ein Signed-Distance-Field aus drei Schichten:
//   1. Grundkörper (Skelett, tiefes Gewebe)        – weich verschmolzen
//   2. Muskeln (ein Ellipsoid je Muskelteil/Seite) – Größe aus dem Muskelmodell
//   3. Fettdepots + gleichmäßige Fettschicht       – Größe aus dem Körperfett
// Definition entsteht geometrisch: Der Glättungsradius, mit dem Muskeln verschmolzen werden,
// wächst mit dem Körperfett. Viel Fett füllt die Rillen zwischen den Muskeln, wenig Fett lässt sie stehen.
// Vernetzt wird mit Surface Nets auf einem dünn besetzten Gitter.
//
// Koordinaten in Metern: y nach oben, z nach vorn (Blickrichtung des Avatars), x > 0 = linke Körperseite.

import { einheitIndex } from './modell.js';

const INF = 1e9;
const ART = { rumpf: 0, arm: 1, haar: 2 };   // Kleidung und Haaransatz bestimmt der Shader aus der Lage

// ---------- Vektorhilfen ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lin = (...terms) => { const r = [0, 0, 0]; for (let i = 0; i < terms.length; i += 2) { r[0] += terms[i][0] * terms[i + 1]; r[1] += terms[i][1] * terms[i + 1]; r[2] += terms[i][2] * terms[i + 1]; } return r; };

function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const d = a - b, h = k - (d < 0 ? -d : d);
  if (h <= 0) return a < b ? a : b;
  const hh = h / k;
  return (a < b ? a : b) - hh * hh * k * 0.25;
}

// ---------- Primitive ----------
// Ellipsoid: Mittelpunkt c, Hauptachse u, Außenrichtung o (wird orthogonalisiert), Radien ru (entlang u), ro (entlang o), rs (seitlich)
function ell(c, u, o, ru, ro, rs) {
  u = norm(u); o = norm(sub(o, mul(u, dot(u, o)))); const s = cross(u, o);
  const ex = Math.hypot(ru * u[0], ro * o[0], rs * s[0]);
  const ey = Math.hypot(ru * u[1], ro * o[1], rs * s[1]);
  const ez = Math.hypot(ru * u[2], ro * o[2], rs * s[2]);
  return {
    t: 0, cx: c[0], cy: c[1], cz: c[2],
    ux: u[0], uy: u[1], uz: u[2], ox: o[0], oy: o[1], oz: o[2], sx: s[0], sy: s[1], sz: s[2],
    ru, ro, rs, minx: c[0] - ex, maxx: c[0] + ex, miny: c[1] - ey, maxy: c[1] + ey, minz: c[2] - ez, maxz: c[2] + ez,
  };
}
// Eingebettetes Ellipsoid für flache Muskeln: gleicher höchster Punkt, aber dicker und tiefer im Körper –
// so tritt nur eine sanfte Kuppe aus statt einer scharfkantigen Platte.
function ein(c, u, o, ru, ro, rs, e) {
  u = norm(u); o = norm(sub(o, mul(u, dot(u, o))));
  return ell(sub(c, mul(o, e)), u, o, ru * 1.08, ro + e, rs * 1.12);
}
// Achsparalleles Ellipsoid
const ella = (c, rx, ry, rz) => ell(c, [1, 0, 0], [0, 1, 0], rx, ry, rz);

// Abgerundeter Kegel zwischen a und b mit Radien r1, r2
function kegel(a, b, r1, r2) {
  const ba = sub(b, a), l2 = dot(ba, ba), rr = r1 - r2;
  return {
    t: 1, ax: a[0], ay: a[1], az: a[2], bax: ba[0], bay: ba[1], baz: ba[2], l2, rr, a2: l2 - rr * rr, il2: 1 / l2, r1, r2,
    minx: Math.min(a[0] - r1, b[0] - r2), maxx: Math.max(a[0] + r1, b[0] + r2),
    miny: Math.min(a[1] - r1, b[1] - r2), maxy: Math.max(a[1] + r1, b[1] + r2),
    minz: Math.min(a[2] - r1, b[2] - r2), maxz: Math.max(a[2] + r1, b[2] + r2),
  };
}

function sd(q, x, y, z) {
  if (q.t === 0) {
    const px = x - q.cx, py = y - q.cy, pz = z - q.cz;
    const lu = (px * q.ux + py * q.uy + pz * q.uz) / q.ru;
    const lo = (px * q.ox + py * q.oy + pz * q.oz) / q.ro;
    const ls = (px * q.sx + py * q.sy + pz * q.sz) / q.rs;
    const k0 = Math.sqrt(lu * lu + lo * lo + ls * ls);
    const k1 = Math.sqrt((lu / q.ru) ** 2 + (lo / q.ro) ** 2 + (ls / q.rs) ** 2);
    if (k1 < 1e-12) return -Math.min(q.ru, q.ro, q.rs);
    return k0 * (k0 - 1) / k1;
  }
  // Round cone (Inigo Quilez)
  const pax = x - q.ax, pay = y - q.ay, paz = z - q.az;
  const yy = pax * q.bax + pay * q.bay + paz * q.baz;
  const zz = yy - q.l2;
  const qx = pax * q.l2 - q.bax * yy, qy = pay * q.l2 - q.bay * yy, qz = paz * q.l2 - q.baz * yy;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yy * yy * q.l2, z2 = zz * zz * q.l2;
  const k = Math.sign(q.rr) * q.rr * q.rr * x2;
  if (Math.sign(zz) * q.a2 * z2 > k) return Math.sqrt(x2 + z2) * q.il2 - q.r2;
  if (Math.sign(yy) * q.a2 * y2 < k) return Math.sqrt(x2 + y2) * q.il2 - q.r1;
  return (Math.sqrt(x2 * q.a2 * q.il2) + yy * q.rr) * q.il2 - q.r1;
}

// Spiegelt ein Primitiv an der Mittelebene (x → −x)
function spiegeln(q) {
  const r = { ...q };
  if (q.t === 0) { r.cx = -q.cx; r.ux = -q.ux; r.ox = -q.ox; r.sx = -q.sx; }
  else { r.ax = -q.ax; r.bax = -q.bax; }
  r.minx = -q.maxx; r.maxx = -q.minx;
  return r;
}

// ---------- Körperbau ----------
// param: { geschlecht: 'm'|'w', faktoren: {'bizeps:L': Volumenfaktor, …} (fehlend = 1 = Start), ff: Fettfaktor (1 = Startkörper) }
export function koerperBauen(param) {
  const faktor = param.faktor ?? ((id, seite) => param.faktoren?.[id + ':' + seite] ?? 1);
  const w = param.geschlecht === 'w';
  const ff = Math.max(0, param.ff);
  const fs = Math.min(ff, 1.6);
  const prims = [];
  const H = w ? 1.66 / 1.79 : 1;                 // Körpergröße relativ zum Mann
  const SCH = w ? 0.9 : 1;                       // Schulterbreite
  const HUE = w ? 1.14 : 1;                      // Hüftbreite
  const MO = w ? 0.8 : 1, MU = w ? 0.86 : 1;     // Muskelradien Ober-/Unterkörper (√ des Massenverhältnisses)

  const kM = 0.008 + 0.032 * Math.min(fs, 1.3);  // Muskelverschmelzung = Definition
  const kF = 0.06;

  // Fettdepot-Skalierung: verschwindet bei ff → 0, wächst über 1 hinaus langsamer
  const depot = (amp) => { const a = ff * amp; return a <= 0.02 ? 0 : a <= 1 ? Math.sqrt(a) : Math.pow(a, 0.45); };

  function setze(q, g, st, k, extra = {}) { Object.assign(q, { g, st, k, mid: 0, art: ART.rumpf }, extra); prims.push(q); return q; }
  const basis = (q, g, k) => setze(q, g, 0, k);
  function muskel(id, seite, q, g) { return setze(q, g, 1, kM, { mid: einheitIndex(id, seite) }); }
  function fett(q, g, k = kF) { return setze(q, g, 2, k); }

  // Muskel-Ellipsoid: wächst quer zur Faserrichtung mit √Volumen. An Armen und Beinen wächst die Dicke nach außen
  // in der Darstellung mit Volumen^0,75 – leicht überzeichnet, damit Unterschiede unter der Fettschicht sichtbar werden.
  const skal = (id, seite) => Math.sqrt(Math.max(0.2, faktor(id, seite)));

  // ===== Rumpf (Gruppe 0) =====
  const brustkorb = w ? [0.122, 0.15, 0.095] : [0.135, 0.165, 0.103];
  basis(ella([0, 1.30, -0.012], ...brustkorb), 0, 0.05);
  basis(ella([0, 1.10, 0.0], (w ? 0.112 : 0.126), 0.12, (w ? 0.085 : 0.093)), 0, 0.05);
  basis(ella([0, 0.955, -0.012], 0.146 * HUE, 0.09, 0.10), 0, 0.05);
  basis(kegel([0, 1.46, -0.03], [0, 1.60, -0.008], w ? 0.047 : 0.056, w ? 0.043 : 0.051), 0, 0.04);
  // Kopf
  basis(ella([0, 1.675, 0.005], 0.074, 0.102, 0.093), 0, 0.03);
  basis(ella([0, 1.605, 0.03], w ? 0.052 : 0.058, 0.045, 0.058), 0, 0.03);
  basis(ella([0, 1.662, 0.094], 0.01, 0.019, 0.014), 0, 0.012);
  basis(ella([0, 1.703, 0.072], 0.056, 0.012, 0.022), 0, 0.02);               // Brauenbogen
  basis(ella([0, 1.583, 0.062], w ? 0.02 : 0.024, 0.018, 0.02), 0, 0.02);     // Kinn
  for (const sx of [1, -1]) {
    basis(ella([0.073 * sx, 1.665, -0.005], 0.012, 0.026, 0.018), 0, 0.01); // Ohren
  }
  if (w) {
    // Haar: Dutt am Hinterkopf
    setze(ella([0, 1.735, -0.085], 0.04, 0.035, 0.035), 0, 0, 0.03, { art: ART.haar });
  }

  for (const seite of ['L', 'R']) {
    const sx = seite === 'L' ? 1 : -1;
    const P = (x, y, z) => [x * sx, y, z];
    const S = (x, y, z) => [x * sx, y, z];      // Richtungen spiegeln wie Punkte
    const grp = 0;
    const m = (id, q) => muskel(id, seite, q, grp);

    // Schultergürtel und Schulterblatt
    basis(kegel(P(0.02, 1.455, -0.025), P(0.172 * SCH, 1.465, -0.028), 0.05, 0.042), grp, 0.04);
    basis(ein(P(0.085, 1.36, -0.088), [0, 1, 0], [0, 0, -1], 0.075, 0.02, 0.055, 0.03), grp, 0.05);

    // Brust
    const sb = skal('brust_u', seite) * MO, so = skal('brust_o', seite) * MO;
    m('brust_u', ein(P(0.078, 1.322, 0.072), S(0.82, 0.52, -0.2), S(0.12, -0.05, 1), 0.095, 0.021 * sb * sb, 0.056 * sb, 0.03));
    m('brust_o', ein(P(0.08, 1.396, 0.07), S(0.95, 0.12, -0.25), S(0.1, 0.25, 1), 0.078, 0.016 * so * so, 0.034 * so, 0.025));
    const ss = skal('serratus', seite) * MO;
    for (let i = 0; i < 3; i++) {
      m('serratus', ein(P(0.128 - 0.004 * i, 1.215 + 0.034 * i, 0.03 + 0.008 * i), S(-0.35, -0.45, 0.8), S(1, 0, 0.25), 0.022, 0.007 * ss, 0.009 * ss, 0.008));
    }
    // Bauch: gerader Bauchmuskel in vier Segmenten
    const sg = skal('bauch_g', seite) * MO;
    const seg = [[1.218, 0.028, 0.032], [1.152, 0.03, 0.032], [1.086, 0.03, 0.033], [0.99, 0.055, 0.031]];
    for (const [y, ry, rx] of seg) {
      const zf = (w ? 0.082 : 0.088) + (y < 1.0 ? -0.004 : 0);
      m('bauch_g', ein(P(0.036, y, zf), [0, 1, 0], [0.12 * sx, 0, 1], ry, 0.013 * sg * sg, rx, 0.012));
    }
    const sso = skal('bauch_s', seite) * MO;
    m('bauch_s', ein(P(0.112, 1.09, 0.03), [0.12 * sx, 1, 0.15], S(0.92, 0, 0.4), 0.095, 0.026 * sso, 0.058, 0.02));
    // Rücken
    const sl = skal('lat', seite) * MO;
    m('lat', ein(P(0.112, 1.25, -0.07), S(0.4, 0.92, 0.08), S(0.55, 0, -0.84), 0.165, 0.021 * sl * sl, 0.062 * sl, 0.035));
    const sto = skal('trapez_o', seite) * MO;
    m('trapez_o', ein(P(0.085, 1.505, -0.04), S(0.92, -0.38, 0.05), S(0.25, 0.85, -0.45), 0.085, 0.024 * sto, 0.03 * sto, 0.01));
    const stm = skal('trapez_m', seite) * MO;
    m('trapez_m', ein(P(0.065, 1.375, -0.098), S(1, 0.12, -0.1), [0, 0.1, -1], 0.072, 0.016 * stm, 0.048, 0.025));
    m('trapez_m', ein(P(0.042, 1.25, -0.095), S(0.35, 1, 0), [0, 0, -1], 0.085, 0.012 * stm, 0.03, 0.02));
    const ser = skal('strecker', seite) * MO;
    m('strecker', ein(P(0.034, 1.09, -0.087), [0, 1, -0.05], S(0.25, 0, -1), 0.165, 0.024 * ser, 0.024 * ser, 0.012));
    // Gesäß
    const sgm = skal('glut_max', seite) * MU, sgd = skal('glut_med', seite) * MU;
    m('glut_max', ell(P(0.074 * HUE, 0.895, -0.075), S(0.3, -1, 0.1), S(0.25, 0, -1), 0.098, 0.058 * sgm, 0.078 * sgm));
    m('glut_med', ell(P(0.128 * HUE, 0.975, -0.035), [0, 1, 0], S(1, 0, -0.35), 0.05, 0.028 * sgd, 0.05));

    // Fettdepots am Rumpf
    const amp = w
      ? { bauch: 0.55, flanke: 0.9, brustF: 0, ruecken: 0.6, gesaess: 1.35 }
      : { bauch: 1.0, flanke: 1.0, brustF: 0.8, ruecken: 0.7, gesaess: 0.35 };
    let f;
    if ((f = depot(amp.flanke))) fett(ell(P(0.128, 1.03, -0.01), [0, 1, 0], S(1, 0, -0.2), 0.055 * f, 0.03 * f, 0.065 * f), grp);
    if ((f = depot(amp.brustF))) fett(ell(P(0.078, 1.305, 0.074), [0, 1, 0], [0, -0.3, 1], 0.062 * f, 0.034 * f, 0.065 * f), grp, 0.07);
    if ((f = depot(amp.gesaess))) fett(ell(P(0.08 * HUE, 0.87, -0.098), S(0.2, -1, 0), [0, -0.2, -1], 0.09 * f, 0.032 * f, 0.08 * f), grp);
    if (w) {
      // Brust (überwiegend Fettgewebe): Grundform plus fettabhängiger Anteil
      const b = 0.75 + 0.25 * Math.min(ff, 1.5);
      fett(ell(P(0.078, 1.285, 0.088), S(0.15, -0.3, 1), S(0.3, 1, 0), 0.06 * b, 0.064 * b, 0.066 * b), grp, 0.035);
    }
  }
  // Mittige Fettdepots
  {
    const amp = w ? { bauch: 0.6, ruecken: 0.6, unterbauch: 1.0 } : { bauch: 1.0, ruecken: 0.7, unterbauch: 0.6 };
    let f;
    if ((f = depot(amp.bauch))) fett(ella([0, 1.07, 0.048 + 0.012 * f], 0.118 * f + 0.02, 0.11 * f, 0.08 * f), 0);
    if ((f = depot(amp.unterbauch))) fett(ella([0, 0.975, 0.075], 0.1 * f, 0.055 * f, 0.045 * f), 0);
    if ((f = depot(amp.ruecken))) fett(ella([0, 1.06, -0.065], 0.115 * f, 0.08 * f, 0.04 * f), 0);
  }

  // ===== Arme (Gruppen 1, 2) =====
  for (const seite of ['L', 'R']) {
    const g = seite === 'L' ? 1 : 2;
    const arm = [];
    const m = (id, q) => { q = muskel(id, seite, q, g); arm.push(q); };
    const b = (q, k) => { q = basis(q, g, k); arm.push(q); };
    const fe = (q, k) => { q = fett(q, g, k); arm.push(q); };

    const S0 = [0.183 * SCH, 1.445, -0.022];
    const uA = norm([0.27, -0.96, -0.03]), LA = w ? 0.285 : 0.295;
    const E = add(S0, mul(uA, LA));
    const uF = norm([0.3, -0.95, 0.1]), LF = w ? 0.24 : 0.255;
    const W = add(E, mul(uF, LF));
    const uH = norm([0.25, -0.96, 0.08]);
    const fA = norm(sub([0, 0, 1], mul(uA, uA[2]))), lA = cross(fA, uA);   // vorn, außen
    const fF = norm(sub([0, 0, 1], mul(uF, uF[2]))), lF = cross(fF, uF);
    const pA = (t, df, dl) => lin(S0, 1, uA, t, fA, df, lA, dl);
    const pF = (t, df, dl) => lin(E, 1, uF, t, fF, df, lF, dl);
    const rad = w ? 0.86 : 1;

    // Grundkörper
    b(kegel(S0, E, 0.033 * rad, 0.027 * rad), 0.03);
    b(kegel(E, W, 0.03 * rad, 0.02 * rad), 0.03);
    b(ella(S0, 0.04 * rad, 0.04 * rad, 0.042 * rad), 0.03);
    // Hand (neutral, Handfläche zum Oberschenkel)
    b(ell(lin(W, 1, uH, 0.045), uH, [0, 0, 1], 0.05 * rad, 0.04 * rad, 0.016 * rad), 0.02);
    b(ell(lin(W, 1, uH, 0.125, fF, -0.004), uH, [0, 0, 1], 0.052 * rad, 0.036 * rad, 0.013 * rad), 0.02);
    b(kegel(lin(W, 1, uH, 0.03, fF, 0.03), lin(W, 1, uH, 0.085, fF, 0.048, lF, -0.01), 0.012 * rad, 0.009 * rad), 0.015);

    // Schulter (drei Köpfe des Deltamuskels)
    const dv = skal('delt_v', seite) * MO, ds = skal('delt_s', seite) * MO, dh = skal('delt_h', seite) * MO;
    m('delt_v', ell(pA(0.05, 0.03, 0.008), lin(uA, 1, fA, -0.25), fA, 0.075, 0.021 * dv ** 1.5, 0.03 * dv));
    m('delt_s', ell(pA(0.045, 0.0, 0.032), lin(uA, 1, lA, -0.35), lA, 0.08, 0.022 * ds ** 1.5, 0.033 * ds));
    m('delt_h', ell(pA(0.055, -0.032, 0.006), lin(uA, 1, fA, 0.25), mul(fA, -1), 0.072, 0.019 * dh ** 1.5, 0.03 * dh));
    // Oberarm
    const sb = skal('bizeps', seite) * MO, sr = skal('brachialis', seite) * MO, st = skal('trizeps', seite) * MO;
    m('bizeps', ell(pA(0.17, 0.026, 0.002), uA, fA, 0.085, 0.021 * sb ** 1.5, 0.024 * sb));
    m('brachialis', ell(pA(0.205, 0.008, 0.022), uA, lin(lA, 1, fA, 0.5), 0.06, 0.012 * sr ** 1.5, 0.017 * sr));
    m('trizeps', ell(pA(0.135, -0.027, -0.004), uA, mul(fA, -1), 0.11, 0.022 * st ** 1.5, 0.026 * st));
    m('trizeps', ell(pA(0.105, -0.016, 0.022), uA, lin(lA, 1, fA, -0.6), 0.068, 0.012 * st ** 1.5, 0.016 * st));
    // Unterarm
    const sbr = skal('brachiorad', seite) * MO, sfl = skal('ua_beuger', seite) * MO, sex = skal('ua_strecker', seite) * MO;
    m('brachiorad', ell(pF(0.035, 0.012, 0.022), lin(uF, 1, lF, -0.15), lin(lF, 1, fF, 0.6), 0.085, 0.016 * sbr ** 1.5, 0.016 * sbr));
    m('ua_beuger', ell(pF(0.075, 0.014, -0.012), uF, lin(fF, 1, lF, -0.7), 0.08, 0.016 * sfl ** 1.5, 0.022 * sfl));
    m('ua_strecker', ell(pF(0.075, -0.015, 0.008), uF, lin(fF, -1, lF, 0.5), 0.08, 0.015 * sex ** 1.5, 0.02 * sex));

    // Fett am Oberarm (Rückseite) und rundum
    let f;
    if ((f = depot(w ? 1.3 : 1.0))) fe(ell(pA(0.15, -0.032, -0.006), uA, mul(fA, -1), 0.1 * f, 0.026 * f, 0.034 * f), 0.045);
    if ((f = depot(w ? 0.8 : 0.6))) fe(ell(pA(0.13, 0.012, 0.012), uA, lin(fA, 1, lA, 0.6), 0.09 * f, 0.016 * f, 0.03 * f), 0.045);

    if (seite === 'R') for (const q of arm) Object.assign(q, spiegeln(q));
  }

  // ===== Beine (Gruppen 3, 4) =====
  for (const seite of ['L', 'R']) {
    const g = seite === 'L' ? 3 : 4;
    const bein = [];
    const m = (id, q) => { q = muskel(id, seite, q, g); bein.push(q); };
    const b = (q, k) => { q = basis(q, g, k); bein.push(q); };
    const fe = (q, k) => { q = fett(q, g, k); bein.push(q); };

    const Hj = [0.092 * HUE, 0.925, 0.0], K = [0.098 * (w ? 0.98 : 1), 0.49, 0.012], A = [0.103, 0.085, -0.012];
    const uT = norm(sub(K, Hj)), LT = Math.hypot(...sub(K, Hj));
    const uS = norm(sub(A, K)), LS = Math.hypot(...sub(A, K));
    const fT = norm(sub([0, 0, 1], mul(uT, uT[2]))), lT = cross(fT, uT);
    const fS = norm(sub([0, 0, 1], mul(uS, uS[2]))), lS = cross(fS, uS);
    const pT = (t, df, dl) => lin(Hj, 1, uT, t * LT, fT, df, lT, dl);
    const pS = (t, df, dl) => lin(K, 1, uS, t * LS, fS, df, lS, dl);
    const rad = w ? 0.9 : 1;

    b(kegel(lin(Hj, 1, uT, -0.03), K, 0.066 * rad, 0.043 * rad), 0.04);
    b(ella(lin(K, 1, fT, 0.016), 0.043 * rad, 0.045, 0.04 * rad), 0.03);
    b(kegel(K, A, 0.04 * rad, 0.024 * rad), 0.03);
    // Fuß
    b(ella([0.103, 0.045, -0.04], 0.03 * rad, 0.04, 0.036), 0.02);
    b(ell([0.11, 0.04, 0.05], [0.05, -0.12, 1], [0, 1, 0.1], 0.115, 0.03, 0.04 * rad), 0.025);
    b(ella([0.116, 0.022, 0.148], 0.04 * rad, 0.018, 0.034), 0.02);

    // Oberschenkel
    const svl = skal('vast_lat', seite) * MU, svm = skal('vast_med', seite) * MU, srf = skal('rect_fem', seite) * MU;
    const sad = skal('adduktoren', seite) * MU, sha = skal('hamstrings', seite) * MU;
    m('vast_lat', ell(pT(0.5, 0.008, 0.04), lin(uT, 1, lT, -0.05), lT, 0.155, 0.03 * svl ** 1.5, 0.036 * svl));
    m('vast_med', ein(pT(0.78, 0.024, -0.03), lin(uT, 1, lT, 0.3), lin(lT, -1, fT, 0.6), 0.08, 0.02 * svm ** 1.5, 0.028 * svm, 0.015));
    m('rect_fem', ell(pT(0.43, 0.047, 0.004), uT, fT, 0.165, 0.024 * srf ** 1.5, 0.03 * srf));
    m('adduktoren', ein(pT(0.27, 0.004, -0.045), lin(uT, 1, lT, 0.3), mul(lT, -1), 0.13, 0.03 * sad ** 1.5, 0.04 * sad, 0.01));
    m('hamstrings', ell(pT(0.47, -0.043, 0.018), uT, lin(fT, -1, lT, 0.3), 0.16, 0.026 * sha ** 1.5, 0.024 * sha));
    m('hamstrings', ell(pT(0.5, -0.042, -0.02), uT, lin(fT, -1, lT, -0.3), 0.155, 0.026 * sha ** 1.5, 0.024 * sha));
    // Unterschenkel
    const sga = skal('gastro', seite) * MU, sso = skal('soleus', seite) * MU, sti = skal('tibialis', seite) * MU;
    m('gastro', ein(pS(0.27, -0.04, -0.018), uS, lin(fS, -1, lS, -0.4), 0.088, 0.022 * sga ** 1.5, 0.026 * sga, 0.012));
    m('gastro', ein(pS(0.25, -0.038, 0.017), uS, lin(fS, -1, lS, 0.4), 0.075, 0.018 * sga ** 1.5, 0.022 * sga, 0.012));
    m('soleus', ein(pS(0.5, -0.026, 0.0), uS, mul(fS, -1), 0.11, 0.016 * sso ** 1.5, 0.034 * sso, 0.01));
    m('tibialis', ell(pS(0.36, 0.022, 0.018), uS, lin(fS, 1, lS, 0.6), 0.1, 0.012 * sti ** 1.5, 0.016 * sti));

    // Fett: Reiterhosen außen, Innenschenkel, Vorderseite
    const amp = w ? { aussen: 1.35, innen: 1.2, vorn: 0.8 } : { aussen: 0.35, innen: 0.6, vorn: 0.5 };
    let f;
    if ((f = depot(amp.aussen))) fe(ell(pT(0.18, -0.005, 0.062), uT, lT, 0.11 * f, 0.03 * f, 0.055 * f), 0.05);
    if ((f = depot(amp.innen))) fe(ell(pT(0.25, 0.008, -0.052), uT, mul(lT, -1), 0.11 * f, 0.026 * f, 0.045 * f), 0.05);
    if ((f = depot(amp.vorn))) fe(ell(pT(0.35, 0.05, 0.01), uT, fT, 0.14 * f, 0.016 * f, 0.05 * f), 0.05);

    if (seite === 'R') for (const q of bein) Object.assign(q, spiegeln(q));
  }

  // Körpergröße der Frau
  if (H !== 1) for (const q of prims) skaliere(q, H);

  prims.sort((a, b) => a.st - b.st);
  return {
    prims, H, geschlecht: param.geschlecht,
    tGruppe: [0.003 + 0.007 * fs, 0.003 + 0.008 * fs, 0.003 + 0.008 * fs, 0.002 + 0.008 * fs, 0.002 + 0.008 * fs],
    kVerbindung: [0, 0.02, 0.02, 0.045, 0.045],
  };
}

function skaliere(q, s) {
  if (q.t === 0) { q.cx *= s; q.cy *= s; q.cz *= s; q.ru *= s; q.ro *= s; q.rs *= s; }
  else {
    q.ax *= s; q.ay *= s; q.az *= s; q.bax *= s; q.bay *= s; q.baz *= s; q.r1 *= s; q.r2 *= s;
    q.l2 *= s * s; q.rr *= s; q.a2 *= s * s; q.il2 = 1 / q.l2;
  }
  q.minx *= s; q.maxx *= s; q.miny *= s; q.maxy *= s; q.minz *= s; q.maxz *= s;
  q.k *= s;
}

// ---------- Feldauswertung ----------
// Die Primitive werden für die schnelle Auswertung in ein Float64Array gepackt (20 Werte je Primitiv).
const ST = 20;
function kompiliere(K) {
  const P = K.prims, D = new Float64Array(P.length * ST);
  P.forEach((q, i) => {
    const o = i * ST;
    D[o] = q.t; D[o + 1] = q.g; D[o + 2] = q.k;
    if (q.t === 0) {
      D.set([q.cx, q.cy, q.cz, q.ux, q.uy, q.uz, q.ox, q.oy, q.oz, q.sx, q.sy, q.sz, 1 / q.ru, 1 / q.ro, 1 / q.rs, Math.min(q.ru, q.ro, q.rs)], o + 3);
    } else {
      D.set([q.ax, q.ay, q.az, q.bax, q.bay, q.baz, q.l2, q.rr, q.a2, q.il2, q.r1, q.r2], o + 3);
    }
  });
  K.D = D;
}

function sdP(D, o, x, y, z) {
  const px = x - D[o + 3], py = y - D[o + 4], pz = z - D[o + 5];
  if (D[o] === 0) {
    const iu = D[o + 15], io = D[o + 16], is = D[o + 17];
    const lu = (px * D[o + 6] + py * D[o + 7] + pz * D[o + 8]) * iu;
    const lo = (px * D[o + 9] + py * D[o + 10] + pz * D[o + 11]) * io;
    const ls = (px * D[o + 12] + py * D[o + 13] + pz * D[o + 14]) * is;
    const k0 = Math.sqrt(lu * lu + lo * lo + ls * ls);
    const a = lu * iu, b = lo * io, c = ls * is;
    const k1 = Math.sqrt(a * a + b * b + c * c);
    return k1 < 1e-12 ? -D[o + 18] : k0 * (k0 - 1) / k1;
  }
  const bax = D[o + 6], bay = D[o + 7], baz = D[o + 8], l2 = D[o + 9], rr = D[o + 10], a2 = D[o + 11], il2 = D[o + 12];
  const yy = px * bax + py * bay + pz * baz;
  const zz = yy - l2;
  const qx = px * l2 - bax * yy, qy = py * l2 - bay * yy, qz = pz * l2 - baz * yy;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yy * yy * l2, z2 = zz * zz * l2;
  const k = (rr > 0 ? 1 : rr < 0 ? -1 : 0) * rr * rr * x2;
  if ((zz > 0 ? 1 : zz < 0 ? -1 : 0) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - D[o + 14];
  if ((yy > 0 ? 1 : yy < 0 ? -1 : 0) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - D[o + 13];
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - D[o + 13];
}

function feld(K, liste, x, y, z) {
  let g0 = INF, g1 = INF, g2 = INF, g3 = INF, g4 = INF;
  const D = K.D;
  for (let i = 0; i < liste.length; i++) {
    const o = liste[i] * ST;
    const d = sdP(D, o, x, y, z), k = D[o + 2];
    switch (D[o + 1]) {
      case 0: g0 = smin(g0, d, k); break;
      case 1: g1 = smin(g1, d, k); break;
      case 2: g2 = smin(g2, d, k); break;
      case 3: g3 = smin(g3, d, k); break;
      default: g4 = smin(g4, d, k);
    }
  }
  const t = K.tGruppe, kv = K.kVerbindung;
  const T = g0 - t[0];
  let R = T, v;
  if (g1 < INF * 0.5) { v = smin(T, g1 - t[1], kv[1]); if (v < R) R = v; }
  if (g2 < INF * 0.5) { v = smin(T, g2 - t[2], kv[2]); if (v < R) R = v; }
  if (g3 < INF * 0.5) { v = smin(T, g3 - t[3], kv[3]); if (v < R) R = v; }
  if (g4 < INF * 0.5) { v = smin(T, g4 - t[4], kv[4]); if (v < R) R = v; }
  return R;
}

// ---------- Vernetzung (Surface Nets auf dünn besetztem Gitter) ----------
export function vernetzen(K, opt = {}) {
  const h = opt.h ?? 0.008;
  const C = 4, hc = h * C;
  const P = K.prims;
  kompiliere(K);

  let minx = INF, miny = INF, minz = INF, maxx = -INF, maxy = -INF, maxz = -INF;
  for (const q of P) {
    minx = Math.min(minx, q.minx); maxx = Math.max(maxx, q.maxx);
    miny = Math.min(miny, q.miny); maxy = Math.max(maxy, q.maxy);
    minz = Math.min(minz, q.minz); maxz = Math.max(maxz, q.maxz);
  }
  const ox = minx - 0.04, oy = miny - 0.04, oz = minz - 0.04;
  const cx = Math.ceil((maxx + 0.04 - ox) / hc), cy = Math.ceil((maxy + 0.04 - oy) / hc), cz = Math.ceil((maxz + 0.04 - oz) / hc);
  const nx = cx * C + 1, ny = cy * C + 1, nz = cz * C + 1;

  // Primitive je Grobzelle
  const eimer = new Array(cx * cy * cz);
  for (let i = 0; i < eimer.length; i++) eimer[i] = [];
  // Ein Primitiv kommt in den Eimer einer Grobzelle, wenn seine (genäherte) Distanz am Zellmittelpunkt klein genug ist,
  // dass es irgendwo in der Zelle die Oberfläche beeinflussen kann. Ausgeschlossene Primitive verändern das Feld dort nicht –
  // so bleibt das Feld über Zellgrenzen hinweg stetig (sonst entstehen Stufen).
  const halbDiag = hc * Math.sqrt(3) / 2, tMax = Math.max(...K.tGruppe);
  P.forEach((q, i) => {
    const grenze = q.k + tMax + 0.008 + 1.5 * halbDiag;
    const r = grenze + 0.02;
    const x0 = Math.max(0, Math.floor((q.minx - r - ox) / hc)), x1 = Math.min(cx - 1, Math.floor((q.maxx + r - ox) / hc));
    const y0 = Math.max(0, Math.floor((q.miny - r - oy) / hc)), y1 = Math.min(cy - 1, Math.floor((q.maxy + r - oy) / hc));
    const z0 = Math.max(0, Math.floor((q.minz - r - oz) / hc)), z1 = Math.min(cz - 1, Math.floor((q.maxz + r - oz) / hc));
    const o = i * ST;
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (sdP(K.D, o, ox + (x + 0.5) * hc, oy + (y + 0.5) * hc, oz + (z + 0.5) * hc) < grenze) eimer[x + cx * (y + cy * z)].push(i);
    }
  });
  const eimerBei = (x, y, z) => {
    const ix = Math.min(cx - 1, Math.max(0, Math.floor((x - ox) / hc)));
    const iy = Math.min(cy - 1, Math.max(0, Math.floor((y - oy) / hc)));
    const iz = Math.min(cz - 1, Math.max(0, Math.floor((z - oz) / hc)));
    return eimer[ix + cx * (iy + cy * iz)];
  };

  const f = (x, y, z) => { const l = eimerBei(x, y, z); return l.length ? feld(K, l, x, y, z) : 1; };

  // Grobgitter
  const gx = cx + 1, gy = cy + 1, gz = cz + 1;
  const grob = new Float32Array(gx * gy * gz);
  for (let z = 0; z < gz; z++) for (let y = 0; y < gy; y++) for (let x = 0; x < gx; x++) {
    const l = eimer[Math.min(x, cx - 1) + cx * (Math.min(y, cy - 1) + cy * Math.min(z, cz - 1))];
    grob[x + gx * (y + gy * z)] = l.length ? feld(K, l, ox + x * hc, oy + y * hc, oz + z * hc) : 1;
  }

  // Feingitter: nur Grobzellen nahe der Oberfläche exakt auswerten
  const schwelle = hc * Math.sqrt(3) * (opt.schwelle ?? 1.15);
  const fein = new Float32Array(nx * ny * nz);
  const gesetzt = new Uint8Array(nx * ny * nz);
  const aktiv = [];
  for (let z = 0; z < cz; z++) for (let y = 0; y < cy; y++) for (let x = 0; x < cx; x++) {
    let nah = false, pos = false, neg = false;
    for (let c = 0; c < 8 && !nah; c++) {
      const v = grob[(x + (c & 1)) + gx * ((y + ((c >> 1) & 1)) + gy * (z + ((c >> 2) & 1)))];
      if (Math.abs(v) < schwelle) nah = true;
      if (v > 0) pos = true; else neg = true;
    }
    if (!nah && !(pos && neg)) continue;
    aktiv.push(x, y, z);
    const l = eimer[x + cx * (y + cy * z)];
    for (let k = 0; k <= C; k++) for (let j = 0; j <= C; j++) for (let i = 0; i <= C; i++) {
      const fx = x * C + i, fy = y * C + j, fz = z * C + k, n = fx + nx * (fy + ny * fz);
      if (gesetzt[n]) continue;
      gesetzt[n] = 1;
      fein[n] = feld(K, l, ox + fx * h, oy + fy * h, oz + fz * h);
    }
  }
  // Surface Nets: ein Punkt je Zelle mit Vorzeichenwechsel
  const zelleIdx = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const zid = (x, y, z) => x + (nx - 1) * (y + (ny - 1) * z);
  const pos = [];
  const ecken = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const kanten = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const wert = new Float32Array(8);
  const zellen = [];
  for (let a = 0; a < aktiv.length; a += 3) {
    const bx = aktiv[a] * C, by = aktiv[a + 1] * C, bz = aktiv[a + 2] * C;
    for (let k = 0; k < C; k++) for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
      const x = bx + i, y = by + j, z = bz + k;
      let maske = 0;
      for (let c = 0; c < 8; c++) {
        const e = ecken[c];
        const v = fein[(x + e[0]) + nx * ((y + e[1]) + ny * (z + e[2]))];
        wert[c] = v;
        if (v < 0) maske |= 1 << c;
      }
      if (maske === 0 || maske === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [c0, c1] of kanten) {
        const v0 = wert[c0], v1 = wert[c1];
        if ((v0 < 0) === (v1 < 0)) continue;
        const t = v0 / (v0 - v1), e0 = ecken[c0], e1 = ecken[c1];
        sx += e0[0] + (e1[0] - e0[0]) * t; sy += e0[1] + (e1[1] - e0[1]) * t; sz += e0[2] + (e1[2] - e0[2]) * t; n++;
      }
      zelleIdx[zid(x, y, z)] = pos.length / 3;
      pos.push(ox + (x + sx / n) * h, oy + (y + sy / n) * h, oz + (z + sz / n) * h);
      zellen.push(x, y, z, maske);
    }
  }

  // Flächen: je Gitterkante mit Vorzeichenwechsel ein Viereck aus den vier anliegenden Zellen
  const idx = [];
  const pv = (i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
  const d2 = (a, b) => { const p = pv(a), q = pv(b); return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; };
  for (let c = 0; c < zellen.length; c += 4) {
    const x = zellen[c], y = zellen[c + 1], z = zellen[c + 2], maske = zellen[c + 3];
    const innen0 = (maske & 1) !== 0;
    // Kanten ab Ecke 0 in x-, y-, z-Richtung (Ecken 1, 2, 4)
    for (let achse = 0; achse < 3; achse++) {
      const andere = 1 << (1 << achse);   // Bit der Ecke 1, 2 bzw. 4
      if (((maske & 1) !== 0) === ((maske & andere) !== 0)) continue;
      const u = (achse + 1) % 3, v = (achse + 2) % 3;
      const o = [x, y, z];
      if (o[u] === 0 || o[v] === 0) continue;
      const du = [0, 0, 0], dv = [0, 0, 0]; du[u] = 1; dv[v] = 1;
      const a0 = zelleIdx[zid(x, y, z)];
      const a1 = zelleIdx[zid(x - du[0], y - du[1], z - du[2])];
      const a2 = zelleIdx[zid(x - du[0] - dv[0], y - du[1] - dv[1], z - du[2] - dv[2])];
      const a3 = zelleIdx[zid(x - dv[0], y - dv[1], z - dv[2])];
      if (a1 < 0 || a2 < 0 || a3 < 0) continue;
      const quad = innen0 ? [a0, a1, a2, a3] : [a0, a3, a2, a1];
      if (d2(quad[0], quad[2]) <= d2(quad[1], quad[3])) idx.push(quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]);
      else idx.push(quad[0], quad[1], quad[3], quad[1], quad[2], quad[3]);
    }
  }

  // Punkte auf die Oberfläche ziehen, Normalen, Umgebungsverdeckung und Muskelzuordnung
  const nv = pos.length / 3;
  const P3 = new Float32Array(pos), N3 = new Float32Array(nv * 3);
  const AO = new Float32Array(nv), MID = new Float32Array(nv), RAND = new Float32Array(nv), ART_ = new Float32Array(nv);
  const eps = h * 0.5;
  const tetra = [[1, -1, -1], [-1, -1, 1], [-1, 1, -1], [1, 1, 1]];
  for (let i = 0; i < nv; i++) {
    let x = P3[3 * i], y = P3[3 * i + 1], z = P3[3 * i + 2];
    let gx_ = 0, gy_ = 0, gz_ = 0, fm = 0;
    for (const [a, b, c] of tetra) { const v = f(x + a * eps, y + b * eps, z + c * eps); gx_ += a * v; gy_ += b * v; gz_ += c * v; fm += v; }
    fm /= 4;
    let gl = Math.hypot(gx_, gy_, gz_) || 1;
    // Gradient der Tetraeder-Differenzen: Betrag ≈ 4·eps·|∇f|
    const gnx = gx_ / gl, gny = gy_ / gl, gnz = gz_ / gl;
    const grad = gl / (4 * eps);
    const schritt = Math.max(-h, Math.min(h, fm / Math.max(grad, 0.3)));
    x -= gnx * schritt; y -= gny * schritt; z -= gnz * schritt;
    P3[3 * i] = x; P3[3 * i + 1] = y; P3[3 * i + 2] = z;
    N3[3 * i] = gnx; N3[3 * i + 1] = gny; N3[3 * i + 2] = gnz;

    let occ = 0, sca = 1;
    for (let s = 1; s <= 3; s++) {
      const hh = 0.012 * s;
      const d = f(x + gnx * hh, y + gny * hh, z + gnz * hh);
      occ += (hh - d) * sca; sca *= 0.7;
    }
    AO[i] = Math.max(0, Math.min(1, 1 - 5 * occ));

    const [mid, rnd, art] = analysiere(K, eimerBei(x, y, z), x, y, z);
    MID[i] = mid; RAND[i] = rnd; ART_[i] = art;
  }

  // Ausrichtung der Dreiecke prüfen (nach außen zeigend)
  let passt = 0, gesamt = 0;
  for (let t = 0; t < idx.length && gesamt < 2000; t += 3 * 7) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const e1 = [P3[3 * b] - P3[3 * a], P3[3 * b + 1] - P3[3 * a + 1], P3[3 * b + 2] - P3[3 * a + 2]];
    const e2 = [P3[3 * c] - P3[3 * a], P3[3 * c + 1] - P3[3 * a + 1], P3[3 * c + 2] - P3[3 * a + 2]];
    const n = cross(e1, e2);
    if (n[0] * N3[3 * a] + n[1] * N3[3 * a + 1] + n[2] * N3[3 * a + 2] > 0) passt++;
    gesamt++;
  }
  if (passt < gesamt / 2) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }

  return {
    pos: P3, nor: N3, ao: AO, mid: MID, rand: RAND, art: ART_, idx: new Uint32Array(idx),
    info: { punkte: nv, dreiecke: idx.length / 3, aktiveZellen: aktiv.length / 3, gitter: [nx, ny, nz] },
  };
}

// Welcher Muskel liegt an diesem Oberflächenpunkt? Liefert [Einheitsindex, Randnähe 0..1, Art]
function analysiere(K, liste, x, y, z) {
  const P = K.prims;
  let d1 = INF, d2 = INF, m1 = 0, m2 = 0, art = ART.rumpf, beste = INF;
  const gw = [INF, INF, INF, INF, INF];
  for (let i = 0; i < liste.length; i++) {
    const q = P[liste[i]];
    const d = sdP(K.D, liste[i] * ST, x, y, z);
    if (d < gw[q.g]) gw[q.g] = d;
    if (q.art === ART.haar && d < 0.012) art = ART.haar;
    if (!q.mid) continue;
    if (d < d1) { if (q.mid !== m1) { d2 = d1; m2 = m1; } d1 = d; m1 = q.mid; }
    else if (d < d2 && q.mid !== m1) { d2 = d; m2 = q.mid; }
  }
  let gruppe = 0;
  for (let g = 0; g < 5; g++) if (gw[g] < beste) { beste = gw[g]; gruppe = g; }
  const grenze = K.tGruppe[0] + 0.022;
  const mid = d1 < grenze ? m1 : 0;
  const rnd = mid && m2 && d2 < grenze ? Math.max(0, 1 - (d2 - d1) / 0.006) : 0;
  if (art !== ART.haar && (gruppe === 1 || gruppe === 2)) art = ART.arm;
  return [mid, rnd, art];
}
