// Verformung des Körpers: pro Punkt eine Muskulatur μ und ein Körperfett ω (beide 0..1, 0,5 = MakeHuman-Mittel).
// Position = Grundform + Σ a_i(μ) · b_j(ω) · Differenz_ij  (bilineare Mischung der 3×3 MakeHuman-Formen).

import { FORM_STUFEN, GEWICHT_STUFEN, type FormNetz } from './daten';
import { MAX_JE_PUNKT, normalen, gemeinsameDreiecke, type Masken } from './masken';
import { haute, type Haut } from './pose';

// Gewichte der drei Stufen (min, mittel, max) für einen Wert 0..1. Oberhalb von 1 wird die Max-Form linear
// verlängert (bis 1,5) – für die stilisierte »Beast«-Entwicklung im Arcade-Modus.
export const MU_MAX = 1.5;
export function stufen(x: number, out: Float32Array | number[] = [0, 0, 0]) {
  const v = Math.min(MU_MAX, Math.max(0, x));
  if (v < 0.5) { out[0] = (0.5 - v) / 0.5; out[1] = v / 0.5; out[2] = 0; }
  else { out[0] = 0; out[1] = (1 - v) / 0.5; out[2] = (v - 0.5) / 0.5; }
  return out;
}

interface Kombination { m: number; g: number; d: Float32Array }

// V-Form: Ein trainierter Oberkörper wird breiter (Latissimus, Schultern, Brustkorb), die Taille bleibt. MakeHumans
// Muskelformen verbreitern den Rumpf unter der Achsel praktisch nicht; dieses Feld liefert je Punkt die Verschiebung
// bei voller Breite (b = 1): der Rumpf wird nach Höhe gewichtet seitlich gestreckt und etwas tiefer, die Arme rücken
// als Ganzes mit der Schulter nach außen (Armanteil aus den Knochengewichten der Haltung).
export interface BreitenFeld { fx: Float32Array; fz: Float32Array; links: Uint8Array }
export const BREITE_SEITLICH = 0.2, BREITE_TIEFE = 0.07;
export function breitenFeld(netz: FormNetz, gelenke: Record<string, [number, number, number]>, haut?: Haut, knochen?: { name: string }[]): BreitenFeld {
  const n = netz.punkte, P = netz.grund;
  const yB = gelenke['pelvis'][1], H = gelenke['neck'][1] - yB, schulter = gelenke['l-shoulder'];
  const glatt = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // Höhenprofil: Hüfte fest, voll vom Rippenbogen bis zur Achsel, zum Hals hin auslaufend
  const profil = (v: number) => glatt(0.15, 0.6, v) * (1 - 0.65 * glatt(0.85, 1.0, v)) * (1 - glatt(1.0, 1.06, v));
  const tiefe = (v: number) => glatt(0.3, 0.55, v) * (1 - glatt(0.8, 0.95, v));
  // Rumpfmitte (z) je Höhe
  const zMitte: number[] = [];
  for (let b = 0; b <= 24; b++) {
    const vb = -0.1 + 0.05 * b; let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
      if (Math.abs((P[3 * i + 1] - yB) / H - vb) > 0.025 || Math.abs(P[3 * i]) > 0.6 * schulter[0]) continue;
      lo = Math.min(lo, P[3 * i + 2]); hi = Math.max(hi, P[3 * i + 2]);
    }
    zMitte.push(Number.isFinite(lo) ? (lo + hi) / 2 : gelenke['pelvis'][2]);
  }
  const rumpfZ = (v: number) => { const q = Math.min(23.999, Math.max(0, (v + 0.1) / 0.05)), k = Math.floor(q); return zMitte[k] + (zMitte[k + 1] - zMitte[k]) * (q - k); };
  // Armanteil je Punkt: Gewichte der Arm-Knochen (Schlüsselbein halb)
  const armGewicht = (knochen ?? []).map(k => (k.name.startsWith('clavicle') ? 0.5 : k.name === 'rumpf' ? 0 : 1));
  const arm = (i: number) => {
    if (!haut || !armGewicht.length) return glatt(0.9 * schulter[0], 1.15 * schulter[0], Math.abs(P[3 * i]));
    let a = 0;
    for (let k = 0; k < 4; k++) a += haut.gew[4 * i + k] * (armGewicht[haut.idx[4 * i + k]] ?? 0);
    return Math.min(1, a);
  };
  const vSchulter = (schulter[1] - yB) / H, armVersatz = BREITE_SEITLICH * profil(vSchulter) * schulter[0];
  const fx = new Float32Array(n), fz = new Float32Array(n), links = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = P[3 * i], v = (P[3 * i + 1] - yB) / H, a = arm(i), s = x >= 0 ? 1 : -1;
    links[i] = x >= 0 ? 1 : 0;
    fx[i] = (1 - a) * BREITE_SEITLICH * profil(v) * x + a * s * armVersatz;
    fz[i] = (1 - a) * BREITE_TIEFE * tiefe(v) * (P[3 * i + 2] - rumpfZ(v));
  }
  return { fx, fz, links };
}

export class Verformer {
  readonly netz: FormNetz;
  readonly ruhe: Float32Array;         // gemeinsame Punkte in der Ruhehaltung (A-Pose), nach der Muskelverformung
  readonly pos: Float32Array;          // gemeinsame Punkte, ggf. in Pose
  readonly nor: Float32Array;
  readonly posUV: Float32Array;        // aufgefächert auf UV-Punkte (für die GPU)
  readonly norUV: Float32Array;
  private readonly kombi: Kombination[];
  private readonly dreieckeG: Uint16Array;

  constructor(netz: FormNetz) {
    this.netz = netz;
    this.ruhe = new Float32Array(netz.grund);
    this.pos = new Float32Array(netz.grund);
    this.nor = new Float32Array(netz.grund.length);
    this.posUV = new Float32Array(netz.quelle.length * 3);
    this.norUV = new Float32Array(netz.quelle.length * 3);
    this.dreieckeG = gemeinsameDreiecke(netz);
    this.kombi = [];
    FORM_STUFEN.forEach((m, mi) => GEWICHT_STUFEN.forEach((g, gi) => {
      const d = netz.formen.get(`${m}|${g}`);
      if (d) this.kombi.push({ m: mi, g: gi, d });
    }));
  }

  private pose: { haut: Haut; matrizen: Float32Array } | null = null;
  private breite: { feld: BreitenFeld; L: number; R: number } | null = null;
  // V-Form je Seite (0 = Startbreite, 1 = volle Breite); wirkt beim nächsten verforme()
  setzeBreite(feld: BreitenFeld | null, L = 0, R = 0) { this.breite = feld && (L > 0 || R > 0) ? { feld, L, R } : null; }
  // Haltung setzen (null = A-Pose); wirkt beim nächsten verforme()
  setzePose(haut: Haut | undefined, matrizen: Float32Array | null) { this.pose = haut && matrizen ? { haut, matrizen } : null; }
  // beliebige Ruhepositionen (punkte × 3) in die aktuelle Haltung bringen
  posiere(quelle: Float32Array): Float32Array {
    if (!this.pose) return quelle.slice();
    const out = new Float32Array(quelle.length);
    haute(quelle, out, this.pose.haut, this.pose.matrizen);
    return out;
  }

  // muskel(i) liefert μ für Punkt i; omega gilt für den ganzen Körper.
  // Mit bezug (Startmuskel μ0, Startfett ω0) werden Muskelzuwachs und Fettabbau getrennt gerechnet:
  //   Form = D(μ, ω0) + D(μ0, ω) − D(μ0, ω0)
  // Ohne Trennung zieht MakeHumans Gewichtsachse beim Abnehmen die Muskeln mit herunter (»maxmuscle-minweight« ist ein
  // dünner Körper) – ein Jahr Training mit Fettabbau sähe dann kaum anders aus als der Start.
  verforme(muskel: (i: number) => number, omega: number, bezug?: { mu: number; omega: number }) {
    const { ruhe: pos, kombi } = this;
    const G = this.netz.grund, n = this.netz.punkte;
    const getrennt = !!bezug && Math.abs(bezug.omega - omega) > 1e-4;
    const b = stufen(Math.min(1, getrennt ? bezug!.omega : omega), new Float32Array(3)), a = new Float32Array(3);
    const a0 = stufen(bezug?.mu ?? 0, new Float32Array(3)), db = new Float32Array(3);
    if (getrennt) { const b1 = stufen(Math.min(1, omega), new Float32Array(3)); for (let k = 0; k < 3; k++) db[k] = b1[k] - b[k]; }
    for (let i = 0; i < n; i++) {
      stufen(muskel(i), a);
      let x = G[3 * i], y = G[3 * i + 1], z = G[3 * i + 2];
      for (let k = 0; k < kombi.length; k++) {
        const c = kombi[k], w = a[c.m] * b[c.g] + (getrennt ? a0[c.m] * db[c.g] : 0);
        if (w === 0) continue;
        x += w * c.d[3 * i]; y += w * c.d[3 * i + 1]; z += w * c.d[3 * i + 2];
      }
      if (this.breite) {
        const { feld, L, R } = this.breite, bs = feld.links[i] ? L : R;
        x += bs * feld.fx[i]; z += bs * feld.fz[i];
      }
      pos[3 * i] = x; pos[3 * i + 1] = y; pos[3 * i + 2] = z;
    }
    // Haltung nach der Muskelverformung; Normalen aus der geposten Form
    if (this.pose) haute(pos, this.pos, this.pose.haut, this.pose.matrizen); else this.pos.set(pos);
    normalen(this.pos, this.dreieckeG, this.nor);
    const q = this.netz.quelle, P = this.pos;
    for (let j = 0; j < q.length; j++) {
      const s = 3 * q[j];
      this.posUV[3 * j] = P[s]; this.posUV[3 * j + 1] = P[s + 1]; this.posUV[3 * j + 2] = P[s + 2];
      this.norUV[3 * j] = this.nor[s]; this.norUV[3 * j + 1] = this.nor[s + 1]; this.norUV[3 * j + 2] = this.nor[s + 2];
    }
  }
}

// μ je Punkt aus den Muskelwerten je Einheit: μ = μ_rest + Σ w_k · (μ_k − μ_rest)
export function muskelProPunkt(masken: Masken, muEinheit: Float32Array, muRest: number) {
  return (i: number) => {
    let mu = muRest;
    const o = i * MAX_JE_PUNKT;
    for (let k = 0; k < MAX_JE_PUNKT; k++) {
      const w = masken.gewicht[o + k];
      if (w === 0) break;
      mu += w * (muEinheit[masken.einheit[o + k]] - muRest);
    }
    return mu;
  };
}

// Wert je Punkt aus einem Wert je Einheit (z. B. Glühen nach einem Satz, Entwicklung für die Farbskala)
export function wertProPunkt(masken: Masken, wertEinheit: Float32Array, i: number) {
  let s = 0;
  const o = i * MAX_JE_PUNKT;
  for (let k = 0; k < MAX_JE_PUNKT; k++) {
    const w = masken.gewicht[o + k];
    if (w === 0) break;
    s += w * wertEinheit[masken.einheit[o + k]];
  }
  return s;
}
