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
  // Haltung setzen (null = A-Pose); wirkt beim nächsten verforme()
  setzePose(haut: Haut | undefined, matrizen: Float32Array | null) { this.pose = haut && matrizen ? { haut, matrizen } : null; }
  // beliebige Ruhepositionen (punkte × 3) in die aktuelle Haltung bringen
  posiere(quelle: Float32Array): Float32Array {
    if (!this.pose) return quelle.slice();
    const out = new Float32Array(quelle.length);
    haute(quelle, out, this.pose.haut, this.pose.matrizen);
    return out;
  }

  // muskel(i) liefert μ für Punkt i; omega gilt für den ganzen Körper
  verforme(muskel: (i: number) => number, omega: number) {
    const { ruhe: pos, kombi } = this;
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
