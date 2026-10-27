// Muskelmasken auf dem realistischen Körpernetz.
//
// Jeder Punkt erhält bis zu vier (Einheit, Gewicht)-Paare. Die Regionen sind relativ zu den Gelenken und
// zur Flächennormalen definiert und funktionieren daher für Mann und Frau. Die eigentliche Form des
// Muskelwachstums stammt aus den künstlerisch modellierten MakeHuman-Formen; die Masken entscheiden nur,
// WELCHER Muskel an einem Punkt die Muskulatur steuert.

import { einheitIndex, type Seite } from '../engine/muskeln';
import type { FormNetz } from './daten';

export const MAX_JE_PUNKT = 4;
export interface Masken {
  einheit: Uint8Array;     // punkte × 4
  gewicht: Float32Array;   // punkte × 4, Summe ≤ 1
}

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const glatt = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Weiches Fenster: ≈1 zwischen a und b, Übergänge der Breite 2s
const fenster = (x: number, a: number, b: number, s: number) => glatt(a - s, a + s, x) * (1 - glatt(b - s, b + s, x));
const ueber = (x: number, a: number, s = 0.12) => glatt(a - s, a + s, x);
const unter = (x: number, a: number, s = 0.12) => 1 - glatt(a - s, a + s, x);

export function normalen(punkte: Float32Array, dreieckeGemeinsam: ArrayLike<number>, out: Float32Array = new Float32Array(punkte.length)): Float32Array {
  out.fill(0);
  for (let t = 0; t < dreieckeGemeinsam.length; t += 3) {
    const a = 3 * dreieckeGemeinsam[t], b = 3 * dreieckeGemeinsam[t + 1], c = 3 * dreieckeGemeinsam[t + 2];
    const e1x = punkte[b] - punkte[a], e1y = punkte[b + 1] - punkte[a + 1], e1z = punkte[b + 2] - punkte[a + 2];
    const e2x = punkte[c] - punkte[a], e2y = punkte[c + 1] - punkte[a + 1], e2z = punkte[c + 2] - punkte[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    out[a] += nx; out[a + 1] += ny; out[a + 2] += nz;
    out[b] += nx; out[b + 1] += ny; out[b + 2] += nz;
    out[c] += nx; out[c + 1] += ny; out[c + 2] += nz;
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= l; out[i + 1] /= l; out[i + 2] /= l;
  }
  return out;
}

export function gemeinsameDreiecke(netz: FormNetz): Uint16Array {
  const d = new Uint16Array(netz.dreiecke.length);
  for (let i = 0; i < d.length; i++) d[i] = netz.quelle[netz.dreiecke[i]];
  return d;
}

// Gliedmaße als Segment mit lokalem Rahmen: Achse u, vorn f, außen l (für die linke Körperseite)
interface Glied { a: V3; u: V3; f: V3; l: V3; laenge: number }
function glied(a: V3, b: V3): Glied {
  const d = sub(b, a), laenge = Math.hypot(...d), u = norm(d);
  const f = norm(sub([0, 0, 1], u.map(x => x * u[2]) as V3));
  return { a, u, f, l: norm(cross(f, u)), laenge };
}
function inGlied(g: Glied, p: V3, n: V3) {
  const d = sub(p, g.a), t = dot(d, g.u) / g.laenge;
  const r = sub(d, g.u.map(x => x * t * g.laenge) as V3);
  return { t, radius: Math.hypot(...r), nf: dot(n, g.f), nl: dot(n, g.l) };
}

export function berechneMasken(netz: FormNetz, gelenke: Record<string, V3>): Masken {
  const n = netz.punkte, P = netz.grund;
  const N = normalen(P, gemeinsameDreiecke(netz));
  const J = (name: string): V3 => gelenke[name] ?? (() => { throw new Error('Gelenk fehlt: ' + name); })();

  // Linke Seite (x > 0); die rechte wird gespiegelt ausgewertet
  const schulter = J('l-shoulder'), ellbogen = J('l-elbow'), hand = J('l-hand');
  const huefte = J('l-upper-leg'), knie = J('l-knee'), knoechel = J('l-ankle');
  const becken = J('pelvis'), hals = J('neck');
  const oberarm = glied(schulter, ellbogen), unterarm = glied(ellbogen, hand);
  const oberschenkel = glied(huefte, knie), unterschenkel = glied(knie, knoechel);
  const W = schulter[0], yB = becken[1], hoeheRumpf = hals[1] - yB;

  // Liefert die Masken der linken Anatomie für einen (gespiegelten) Punkt
  function links(p: V3, nv: V3): [string, number][] {
    const out: [string, number][] = [];
    const add = (id: string, w: number) => { if (w > 0.02) out.push([id, w]); };

    // --- Arme ---
    const oa = inGlied(oberarm, p, nv);
    const ua = inGlied(unterarm, p, nv);
    const armOben = fenster(oa.t, 0.05, 1.02, 0.08) * unter(oa.radius, 0.085, 0.015);
    const armUnten = fenster(ua.t, 0.0, 0.9, 0.07) * unter(ua.radius, 0.07, 0.012);
    const schulterKappe = fenster(oa.t, -0.12, 0.42, 0.1) * unter(oa.radius, 0.105, 0.02) * ueber(p[1], schulter[1] - 0.16, 0.03);
    // Deltamuskel: drei Köpfe nach Blickrichtung der Fläche
    add('delt_v', schulterKappe * ueber(oa.nf, 0.2, 0.2));
    add('delt_h', schulterKappe * unter(oa.nf, -0.2, 0.2));
    add('delt_s', schulterKappe * fenster(oa.nf, -0.35, 0.35, 0.15) * ueber(oa.nl, -0.1, 0.25));
    const oberarmRumpf = armOben * (1 - glatt(0.2, 0.45, schulterKappe));
    add('bizeps', oberarmRumpf * ueber(oa.nf, 0.25, 0.2) * fenster(oa.t, 0.22, 0.94, 0.08));
    add('brachialis', oberarmRumpf * fenster(oa.nf, -0.3, 0.35, 0.15) * ueber(oa.nl, 0.25, 0.2) * fenster(oa.t, 0.45, 0.98, 0.08));
    add('trizeps', oberarmRumpf * unter(oa.nf, -0.05, 0.25));
    add('brachiorad', armUnten * fenster(ua.t, 0.0, 0.55, 0.08) * ueber(ua.nf, 0.15, 0.25) * ueber(ua.nl, -0.2, 0.25));
    add('ua_beuger', armUnten * unter(ua.nl, -0.05, 0.3) * (1 - 0.6 * fenster(ua.t, 0.0, 0.5, 0.08) * ueber(ua.nf, 0.3, 0.2)));
    add('ua_strecker', armUnten * ueber(ua.nl, 0.05, 0.3) * unter(ua.nf, 0.35, 0.25));

    // --- Beine ---
    const os = inGlied(oberschenkel, p, nv);
    const us = inGlied(unterschenkel, p, nv);
    const beinOben = fenster(os.t, 0.08, 0.97, 0.06) * unter(os.radius, 0.13, 0.02);
    const beinUnten = fenster(us.t, 0.04, 0.86, 0.05) * unter(us.radius, 0.09, 0.015);
    add('rect_fem', beinOben * ueber(os.nf, 0.72, 0.12) * fenster(os.t, 0.1, 0.85, 0.08));
    add('vast_lat', beinOben * ueber(os.nl, 0.15, 0.2) * ueber(os.nf, -0.35, 0.2) * fenster(os.t, 0.12, 0.92, 0.08));
    add('vast_med', beinOben * unter(os.nl, -0.05, 0.2) * ueber(os.nf, 0.05, 0.2) * fenster(os.t, 0.52, 0.98, 0.07));
    add('adduktoren', beinOben * unter(os.nl, -0.3, 0.2) * fenster(os.nf, -0.6, 0.45, 0.2) * fenster(os.t, 0.0, 0.62, 0.08));
    add('hamstrings', beinOben * unter(os.nf, -0.3, 0.2) * fenster(os.t, 0.18, 0.95, 0.07));
    add('gastro', beinUnten * unter(us.nf, -0.15, 0.2) * fenster(us.t, 0.06, 0.55, 0.07));
    add('soleus', beinUnten * unter(us.nf, 0.1, 0.3) * fenster(us.t, 0.42, 0.86, 0.07) * (us.nf < -0.5 ? 0.6 : 1));
    add('tibialis', beinUnten * ueber(us.nf, 0.25, 0.2) * ueber(us.nl, -0.15, 0.2) * fenster(us.t, 0.1, 0.8, 0.07));

    // --- Rumpf (nicht auf Armen oder Beinen) ---
    const glied_ = Math.max(armOben, armUnten, schulterKappe * 0.9, beinOben * ueber(os.t, 0.15, 0.08), beinUnten);
    const rumpf = 1 - Math.min(1, glied_);
    const u = p[0] / W, v = (p[1] - yB) / hoeheRumpf;
    const [nx, ny, nz] = nv;
    add('brust_o', rumpf * ueber(nz, 0.25, 0.2) * fenster(u, 0.04, 0.88, 0.06) * fenster(v, 0.72, 0.86, 0.04));
    add('brust_u', rumpf * ueber(nz, 0.2, 0.2) * fenster(u, 0.04, 0.9, 0.06) * fenster(v, 0.5, 0.73, 0.05));
    add('serratus', rumpf * ueber(nx, 0.35, 0.2) * ueber(nz, -0.15, 0.2) * fenster(v, 0.42, 0.62, 0.05) * ueber(u, 0.55, 0.08));
    add('bauch_g', rumpf * ueber(nz, 0.4, 0.2) * fenster(u, -0.1, 0.3, 0.06) * fenster(v, -0.1, 0.5, 0.05));
    add('bauch_s', rumpf * ueber(nz, -0.3, 0.25) * fenster(u, 0.32, 1.1, 0.07) * fenster(v, -0.02, 0.47, 0.05));
    add('lat', rumpf * unter(nz, 0.15, 0.2) * fenster(u, 0.25, 1.1, 0.08) * fenster(v, 0.3, 0.78, 0.05));
    add('trapez_m', rumpf * unter(nz, -0.3, 0.2) * fenster(u, -0.1, 0.55, 0.07) * fenster(v, 0.58, 0.9, 0.05));
    add('trapez_o', rumpf * (ueber(ny, 0.25, 0.2) + unter(nz, -0.2, 0.2)) * 0.6 * fenster(u, 0.06, 0.85, 0.07) * fenster(v, 0.86, 1.07, 0.04));
    add('strecker', rumpf * unter(nz, -0.4, 0.2) * fenster(u, -0.1, 0.28, 0.06) * fenster(v, -0.05, 0.62, 0.05));
    // Gesäß: unterhalb des Beckens, rückwärts gerichtet
    const ug = p[0] / (huefte[0] + 0.09), vg = (p[1] - (huefte[1] - 0.15)) / 0.27;
    const gesaess = (1 - Math.min(1, beinUnten + armOben + armUnten)) * (1 - 0.7 * beinOben * ueber(os.t, 0.32, 0.06));
    add('glut_max', gesaess * unter(nz, -0.15, 0.2) * fenster(ug, -0.1, 1.0, 0.08) * fenster(vg, 0.0, 1.0, 0.08));
    add('glut_med', gesaess * ueber(nx, 0.3, 0.2) * unter(nz, 0.35, 0.2) * fenster(p[1], yB - 0.03, yB + 0.11, 0.025) * fenster(p[0], huefte[0] - 0.02, huefte[0] + 0.14, 0.02));
    return out;
  }

  const einheit = new Uint8Array(n * MAX_JE_PUNKT), gewicht = new Float32Array(n * MAX_JE_PUNKT);
  const rumpfIds = new Set(['brust_o', 'brust_u', 'bauch_g', 'bauch_s', 'trapez_m', 'trapez_o', 'strecker', 'lat', 'glut_max']);
  for (let i = 0; i < n; i++) {
    const x = P[3 * i], p: V3 = [Math.abs(x), P[3 * i + 1], P[3 * i + 2]], nv: V3 = [x < 0 ? -N[3 * i] : N[3 * i], N[3 * i + 1], N[3 * i + 2]];
    const seite: Seite = x >= 0 ? 'L' : 'R';
    const liste: [number, number][] = [];
    // An der Mittellinie gehen linke und rechte Rumpfmuskeln weich ineinander über
    const anteilL = glatt(-0.012, 0.012, x);
    for (const [id, w] of links(p, nv)) {
      if (rumpfIds.has(id) && Math.abs(x) < 0.012) {
        liste.push([einheitIndex(id, 'L'), w * anteilL], [einheitIndex(id, 'R'), w * (1 - anteilL)]);
      } else liste.push([einheitIndex(id, seite), w]);
    }
    liste.sort((a, b) => b[1] - a[1]);
    const auswahl = liste.slice(0, MAX_JE_PUNKT);
    const summe = auswahl.reduce((s, e) => s + e[1], 0);
    const teiler = summe > 1 ? summe : 1;
    auswahl.forEach(([e, w], k) => { einheit[i * MAX_JE_PUNKT + k] = e; gewicht[i * MAX_JE_PUNKT + k] = w / teiler; });
  }
  return { einheit, gewicht };
}

// Hauptmuskel je Punkt (für Farbe der Atlas-Ansicht und Auswahl per Antippen)
export function hauptEinheit(m: Masken, i: number, schwelle = 0.25): number {
  return m.gewicht[i * MAX_JE_PUNKT] >= schwelle ? m.einheit[i * MAX_JE_PUNKT] : 0;
}

// Zusatzdaten für die Anatomie-Ansicht: Faserphase je Punkt (Streifen entlang der Muskelfasern), Furchen an
// Muskelgrenzen und der Anteil des geraden Bauchmuskels (für die Sehnenzüge des Sixpacks).
export interface Anatomie {
  phase: Float32Array;    // Koordinate quer zur Faser in »Streifen«: sin(2π·phase) zeichnet die Fasern
  rille: Float32Array;    // 0 = mitten im Muskel, 1 = Grenze zwischen zwei Muskeln oder Muskel und Sehne
  rilleHaut: Float32Array; // nur Grenzen, die man bei wenig Fett durch die Haut sieht (Muskel an Muskel)
  bauch: Float32Array;    // Gewicht des geraden Bauchmuskels
}

const FASERN_JE_METER = 75;

// Faserverlauf: entlang einer Achse (Gliedmaßen, gerade Rumpfmuskeln) oder fächerförmig zu einem Ansatz
type Verlauf = { art: 'achse'; a: V3; u: V3; radius: number } | { art: 'faecher'; z: V3; ebene: V3 };

export function berechneAnatomie(netz: FormNetz, gelenke: Record<string, V3>, m: Masken, idVon: (einheit: number) => string): Anatomie {
  const n = netz.punkte, P = netz.grund;
  const J = (name: string): V3 => gelenke[name];
  const schulter = J('l-shoulder'), ellbogen = J('l-elbow'), hand = J('l-hand');
  const huefte = J('l-upper-leg'), knie = J('l-knee'), knoechel = J('l-ankle'), becken = J('pelvis');
  const W = schulter[0], zMitte = becken[2];
  const plus = (a: V3, b: V3, k = 1): V3 => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
  const achse = (a: V3, b: V3, radius: number): Verlauf => ({ art: 'achse', a, u: norm(sub(b, a)), radius });
  const fest = (u: V3, a: V3, radius: number): Verlauf => ({ art: 'achse', a, u: norm(u), radius });
  const faecher = (z: V3, ebene: V3): Verlauf => ({ art: 'faecher', z, ebene: norm(ebene) });
  const rumpf: V3 = [0, becken[1], zMitte];
  const trochanter: V3 = [huefte[0] + 0.07, huefte[1] - 0.1, huefte[2] - 0.02];
  const VERLAUF: Record<string, Verlauf> = {
    delt_v: achse(schulter, ellbogen, 0.06), delt_s: achse(schulter, ellbogen, 0.06), delt_h: achse(schulter, ellbogen, 0.06),
    bizeps: achse(schulter, ellbogen, 0.05), trizeps: achse(schulter, ellbogen, 0.05), brachialis: achse(schulter, ellbogen, 0.05),
    brachiorad: achse(ellbogen, hand, 0.04), ua_beuger: achse(ellbogen, hand, 0.04), ua_strecker: achse(ellbogen, hand, 0.04),
    rect_fem: achse(huefte, knie, 0.08), vast_lat: achse(huefte, knie, 0.08), vast_med: achse(huefte, knie, 0.08), hamstrings: achse(huefte, knie, 0.08),
    adduktoren: faecher(plus(huefte, sub(knie, huefte), 0.55), [-1, 0, 0]),
    gastro: achse(knie, knoechel, 0.055), soleus: achse(knie, knoechel, 0.055), tibialis: achse(knie, knoechel, 0.055),
    brust_o: faecher([schulter[0], schulter[1] - 0.02, schulter[2] + 0.04], [0, 0, 1]),
    brust_u: faecher([schulter[0], schulter[1] - 0.06, schulter[2] + 0.04], [0, 0, 1]),
    serratus: faecher([W * 0.5, schulter[1] - 0.1, schulter[2] - 0.12], [1, 0, 0]),
    bauch_g: fest([0, 1, 0], rumpf, 0.16), strecker: fest([0, 1, 0], rumpf, 0.16),
    bauch_s: fest([0.6, 0.8, 0.15], rumpf, 0.15),
    lat: faecher([W * 0.85, schulter[1] - 0.1, schulter[2] - 0.04], [0, 0, -1]),
    trapez_o: faecher(schulter, [0, 0.4, -1]), trapez_m: fest([1, 0.25, 0], [0, schulter[1] - 0.1, zMitte], 0.12),
    glut_max: faecher(trochanter, [0, 0, -1]), glut_med: faecher(trochanter, [1, 0, 0]),
  };

  // Mitte jedes Muskels (linke Seite, gespiegelt) als Bezug für die Fächerwinkel
  const mitte = new Map<string, [number, number, number, number]>();
  for (let i = 0; i < n; i++) {
    if (m.gewicht[i * MAX_JE_PUNKT] < 0.5) continue;
    const id = idVon(m.einheit[i * MAX_JE_PUNKT]), s = mitte.get(id) ?? [0, 0, 0, 0];
    s[0] += Math.abs(P[3 * i]); s[1] += P[3 * i + 1]; s[2] += P[3 * i + 2]; s[3]++;
    mitte.set(id, s);
  }
  const bezug = new Map<string, { e1: V3; e2: V3; r: number }>();
  for (const [id, v] of Object.entries(VERLAUF)) {
    const c = mitte.get(id);
    if (v.art !== 'faecher' || !c) continue;
    const d = sub([c[0] / c[3], c[1] / c[3], c[2] / c[3]], v.z);
    const flach = sub(d, v.ebene.map(x => x * dot(d, v.ebene)) as V3);
    const e1 = norm(flach);
    bezug.set(id, { e1, e2: norm(cross(v.ebene, e1)), r: Math.hypot(...flach) });
  }
  // Fester Querbezug je Achse, damit der Umfangswinkel stetig bleibt
  const quer = (u: V3): V3 => norm(Math.abs(u[2]) < 0.9 ? cross(u, [0, 0, 1]) : cross(u, [1, 0, 0]));

  const phase = new Float32Array(n), rille = new Float32Array(n), bauch = new Float32Array(n);
  const herr = new Int16Array(n);   // stärkster Anteil je Punkt (0 = Sehne/Haut)
  for (let i = 0; i < n; i++) {
    const x = P[3 * i], p: V3 = [Math.abs(x), P[3 * i + 1], P[3 * i + 2]];
    const gewichte: [number, number][] = [];
    let summe = 0;
    for (let k = 0; k < MAX_JE_PUNKT; k++) {
      const w = m.gewicht[i * MAX_JE_PUNKT + k];
      if (w === 0) break;
      const e = m.einheit[i * MAX_JE_PUNKT + k];
      gewichte.push([e, w]); summe += w;
      if (idVon(e) === 'bauch_g') bauch[i] += w;
    }
    // Faserphase des stärksten Muskels
    const id = gewichte.length ? idVon(gewichte[0][0]) : '', v = VERLAUF[id];
    if (v?.art === 'achse') {
      const d = sub(p, v.a), r = sub(d, v.u.map(c => c * dot(d, v.u)) as V3);
      const f = quer(v.u), l = cross(v.u, f);
      const winkel = Math.atan2(dot(r, l), dot(r, f));
      // ganzzahlige Streifenzahl rundherum: der Sprung bei ±π ändert sin(2π·phase) nicht
      phase[i] = winkel / (2 * Math.PI) * Math.round(2 * Math.PI * v.radius * FASERN_JE_METER);
    } else if (v?.art === 'faecher' && bezug.has(id)) {
      const b = bezug.get(id)!, d = sub(p, v.z);
      phase[i] = Math.atan2(dot(d, b.e2), dot(d, b.e1)) * b.r * FASERN_JE_METER;
    }
    herr[i] = gewichte.length && gewichte[0][1] >= 1 - summe ? gewichte[0][0] : 0;
  }
  // Furche = Punkte, an deren Kanten der stärkste Anteil wechselt: schmale Linie statt breiter Mischzone
  const rilleHaut = new Float32Array(n);
  // Köpfe desselben Muskels trennt man durch die Haut nicht (obere/untere Brust)
  const UNSICHTBAR = new Set(['brust_o|brust_u', 'brust_u|brust_o']);
  const sichtbar = (a: number, b: number) => a !== 0 && b !== 0 && !UNSICHTBAR.has(idVon(a) + '|' + idVon(b));
  const d = gemeinsameDreiecke(netz);
  for (let t = 0; t < d.length; t += 3) {
    const ecken = [d[t], d[t + 1], d[t + 2]];
    for (let k = 0; k < 3; k++) {
      const a = ecken[k], b = ecken[(k + 1) % 3];
      if (herr[a] === herr[b]) continue;
      rille[a] = rille[b] = 1;
      if (sichtbar(herr[a], herr[b])) rilleHaut[a] = rilleHaut[b] = 1;
    }
  }
  // Weich ausblenden: einige Glättungsschritte über die Nachbarn, damit die Furche nicht den Dreieckskanten folgt
  const nachbarn: number[][] = Array.from({ length: n }, () => []);
  for (let t = 0; t < d.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = d[t + k], b = d[t + (k + 1) % 3];
    nachbarn[a].push(b); nachbarn[b].push(a);
  }
  const glaette = (f: Float32Array, schritte: number): Float32Array => {
    let x: Float32Array = f, y: Float32Array = new Float32Array(n);
    for (let s = 0; s < schritte; s++) {
      for (let i = 0; i < n; i++) {
        const nb = nachbarn[i];
        let m = 0;
        for (const j of nb) m += x[j];
        y[i] = nb.length ? 0.4 * x[i] + 0.6 * m / nb.length : x[i];
      }
      [x, y] = [y, x];
    }
    return x;
  };
  return { phase, rille: glaette(rille, 2), rilleHaut: glaette(rilleHaut, 3), bauch };
}
