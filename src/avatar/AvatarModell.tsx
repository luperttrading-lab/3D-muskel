// Der verformbare 3D-Körper mit Haut, Augen, Brauen, Wimpern und Haaren.
// Zielwerte (Muskulatur je Einheit, Glühen) kommen als Props; die Anzeige gleitet weich dorthin, damit jeder
// Satz als sichtbares Anschwellen der beanspruchten Muskeln erscheint.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Begleiter, KoerperDaten } from './daten';
import { berechneMasken, hauptEinheit, MAX_JE_PUNKT, type Masken } from './masken';
import { Verformer, muskelProPunkt } from './morph';
import { einheitIndex, SEITEN } from '../engine/muskeln';

export type Darstellung = 'haut' | 'entwicklung' | 'atlas';

export interface AvatarZustand {
  mu: Float32Array;          // Muskulatur je Einheit (Index wie EINHEITEN)
  muRest: number;            // Muskulatur außerhalb der Masken (Kopf, Hände, Füße)
  omega: number;             // Körperfett 0..1
  gluehen: Float32Array;     // Stärke des Glühens je Einheit nach dem letzten Satz (0..1)
  farbe: Float32Array;       // RGB je Einheit für Entwicklung/Atlas, Index 0 = Haut ohne Muskel
}

interface Props {
  daten: KoerperDaten;
  zustand: AvatarZustand;
  darstellung: Darstellung;
  auswahl: number;
  hautton: 'hell' | 'mittel' | 'dunkel';
  akzent: string;
  gluehStart: number;        // performance.now() des letzten Satzes
  bewegung: boolean;         // false = keine weichen Übergänge (reduzierte Bewegung)
  position?: [number, number, number];
  basis?: string;
  onWahl?: (einheit: number) => void;
  onMasken?: (m: Masken, mitten: Map<number, [number, number, number]>) => void;
  onMorphMs?: (ms: number) => void;
}

const KLEID_GLSL = /* glsl */`
uniform float uFrau, uFarbAnteil, uHoseOben, uHoseUnten, uBhOben, uBhUnten, uRumpfX, uTraegerX;
uniform vec3 uKleid, uAkzent;
varying vec3 vLokal;
varying vec3 vFarbe;
varying float vGluehen;
varying float vAuswahl;
varying float vArm;
float fenster(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
`;

function kleidMaterial(map: THREE.Texture, akzent: THREE.Color, gelenke: KoerperDaten['gelenke'], frau: boolean) {
  const mat = new THREE.MeshPhysicalMaterial({
    map, roughness: 0.58, metalness: 0, sheen: 0.35, sheenRoughness: 0.75, sheenColor: new THREE.Color('#ffd9c7'),
  });
  const J = (n: string) => gelenke[n];
  const becken = J('pelvis'), huefte = J('l-upper-leg'), knie = J('l-knee'), schulter = J('l-shoulder'), hals = J('neck');
  const uniforms = {
    uFrau: { value: frau ? 1 : 0 },
    uFarbAnteil: { value: 0 },
    uHoseOben: { value: becken[1] + (frau ? 0.06 : 0.07) },
    uHoseUnten: { value: huefte[1] + (knie[1] - huefte[1]) * (frau ? 0.38 : 0.45) },
    uBhOben: { value: becken[1] + (hals[1] - becken[1]) * 0.8 },
    uBhUnten: { value: becken[1] + (hals[1] - becken[1]) * 0.5 },
    uRumpfX: { value: schulter[0] * 0.92 },
    uTraegerX: { value: schulter[0] * 0.48 },
    uKleid: { value: new THREE.Color('#1b1f2a') },
    uAkzent: { value: akzent },
  };
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${KLEID_GLSL}\nattribute vec3 aFarbe;\nattribute float aGluehen;\nattribute float aAuswahl;\nattribute float aArm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvLokal = position; vFarbe = aFarbe; vGluehen = aGluehen; vAuswahl = aAuswahl; vArm = aArm;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${KLEID_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float w = 0.004;
        float hose = fenster(vLokal.y, uHoseUnten, uHoseOben, w);
        float bh = uFrau * max(fenster(vLokal.y, uBhUnten, uBhOben, w) * (1.0 - smoothstep(uRumpfX - w, uRumpfX + w, abs(vLokal.x))),
                               fenster(vLokal.y, uBhOben - 0.01, uBhOben + 0.12, w) * fenster(abs(vLokal.x), uTraegerX - 0.012, uTraegerX + 0.012, w));
        float kleid = max(hose, bh) * (1.0 - vArm);
        diffuseColor.rgb = mix(diffuseColor.rgb, uKleid, kleid * (1.0 - uFarbAnteil));
        diffuseColor.rgb = mix(diffuseColor.rgb, vFarbe * (1.0 - 0.4 * kleid), uFarbAnteil);   // Kleidung bleibt als dunklere Zone erkennbar`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float randLicht = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += uAkzent * (vGluehen * 0.9 + vAuswahl * 0.4 + randLicht * 0.22);`);
  };
  return { mat, uniforms };
}

function BegleitNetz({ b, muRest, omega, basis }: { b: Begleiter; muRest: number; omega: number; basis: string }) {
  const verformer = useMemo(() => new Verformer(b), [b]);
  const textur = useLoader(THREE.TextureLoader, `${basis}modelle/${b.textur}.${b.alpha ? 'png' : 'jpg'}`);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verformer.posUV, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(verformer.norUV, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(b.uv, 2));
    g.setIndex(new THREE.BufferAttribute(b.dreiecke, 1));
    return g;
  }, [b, verformer]);
  useEffect(() => { textur.colorSpace = THREE.SRGBColorSpace; textur.anisotropy = 4; textur.needsUpdate = true; }, [textur]);
  useEffect(() => {
    verformer.verforme(() => muRest, omega);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.computeBoundingSphere();
  }, [muRest, omega, geo, verformer]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} renderOrder={b.alpha ? 2 : 1} raycast={() => null}>
      <meshStandardMaterial map={textur} transparent={b.alpha} alphaTest={b.alpha ? 0.35 : 0} side={b.alpha ? THREE.DoubleSide : THREE.FrontSide}
        roughness={b.name === 'augen' ? 0.15 : 0.85} depthWrite />
    </mesh>
  );
}

const ARM_IDS = ['bizeps', 'trizeps', 'brachialis', 'brachiorad', 'ua_beuger', 'ua_strecker', 'delt_v', 'delt_s', 'delt_h'];

export function AvatarModell({ daten, zustand, darstellung, auswahl, hautton, akzent, gluehStart, bewegung, position, basis = import.meta.env.BASE_URL, onWahl, onMasken, onMorphMs }: Props) {
  const invalidate = useThree(s => s.invalidate);
  const verformer = useMemo(() => new Verformer(daten.koerper), [daten]);
  const masken = useMemo(() => berechneMasken(daten.koerper, daten.gelenke), [daten]);
  const haut = useLoader(THREE.TextureLoader, `${basis}modelle/haut-${daten.geschlecht}-${hautton}.jpg`);
  const akzentFarbe = useMemo(() => new THREE.Color(akzent), [akzent]);
  const { mat, uniforms } = useMemo(() => kleidMaterial(haut, akzentFarbe, daten.gelenke, daten.geschlecht === 'w'), [haut, akzentFarbe, daten]);
  const nUV = daten.koerper.quelle.length;
  const attr = useMemo(() => ({
    farbe: new THREE.BufferAttribute(new Float32Array(nUV * 3), 3),
    gluehen: new THREE.BufferAttribute(new Float32Array(nUV), 1),
    auswahl: new THREE.BufferAttribute(new Float32Array(nUV), 1),
    arm: new THREE.BufferAttribute(new Float32Array(nUV), 1),
  }), [nUV]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verformer.posUV, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(verformer.norUV, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(daten.koerper.uv, 2));
    g.setAttribute('aFarbe', attr.farbe);
    g.setAttribute('aGluehen', attr.gluehen);
    g.setAttribute('aAuswahl', attr.auswahl);
    g.setAttribute('aArm', attr.arm);
    g.setIndex(new THREE.BufferAttribute(daten.koerper.dreiecke, 1));
    return g;
  }, [verformer, daten, attr]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useEffect(() => { haut.colorSpace = THREE.SRGBColorSpace; haut.anisotropy = 8; haut.needsUpdate = true; invalidate(); }, [haut, invalidate]);

  // Muskelmitten (für Kameraführung) und Arm-Kennung (Kleidung nie auf den Armen)
  useEffect(() => {
    const P = daten.koerper.grund, summe = new Map<number, [number, number, number, number]>();
    for (let i = 0; i < daten.koerper.punkte; i++) {
      const o = i * MAX_JE_PUNKT;
      for (let k = 0; k < MAX_JE_PUNKT; k++) {
        const w = masken.gewicht[o + k];
        if (w < 0.5) break;
        const e = masken.einheit[o + k], s = summe.get(e) ?? [0, 0, 0, 0];
        s[0] += w * P[3 * i]; s[1] += w * P[3 * i + 1]; s[2] += w * P[3 * i + 2]; s[3] += w;
        summe.set(e, s);
      }
    }
    const mitten = new Map<number, [number, number, number]>();
    for (const [e, s] of summe) mitten.set(e, [s[0] / s[3], s[1] / s[3], s[2] / s[3]]);
    onMasken?.(masken, mitten);

    const armIds = new Set<number>();
    for (const id of ARM_IDS) for (const s of SEITEN) armIds.add(einheitIndex(id, s));
    const q = daten.koerper.quelle, aussen = 0.3 * daten.groesse / 1.79;
    for (let j = 0; j < q.length; j++) {
      const i = q[j];
      attr.arm.array[j] = armIds.has(hauptEinheit(masken, i, 0.15)) || Math.abs(P[3 * i]) > aussen ? 1 : 0;
    }
    attr.arm.needsUpdate = true;
  }, [masken, daten, attr, onMasken]);

  // Anzeige-Zustand gleitet auf die Zielwerte zu
  const n = zustand.mu.length;
  const anzeige = useRef<{ mu: Float32Array; omega: number; muRest: number } | null>(null);
  const glow = useRef(new Float32Array(n));
  const dirty = useRef(true);
  const farbAnteil = useRef(0);
  useEffect(() => { dirty.current = true; invalidate(); }, [zustand, auswahl, darstellung, gluehStart, invalidate]);

  const aktualisiere = (mu: Float32Array, muRest: number, omega: number) => {
    const t0 = performance.now();
    verformer.verforme(muskelProPunkt(masken, mu, muRest), omega);
    const q = daten.koerper.quelle, F = attr.farbe.array as Float32Array, Gl = attr.gluehen.array as Float32Array, A = attr.auswahl.array as Float32Array;
    const mg = masken.gewicht, me = masken.einheit, farbe = zustand.farbe, gl = glow.current;
    for (let j = 0; j < q.length; j++) {
      const o = q[j] * MAX_JE_PUNKT;
      let r = 0, g = 0, b = 0, glu = 0, aus = 0, summe = 0;
      for (let k = 0; k < MAX_JE_PUNKT; k++) {
        const w = mg[o + k];
        if (w === 0) break;
        const e = me[o + k];
        r += w * farbe[3 * e]; g += w * farbe[3 * e + 1]; b += w * farbe[3 * e + 2];
        glu += w * gl[e];
        if (e === auswahl) aus += w;
        summe += w;
      }
      const rest = 1 - Math.min(1, summe);
      F[3 * j] = r + rest * farbe[0]; F[3 * j + 1] = g + rest * farbe[1]; F[3 * j + 2] = b + rest * farbe[2];
      Gl[j] = glu; A[j] = aus;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    attr.farbe.needsUpdate = attr.gluehen.needsUpdate = attr.auswahl.needsUpdate = true;
    geo.computeBoundingSphere();
    onMorphMs?.(performance.now() - t0);
  };

  useFrame((_, dt) => {
    const a = anzeige.current ??= { mu: zustand.mu.slice(), omega: zustand.omega, muRest: zustand.muRest };
    let aktiv = false;
    const k = bewegung ? 1 - Math.exp(-Math.min(dt, 0.1) / 0.3) : 1;
    for (let e = 0; e < n; e++) {
      const d = zustand.mu[e] - a.mu[e];
      if (Math.abs(d) > 2e-4) { a.mu[e] += d * k; aktiv = true; } else a.mu[e] = zustand.mu[e];
    }
    for (const key of ['omega', 'muRest'] as const) {
      const d = zustand[key] - a[key];
      if (Math.abs(d) > 2e-4) { a[key] += d * k; aktiv = true; } else a[key] = zustand[key];
    }
    // Glühen: schnell an, dann über ~2,5 s abklingen
    const t = (performance.now() - gluehStart) / 1000;
    const huelle = !bewegung ? (t < 2.5 ? 1 : 0) : t < 0 ? 0 : t < 0.18 ? t / 0.18 : Math.exp(-(t - 0.18) / 0.9);
    const glueht = huelle > 0.01;
    for (let e = 0; e < n; e++) glow.current[e] = glueht ? zustand.gluehen[e] * huelle : 0;
    const ziel = darstellung === 'haut' ? 0 : darstellung === 'entwicklung' ? 0.85 : 0.95;
    const fd = ziel - farbAnteil.current;
    if (Math.abs(fd) > 0.002) { farbAnteil.current += fd * (bewegung ? Math.min(1, dt * 8) : 1); aktiv = true; } else farbAnteil.current = ziel;
    uniforms.uFarbAnteil.value = farbAnteil.current;
    mat.sheen = 0.02 + 0.33 * (1 - farbAnteil.current);   // Haut-Glanz würde die Farbskalen auswaschen
    if (aktiv || glueht || dirty.current) {
      aktualisiere(a.mu, a.muRest, a.omega);
      dirty.current = glueht;   // nach dem Abklingen einmal sauber auf 0 setzen
    }
    if (aktiv || glueht) invalidate();
  });

  const tippen = (e: ThreeEvent<MouseEvent>) => {
    if (!onWahl || !e.face) return;
    e.stopPropagation();
    const q = daten.koerper.quelle, ecken = [e.face.a, e.face.b, e.face.c], p = verformer.posUV;
    const lokal = e.object.worldToLocal(e.point.clone());
    let beste = ecken[0], d = Infinity;
    for (const j of ecken) {
      const s = 3 * j, dd = (p[s] - lokal.x) ** 2 + (p[s + 1] - lokal.y) ** 2 + (p[s + 2] - lokal.z) ** 2;
      if (dd < d) { d = dd; beste = j; }
    }
    onWahl(hauptEinheit(masken, q[beste]));
  };

  const muRest = anzeige.current?.muRest ?? zustand.muRest, omega = anzeige.current?.omega ?? zustand.omega;
  return (
    <group position={position}>
      <mesh geometry={geo} material={mat} onClick={tippen} />
      {daten.begleiter.map(b => <BegleitNetz key={b.name} b={b} muRest={Math.round(muRest * 50) / 50} omega={Math.round(omega * 50) / 50} basis={basis} />)}
    </group>
  );
}
