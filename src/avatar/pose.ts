// Lockere Standhaltung über ein vereinfachtes MakeHuman-Skelett (CC0): Arme seitlich am Körper statt A-Pose.
// Die Muskelverformung passiert in der Ruhehaltung; danach wird jeder Punkt per Linear Blend Skinning mit bis zu
// vier Knochen bewegt. Matrizen sind affine 3×4 (Zeilen: r00 r01 r02 tx | r10 … | r20 …).

export type V3 = [number, number, number];
export interface Knochen { name: string; eltern: number; kopf: V3; ende: V3 }
export interface Haut { idx: Uint8Array; gew: Float32Array }   // je Punkt 4 Knochen mit Gewichten (Summe 1)

const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const EINHEIT = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);

// Drehung um eine Achse (Rodrigues) als 3×3 in einer 3×4-Matrix ohne Verschiebung
function drehung(achse: V3, winkel: number): Float32Array {
  const [x, y, z] = norm(achse), c = Math.cos(winkel), s = Math.sin(winkel), t = 1 - c;
  return new Float32Array([
    t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0,
  ]);
}
function mal(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[4 * r + c] = a[4 * r] * b[c] + a[4 * r + 1] * b[4 + c] + a[4 * r + 2] * b[8 + c];
    o[4 * r + 3] = a[4 * r] * b[3] + a[4 * r + 1] * b[7] + a[4 * r + 2] * b[11] + a[4 * r + 3];
  }
  return o;
}
// Drehung R um den Drehpunkt p: T(p) · R · T(−p)
function um(p: V3, r: Float32Array): Float32Array {
  const o = r.slice();
  for (let i = 0; i < 3; i++) o[4 * i + 3] = p[i] - (r[4 * i] * p[0] + r[4 * i + 1] * p[1] + r[4 * i + 2] * p[2]);
  return o;
}

export interface PoseWerte {
  armWinkel: number;    // Ziel: Winkel des Oberarms zur Senkrechten (rad)
  armVor: number;       // Arme leicht nach vorn (rad)
  ellbogen: number;     // verbleibende Beugung im Ellbogen (rad)
}
export const LOCKER: PoseWerte = { armWinkel: 0.24, armVor: 0.1, ellbogen: 0.22 };

// Weltmatrix je Knochen für die lockere Haltung; staerke 0 = A-Pose, 1 = locker
export function poseMatrizen(skelett: Knochen[], werte: PoseWerte = LOCKER, staerke = 1): Float32Array {
  const lokal: Float32Array[] = skelett.map(() => EINHEIT());
  const finde = (n: string) => skelett.findIndex(k => k.name === n);
  for (const seite of ['L', 'R'] as const) {
    const s = seite === 'L' ? 1 : -1;
    const ob = skelett[finde(`upperarm01.${seite}`)], ua = skelett[finde(`lowerarm01.${seite}`)], hand = skelett[finde(`hand.${seite}`)];
    if (!ob || !ua || !hand) continue;
    // Senken: aktueller Winkel des Oberarms zur Senkrechten (Frontalebene) minus Zielwinkel
    const oberarm = sub(ua.kopf, ob.kopf), istWinkel = Math.atan2(Math.abs(oberarm[0]), -oberarm[1]);
    const senken = Math.max(0, istWinkel - werte.armWinkel) * staerke;
    const z: V3 = [0, 0, 1];
    const schl = finde(`clavicle.${seite}`), schu = finde(`shoulder01.${seite}`), o1 = finde(`upperarm01.${seite}`), u1 = finde(`lowerarm01.${seite}`);
    lokal[schl] = um(skelett[schl].kopf, drehung(z, -s * 0.06 * staerke));
    lokal[schu] = um(skelett[schu].kopf, drehung(z, -s * 0.3 * senken));
    lokal[o1] = um(ob.kopf, mal(drehung([1, 0, 0], -werte.armVor * staerke), drehung(z, -s * 0.7 * senken)));
    // Ellbogen: die A-Pose ist deutlich gebeugt – auf die Zielbeugung strecken
    const unterarm = sub(hand.kopf, ua.kopf), u = norm(oberarm), f = norm(unterarm);
    const beugung = Math.acos(Math.max(-1, Math.min(1, dot(u, f))));
    const achse = cross(u, f);
    if (Math.hypot(...achse) > 1e-4) lokal[u1] = um(ua.kopf, drehung(achse, -Math.max(0, beugung - werte.ellbogen) * staerke));
  }
  // Vorwärtskinematik: Welt = Eltern-Welt · lokal (Knochen sind nach Eltern sortiert)
  const welt: Float32Array[] = [];
  skelett.forEach((k, i) => { welt[i] = k.eltern >= 0 ? mal(welt[k.eltern], lokal[i]) : lokal[i]; });
  const out = new Float32Array(skelett.length * 12);
  welt.forEach((m, i) => out.set(m, 12 * i));
  return out;
}

// Linear Blend Skinning: quelle (Ruhehaltung, punkte × 3) → ziel
export function haute(quelle: Float32Array, ziel: Float32Array, haut: Haut, m: Float32Array) {
  const n = quelle.length / 3;
  for (let i = 0; i < n; i++) {
    const x = quelle[3 * i], y = quelle[3 * i + 1], z = quelle[3 * i + 2];
    let ox = 0, oy = 0, oz = 0;
    for (let k = 0; k < 4; k++) {
      const w = haut.gew[4 * i + k];
      if (w === 0) continue;
      const b = 12 * haut.idx[4 * i + k];
      ox += w * (m[b] * x + m[b + 1] * y + m[b + 2] * z + m[b + 3]);
      oy += w * (m[b + 4] * x + m[b + 5] * y + m[b + 6] * z + m[b + 7]);
      oz += w * (m[b + 8] * x + m[b + 9] * y + m[b + 10] * z + m[b + 11]);
    }
    ziel[3 * i] = ox; ziel[3 * i + 1] = oy; ziel[3 * i + 2] = oz;
  }
}
