// Exportiert die MakeHuman-Körperdaten (CC0) in das kompakte Laufzeitformat von MuscleAtlas 3D.
//
// Aufruf:  node tools/mh-export.mjs <makehuman/data> <system-assets> <ausgabeordner>
//
// Je Geschlecht entsteht public/modelle/koerper-<m|w>.json mit:
//   – Körpernetz (nur Gruppe "body"), UVs, Dreiecke
//   – 9 Formen: Muskulatur {min, mittel, max} × Gewicht {min, mittel, max} (MakeHuman-Makrosystem,
//     jung, Ethnien je 1/3). Gespeichert als Grundform (mittel/mittel) + 8 Differenzen (Int16, 0,1 mm)
//   – Gelenkpunkte (aus den joint-Hilfsgeometrien), für die Platzierung der Muskelmasken
//   – angepasste Begleitnetze (Augen, Brauen, Wimpern, Haare) über MakeHumans .mhclo-Bindung
// Einheit Meter, y oben, z vorn; Füße auf y = 0.

import fs from 'node:fs';
import path from 'node:path';

const [MH, SYS, ZIEL] = process.argv.slice(2);
if (!MH || !SYS || !ZIEL) { console.error('Aufruf: node tools/mh-export.mjs <makehuman/data> <system-assets> <ausgabe>'); process.exit(1); }

const STUFEN_M = ['minmuscle', 'averagemuscle', 'maxmuscle'];
const STUFEN_G = ['minweight', 'averageweight', 'maxweight'];
const ETHNIEN = ['african', 'asian', 'caucasian'];
const QUANT = 1e-4;                       // Auflösung der Differenzen in Metern

const GESCHLECHTER = {
  m: { mh: 'male', groesse: 1.79, brauen: 'eyebrows/eyebrow001', haare: 'hair/short02' },
  w: { mh: 'female', groesse: 1.66, brauen: 'eyebrows/eyebrow010', haare: 'hair/ponytail01' },
};
const BEGLEITER = [
  { name: 'augen', ordner: 'eyes/low-poly', textur: 'augen' },
  { name: 'wimpern', ordner: 'eyelashes/eyelashes02', textur: 'wimpern', alpha: true },
];

function leseObj(datei) {
  const v = [], vt = [], flaechen = [];
  let gruppe = null;
  for (const zeile of fs.readFileSync(datei, 'utf8').split('\n')) {
    if (zeile.startsWith('v ')) { const t = zeile.trim().split(/\s+/); v.push(+t[1], +t[2], +t[3]); }
    else if (zeile.startsWith('vt ')) { const t = zeile.trim().split(/\s+/); vt.push(+t[1], +t[2]); }
    else if (zeile.startsWith('g ')) gruppe = zeile.trim().split(/\s+/)[1];
    else if (zeile.startsWith('f ')) {
      const ecken = zeile.trim().split(/\s+/).slice(1).map(t => { const [a, b] = t.split('/'); return [+a - 1, b ? +b - 1 : -1]; });
      flaechen.push({ gruppe, ecken });
    }
  }
  return { v: Float64Array.from(v), vt: Float64Array.from(vt), flaechen };
}

function leseTarget(datei) {
  const idx = [], d = [];
  for (const zeile of fs.readFileSync(datei, 'utf8').split('\n')) {
    if (!zeile || zeile[0] === '#') continue;
    const t = zeile.trim().split(/\s+/);
    if (t.length < 4) continue;
    idx.push(+t[0]); d.push(+t[1], +t[2], +t[3]);
  }
  return { idx, d };
}
function wende(form, target, w) {
  for (let i = 0; i < target.idx.length; i++) {
    const k = 3 * target.idx[i];
    form[k] += w * target.d[3 * i]; form[k + 1] += w * target.d[3 * i + 1]; form[k + 2] += w * target.d[3 * i + 2];
  }
}

// MakeHuman-Bindung eines Begleitnetzes (.mhclo): je Punkt drei Bezugspunkte mit Gewichten und skaliertem Versatz
function leseMhclo(datei) {
  const ref = [], skal = {};
  let objDatei = null, lesen = false;
  for (const roh of fs.readFileSync(datei, 'utf8').split('\n')) {
    const zeile = roh.trim();
    if (!zeile || zeile[0] === '#') continue;
    const t = zeile.split(/\s+/);
    const zahlen = t.every(x => !isNaN(+x));
    if (lesen && zahlen) {
      if (t.length === 9) { ref.push(t.map(Number)); continue; }
      if (t.length === 1) { ref.push([+t[0], 0, 0, 1, 0, 0, 0, 0, 0]); continue; }
    }
    if (t[0] === 'delete_verts') lesen = false;
    if (t[0] === 'verts') { lesen = true; continue; }
    if (t[0] === 'obj_file') objDatei = t[1];
    if (t[0] === 'x_scale' || t[0] === 'y_scale' || t[0] === 'z_scale') skal[t[0][0]] = [+t[1], +t[2], +t[3]];
  }
  return { ref, skal, objDatei };
}
function passeAn(bindung, form) {
  const s = ['x', 'y', 'z'].map((a, i) => {
    const d = bindung.skal[a];
    return d ? Math.abs(form[3 * d[0] + i] - form[3 * d[1] + i]) / d[2] : 1;
  });
  const out = new Float64Array(bindung.ref.length * 3);
  bindung.ref.forEach(([a, b, c, wa, wb, wc, ox, oy, oz], i) => {
    for (let k = 0; k < 3; k++) out[3 * i + k] = wa * form[3 * a + k] + wb * form[3 * b + k] + wc * form[3 * c + k] + [ox, oy, oz][k] * s[k];
  });
  return out;
}

// Netz mit getrennten UV-Nähten: je (Punkt, UV)-Paar ein eigener Punkt; »quelle« zeigt auf den gemeinsamen Punkt
function entschweisse(flaechen, vt, punktIndex) {
  const schluessel = new Map(), quelle = [], uv = [], dreiecke = [];
  const id = (vi, ti) => {
    const k = vi * 1e6 + ti;
    let n = schluessel.get(k);
    if (n === undefined) { n = quelle.length; schluessel.set(k, n); quelle.push(punktIndex(vi)); uv.push(ti >= 0 ? vt[2 * ti] : 0, ti >= 0 ? vt[2 * ti + 1] : 0); }
    return n;
  };
  for (const f of flaechen) {
    const e = f.ecken.map(([vi, ti]) => id(vi, ti));
    for (let i = 1; i + 1 < e.length; i++) dreiecke.push(e[0], e[i], e[i + 1]);
  }
  return { quelle, uv, dreiecke };
}

// ---------- Binärpuffer ----------
class Puffer {
  constructor() { this.teile = []; this.laenge = 0; }
  schreibe(typed) {
    const pad = (4 - (this.laenge % 4)) % 4;           // 4-Byte-Ausrichtung für Float32/Uint32
    if (pad) { this.teile.push(new Uint8Array(pad)); this.laenge += pad; }
    const off = this.laenge;
    this.teile.push(new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength));
    this.laenge += typed.byteLength;
    return { off, n: typed.length, typ: typed.constructor.name };
  }
  base64() { return Buffer.concat(this.teile.map(t => Buffer.from(t))).toString('base64'); }
}
function quantisiere(diff) {
  const q = new Int16Array(diff.length);
  for (let i = 0; i < diff.length; i++) {
    const v = Math.round(diff[i] / QUANT);
    if (v > 32767 || v < -32768) throw new Error('Differenz außerhalb des Int16-Bereichs');
    q[i] = v;
  }
  return q;
}

const basis = leseObj(path.join(MH, '3dobjs/base.obj'));
const nAlle = basis.v.length / 3;
console.log('Grundnetz:', nAlle, 'Punkte,', basis.flaechen.length, 'Flächen');

// Gelenkgruppen → Punktmengen
const gelenkPunkte = {};
for (const f of basis.flaechen) if (f.gruppe?.startsWith('joint-')) {
  (gelenkPunkte[f.gruppe.slice(6)] ??= new Set());
  for (const [vi] of f.ecken) gelenkPunkte[f.gruppe.slice(6)].add(vi);
}

fs.mkdirSync(ZIEL, { recursive: true });
const targetCache = new Map();
const target = rel => { if (!targetCache.has(rel)) targetCache.set(rel, leseTarget(path.join(MH, 'targets', rel))); return targetCache.get(rel); };

for (const [kurz, g] of Object.entries(GESCHLECHTER)) {
  // 9 Formen über den gesamten Punktbestand (inkl. Hilfsgeometrie, die die Begleitnetze brauchen)
  const formen = {};
  for (const m of STUFEN_M) for (const w of STUFEN_G) {
    const f = Float64Array.from(basis.v);
    wende(f, target(`macrodetails/universal-${g.mh}-young-${m}-${w}.target`), 1);
    for (const e of ETHNIEN) wende(f, target(`macrodetails/${e}-${g.mh}-young.target`), 1 / 3);
    formen[`${m}|${w}`] = f;
  }
  const grund = formen['averagemuscle|averageweight'];

  // Körper (Gruppe body)
  const koerperFl = basis.flaechen.filter(f => f.gruppe === 'body');
  const koerperIdx = [...new Set(koerperFl.flatMap(f => f.ecken.map(e => e[0])))].sort((a, b) => a - b);
  const neu = new Map(koerperIdx.map((v, i) => [v, i]));
  const nK = koerperIdx.length;

  // Maßstab und Lage aus der Grundform: Füße auf 0, Mitte auf x = 0, Größe in Metern
  let ymin = Infinity, ymax = -Infinity, xs = 0;
  for (const v of koerperIdx) { const y = grund[3 * v + 1]; ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); xs += grund[3 * v]; }
  const skala = g.groesse / (ymax - ymin), x0 = xs / nK;
  let zs = 0; for (const v of koerperIdx) zs += grund[3 * v + 2];
  const z0 = zs / nK;
  const transf = (arr, i) => [(arr[3 * i] - x0) * skala, (arr[3 * i + 1] - ymin) * skala, (arr[3 * i + 2] - z0) * skala];

  const pos = (form, idx) => { const o = new Float64Array(idx.length * 3); idx.forEach((v, i) => o.set(transf(form, v), 3 * i)); return o; };
  const grundK = pos(grund, koerperIdx);
  const puffer = new Puffer();
  const meta = { version: 1, geschlecht: kurz, groesse: g.groesse, quant: QUANT, formen: [], koerper: {}, begleiter: [], gelenke: {} };
  meta.koerper.grund = puffer.schreibe(Float32Array.from(grundK));
  for (const m of STUFEN_M) for (const w of STUFEN_G) {
    if (m === 'averagemuscle' && w === 'averageweight') continue;
    const f = pos(formen[`${m}|${w}`], koerperIdx);
    for (let i = 0; i < f.length; i++) f[i] -= grundK[i];
    meta.formen.push(`${m}|${w}`);
    meta.koerper[`${m}|${w}`] = puffer.schreibe(quantisiere(f));
  }
  const ent = entschweisse(koerperFl, basis.vt, vi => neu.get(vi));
  meta.koerper.punkte = nK;
  meta.koerper.quelle = puffer.schreibe(Uint16Array.from(ent.quelle));
  meta.koerper.uv = puffer.schreibe(Float32Array.from(ent.uv));
  meta.koerper.dreiecke = puffer.schreibe(Uint16Array.from(ent.dreiecke));

  for (const [name, set] of Object.entries(gelenkPunkte)) {
    let s = [0, 0, 0];
    for (const v of set) { const p = transf(grund, v); s = [s[0] + p[0], s[1] + p[1], s[2] + p[2]]; }
    meta.gelenke[name] = s.map(x => +(x / set.size).toFixed(5));
  }

  // Begleitnetze
  const begleiter = [...BEGLEITER,
    { name: 'brauen', ordner: g.brauen, textur: 'brauen-' + kurz, alpha: true },
    { name: 'haare', ordner: g.haare, textur: 'haare-' + kurz, alpha: true }];
  for (const b of begleiter) {
    const ordner = path.join(SYS, b.ordner);
    const mhclo = leseMhclo(path.join(ordner, fs.readdirSync(ordner).find(d => d.endsWith('.mhclo'))));
    const obj = leseObj(path.join(ordner, mhclo.objDatei));
    if (obj.v.length / 3 !== mhclo.ref.length) throw new Error(`${b.name}: ${obj.v.length / 3} Punkte, ${mhclo.ref.length} Bindungen`);
    const n = mhclo.ref.length;
    const anpassen = form => { const roh = passeAn(mhclo, form); const o = new Float64Array(n * 3); for (let i = 0; i < n; i++) o.set(transf(roh, i), 3 * i); return o; };
    const g0 = anpassen(grund);
    const eintrag = { name: b.name, textur: b.textur, alpha: !!b.alpha, punkte: n, grund: puffer.schreibe(Float32Array.from(g0)), formen: {} };
    for (const key of meta.formen) {
      const f = anpassen(formen[key]);
      for (let i = 0; i < f.length; i++) f[i] -= g0[i];
      eintrag.formen[key] = puffer.schreibe(quantisiere(f));
    }
    const e = entschweisse(obj.flaechen, obj.vt, vi => vi);
    eintrag.quelle = puffer.schreibe(Uint16Array.from(e.quelle));
    eintrag.uv = puffer.schreibe(Float32Array.from(e.uv));
    eintrag.dreiecke = puffer.schreibe(Uint16Array.from(e.dreiecke));
    meta.begleiter.push(eintrag);
  }

  meta.daten = puffer.base64();
  const datei = path.join(ZIEL, `koerper-${kurz}.json`);
  fs.writeFileSync(datei, JSON.stringify(meta));
  console.log(kurz, 'Körper', nK, 'Punkte,', ent.quelle.length, 'mit UV-Nähten,', ent.dreiecke.length / 3, 'Dreiecke,',
    'Begleiter', meta.begleiter.map(b => `${b.name}:${b.punkte}`).join(' '), '→', (fs.statSync(datei).size / 1024).toFixed(0), 'KB');
}
