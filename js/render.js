// WebGL-Darstellung des Avatars: Beleuchtung relativ zur Kamera, Drehen per Ziehen,
// Zoomen per Zwei-Finger-Geste oder Mausrad, Antippen wählt einen Muskel (Strahltest auf der CPU).

const VS = `
precision highp float;
attribute vec3 aPos; attribute vec3 aNor; attribute float aAo; attribute float aMid; attribute float aRand; attribute float aArt;
uniform mat4 uPV; uniform vec3 uVersatz;
uniform vec4 uMus[67];
uniform float uModus, uWahl;
varying vec3 vNor; varying vec3 vPos; varying vec3 vLok; varying vec3 vFarbe; varying float vAo; varying float vSel; varying float vMus; varying float vArt;
vec3 waerme(float t) {
  vec3 a = vec3(0.30, 0.36, 0.50), b = vec3(0.96, 0.66, 0.26), c = vec3(0.93, 0.20, 0.17);
  return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, t * 2.0 - 1.0);
}
void main() {
  vec3 p = aPos + uVersatz;
  int id = int(aMid + 0.5);
  vec4 m = uMus[0];
  for (int i = 0; i < 67; i++) { if (i == id) m = uMus[i]; }
  vec3 col = vec3(0.0); float mus = 0.0;
  if (uModus > 0.5) {
    if (id > 0) {
      col = uModus < 1.5 ? waerme(m.x) : mix(vec3(0.50, 0.15, 0.13), vec3(0.88, 0.30, 0.22), m.x);
      col *= 1.0 - 0.5 * aRand;
      mus = 1.0;
    }
  }
  vSel = (id > 0 && abs(float(id) - uWahl) < 0.5) ? 1.0 : 0.0;
  vFarbe = col; vMus = mus; vNor = aNor; vPos = p; vLok = aPos; vAo = aAo; vArt = aArt;
  gl_Position = uPV * vec4(p, 1.0);
}`;

const FS = `
precision highp float;
varying vec3 vNor; varying vec3 vPos; varying vec3 vLok; varying vec3 vFarbe; varying float vAo; varying float vSel; varying float vMus; varying float vArt;
uniform vec3 uAuge, uL1, uL2, uL3, uAkzent, uHaut, uKleid, uHaar;
uniform float uZeit, uModus, uH, uFrau;
float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
void main() {
  vec3 n = normalize(vNor);
  vec3 v = normalize(uAuge - vPos);
  vec3 q = vLok / uH;                       // Lage im Körpermaß des Mannes
  float w = 0.0025;
  float arm = smoothstep(0.4, 0.6, vArt) * (1.0 - smoothstep(1.4, 1.6, vArt));
  float haarPrim = smoothstep(1.4, 1.6, vArt);
  float kopf = smoothstep(1.595, 1.605, q.y);
  float haar = max(haarPrim, kopf * smoothstep(-w, w, q.y - (1.73 - 0.1 * clamp(-q.z / 0.09, 0.0, 1.0))));
  float hose = uFrau > 0.5 ? band(q.y, 0.75, 0.995, w) : band(q.y, 0.695, 1.02, w);
  float bh = uFrau > 0.5 ? max(band(q.y, 1.215, 1.395, w), band(q.y, 1.39, 1.48, w) * band(abs(q.x), 0.068, 0.092, w)) : 0.0;
  float kleid = max(hose, bh) * (1.0 - arm);
  vec3 grund = uModus < 0.5 ? mix(uHaut, uKleid, kleid) : (vMus > 0.5 ? vFarbe : mix(uHaut, vec3(0.62, 0.58, 0.55), 0.45));
  grund = mix(grund, uHaar, haar);
  float glanz = mix(mix(0.22, 0.04, kleid * (1.0 - step(0.5, uModus))), 0.08, haar);
  float ao = mix(0.45, 1.0, vAo);
  float d1 = max((dot(n, uL1) + 0.3) / 1.3, 0.0);
  float d2 = max(dot(n, uL2), 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  vec3 umg = mix(vec3(0.10, 0.11, 0.16), vec3(0.27, 0.29, 0.36), hemi);
  vec3 licht = umg * ao + d1 * vec3(1.0, 0.95, 0.88) * mix(0.7, 1.0, vAo) + d2 * vec3(0.35, 0.42, 0.6) * ao;
  vec3 h = normalize(uL1 + v);
  float spec = pow(max(dot(n, h), 0.0), 36.0) * glanz * vAo;
  float rand = pow(1.0 - max(dot(n, v), 0.0), 3.0) * vAo;
  float gegen = max(dot(n, uL3), 0.0);
  vec3 col = grund * licht + spec + uAkzent * rand * (0.35 + 0.65 * gegen) * 0.9;
  if (vSel > 0.5) col = mix(col, uAkzent * 1.2, 0.35 + 0.15 * sin(uZeit * 4.0));
  gl_FragColor = vec4(col, 1.0);
}`;

const VS_BODEN = `
precision highp float;
attribute vec2 aXZ; uniform mat4 uPV; uniform vec3 uVersatz; varying vec2 vXZ;
void main() { vXZ = aXZ; gl_Position = uPV * vec4(aXZ.x + uVersatz.x, 0.0, aXZ.y + uVersatz.z, 1.0); }`;
const FS_BODEN = `
precision highp float;
varying vec2 vXZ; uniform vec3 uAkzent;
void main() {
  float r = length(vXZ * vec2(1.0, 1.35));
  float schatten = smoothstep(0.32, 0.0, r) * 0.55;
  float ring = smoothstep(0.03, 0.0, abs(r - 0.42)) * 0.55 + smoothstep(0.5, 0.0, r) * 0.08;
  vec3 col = uAkzent * ring;
  float a = max(schatten, ring);
  gl_FragColor = vec4(col * a, a);
}`;

// ---------- Matrizen ----------
function perspektive(fovy, asp, n, f) {
  const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f);
  return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]);
}
function blick(auge, ziel, oben) {
  const z = norm3(sub3(auge, ziel)), x = norm3(kreuz3(oben, z)), y = kreuz3(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -dot3(x, auge), -dot3(y, auge), -dot3(z, auge), 1]);
}
function mal(a, b) {
  const r = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
    r[i * 4 + j] = s;
  }
  return r;
}
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const kreuz3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function shader(gl, typ, quelle) {
  const s = gl.createShader(typ);
  gl.shaderSource(s, quelle); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function programm(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const loc = {};
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES), nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < na; i++) { const a = gl.getActiveAttrib(p, i); loc[a.name] = gl.getAttribLocation(p, a.name); }
  for (let i = 0; i < nu; i++) { const u = gl.getActiveUniform(p, i); const n = u.name.replace('[0]', ''); loc[n] = gl.getUniformLocation(p, n); }
  return { p, loc };
}

export class Buehne {
  constructor(canvas, beiWahl) {
    this.canvas = canvas;
    this.beiWahl = beiWahl;
    const opt = { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false };
    const gl = canvas.getContext('webgl', opt) || canvas.getContext('experimental-webgl', opt);
    if (!gl) throw new Error('WebGL nicht verfügbar');
    if (!gl.getExtension('OES_element_index_uint')) throw new Error('32-Bit-Indizes nicht verfügbar');
    this.gl = gl;
    this.prog = programm(gl, VS, FS);
    this.boden = programm(gl, VS_BODEN, FS_BODEN);
    this.bodenPuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bodenPuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.6, -0.6, 0.6, -0.6, -0.6, 0.6, 0.6, 0.6]), gl.STATIC_DRAW);
    this.netze = new Map();
    this.mus = new Float32Array(67 * 4);
    this.modus = 0; this.wahl = -1; this.groesse = 1; this.frau = 0;
    this.farben = { haut: [0.78, 0.58, 0.47], kleid: [0.11, 0.12, 0.15], haar: [0.16, 0.12, 0.1], akzent: [0.18, 0.5, 1.0] };
    this.kam = { yaw: 0.35, pitch: 0.08, dist: 4.4, ziel: [0, 0.92, 0], zielH: 0.92 };
    this.standard = { ...this.kam };
    this.vy = 0; this.offen = false; this.t0 = performance.now();
    this.#eingabe();
    new ResizeObserver(() => this.anfordern()).observe(canvas);
  }

  setzeNetz(name, netz, versatz = [0, 0, 0]) {
    const gl = this.gl;
    const alt = this.netze.get(name);
    if (alt) for (const b of alt.puffer) gl.deleteBuffer(b);
    if (!netz) { this.netze.delete(name); this.anfordern(); return; }
    const puffer = [];
    const lade = (daten, ziel = gl.ARRAY_BUFFER) => { const b = gl.createBuffer(); gl.bindBuffer(ziel, b); gl.bufferData(ziel, daten, gl.STATIC_DRAW); puffer.push(b); return b; };
    this.netze.set(name, {
      versatz, netz, puffer,
      pos: lade(netz.pos), nor: lade(netz.nor), ao: lade(netz.ao), mid: lade(netz.mid), rand: lade(netz.rand), art: lade(netz.art),
      idx: lade(netz.idx, gl.ELEMENT_ARRAY_BUFFER), n: netz.idx.length,
    });
    this.anfordern();
  }
  setzeVersatz(name, versatz) { const n = this.netze.get(name); if (n) { n.versatz = versatz; this.anfordern(); } }

  setzeMuskeln(werte) { this.mus.set(werte); this.anfordern(); }
  setzeModus(m) { this.modus = m; this.anfordern(); }
  setzeWahl(idx) { this.wahl = idx ?? -1; this.anfordern(); }
  setzeAkzent(rgb) { this.farben.akzent = rgb; this.anfordern(); }
  setzeHaut(rgb) { this.farben.haut = rgb; this.anfordern(); }
  setzeKoerper(frau, groesse) { this.frau = frau ? 1 : 0; this.groesse = groesse; this.anfordern(); }
  ansicht(dist, zielH) { this.kam.dist = dist; this.kam.ziel = [0, zielH, 0]; this.standard = { ...this.kam }; this.anfordern(); }

  anfordern() {
    if (this.offen) return;
    this.offen = true;
    requestAnimationFrame(() => { this.offen = false; this.#zeichne(); });
  }

  #matrix() {
    const c = this.canvas, w = c.clientWidth || 1, h = c.clientHeight || 1;
    const k = this.kam;
    const auge = [k.ziel[0] + k.dist * Math.cos(k.pitch) * Math.sin(k.yaw), k.ziel[1] + k.dist * Math.sin(k.pitch), k.ziel[2] + k.dist * Math.cos(k.pitch) * Math.cos(k.yaw)];
    const proj = perspektive(28 * Math.PI / 180, w / h, 0.05, 30);
    const view = blick(auge, k.ziel, [0, 1, 0]);
    return { pv: mal(proj, view), auge, view, proj, w, h };
  }

  #zeichne() {
    const gl = this.gl, c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const M = this.#matrix();
    // Kamera-Basis für Lichter
    const z = norm3(sub3(M.auge, this.kam.ziel)), x = norm3(kreuz3([0, 1, 0], z)), y = kreuz3(z, x);
    const L = (a, b, cc) => norm3([x[0] * a + y[0] * b + z[0] * cc, x[1] * a + y[1] * b + z[1] * cc, x[2] * a + y[2] * b + z[2] * cc]);
    const zeit = (performance.now() - this.t0) / 1000;

    // Boden
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const B = this.boden;
    gl.useProgram(B.p);
    gl.uniformMatrix4fv(B.loc.uPV, false, M.pv);
    gl.uniform3fv(B.loc.uAkzent, this.farben.akzent);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bodenPuffer);
    gl.enableVertexAttribArray(B.loc.aXZ);
    gl.vertexAttribPointer(B.loc.aXZ, 2, gl.FLOAT, false, 0, 0);
    for (const n of this.netze.values()) { gl.uniform3fv(B.loc.uVersatz, n.versatz); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
    gl.disableVertexAttribArray(B.loc.aXZ);
    gl.disable(gl.BLEND);

    // Körper
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    const P = this.prog, l = P.loc;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(l.uPV, false, M.pv);
    gl.uniform4fv(l.uMus, this.mus);
    gl.uniform1f(l.uModus, this.modus);
    gl.uniform1f(l.uWahl, this.wahl);
    gl.uniform3fv(l.uHaut, this.farben.haut);
    gl.uniform3fv(l.uKleid, this.farben.kleid);
    gl.uniform3fv(l.uHaar, this.farben.haar);
    gl.uniform3fv(l.uAkzent, this.farben.akzent);
    gl.uniform3fv(l.uAuge, M.auge);
    gl.uniform3fv(l.uL1, L(0.55, 0.75, 0.6));
    gl.uniform3fv(l.uL2, L(-0.8, 0.1, 0.35));
    gl.uniform3fv(l.uL3, L(0.2, 0.4, -1));
    gl.uniform1f(l.uZeit, zeit);
    gl.uniform1f(l.uH, this.groesse);
    gl.uniform1f(l.uFrau, this.frau);
    for (const n of this.netze.values()) {
      gl.uniform3fv(l.uVersatz, n.versatz);
      const attr = (name, puffer, k) => { gl.bindBuffer(gl.ARRAY_BUFFER, puffer); gl.enableVertexAttribArray(l[name]); gl.vertexAttribPointer(l[name], k, gl.FLOAT, false, 0, 0); };
      attr('aPos', n.pos, 3); attr('aNor', n.nor, 3); attr('aAo', n.ao, 1); attr('aMid', n.mid, 1); attr('aRand', n.rand, 1); attr('aArt', n.art, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, n.idx);
      gl.drawElements(gl.TRIANGLES, n.n, gl.UNSIGNED_INT, 0);
    }
    for (const name of ['aPos', 'aNor', 'aAo', 'aMid', 'aRand', 'aArt']) if (l[name] >= 0) gl.disableVertexAttribArray(l[name]);
    gl.disable(gl.CULL_FACE);

    // Trägheit beim Drehen, Pulsieren der Auswahl
    let weiter = false;
    if (Math.abs(this.vy) > 1e-4 && !this.ziehen) { this.kam.yaw += this.vy; this.vy *= 0.92; weiter = true; }
    if (this.wahl > 0) weiter = true;
    if (weiter) this.anfordern();
  }

  // Strahl durch den Bildpunkt (x, y in CSS-Pixeln relativ zum Canvas) → nächster Treffer
  treffer(px, py) {
    const M = this.#matrix();
    const nx = (px / M.w) * 2 - 1, ny = 1 - (py / M.h) * 2;
    const k = this.kam;
    const z = norm3(sub3(M.auge, k.ziel)), x = norm3(kreuz3([0, 1, 0], z)), y = kreuz3(z, x);
    const t = Math.tan(14 * Math.PI / 180), asp = M.w / M.h;
    const dir = norm3([-z[0] + x[0] * nx * t * asp + y[0] * ny * t, -z[1] + x[1] * nx * t * asp + y[1] * ny * t, -z[2] + x[2] * nx * t * asp + y[2] * ny * t]);
    let best = { t: Infinity };
    for (const [name, n] of this.netze) {
      const o = sub3(M.auge, n.versatz);
      const P = n.netz.pos, I = n.netz.idx;
      for (let i = 0; i < I.length; i += 3) {
        const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
        const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
        const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
        const hx = dir[1] * e2z - dir[2] * e2y, hy = dir[2] * e2x - dir[0] * e2z, hz = dir[0] * e2y - dir[1] * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det;
        const sx = o[0] - P[a], sy = o[1] - P[a + 1], sz = o[2] - P[a + 2];
        const u = (sx * hx + sy * hy + sz * hz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (tt > 0 && tt < best.t) {
          const w = 1 - u - v;
          const ecke = w >= u && w >= v ? I[i] : u >= v ? I[i + 1] : I[i + 2];
          best = { t: tt, name, mid: Math.round(n.netz.mid[ecke]), punkt: [o[0] + dir[0] * tt, o[1] + dir[1] * tt, o[2] + dir[2] * tt] };
        }
      }
    }
    return best.t < Infinity ? best : null;
  }

  #eingabe() {
    const c = this.canvas;
    const zeiger = new Map();
    let start = null, bewegt = 0, letzterTipp = 0, pinch = null;
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture(e.pointerId);
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (zeiger.size === 1) { start = { x: e.clientX, y: e.clientY, t: performance.now() }; bewegt = 0; this.ziehen = true; this.vy = 0; }
      if (zeiger.size === 2) { const [a, b] = [...zeiger.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: this.kam.dist }; }
    });
    c.addEventListener('pointermove', e => {
      const alt = zeiger.get(e.pointerId);
      if (!alt) return;
      const neu = { x: e.clientX, y: e.clientY };
      zeiger.set(e.pointerId, neu);
      if (zeiger.size === 2 && pinch) {
        const [a, b] = [...zeiger.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.kam.dist = Math.min(7, Math.max(1.1, pinch.dist * pinch.d / Math.max(d, 1)));
        bewegt = 99; this.anfordern(); return;
      }
      const dx = neu.x - alt.x, dy = neu.y - alt.y;
      bewegt += Math.abs(dx) + Math.abs(dy);
      const k = 1 / Math.max(240, c.clientWidth);
      this.kam.yaw -= dx * k * 3.2; this.vy = -dx * k * 3.2;
      this.kam.pitch = Math.min(0.75, Math.max(-0.35, this.kam.pitch + dy * k * 2));
      this.anfordern();
    });
    const ende = e => {
      if (!zeiger.has(e.pointerId)) return;
      zeiger.delete(e.pointerId);
      if (zeiger.size < 2) pinch = null;
      if (zeiger.size > 0) return;
      this.ziehen = false;
      const r = c.getBoundingClientRect();
      if (start && bewegt < 8 && performance.now() - start.t < 400) {
        const jetzt = performance.now();
        const hit = this.treffer(e.clientX - r.left, e.clientY - r.top);
        if (jetzt - letzterTipp < 300) {
          // Doppeltipp: heranzoomen bzw. zurück
          if (this.kam.dist < this.standard.dist * 0.7) Object.assign(this.kam, { dist: this.standard.dist, ziel: [...this.standard.ziel] });
          else if (hit) Object.assign(this.kam, { dist: Math.max(1.3, this.standard.dist * 0.42), ziel: [hit.punkt[0] + (this.netze.get(hit.name)?.versatz[0] ?? 0), hit.punkt[1], 0] });
          letzterTipp = 0;
        } else {
          letzterTipp = jetzt;
          this.beiWahl?.(hit);
        }
        this.vy = 0;
      }
      this.anfordern();
    };
    c.addEventListener('pointerup', ende);
    c.addEventListener('pointercancel', ende);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.kam.dist = Math.min(7, Math.max(1.1, this.kam.dist * Math.exp(e.deltaY * 0.0012)));
      this.anfordern();
    }, { passive: false });
  }
}
