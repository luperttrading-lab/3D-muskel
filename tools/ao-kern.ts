// Backt die Umgebungsverdeckung (Ambient Occlusion) je Körperpunkt (läuft über tools/ao-backen.mjs).
//
// Grundlage ist der Körper in der lockeren Haltung der App bei Startmuskulatur: Achseln, Armseiten am Rumpf, Schritt,
// Kinn und Hals, Kniekehlen und die Furchen zwischen Muskeln bekommen weniger Umgebungslicht. Je Punkt werden Strahlen
// kosinusverteilt über die Halbkugel der Normale geschickt; Treffer innerhalb von 25 cm verdecken, nahe stärker.
// Ergebnis: ein Byte je gemeinsamem Punkt (255 = frei, 0 = ganz verdeckt).

import fs from 'node:fs';
import { entpacke } from '../src/avatar/daten';
import { gemeinsameDreiecke } from '../src/avatar/masken';
import { Verformer } from '../src/avatar/morph';
import { LOCKER, poseMatrizen } from '../src/avatar/pose';
import { MU_START, KOERPERFORMEN } from '../src/store/profil';

const REICHWEITE = 0.25, ZELLE = 0.03, STRAHLEN = 96;

export function backeAO(g: 'm' | 'w'): Uint8Array {
  const daten = entpacke(JSON.parse(fs.readFileSync(`public/modelle/koerper-${g}.json`, 'utf8')));
  const netz = daten.koerper;
  const v = new Verformer(netz);
  if (daten.skelett && daten.haut) v.setzePose(daten.haut, poseMatrizen(daten.skelett, LOCKER, 1));
  v.verforme(() => MU_START, KOERPERFORMEN.mittel.omega[g]);
  const P = v.pos, N = v.nor, T = gemeinsameDreiecke(netz), n = netz.punkte, nt = T.length / 3;

  // Gitter über die Dreiecke
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P[3 * i + k]); max[k] = Math.max(max[k], P[3 * i + k]); }
  min = min.map(x => x - 0.01); max = max.map(x => x + 0.01);
  const dim = [0, 1, 2].map(k => Math.ceil((max[k] - min[k]) / ZELLE));
  const zellen: number[][] = Array.from({ length: dim[0] * dim[1] * dim[2] }, () => []);
  const zi = (x: number, y: number, z: number) => (z * dim[1] + y) * dim[0] + x;
  const zelle = (p: number, k: number) => Math.min(dim[k] - 1, Math.max(0, Math.floor((p - min[k]) / ZELLE)));
  for (let t = 0; t < nt; t++) {
    const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
    const lo = [0, 1, 2].map(k => zelle(Math.min(P[3 * a + k], P[3 * b + k], P[3 * c + k]), k));
    const hi = [0, 1, 2].map(k => zelle(Math.max(P[3 * a + k], P[3 * b + k], P[3 * c + k]), k));
    for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) zellen[zi(x, y, z)].push(t);
  }

  // Strahl gegen Dreieck (Möller–Trumbore), Rückgabe: Abstand oder Infinity
  const treffer = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, t: number) => {
    const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
    const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
    const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) return Infinity;
    const inv = 1 / det, sx = ox - P[a], sy = oy - P[a + 1], sz = oz - P[a + 2];
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) return Infinity;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const w = (dx * qx + dy * qy + dz * qz) * inv;
    if (w < 0 || u + w > 1) return Infinity;
    const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return d > 1e-5 ? d : Infinity;
  };

  // Feste, gleichmäßig verteilte Richtungen (Fibonacci-Halbkugel, kosinusgewichtet)
  const richtungen: number[] = [];
  for (let k = 0; k < STRAHLEN; k++) {
    const r = Math.sqrt((k + 0.5) / STRAHLEN), phi = k * 2.399963229728653;
    richtungen.push(r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - r * r));
  }

  const ao = new Float32Array(n), besucht = new Int32Array(nt).fill(-1);
  let strahl = 0;
  for (let i = 0; i < n; i++) {
    const nx = N[3 * i], ny = N[3 * i + 1], nz = N[3 * i + 2];
    // Tangentenbasis zur Normale
    const hx = Math.abs(nx) < 0.9 ? 1 : 0, hy = hx ? 0 : 1;
    let tx = ny * 0 - nz * hy, ty = nz * hx - nx * 0, tz = nx * hy - ny * hx;
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    const ox = P[3 * i] + nx * 0.003, oy = P[3 * i + 1] + ny * 0.003, oz = P[3 * i + 2] + nz * 0.003;
    let verdeckt = 0;
    for (let k = 0; k < STRAHLEN; k++) {
      const a = richtungen[3 * k], b = richtungen[3 * k + 1], c = richtungen[3 * k + 2];
      const dx = a * tx + b * bx + c * nx, dy = a * ty + b * by + c * ny, dz = a * tz + b * bz + c * nz;
      // Gitter entlang des Strahls abschreiten (Schritt halbe Zelle reicht für 25 cm)
      strahl++;
      let naechst = Infinity;
      for (let s = 0; s <= REICHWEITE && naechst === Infinity; s += ZELLE * 0.5) {
        const cx = zelle(ox + dx * s, 0), cy = zelle(oy + dy * s, 1), cz = zelle(oz + dz * s, 2);
        for (const t of zellen[zi(cx, cy, cz)]) {
          if (besucht[t] === strahl) continue;
          besucht[t] = strahl;
          if (T[3 * t] === i || T[3 * t + 1] === i || T[3 * t + 2] === i) continue;
          const d = treffer(ox, oy, oz, dx, dy, dz, t);
          if (d < naechst) naechst = d;
        }
      }
      if (naechst < REICHWEITE) verdeckt += 1 - (naechst / REICHWEITE) ** 2;
    }
    ao[i] = 1 - verdeckt / STRAHLEN;
  }

  // Zweimal mit den Nachbarn glätten (Rauschen der festen Richtungen)
  const nachbarn: number[][] = Array.from({ length: n }, () => []);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) for (let m = 0; m < 3; m++) if (k !== m) nachbarn[T[3 * t + k]].push(T[3 * t + m]);
  let a = ao;
  for (let runde = 0; runde < 2; runde++) {
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 2 * a[i], w = 2; for (const j of nachbarn[i]) { s += a[j]; w++; } b[i] = s / w; }
    a = b;
  }
  const out = new Uint8Array(n);
  let summe = 0;
  for (let i = 0; i < n; i++) { out[i] = Math.round(255 * Math.min(1, Math.max(0, a[i]))); summe += a[i]; }
  console.log(`${g}: ${n} Punkte, ${nt} Dreiecke, mittlere AO ${(summe / n).toFixed(3)}, min ${(Math.min(...a) as number).toFixed(3)}`);
  return out;
}
