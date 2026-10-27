// Backt das Anatomie-Texturpaket für die Anatomie-Ansicht (läuft über tools/anatomie-backen.mjs).
//
// Je Texel im UV-Raum des MakeHuman-Körpers: Position und Normale aus dem Dreieck, dann die Muskelmasken analytisch
// ausgewertet (pixelgenaue Grenzen statt Dreieckskanten). Darüber anatomische Unterteilungen (Sixpack-Segmente,
// Bizeps-/Waden-/Beinbeuger-Köpfe, Sägemuskel-Zacken) und Sehnenplatten (Rückenfaszie, Tractus iliotibialis,
// Achillessehne …). Aus dem 3D-Abstand zur nächsten Grenze entstehen gewölbte Muskelbäuche, helle Faszienlinien und
// Schattenkanten; die Faserzeichnung folgt dem Faserverlauf je Muskel.
//
// Ergebnis je Geschlecht:
//   farbe  RGB  – gemalte Anatomie (sRGB)
//   hoehe  RGB  – R = Relief für Bump-Mapping (0,5 = neutral), G = Furchentiefe (dämpft Glanz)
//   karte  RGBA – R = Einheit (0 = Sehne/Haut), G = Muskelanteil (255 = Muskel, 0 = Sehne), B = Hautzone

import fs from 'node:fs';
import { entpacke } from '../src/avatar/daten';
import { berechneMasken, faserAuswerter, gemeinsameDreiecke, glied, maskenAuswerter, MAX_JE_PUNKT, normalen } from '../src/avatar/masken';
import { EINHEITEN, einheitIndex } from '../src/engine/muskeln';

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const glatt = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mischen = (a: number, b: number, t: number) => a + (b - a) * t;

// Wertrauschen in 3D (deterministisch), für Farbschwankungen und unruhigere Fasern
function hash(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function rauschen(px: number, py: number, pz: number) {
  const x0 = Math.floor(px), y0 = Math.floor(py), z0 = Math.floor(pz);
  const fx = px - x0, fy = py - y0, fz = pz - z0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  let v = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const w = (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
    v += w * hash(x0 + dx, y0 + dy, z0 + dz);
  }
  return v;
}

export interface Ergebnis { n: number; farbe: Uint8Array; hoehe: Uint8Array; karte: Uint8Array }

export function backe(g: 'm' | 'w', N = 2048): Ergebnis {
  const daten = entpacke(JSON.parse(fs.readFileSync(`public/modelle/koerper-${g}.json`, 'utf8')));
  const netz = daten.koerper, P = netz.grund, Q = netz.quelle, UV = netz.uv, T = netz.dreiecke;
  const NN = normalen(P, gemeinsameDreiecke(netz));
  const G = daten.gelenke as Record<string, V3>;
  const auswerten = maskenAuswerter(G);
  const idVon = (e: number) => EINHEITEN[e - 1]?.id ?? '';

  // Muskelmitten für die Fächerwinkel der Fasern (wie zur Laufzeit)
  const masken = berechneMasken(netz, G);
  const summen = new Map<string, [number, number, number, number]>();
  for (let i = 0; i < netz.punkte; i++) {
    if (masken.gewicht[i * MAX_JE_PUNKT] < 0.5) continue;
    const id = idVon(masken.einheit[i * MAX_JE_PUNKT]), s = summen.get(id) ?? [0, 0, 0, 0];
    s[0] += Math.abs(P[3 * i]); s[1] += P[3 * i + 1]; s[2] += P[3 * i + 2]; s[3]++;
    summen.set(id, s);
  }
  const mitten = new Map<string, V3>([...summen].map(([id, c]) => [id, [c[0] / c[3], c[1] / c[3], c[2] / c[3]]]));
  const faser = faserAuswerter(G, mitten, 190);

  // ---------- 1. Dreiecke in den UV-Raum rastern ----------
  const NN2 = N * N;
  const dreieck = new Int32Array(NN2).fill(-1), b0 = new Float32Array(NN2), b1 = new Float32Array(NN2);
  for (let t = 0; t < T.length / 3; t++) {
    const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
    const ax = UV[2 * a] * N, ay = (1 - UV[2 * a + 1]) * N, bx = UV[2 * b] * N, by = (1 - UV[2 * b + 1]) * N, cx = UV[2 * c] * N, cy = (1 - UV[2 * c + 1]) * N;
    const flaeche = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(flaeche) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(N - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const qx = px + 0.5, qy = py + 0.5;
      const w0 = ((bx - qx) * (cy - qy) - (cx - qx) * (by - qy)) / flaeche;
      const w1 = ((cx - qx) * (ay - qy) - (ax - qx) * (cy - qy)) / flaeche;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
      const i = py * N + px;
      dreieck[i] = t; b0[i] = w0; b1[i] = w1;
    }
  }

  // ---------- 2. Je Texel: Position, Normale, Einheit, Unterteilung, Sehne, Faser ----------
  const J = (n: string): V3 => G[n];
  const schulter = J('l-shoulder'), ellbogen = J('l-elbow'), hand = J('l-hand');
  const huefte = J('l-upper-leg'), knie = J('l-knee'), knoechel = J('l-ankle'), becken = J('pelvis'), hals = J('neck'), kopf = J('head');
  const oberarm = glied(schulter, ellbogen), unterarm = glied(ellbogen, hand), oberschenkel = glied(huefte, knie), unterschenkel = glied(knie, knoechel);
  const W = schulter[0], yB = becken[1], hoeheRumpf = hals[1] - yB;
  // Lage im Glied: t entlang der Achse, Winkel um die Achse (0 vorn, + außen, ±π hinten)
  const imGlied = (gl: ReturnType<typeof glied>, p: V3) => {
    const d = sub(p, gl.a), t = dot(d, gl.u) / gl.laenge;
    const r = sub(d, gl.u.map(x => x * t * gl.laenge) as V3);
    return { t, w: Math.atan2(dot(r, gl.l), dot(r, gl.f)), radius: Math.hypot(r[0], r[1], r[2]) };
  };

  // Anzeige-Umrisse: die Wachstumsmasken sind bewusst weich und grob; für die gezeichnete Anatomie werden die
  // sichtbaren Muskeln hier nach ihrer echten Form zugeschnitten (Brust, Trapez, Schulterblatt, Lat, Oberschenkel).
  const ix = (id: string, s: 'L' | 'R') => einheitIndex(id, s);
  const OBERSCHENKEL = new Set(['rect_fem', 'vast_lat', 'vast_med', 'adduktoren', 'hamstrings', 'sartorius']);
  const BRUSTRAUM = new Set(['brust_o', 'brust_u', 'serratus', 'bauch_s', 'bauch_g', 'delt_v', 'trapez_o', '']);
  const RUECKEN = new Set(['lat', 'trapez_m', 'trapez_o', 'strecker', 'rotatoren', 'delt_h', 'bauch_s', 'serratus', '']);
  const OBERARM = new Set(['bizeps', 'brachialis', 'trizeps']);
  const GESAESS = new Set(['glut_max', 'glut_med', 'lat', 'strecker', 'bauch_s', 'serratus', '']);
  const UNTERARM = new Set(['brachiorad', 'ua_beuger', 'ua_strecker', '']);
  const UNTERSCHENKEL = new Set(['gastro', 'soleus', 'tibialis', '']);
  const UNTEN = new Set([...OBERSCHENKEL, ...UNTERSCHENKEL, 'glut_max', 'glut_med', 'bauch_s', 'bauch_g', 'lat', 'strecker', 'serratus']);
  // Lage am Becken (linke, gespiegelte Seite): beta läuft von vorn (0) über außen (π/2) und hinten (π) bis zur Gesäßfalte (≈ 4,3)
  const beckenLage = (p: V3) => {
    const { t, w, radius } = imGlied(oberschenkel, p);
    return { t, w, radius, beta: w < -1.2 ? w + 2 * Math.PI : w };
  };
  // Beckenkamm: vorderer Darmbeinstachel (beta 0,4, v 0,08) → höchster Punkt außen → hinterer Stachel → Kreuzbein
  const vKamm = (beta: number) => beta < 1.4 ? 0.08 + 0.12 * Math.sin(Math.PI / 2 * Math.max(0, beta - 0.4))
    : beta < 3.7 ? 0.2 - 0.1 * ((beta - 1.4) / 2.3) ** 1.5 : 0.1 + 0.04 * Math.min(1, (beta - 3.7) / 0.65);
  // Leistenband vom Schambeinhöcker (u 0,1) zum vorderen Darmbeinstachel (u 0,65)
  const vLeiste = (u: number) => -0.07 + 0.15 * Math.min(1, Math.max(0, (u - 0.1) / 0.55));
  // Gerader Bauchmuskel: Außenrand, zum Schambein schmaler
  const uRect = (v: number) => 0.13 + 0.16 * glatt(-0.1, 0.14, v);
  // Gesäß: lam 0 = außen am großen Rollhügel, 1 = an der Gesäßspalte
  const gesLam = (beta: number) => Math.min(1, Math.max(0, (beta - 1.75) / 2.55));
  const vGesOben = (lam: number) => -0.12 + 0.27 * lam, vGesUnten = (lam: number) => -0.42 + 0.17 * lam;
  const uKreuz = (v: number) => 0.04 + 0.2 * glatt(-0.18, 0.12, v);       // Kreuzbein-Dreieck zwischen den Gesäßmuskeln
  // Spanner der Oberschenkelbinde (TFL): vom Darmbeinstachel schräg nach hinten unten in den Tractus
  const imTFL = (w: number, v: number) => {
    const q = (0.08 - v) / 0.4;
    return q >= 0 && q <= 1 && Math.abs(w - (1.1 + 0.3 * q)) < 0.3 * Math.sqrt(1 - q * q);
  };
  // ---- Seitliche Brustwand: Sägemuskel und äußerer schräger Bauchmuskel verzahnt ----
  // Umfangswinkel phi um die Rumpfmitte (0 vorn, π/2 seitlich, π hinten); X = phi·R und Y = v·Rumpfhöhe als Meter-Ebene.
  // Die Verzahnungslinie läuft vom Unterrand des Brustmuskels (vorn oben) schräg nach hinten unten zum Latissimus.
  // Darüber/dahinter der Sägemuskel als Finger, die schräg nach hinten oben unter den Lat ziehen; darunter/davor die
  // spitzen Ursprungszacken des äußeren schrägen Bauchmuskels, dessen Fasern steil nach vorn unten laufen.
  const zMitteV: number[] = [];
  for (let b = 0; b <= 24; b++) {
    const vb = -0.1 + 0.05 * b; let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < netz.punkte; i++) {
      if (Math.abs((P[3 * i + 1] - yB) / hoeheRumpf - vb) > 0.025 || Math.abs(P[3 * i]) > 0.6 * W) continue;
      lo = Math.min(lo, P[3 * i + 2]); hi = Math.max(hi, P[3 * i + 2]);
    }
    zMitteV.push(Number.isFinite(lo) ? (lo + hi) / 2 : becken[2]);
  }
  const rumpfZ = (v: number) => { const q = Math.min(23.999, Math.max(0, (v + 0.1) / 0.05)), k = Math.floor(q); return mischen(zMitteV[k], zMitteV[k + 1], q - k); };
  const R_SEITE = 0.14, SA: [number, number] = [0.86 * R_SEITE, 0.67 * hoeheRumpf], SB: [number, number] = [1.68 * R_SEITE, 0.37 * hoeheRumpf];
  const SL = Math.hypot(SB[0] - SA[0], SB[1] - SA[1]), slx = (SB[0] - SA[0]) / SL, sly = (SB[1] - SA[1]) / SL;
  const ZACKE = SL / 5, ZACKE_TIEFE = 0.026;
  const phiLat = (v: number) => 1.55 + 0.2 * Math.min(1, Math.max(0, (v - 0.18) / 0.5));   // Vorderrand des Latissimus
  const seitenLage = (p: V3, v: number) => {
    const phi = Math.atan2(p[0], p[2] - rumpfZ(v)), X = phi * R_SEITE, Y = v * hoeheRumpf;
    const dx = X - SA[0], dy = Y - SA[1];
    const sl = dx * slx + dy * sly, tq = -dx * sly + dy * slx;   // entlang der Linie, quer (positiv = hinten oben)
    const q = sl / ZACKE, f = q - Math.floor(q);
    // Fingerkuppen des Sägemuskels rund (f = 0,5), Zacken des Bauchmuskels spitz dazwischen (f = 0)
    const grenze = ZACKE_TIEFE * (0.3 - Math.max(0, 1 - (2 * f - 1) ** 2) ** 0.7);
    return { phi, X, Y, sl, tq, q, saege: tq > grenze && sl > -0.2 * ZACKE && sl < SL + 0.2 * ZACKE };
  };
  const SEITE = new Set(['serratus', 'bauch_s', 'lat', 'brust_u', 'brust_o']);
  // −1 = nicht zuständig (vorn am Sixpack, hinten am Rücken, Achsel und Becken)
  function seitenEinheit(p: V3, v: number, s: 'L' | 'R'): number {
    if (v < 0.18 || v > 0.75) return -1;
    const L = seitenLage(p, v);
    if (L.phi < 0.55 || L.phi > phiLat(v) + 0.3) return -1;
    if (L.phi >= phiLat(v)) return v < 0.72 ? ix('lat', s) : -1;
    return ix(L.saege ? 'serratus' : 'bauch_s', s);
  }
  const imSartorius = (w: number, t: number) => t > -0.14 && t < 0.97 && Math.abs(w - (0.55 - 2.5 * t)) < 0.2 * glatt(-0.14, -0.06, t);
  function oberschenkelEinheit(t: number, w: number, s: 'L' | 'R'): number {
    if (imSartorius(w, t)) return ix('sartorius', s);
    if (Math.abs(w) > 2.3 && t > 0.1) {
      // Kniekehle: die Wadenköpfe reichen über das Gelenk, die Beinbeuger laufen als Sehnen seitlich vorbei
      if (Math.PI - Math.abs(w) < 0.55 * glatt(0.8, 0.97, t)) return ix('gastro', s);
      return ix('hamstrings', s);
    }
    const halb = 0.46 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (t + 0.02) / 0.92)))), 0.5);
    if (Math.abs(w - 0.02) < halb) return ix('rect_fem', s);
    // oben zwischen Schneidermuskel und TFL: Ursprung des geraden Quadrizeps am unteren Darmbeinstachel
    if (Math.abs(w - 0.47) < 0.4 * (1 - glatt(0.0, 0.25, t))) return ix('rect_fem', s);
    if (w > 0) return ix('vast_lat', s);
    // innen: vor dem Schneidermuskel der innere Quadrizeps, dahinter die Adduktoren (Grenze folgt seinem Verlauf)
    return ix(w > 0.55 - 2.5 * t ? 'vast_med' : 'adduktoren', s);
  }
  // −1 = nicht zuständig (Rumpf darüber, Unterschenkel darunter)
  const RUMPF = new Set(['lat', 'serratus', 'bauch_s', 'bauch_g', 'strecker']);
  function beckenEinheit(id: string, p: V3, nz: number, u: number, v: number, s: 'L' | 'R'): number {
    const { t, w, radius, beta } = beckenLage(p);
    if (radius > 0.26) return -1;
    if (((w - 0.05) / 0.42) ** 2 + ((t - 0.95) / 0.075) ** 2 < 1) return 0;   // Kniescheibe
    if (t >= 0.99) return -1;
    const seitlich = beta >= 0.4 && beta <= 4.35, unterKamm = seitlich && v <= vKamm(beta);
    // vorn über dem Leistenband: Bauchwand; am Darmbeinstachel übernimmt das Becken
    if (nz > -0.05 && v > vLeiste(u) && !(unterKamm && u > 0.64) && id !== 'lat' && id !== 'serratus') return ix(u < uRect(v) ? 'bauch_g' : 'bauch_s', s);
    if (seitlich && !unterKamm) {
      // über dem Beckenkamm: Gesäß- und Beinanteile der weichen Masken gehören hier zur Bauch- bzw. Rückenwand
      if (RUMPF.has(id)) return -1;
      return ix(beta < 2.4 ? 'bauch_s' : u < 0.27 ? 'strecker' : 'lat', s);
    }
    if (unterKamm) {
      if (beta > 3.4 && u < uKreuz(v) && v > -0.2) return ix('strecker', s);
      if (imSartorius(w, t)) return ix('sartorius', s);
      if (imTFL(w, v)) return ix('glut_med', s);
      const lam = gesLam(beta), oben = vGesOben(lam);
      if (beta >= 0.85 && v >= oben) return ix('glut_med', s);
      if (beta >= 1.6 && v < oben && v > vGesUnten(lam)) return ix('glut_max', s);
      if (t < -0.15) return ix('glut_med', s);               // Darmbein über dem Stachel
    }
    if (t < -0.15) return -1;
    return oberschenkelEinheit(t, w, s);
  }
  function anzeigeEinheit(e: number, p: V3, nz: number, u: number, v: number, s: 'L' | 'R'): number {
    const id = idVon(e);
    // Brust vorn: Brustbein frei, Unterrand vom Schwertfortsatz bogenförmig zur Achsel
    if (nz > -0.05 && BRUSTRAUM.has(id) && u < 1.02 && v > 0.45 && v < 0.93 && !(id === 'delt_v' && u > 0.9)) {
      const unten = 0.53 + 0.22 * Math.pow(Math.min(1, u), 1.6), oben = 0.865 + 0.03 * u;
      if (u > 0.022 && v > unten && v < oben) return ix(v > 0.785 - 0.05 * u ? 'brust_o' : 'brust_u', s);
      if (id === 'brust_o' || id === 'brust_u') {
        if (v >= oben) return u > 0.18 ? ix('trapez_o', s) : 0;
        if (u <= 0.022) return 0;
        if (u >= uRect(v)) { const se = seitenEinheit(p, v, s); if (se >= 0) return se; }
        return ix(u < uRect(v) ? 'bauch_g' : 'bauch_s', s);
      }
    }
    if ((id === 'bauch_g' || id === 'bauch_s' || (id === '' && u > 0.03 && v < 0.53 + 0.22 * Math.pow(Math.min(1, u), 1.6))) && nz > -0.05 && u < 0.6 && v >= 0.45)
      return ix(u < uRect(v) ? 'bauch_g' : 'bauch_s', s);   // auch Maskenlücken am Rippenbogen
    // Becken und Oberschenkel: Grenzen im Koordinatensystem des Oberschenkels (Winkel w um die Achse, Höhe v),
    // damit Beckenkamm, Leistenband, Gesäßfalte und Spanner der Oberschenkelbinde glatt verlaufen
    if (UNTEN.has(id) && v < 0.45 && u < 1.4) {
      const b = beckenEinheit(id, p, nz, u, v, s);
      if (b >= 0) return b;
    }
    if (SEITE.has(id) && u >= uRect(v)) {
      const se = seitenEinheit(p, v, s);
      if (se >= 0) return se;
    }
    // Rücken: Trapez als Raute bis zum 12. Brustwirbel, darunter Lat, auf dem Schulterblatt die Rotatoren
    if (nz < -0.1 && RUECKEN.has(id) && !(id === 'delt_h' && u > 0.85) && u < 1.1 && v > 0.04 && v < 1.06) {
      const trapBreite = v < 0.42 ? -1 : v < 0.82 ? (v - 0.42) / 0.4 * 0.95 : 0.95 - Math.max(0, v - 0.88) / 0.18 * 0.78;
      if (u <= trapBreite + 0.01) return ix(v > 0.86 ? 'trapez_o' : 'trapez_m', s);
      if (u > 0.42 && u < 0.98 && v > 0.6 && v < 0.82) return ix('rotatoren', s);
      if (u < 0.27 - 0.15 * glatt(0.3, 0.44, v) && v < 0.46) return ix('strecker', s);   // Rückenstrecker, oben spitz unter dem Trapez
      const latOben = 0.6 + 0.14 * Math.min(1, u);
      if (v < latOben) return ix('lat', s);
      if (id === 'lat' || id === 'trapez_m' || id === 'rotatoren') return u < 0.3 ? ix('strecker', s) : ix('lat', s);
    }
    // Oberarm: Deltamuskel läuft als V zum Ansatz außen am Oberarm aus; darunter Bizeps vorn, Oberarmmuskel außen
    // unten, Trizeps hinten
    if (OBERARM.has(id) || id.startsWith('delt_') || id === '') {
      const { t, w, radius } = imGlied(oberarm, p);
      // in der gebeugten Ruhehaltung reicht der Oberarm-Zylinder über das Gelenk: dort gilt der Unterarm
      const ua = imGlied(unterarm, p), jenseits = ua.t > 0.0 && ua.radius < 0.09;
      if (t > 0.08 && t < 1.0 && !jenseits && (id !== '' || radius < 0.08)) {   // auch Ringe ohne Maskenabdeckung
        const dw = Math.abs(Math.atan2(Math.sin(w - 1.4), Math.cos(w - 1.4)));
        if (t < 0.47 - 0.36 * Math.min(1, dw / 2.2) ** 1.2) return ix(w > -1.6 && w < 1.15 ? 'delt_v' : w >= 1.15 && w < 2.1 ? 'delt_s' : 'delt_h', s);
        if (Math.abs(w) < 0.95 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.12) / 0.86))) ** 0.4) return ix('bizeps', s);
        if (t > 0.7 && Math.abs(w - 0.95) < 0.5 * glatt(0.7, 0.88, t)) return ix('brachiorad', s);   // Ursprung am Oberarm
        if (w > 0 && w < 1.75 && t > 0.42) return ix('brachialis', s);
        if (Math.abs(w) >= 1.2) return ix('trizeps', s);
        return ix(w > 0 ? 'brachialis' : 'bizeps', s);
      }
    }
    // Unterarm: Oberarmspeichenmuskel daumenseitig vorn, Beuger innen, Strecker außen/hinten
    if (UNTERARM.has(id) || OBERARM.has(id)) {
      const { t, w, radius } = imGlied(unterarm, p);
      if (t > -0.02 && t < 0.93 && radius < 0.09) {
        if (w > 0.15 && w < 1.35 && t < 0.62) return ix('brachiorad', s);
        if (w <= 0.15 && w > -2.2) return ix('ua_beuger', s);
        return ix('ua_strecker', s);
      }
    }
    // Unterschenkel: Wadenmuskel hinten oben, Schollenmuskel darunter und seitlich, Schienbeinmuskel vorn außen,
    // dazwischen die freie Schienbeinkante
    if (UNTEN.has(id)) {
      const { t, w, radius } = imGlied(unterschenkel, p);
      if (t > -0.03 && t < 0.97 && radius < 0.1) {
        const hinten = Math.PI - Math.abs(w);
        // Wadenmuskel: zwei Köpfe mit rundem Unterrand (W-Form), der innere reicht tiefer
        const unten = (w > 0 ? 0.46 : 0.53) - 0.14 * ((hinten - 0.55) / 0.7) ** 2;
        if (hinten < 1.3 && t < unten) return ix('gastro', s);
        // Schienbein frei unter der Haut: oben breiter (Schienbeinkopf, Kniescheibenband), unten schmaler
        const vorn = 0.12 + 0.16 * (1 - glatt(0.04, 0.16, t)), innen = -0.75 - 0.3 * (1 - glatt(0.0, 0.16, t));
        if (w > vorn && w < 1.25 && t < 0.86) return ix('tibialis', s);
        if (w > innen && w <= vorn) return 0;
        return ix('soleus', s);
      }
    }
    return e;
  }

  const pos = new Float32Array(NN2 * 3), einheit = new Uint8Array(NN2), teil = new Int32Array(NN2);
  const sehne = new Float32Array(NN2), phase = new Float32Array(NN2), hautzone = new Float32Array(NN2), hals2 = new Float32Array(NN2);
  for (let i = 0; i < NN2; i++) {
    const t = dreieck[i];
    if (t < 0) continue;
    const ja = T[3 * t], jb = T[3 * t + 1], jc = T[3 * t + 2], a = Q[ja], b = Q[jb], c = Q[jc];
    const w0 = b0[i], w1 = b1[i], w2 = 1 - w0 - w1;
    const x = w0 * P[3 * a] + w1 * P[3 * b] + w2 * P[3 * c], y = w0 * P[3 * a + 1] + w1 * P[3 * b + 1] + w2 * P[3 * c + 1], z = w0 * P[3 * a + 2] + w1 * P[3 * b + 2] + w2 * P[3 * c + 2];
    let nx = w0 * NN[3 * a] + w1 * NN[3 * b] + w2 * NN[3 * c], ny = w0 * NN[3 * a + 1] + w1 * NN[3 * b + 1] + w2 * NN[3 * c + 1], nz = w0 * NN[3 * a + 2] + w1 * NN[3 * b + 2] + w2 * NN[3 * c + 2];
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    pos[3 * i] = x; pos[3 * i + 1] = y; pos[3 * i + 2] = z;

    const liste = auswerten(x, y, z, nx, ny, nz);
    const decke = liste.reduce((s, [, w]) => s + w, 0);
    const p: V3 = [Math.abs(x), y, z], u = p[0] / W, v = (y - yB) / hoeheRumpf;
    const seite = x >= 0 ? 'L' : 'R';
    const e = anzeigeEinheit(liste.length && liste[0][1] >= 1 - decke ? liste[0][0] : 0, p, nz, u, v, seite);
    einheit[i] = e;
    const id = idVon(e);
    let k = 0, s = 0;

    // Anatomische Unterteilungen und Sehnenplatten (in der linken, gespiegelten Anatomie)
    if (id === 'bauch_g') {
      // Sehnenzüge des geraden Bauchmuskels, leicht gewellt: vier Segmente je Seite
      const welle = 0.006 * Math.sin(p[0] * 90);
      for (const h of [0.2, 0.32, 0.43]) if (v + welle / hoeheRumpf > h) k++;
    } else if (id === 'serratus') {
      k = 1 + ((Math.floor(seitenLage(p, v).q) % 8) + 8) % 8;   // ein Finger je Rippe
    } else if (id === 'bizeps') {
      const { t: tt, w } = imGlied(oberarm, p);
      k = w > 0.05 + 0.7 * glatt(0.55, 0.85, tt) ? 1 : 2;     // kurzer und langer Kopf; die Trennung läuft unten seitlich aus
    } else if (id === 'trizeps') {
      const { t: tt, w } = imGlied(oberarm, p), hinten = Math.PI - Math.abs(w);
      k = w > 0 && w < 2.45 ? 1 : 2;                          // seitlicher und langer Kopf
      const halb = 0.24 * (tt - 0.66) / 0.32;
      s = 0.78 * (1 - glatt(halb - 0.03, halb + 0.03, hinten)) * glatt(0.62, 0.68, tt);   // Trizepssehne, nach unten breiter
    } else if (id === 'gastro') {
      const { t: tt, w } = imGlied(unterschenkel, p);
      k = w > 0 ? 1 : 2;                                        // äußerer und innerer Kopf
    } else if (id === 'soleus') {
      const { t: tt, w } = imGlied(unterschenkel, p), hinten = Math.PI - Math.abs(w);
      const breite = 0.5 - 0.3 * glatt(0.45, 0.85, tt);           // Sehnenspiegel unter dem Wadenmuskel → Achillessehne
      s = 0.85 * glatt(0.36, 0.5, tt) * (1 - glatt(breite - 0.06, breite + 0.06, hinten));
    } else if (id === 'tibialis') {
      s = glatt(0.62, 0.8, imGlied(unterschenkel, p).t);
    } else if (id === 'hamstrings') {
      const { t: tt, w } = imGlied(oberschenkel, p);
      if (tt > 0.22) k = w > 0 ? 1 : 2;                        // Bizeps femoris außen, Semitendinosus innen
      s = 0.75 * glatt(0.8, 0.95, tt);
    } else if (id === 'vast_lat') {
      const { t: tt, w } = imGlied(oberschenkel, p);
      s = 0.85 * (1 - glatt(0.16, 0.3, Math.abs(w - 1.62))) * glatt(0.12, 0.3, tt);   // Tractus iliotibialis
    } else if (id === 'ua_beuger' || id === 'ua_strecker' || id === 'brachiorad') {
      const { t: tt, w } = imGlied(unterarm, p);
      s = 0.9 * glatt(0.58, 0.8, tt + 0.07 * Math.sin(3 * w)) * (0.25 + 0.75 * Math.abs(Math.sin(4.5 * w)) ** 0.6);   // Sehnenstränge zum Handgelenk
    } else if ((id === 'lat' || id === 'strecker') && nz < 0) {
      // Rückenfaszie: Raute vom 12. Brustwirbel zum Beckenkamm, darunter das Kreuzbein-Dreieck ganz sehnig
      const breite = v > 0.14 ? 0.4 * Math.max(0, 1 - (v - 0.14) / 0.32) : 0.4 * Math.max(0, 1 - (0.14 - v) / 0.24);
      s = id === 'strecker' && v < 0.14 ? 0.88 : 0.88 * (1 - glatt(breite - 0.015, breite + 0.015, u)) * glatt(0.05, 0.3, -nz);
    } else if (id === 'bauch_s' && nz > -0.2) {
      // Aponeurose des äußeren schrägen Bauchmuskels: schmal neben dem Sixpack, nach unten breiter, Saum am Leistenband
      const rand = uRect(v) + 0.03 + 0.1 * glatt(0.38, 0.05, v);
      const neben = 1 - glatt(rand - 0.015, rand + 0.015, u);
      const leiste = (1 - glatt(0.02, 0.06, v - vLeiste(u))) * (1 - glatt(0.58, 0.66, u));
      s = 0.85 * Math.max(neben, leiste) * (1 - glatt(0.42, 0.52, v));
    } else if (id === 'glut_max') {
      const { beta } = beckenLage(p);
      s = 0.8 * (1 - glatt(1.7, 2.1, beta)) * (1 - glatt(-0.2, -0.1, v));   // außen unten in den Tractus iliotibialis
    } else if (id === 'glut_med') {
      const { w } = beckenLage(p);
      if (imTFL(w, v)) k = 1;                                    // Spanner der Oberschenkelbinde als eigener Bauch
      else s = 0.6 * (1 - glatt(-0.13, -0.05, v));              // Ansatzsehne am großen Rollhügel
    } else if (id === 'trapez_o' || id === 'trapez_m') {
      s = 0.8 * (1 - glatt(0.05, 0.12, u)) * glatt(0.8, 0.88, v) * glatt(0.1, 0.4, -nz);   // Sehnenspiegel am Nacken
    }
    teil[i] = e * 16 + k;
    sehne[i] = e === 0 ? 1 : s;
    if (e) phase[i] = faser(id, p);
    if (id === 'serratus' || (id === 'bauch_s' && v > 0.12)) {
      const L = seitenLage(p, v);
      phase[i] = id === 'serratus' ? L.sl * 190 : (L.X * 0.77 - L.Y * 0.64) * 190;
    }
    // Hautzonen (Kopf, Hände, Füße) wie zur Laufzeit
    const ua = imGlied(unterarm, p);
    hautzone[i] = Math.max(glatt(hals[1] - 0.05, hals[1] - 0.02, y), ua.radius < 0.15 ? glatt(0.9, 0.98, ua.t) : 0, glatt(knoechel[1] + 0.04, knoechel[1] + 0.01, y));
    // Kopfwender (M. sternocleidomastoideus): Wulst vom Warzenfortsatz zum Brustbein
    if (y > hals[1] - 0.12 && y < kopf[1] - 0.01) {
      const tt = (kopf[1] - 0.01 - y) / (kopf[1] - 0.01 - (hals[1] - 0.12));
      const ziel = mischen(1.75, 0.25, tt), win = Math.atan2(p[0], z - (hals[2] + 0.05));
      hals2[i] = (1 - glatt(0.16, 0.34, Math.abs(win - ziel))) * glatt(0, 0.15, tt) * (1 - glatt(0.85, 1, tt));
    }
  }

  // ---------- 2b. Faserverlauf je Muskel an den Gliedmaßen ----------
  // Statt stur parallel zur Gliedachse: Spindel (Fasern laufen zu beiden Sehnen zusammen), Delta (Deltamuskel bündelt
  // sich zum Ansatz am Oberarm), gefiedert (Fasern schräg zu einer Sehne: doppelt mit Mittelsehne, einfach einseitig).
  type Art = 'spindel' | 'delta' | 'doppelt' | 'einfach';
  const AUFBAU: Record<string, [ReturnType<typeof glied>, Art, number]> = {   // Glied, Art, Richtung bei »einfach«
    delt_v: [oberarm, 'delta', 0], delt_s: [oberarm, 'delta', 0], delt_h: [oberarm, 'delta', 0],
    bizeps: [oberarm, 'spindel', 0], brachialis: [oberarm, 'spindel', 0], trizeps: [oberarm, 'spindel', 0],
    brachiorad: [unterarm, 'spindel', 0], ua_beuger: [unterarm, 'spindel', 0], ua_strecker: [unterarm, 'spindel', 0],
    rect_fem: [oberschenkel, 'doppelt', 0], vast_lat: [oberschenkel, 'einfach', 1], vast_med: [oberschenkel, 'einfach', -1],
    hamstrings: [oberschenkel, 'spindel', 0],
    gastro: [unterschenkel, 'doppelt', 0], soleus: [unterschenkel, 'doppelt', 0], tibialis: [unterschenkel, 'einfach', 1],
  };
  {
    const gruppeVon = new Int32Array(NN2).fill(-1), lage = new Float32Array(NN2 * 3);
    const nr = new Map<string, number>(), stat: { cs: number; sn: number; ts: number[] }[] = [];
    for (let i = 0; i < NN2; i++) {
      const e = einheit[i];
      if (dreieck[i] < 0 || !e) continue;
      const id = idVon(e), a = AUFBAU[id];
      if (!a) continue;
      const p: V3 = [Math.abs(pos[3 * i]), pos[3 * i + 1], pos[3 * i + 2]], { t, w, radius } = imGlied(a[0], p);
      // Deltamuskel als ein Fächer, sonst je Muskelkopf (Bizeps, Trizeps, Wade, Beinbeuger) eigener Verlauf
      const k = id.startsWith('delt_') ? `delt|${pos[3 * i] >= 0 ? 'L' : 'R'}` : String(teil[i]);
      let g = nr.get(k);
      if (g === undefined) { g = stat.length; nr.set(k, g); stat.push({ cs: 0, sn: 0, ts: [] }); }
      stat[g].cs += Math.cos(w); stat[g].sn += Math.sin(w); stat[g].ts.push(t);
      gruppeVon[i] = g; lage[3 * i] = t; lage[3 * i + 1] = w; lage[3 * i + 2] = radius;
    }
    const mitte = stat.map(st => {
      st.ts.sort((a, b) => a - b);
      const n = st.ts.length, t0 = st.ts[Math.floor(0.01 * n)], t1 = st.ts[Math.min(n - 1, Math.floor(0.99 * n))];
      return { wc: Math.atan2(st.sn, st.cs), t0, t1: t1 > t0 + 0.02 ? t1 : t0 + 0.02 };
    });
    const DICHTE = 190, SCHRAEG = 0.38;
    for (let i = 0; i < NN2; i++) {
      const g = gruppeVon[i];
      if (g < 0) continue;
      const id = idVon(einheit[i]), [gl, art, richtung] = AUFBAU[id], m = mitte[g];
      const t = lage[3 * i], dw = Math.atan2(Math.sin(lage[3 * i + 1] - m.wc), Math.cos(lage[3 * i + 1] - m.wc));
      const bogen = dw * lage[3 * i + 2], sl = Math.min(1, Math.max(0, (t - m.t0) / (m.t1 - m.t0))), laengs = (t - m.t0) * gl.laenge;
      let ph: number;
      if (art === 'spindel') ph = bogen * DICHTE / (0.42 + 0.58 * Math.sin(Math.PI * sl) ** 0.7);
      else if (art === 'delta') ph = bogen * DICHTE / (0.28 + 0.72 * (1 - sl ** 1.6));
      else {
        const breit = 0.62 + 0.38 * Math.sin(Math.PI * sl) ** 0.7;
        ph = art === 'doppelt'
          ? DICHTE * (Math.abs(bogen) * Math.cos(SCHRAEG) / breit + laengs * Math.sin(SCHRAEG))
          : DICHTE * (bogen * Math.cos(SCHRAEG) / breit + richtung * laengs * Math.sin(SCHRAEG));
        // Mittelsehne des geraden Quadrizeps als feiner heller Streifen in der unteren Hälfte
        if (id === 'rect_fem') sehne[i] = Math.max(sehne[i], 0.55 * (1 - glatt(0.0012, 0.003, Math.abs(bogen))) * glatt(0.3, 0.6, sl));
      }
      phase[i] = ph;
    }
  }

  // ---------- 3. Grenzen: Wechsel von Einheit oder Unterteilung zum Nachbartexel ----------
  const staerke = (ta: number, tb: number) => {
    const ea = ta >> 4, eb = tb >> 4;
    if (ea !== eb) {
      const ia = idVon(ea), ib = idVon(eb);
      const paar = [ia, ib].sort().join('|');
      if (ia === ib) return 0.8;                                 // links/rechts: Linea alba, Brustbein, Wirbelsäule
      if (paar === 'brust_o|brust_u' || paar === 'trapez_m|trapez_o') return 0.3;
      if (ia.startsWith('delt_') && ib.startsWith('delt_')) return 0.35;
      return 1;
    }
    const id = idVon(ea);
    return id === 'bauch_g' ? 0.9 : id === 'serratus' ? 0.7 : 0.45;
  };
  // Helle Faszie nur, wo sie auch anatomisch hell ist: Linea alba und Mittellinien (gleicher Muskel links/rechts),
  // Sehnenzüge des geraden Bauchmuskels. Alle anderen Grenzen sind Furchen (Schatten statt Linie).
  const hellVon = (ta: number, tb: number) => {
    const ea = ta >> 4, eb = tb >> 4;
    if (ea !== eb) return ea && eb && idVon(ea) === idVon(eb) ? 1 : 0;
    return idVon(ea) === 'bauch_g' ? 1 : 0;
  };
  const randPkte: number[] = [], randSt: number[] = [], randHell: number[] = [];
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const i = py * N + px;
    if (dreieck[i] < 0) continue;
    let st = 0, hl = 0, jb = i;
    for (const j of [px + 1 < N ? i + 1 : -1, py + 1 < N ? i + N : -1]) {
      if (j < 0 || dreieck[j] < 0 || teil[j] === teil[i]) continue;
      // nur echte Nachbarn im Raum (UV-Nähte trennen Texel, die im Körper weit auseinanderliegen)
      const d = Math.hypot(pos[3 * i] - pos[3 * j], pos[3 * i + 1] - pos[3 * j + 1], pos[3 * i + 2] - pos[3 * j + 2]);
      if (d > 0.006) continue;
      const sv = staerke(teil[i], teil[j]) * (1 - 0.75 * Math.min(sehne[i], sehne[j]));
      if (sv > st) { st = sv; hl = hellVon(teil[i], teil[j]); jb = j; }
    }
    // Grenzpunkt genau zwischen den beiden Texeln (halbiert die Treppenstufen schräger Grenzen)
    if (st > 0) { randPkte.push((pos[3 * i] + pos[3 * jb]) / 2, (pos[3 * i + 1] + pos[3 * jb + 1]) / 2, (pos[3 * i + 2] + pos[3 * jb + 2]) / 2); randSt.push(st); randHell.push(hl); }
  }

  // ---------- 4. Abstand jedes Texels zur nächsten Grenze (3D, Gitter 2 cm) ----------
  const ZELLE = 0.02, gitter = new Map<string, number[]>();
  const schl = (x: number, y: number, z: number) => `${Math.floor(x / ZELLE)},${Math.floor(y / ZELLE)},${Math.floor(z / ZELLE)}`;
  for (let k = 0; k < randSt.length; k++) {
    const key = schl(randPkte[3 * k], randPkte[3 * k + 1], randPkte[3 * k + 2]);
    (gitter.get(key) ?? gitter.set(key, []).get(key)!).push(k);
  }
  const abstand = new Float32Array(NN2).fill(ZELLE), naechsteSt = new Float32Array(NN2), naechsteHell = new Float32Array(NN2);
  for (let i = 0; i < NN2; i++) {
    if (dreieck[i] < 0) continue;
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    const cx = Math.floor(x / ZELLE), cy = Math.floor(y / ZELLE), cz = Math.floor(z / ZELLE);
    let best = ZELLE * ZELLE, bs = 0, bh = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const liste = gitter.get(`${cx + dx},${cy + dy},${cz + dz}`);
      if (!liste) continue;
      for (const k of liste) {
        const ex = randPkte[3 * k] - x, ey = randPkte[3 * k + 1] - y, ez = randPkte[3 * k + 2] - z, d2 = ex * ex + ey * ey + ez * ez;
        // starke Grenzen zählen etwas näher: so dominiert die echte Muskelgrenze die Unterteilung
        const d2w = d2 / (0.6 + 0.4 * randSt[k]);
        if (d2w < best) { best = d2w; bs = randSt[k]; bh = randHell[k]; }
      }
    }
    abstand[i] = Math.sqrt(best); naechsteSt[i] = bs; naechsteHell[i] = bh;
  }

  // ---------- 4a. Abstandsfeld leicht glätten (Treppen aus dem Texelraster) ----------
  const abstandRoh = abstand.slice();   // für die feinen hellen Linien (würden durch die Glättung verschwinden)
  {
    const RR = 3, kk = Array.from({ length: 2 * RR + 1 }, (_, k) => Math.exp(-(((k - RR) / 1.6) ** 2) / 2));
    const zw = new Float32Array(NN2);
    for (const [quelle, ziel, schritt] of [[abstand, zw, 1], [zw, abstand, N]] as [Float32Array, Float32Array, number][]) {
      const kopie = quelle === abstand ? abstand.slice() : quelle;
      for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
        const i = py * N + px;
        if (dreieck[i] < 0) continue;
        let sw = 0, sv = 0;
        for (let k = -RR; k <= RR; k++) {
          const xx = schritt === 1 ? px + k : px, yy = schritt === 1 ? py : py + k;
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          const j = yy * N + xx;
          if (dreieck[j] < 0) continue;
          const d3 = Math.hypot(pos[3 * i] - pos[3 * j], pos[3 * i + 1] - pos[3 * j + 1], pos[3 * i + 2] - pos[3 * j + 2]);
          if (d3 > 0.008) continue;                                       // UV-Naht: im Körper nicht benachbart
          sw += kk[k + RR]; sv += kk[k + RR] * kopie[j];
        }
        ziel[i] = sw > 0 ? sv / sw : kopie[i];
      }
    }
  }

  // ---------- 4b. Wölbung je Muskel glätten ----------
  // Das Abstandsfeld zur nächsten Grenze hat Grate (Dachform, Pyramiden auf dem Sixpack). Gauß-Glättung im
  // Texturraum, nur innerhalb desselben Muskelteils, rundet die Bäuche ab; die Furche bleibt scharf (eigener Term).
  const wolb = new Float32Array(NN2), tmp = new Float32Array(NN2);
  for (let i = 0; i < NN2; i++) if (dreieck[i] >= 0) wolb[i] = 1 - (1 - Math.min(1, abstand[i] / 0.032)) ** 2.2;
  const R = 12, kern = Array.from({ length: 2 * R + 1 }, (_, k) => Math.exp(-(((k - R) / 6) ** 2) / 2));
  for (const [quelle, ziel, schritt] of [[wolb, tmp, 1], [tmp, wolb, N]] as [Float32Array, Float32Array, number][]) {
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px;
      if (dreieck[i] < 0) continue;
      let sw = 0, sv = 0;
      for (let k = -R; k <= R; k++) {
        const xx = schritt === 1 ? px + k : px, yy = schritt === 1 ? py : py + k;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const j = yy * N + xx;
        if (dreieck[j] < 0 || teil[j] !== teil[i]) continue;   // je Muskelteil: Zacken, Köpfe, Segmente eigene Polster
        sw += kern[k + R]; sv += kern[k + R] * quelle[j];
      }
      ziel[i] = sw > 0 ? sv / sw : quelle[i];
    }
  }

  // ---------- 5. Farbe und Relief ----------
  // Plastik entsteht aus Licht, nicht aus Linien: Muskelbäuche wölben sich, Grenzen sind Furchen (dunkel, im Relief
  // tief), Fasern sind gerundete Bündel mit unregelmäßiger Helligkeit, Sehnenübergänge fiedern entlang der Fasern aus.
  const farbe = new Uint8Array(NN2 * 3), hoehe = new Uint8Array(NN2 * 3), karte = new Uint8Array(NN2 * 4);
  const MUSKEL_D: V3 = [88, 28, 23], MUSKEL_M: V3 = [174, 72, 55], MUSKEL_H: V3 = [228, 140, 112];
  const SEHNE: V3 = [234, 227, 224], KNOCHEN: V3 = [212, 196, 176], FASZIE: V3 = [238, 218, 210];
  const lin = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  let lumSumme = 0, lumAnzahl = 0;
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const i = py * N + px;
    if (dreieck[i] < 0) continue;
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2], e = einheit[i];
    const d = abstand[i], st = naechsteSt[i], hell = naechsteHell[i];
    const bauch = Math.min(wolb[i], 1 - (1 - Math.min(1, d / 0.032)) ** 2.2 + 0.12);   // geglättet, am Rand nicht höher als roh
    const furche = st * (1 - glatt(0.0, 0.011, d)) ** 1.8;                  // ~1 cm breite, weich auslaufende Furche
    const linieHell = hell * st * (1 - glatt(0.0007, 0.0017, abstandRoh[i]));   // helle Faszie (Linea alba, Sehnenzüge), ~3 mm
    const korn = rauschen(x * 400, y * 400, z * 400) - 0.5, wolke = rauschen(x * 25, y * 25, z * 25) - 0.5;
    // Faserstränge (~4 mm) wie gezeichnet: feine dunkle Trennlinie, gerundete Mitte, eigene Helligkeit je Strang,
    // Streifen entlang des Strangs; Breite schwankt. Nur Farbe – im Relief würden sie glitzern.
    let bund = 0.5, naht = 0, strahl = 0, zufall = 0;
    if (e) {
      const ph = phase[i];
      // Phasenänderung je Texel in beiden Richtungen: wo die Textur für feine Stränge zu grob ist, doppelt so breite
      // Stränge (zweite Stufe) statt Ausblenden
      const dx = px + 1 < N && dreieck[i + 1] >= 0 && einheit[i + 1] === e ? Math.abs(phase[i + 1] - ph) : 0;
      const dy = py + 1 < N && dreieck[i + N] >= 0 && einheit[i + N] === e ? Math.abs(phase[i + N] - ph) : 0;
      const nb = Math.max(dx < 0.5 ? dx : 0, dy < 0.5 ? dy : 0);
      const grob = glatt(0.13, 0.2, 1.32 * nb), aa = 1 - glatt(0.15, 0.24, 0.66 * nb);
      const verzug = 0.55 * (rauschen(x * 30, y * 30, z * 30) - 0.5) + 0.18 * (rauschen(x * 140, y * 140, z * 140) - 0.5);
      const strang = (f: number) => {
        const q = f * ph + verzug, idx = Math.floor(q), fr = q - idx, rand = hash(idx, e, 11);
        const breite = 0.08 + 0.08 * rand;                                     // halbe Trennlinie im Strangmaß
        return { naht: 1 - glatt(0.3 * breite, breite, Math.min(fr, 1 - fr)), bund: Math.sin(Math.PI * fr) ** 0.7 - 0.6,
          zufall: hash(idx, e, 7) - 0.5, strahl: rauschen(x * 70 + idx * 1.7, y * 70 + idx * 0.9, z * 70) - 0.5 };
      };
      const fein = strang(1.32), breit = strang(0.66);
      const m = (a: number, b: number) => mischen(a, b, grob) * aa;
      naht = m(fein.naht, breit.naht); bund = 0.5 + m(fein.bund, breit.bund);
      zufall = m(fein.zufall, breit.zufall); strahl = m(fein.strahl, breit.strahl);
    }
    // Sehne: Übergang fiedert entlang der Bündel aus statt als weicher Verlauf
    const sRoh = sehne[i];
    let s = sRoh;
    if (e) {
      const fieder = idVon(e) === 'bauch_s' ? 0.15 : 0.6;
      s = Math.min(1, Math.max(0, sRoh + fieder * (0.5 * (bund - 0.5) + 0.35 * strahl) * 4 * sRoh * (1 - sRoh)));
      s = Math.min(0.95, glatt(0.12, 0.88, s));
    }
    // Muskel: Wölbung hell, Furche tief und satt; Bündel, Streifen, Wolken und Korn brechen die Gleichförmigkeit
    const licht = 0.2 + 0.6 * bauch + 0.13 * (bund - 0.5) + 0.12 * zufall + 0.07 * strahl + 0.06 * wolke + 0.02 * korn - 0.17 * naht - 0.24 * furche;
    const l = Math.min(1, Math.max(0, licht));
    const muskel: V3 = [0, 1, 2].map(k => l < 0.5 ? mischen(MUSKEL_D[k], MUSKEL_M[k], l / 0.5) : mischen(MUSKEL_M[k], MUSKEL_H[k], (l - 0.5) / 0.5)) as V3;
    // Sehne perlmuttartig mit Faserstreifen, Knochen elfenbeinfarben
    const sh = 0.94 + 0.03 * (bund - 0.5) + 0.04 * strahl + 0.03 * wolke + 0.02 * korn - 0.04 * naht - 0.1 * furche;
    const basis = e === 0 ? KNOCHEN : SEHNE;
    const c: V3 = [0, 1, 2].map(k => {
      let v = mischen(muskel[k], basis[k] * sh, s);
      v = mischen(v, FASZIE[k], 0.75 * linieHell);
      return Math.max(0, Math.min(255, v));
    }) as V3;
    farbe[3 * i] = c[0]; farbe[3 * i + 1] = c[1]; farbe[3 * i + 2] = c[2];
    if (e && s < 0.2) { lumSumme += 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); lumAnzahl++; }
    // Relief nur grob: Bauch hoch, Furche tief (Fasern stecken in der Farbe). G = Furchentiefe für Glanzdämpfung
    const h = 0.5 + (1 - s) * 0.3 * bauch - 0.2 * furche + 0.28 * hals2[i];
    hoehe[3 * i] = Math.max(0, Math.min(255, Math.round(h * 255)));
    hoehe[3 * i + 1] = Math.round(255 * Math.min(1, furche));
    karte[4 * i] = e; karte[4 * i + 1] = Math.round(255 * (1 - s)); karte[4 * i + 2] = Math.round(255 * hautzone[i]); karte[4 * i + 3] = 255;
  }
  console.log(`${g}: mittlere Muskel-Luminanz (linear) ${(lumSumme / Math.max(1, lumAnzahl)).toFixed(3)}`);

  // ---------- 6. Ränder der UV-Inseln auffüllen (für Mipmaps und bilineares Filtern) ----------
  const belegt = new Uint8Array(NN2);
  for (let i = 0; i < NN2; i++) belegt[i] = dreieck[i] >= 0 ? 1 : 0;
  for (let runde = 0; runde < 8; runde++) {
    const neu: number[] = [];
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px;
      if (belegt[i]) continue;
      for (const j of [px > 0 ? i - 1 : -1, px + 1 < N ? i + 1 : -1, py > 0 ? i - N : -1, py + 1 < N ? i + N : -1]) {
        if (j >= 0 && belegt[j] === 1) { neu.push(i, j); break; }
      }
    }
    for (let k = 0; k < neu.length; k += 2) {
      const i = neu[k], j = neu[k + 1];
      farbe.copyWithin(3 * i, 3 * j, 3 * j + 3); hoehe.copyWithin(3 * i, 3 * j, 3 * j + 3); karte.copyWithin(4 * i, 4 * j, 4 * j + 4);
    }
    for (let k = 0; k < neu.length; k += 2) belegt[neu[k]] = 1;
  }
  console.log(`${g}: ${randSt.length} Grenzpunkte, ${(belegt.reduce((a, b) => a + b, 0) / NN2 * 100).toFixed(0)} % belegt`);
  return { n: N, farbe, hoehe, karte };
}
