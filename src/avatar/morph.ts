// Verformung des Körpers: pro Punkt eine Muskulatur μ und ein Körperfett ω (beide 0..1, 0,5 = MakeHuman-Mittel).
// Position = Grundform + Σ a_i(μ) · b_j(ω) · Differenz_ij  (bilineare Mischung der 3×3 MakeHuman-Formen).

import { FORM_STUFEN, GEWICHT_STUFEN, type FormNetz } from './daten';
import { MAX_JE_PUNKT, normalen, gemeinsameDreiecke, type Masken } from './masken';

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

export class Verformer {
  readonly netz: FormNetz;
  readonly pos: Float32Array;          // gemeinsame Punkte
  readonly nor: Float32Array;
  readonly posUV: Float32Array;        // aufgefächert auf UV-Punkte (für die GPU)
  readonly norUV: Float32Array;
  private readonly kombi: Kombination[];
  private readonly dreieckeG: Uint16Array;

  constructor(netz: FormNetz) {
    this.netz = netz;
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

  // muskel(i) liefert μ für Punkt i; omega gilt für den ganzen Körper
  verforme(muskel: (i: number) => number, omega: number) {
    const { pos, kombi } = this;
    const G = this.netz.grund, n = this.netz.punkte;
    const b = stufen(Math.min(1, omega), new Float32Array(3)), a = new Float32Array(3);
    for (let i = 0; i < n; i++) {
      stufen(muskel(i), a);
      let x = G[3 * i], y = G[3 * i + 1], z = G[3 * i + 2];
      for (let k = 0; k < kombi.length; k++) {
        const c = kombi[k], w = a[c.m] * b[c.g];
        if (w === 0) continue;
        x += w * c.d[3 * i]; y += w * c.d[3 * i + 1]; z += w * c.d[3 * i + 2];
      }
      pos[3 * i] = x; pos[3 * i + 1] = y; pos[3 * i + 2] = z;
    }
    normalen(pos, this.dreieckeG, this.nor);
    const q = this.netz.quelle;
    for (let j = 0; j < q.length; j++) {
      const s = 3 * q[j];
      this.posUV[3 * j] = pos[s]; this.posUV[3 * j + 1] = pos[s + 1]; this.posUV[3 * j + 2] = pos[s + 2];
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
