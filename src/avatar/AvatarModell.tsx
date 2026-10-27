// Der verformbare 3D-Körper mit Haut, Augen, Brauen, Wimpern und Haaren.
// Zielwerte (Muskulatur je Einheit, Glühen) kommen als Props; die Anzeige gleitet weich dorthin, damit jeder
// Satz als sichtbares Anschwellen der beanspruchten Muskeln erscheint.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Begleiter, KoerperDaten } from './daten';
import { berechneAnatomie, berechneMasken, hauptEinheit, MAX_JE_PUNKT, type Masken } from './masken';
import { Verformer, beinFelder, breitenFeld, muskelProPunkt } from './morph';
import { poseMatrizen } from './pose';
import { EINHEITEN, einheitIndex, SEITEN } from '../engine/muskeln';
import { atlasFarbe } from '../ui/farben';

export type Darstellung = 'haut' | 'entwicklung' | 'atlas';

export interface AvatarZustand {
  mu: Float32Array;          // Muskulatur je Einheit (Index wie EINHEITEN)
  muRest: number;            // Muskulatur außerhalb der Masken (Kopf, Hände, Füße)
  omega: number;             // Körperfett 0..1
  bezug?: { mu: number; omega: number };   // Startmuskel und Startfett: Muskelzuwachs und Fettabbau getrennt rechnen
  gluehen: Float32Array;     // Stärke des Glühens je Einheit nach dem letzten Satz (0..1)
  farbe: Float32Array;       // RGB je Einheit für Entwicklung/Atlas, Index 0 = Haut ohne Muskel
}

interface Props {
  daten: KoerperDaten;
  zustand: AvatarZustand;
  darstellung: Darstellung;
  auswahl: number | readonly number[];   // hervorgehobene Einheit(en)
  hautton: 'hell' | 'mittel' | 'dunkel';
  akzent: string;
  gluehStart: number;        // performance.now() des letzten Satzes
  bewegung: boolean;         // false = keine weichen Übergänge (reduzierte Bewegung)
  position?: [number, number, number];
  basis?: string;
  pose?: boolean;            // lockere Haltung statt A-Pose (Standard: an)
  aoStaerke?: number;        // Stärke der gebackenen Umgebungsverdeckung (0 = aus)
  onWahl?: (einheit: number) => void;
  onMasken?: (m: Masken, mitten: Map<number, [number, number, number]>) => void;
  onMorphMs?: (ms: number) => void;
}

const RELIEF_GLSL = /* glsl */`
// Normale aus einer prozeduralen Höhe in Metern stören (Bump-Mapping ohne Textur)
vec3 relief(vec3 pos, vec3 n, float h) {
  vec3 dpdx = dFdx(pos), dpdy = dFdy(pos);
  vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - grad);
}
float linie(float y, float m, float b) { return 1.0 - smoothstep(0.0, b, abs(y - m)); }
`;

const KLEID_GLSL = /* glsl */`
uniform float uFrau, uFarbAnteil, uHoseOben, uHoseUnten, uBhOben, uBhUnten, uRumpfX, uTraegerX;
uniform float uAnatomie, uKarteAn, uAtlasLum, uAOStaerke;
uniform sampler2D uAnatKarte, uAnatFarbe, uAnatHoehe, uEinheiten;
uniform vec3 uAtlasRef;
uniform vec3 uKleid, uAkzent, uAkzentAnatomie, uRestFarbe, uBauchY;
varying vec3 vLokal;
varying vec3 vFarbe;
// Einzelwerte in vec4 gebündelt: WebGL garantiert nur 16 Vertex-Attribute (iPhone: genau 16)
varying vec4 vDyn, vStat1, vStat2;
varying vec4 vKlasseA, vKlasseB;
varying float vAO;   // gebackene Umgebungsverdeckung (1 = frei)
#define vGluehen vDyn.x
#define vAuswahl vDyn.y
#define vDef vDyn.z
#define vPhase vStat1.x
#define vRille vStat1.y
#define vRilleHaut vStat1.z
#define vBauch vStat1.w
#define vSerratus vStat2.x
#define vDecke vStat2.y
#define vHautZone vStat2.z
#define vArm vStat2.w
float fenster(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
`;

const LEER = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
LEER.needsUpdate = true;
const ATLAS_REF = (() => { const [r, g, b] = atlasFarbe(0.5); return new THREE.Vector3(r, g, b); })();

function kleidMaterial(map: THREE.Texture, akzent: THREE.Color, gelenke: KoerperDaten['gelenke'], frau: boolean) {
  const mat = new THREE.MeshPhysicalMaterial({
    map, roughness: 0.58, metalness: 0, sheen: 0.35, sheenRoughness: 0.75, sheenColor: new THREE.Color('#ffd9c7'),
    clearcoat: 0.001, clearcoatRoughness: 0.42,
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
    uAnatomie: { value: 0 },
    uAOStaerke: { value: 0.85 },
    uKarteAn: { value: 0 },
    uAnatKarte: { value: LEER as THREE.Texture },
    uAnatFarbe: { value: LEER as THREE.Texture },
    uAnatHoehe: { value: LEER as THREE.Texture },
    uEinheiten: { value: LEER as THREE.Texture },
    uAtlasRef: { value: ATLAS_REF },
    uAtlasLum: { value: 0.17 },   // Luminanz der gemalten Muskelfarbe (linear)
    uAkzentAnatomie: { value: akzent.clone().lerp(new THREE.Color('#ffffff'), 0.1) },
    uRestFarbe: { value: new THREE.Color(0.8, 0.75, 0.7) },
    // Sehnenzüge des Sixpacks: Nabelhöhe und zwei darüber (Anteile der Rumpfhöhe Becken → Hals)
    uBauchY: { value: new THREE.Vector3(...[0.2, 0.32, 0.43].map(v => becken[1] + (hals[1] - becken[1]) * v)) },
  };
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${KLEID_GLSL}\nattribute vec3 aFarbe;\nattribute vec4 aDyn, aStat1, aStat2, aKlasseA, aKlasseB;\nattribute float aAO;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLokal = position; vFarbe = aFarbe; vDyn = aDyn; vStat1 = aStat1; vStat2 = aStat2; vKlasseA = aKlasseA; vKlasseB = aKlasseB; vAO = aAO;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${KLEID_GLSL}${RELIEF_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float w = 0.004;
        float hose = fenster(vLokal.y, uHoseUnten, uHoseOben, w);
        float bh = uFrau * max(fenster(vLokal.y, uBhUnten, uBhOben, w) * (1.0 - smoothstep(uRumpfX - w, uRumpfX + w, abs(vLokal.x))),
                               fenster(vLokal.y, uBhOben - 0.01, uBhOben + 0.12, w) * fenster(abs(vLokal.x), uTraegerX - 0.012, uTraegerX + 0.012, w));
        float kleid = max(hose, bh) * (1.0 - vArm);
        // Muskelfläche mit scharfer Kante zur Sehne/Haut
        float decke = smoothstep(0.15, 0.45, vDecke);
        vec3 farbe = mix(uRestFarbe, vFarbe, decke);
        vec3 hautFarbe = diffuseColor.rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, uKleid, kleid * (1.0 - uFarbAnteil));
        vec3 nachKleid = diffuseColor.rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, farbe * (1.0 - 0.4 * kleid * (1.0 - uAnatomie)), uFarbAnteil);   // Kleidung bleibt als dunklere Zone erkennbar
        // Anatomie: Muskelfasern, Furchen zwischen Muskeln, Sehnenzüge des geraden Bauchmuskels
        float aa = 1.0 - smoothstep(0.1, 0.3, fwidth(vPhase));
        float faser = (0.7 * sin(6.2831853 * vPhase) + 0.3 * sin(6.2831853 * 2.3 * vPhase + 1.3)) * aa * decke;
        float rille = smoothstep(0.12, 0.55, vRille);
        // Sehnenzüge quer und Linea alba in der Mitte
        float sixpack = vBauch * max(max(max(linie(vLokal.y, uBauchY.x, 0.011), linie(vLokal.y, uBauchY.y, 0.011)), linie(vLokal.y, uBauchY.z, 0.01)), linie(vLokal.x, 0.0, 0.009));
        // Haut: sichtbare Muskelgrenzen nur bei viel Muskel und wenig Fett (vDef)
        float rilleHaut = smoothstep(0.05, 0.6, vRilleHaut) * (1.0 - kleid);
        float sixpackHaut = vBauch * max(max(max(linie(vLokal.y, uBauchY.x, 0.012), linie(vLokal.y, uBauchY.y, 0.012)), linie(vLokal.y, uBauchY.z, 0.011)), linie(vLokal.x, 0.0, 0.01));
        float hautTiefe = vDef * (0.0007 * rilleHaut + 0.0008 * sixpackHaut);
        // Faszie: wo die zwei stärksten Farbklassen gleich stark sind; Breite ≈ 2 mm, mindestens ~1 Pixel
        float m1 = 0.0, m2 = 0.0;
        for (int k = 0; k < 8; k++) {
          float v = k < 4 ? vKlasseA[k] : vKlasseB[k - 4];
          if (v > m1) { m2 = m1; m1 = v; } else if (v > m2) m2 = v;
        }
        float abstandGrenze = m1 - m2;
        float faszie = 1.0 - smoothstep(0.04, 0.04 + 1.2 * fwidth(abstandGrenze), abstandGrenze);
        float sixpackKern = vBauch * max(max(max(linie(vLokal.y, uBauchY.x, 0.0045), linie(vLokal.y, uBauchY.y, 0.0045)), linie(vLokal.y, uBauchY.z, 0.004)), linie(vLokal.x, 0.0, 0.004));
        float hoehe = uAnatomie * (0.0005 * faser - 0.0045 * rille - 0.0035 * sixpack) - (1.0 - uAnatomie) * hautTiefe;
        diffuseColor.rgb *= 1.0 - (1.0 - uAnatomie) * vDef * (0.2 * rilleHaut + 0.16 * sixpackHaut) * (1.0 - kleid);   // weiche Schatten in den Muskelgrenzen
        diffuseColor.rgb *= 1.0 - uAnatomie * (0.4 * max(rille - faszie, 0.0) * decke + 0.3 * max(sixpack - sixpackKern, 0.0));   // Schattenkante am Muskelbauch
        diffuseColor.rgb *= 1.0 + uAnatomie * 0.10 * faser;
        diffuseColor.rgb = mix(diffuseColor.rgb, uAkzentAnatomie, uAnatomie * vAuswahl * 0.75);   // gewählter Muskel flächig
        vec3 faszienFarbe = vec3(0.78, 0.80, 0.86);
        // Zacken des Sägemuskels: schräge Linien im Abstand von ~2,8 cm über den seitlichen Rippen
        float sz = (vLokal.y + 0.6 * vLokal.z) / 0.028, szd = min(fract(sz), 1.0 - fract(sz));
        float zacken = smoothstep(0.3, 0.6, vSerratus) * (1.0 - smoothstep(0.05, 0.05 + 1.5 * fwidth(sz), szd));
        diffuseColor.rgb = mix(diffuseColor.rgb, faszienFarbe, uAnatomie * max(max(0.8 * faszie, 0.75 * sixpackKern), 0.7 * zacken));   // Faszien zwischen den Muskeln
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.70, 0.62, 0.64), uAnatomie * (1.0 - decke) * 0.6);   // Sehnenplatten gedämpft, damit Maskenlücken nicht grell wirken
        // Kopf, Hände und Füße bleiben in der Anatomie-Ansicht Haut
        diffuseColor.rgb = mix(diffuseColor.rgb, hautFarbe, uAnatomie * vHautZone * (1.0 - decke));
        // Texturpaket (sobald geladen): gemalte Anatomie, pixelgenaue Einheiten, Relief – ersetzt das Prozedurale
        float gewebe = 0.0;   // 1 = Muskel, 0 = Sehne/Knochen/Haut (für Glanz)
        float hoehle = 0.0;   // Furchentiefe: dort kein Glanz
        if (uKarteAn > 0.5) {
          vec4 kt = texture2D(uAnatKarte, vMapUv);
          gewebe = kt.g * step(0.5, floor(kt.r * 255.0 + 0.5)) * uAnatomie;
          float id = floor(kt.r * 255.0 + 0.5);
          vec4 ec = texture2D(uEinheiten, vec2((id + 0.5) / 128.0, 0.25));   // Farbe der Einheit (Entwicklung bzw. Atlas)
          vec4 ez = texture2D(uEinheiten, vec2((id + 0.5) / 128.0, 0.75));   // r = gewählt
          vec3 gemalt = texture2D(uAnatFarbe, vMapUv).rgb;
          float lum = dot(gemalt, vec3(0.2126, 0.7152, 0.0722));
          vec3 anat = gemalt * mix(vec3(1.0), ec.rgb / uAtlasRef, kt.g * 0.85);
          anat = mix(anat, uAkzentAnatomie * min(0.45 + 0.9 * lum / uAtlasLum, 1.3), ez.r * 0.72);
          vec3 entw = (id > 0.5 ? ec.rgb : uRestFarbe) * (0.6 + 0.4 * min(lum / uAtlasLum, 1.5));
          vec3 tex = mix(entw, anat, uAnatomie);
          tex = mix(tex, hautFarbe, kt.b * step(id, 0.5) * uAnatomie);
          diffuseColor.rgb = mix(nachKleid, tex, uFarbAnteil);
          vec3 ht = texture2D(uAnatHoehe, vMapUv).rgb;
          float hoeheTex = (ht.r - 0.5) * 0.016;
          hoehle = ht.g * uAnatomie;
          hoehe = (uAnatomie + 0.35 * (uFarbAnteil - uAnatomie)) * hoeheTex - (1.0 - uFarbAnteil) * hautTiefe;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, mix(0.55, 0.46, gewebe) + 0.3 * hoehle, uAnatomie * uKarteAn);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = relief(-vViewPosition, normal, hoehe);`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // Umgebungsverdeckung: Achseln, Schritt, Kinn, Kniekehlen bekommen weniger Umgebungs- und etwas weniger Direktlicht
        float ao = mix(1.0, vAO, uAOStaerke);
        reflectedLight.indirectDiffuse *= ao;
        reflectedLight.indirectSpecular *= ao * ao;
        reflectedLight.directDiffuse *= mix(1.0, ao, 0.5);
        reflectedLight.directSpecular *= ao;
        // Furchen fangen kein Glanzlicht (sonst farbige Säume vom Fülllicht)
        reflectedLight.directSpecular *= 1.0 - 0.85 * hoehle;
        reflectedLight.indirectSpecular *= 1.0 - 0.7 * hoehle;
        #ifdef USE_CLEARCOAT
        clearcoatSpecularDirect *= 1.0 - hoehle;
        clearcoatSpecularIndirect *= 1.0 - hoehle;
        #endif`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
        material.clearcoat *= gewebe;   // feuchter Film nur auf Muskelgewebe
        #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float randLicht = pow(1.0 - clamp(dot(nonPerturbedNormal, normalize(vViewPosition)), 0.0, 1.0), 3.0);   // Silhouette, nicht Relief
        totalEmissiveRadiance += uAkzent * (vGluehen * 0.9 + vAuswahl * 0.4 + randLicht * 0.22);`);
  };
  return { mat, uniforms };
}

function BegleitNetz({ b, muRest, omega, bezug, basis }: { b: Begleiter; muRest: number; omega: number; bezug?: { mu: number; omega: number }; basis: string }) {
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
    verformer.verforme(() => muRest, omega, bezug);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.computeBoundingSphere();
  }, [muRest, omega, bezug?.mu, bezug?.omega, geo, verformer]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} renderOrder={b.alpha ? 2 : 1} raycast={() => null}>
      <meshStandardMaterial map={textur} transparent={b.alpha} alphaTest={b.alpha ? 0.35 : 0} side={b.alpha ? THREE.DoubleSide : THREE.FrontSide}
        roughness={b.name === 'augen' ? 0.15 : 0.85} depthWrite />
    </mesh>
  );
}

// Wachstumsfelder und die Muskeln, die sie steuern (mit Gewicht): V-Form des Oberkörpers, Oberschenkel, Wade, Gesäß
const FELD_IDS: [string, number][][] = [
  [['lat', 0.3], ['delt_s', 0.15], ['delt_v', 0.08], ['delt_h', 0.08], ['brust_u', 0.12], ['brust_o', 0.06], ['trapez_o', 0.08], ['trapez_m', 0.05], ['serratus', 0.08]],
  [['rect_fem', 0.2], ['vast_lat', 0.2], ['vast_med', 0.15], ['hamstrings', 0.25], ['adduktoren', 0.15], ['sartorius', 0.05]],
  [['gastro', 0.5], ['soleus', 0.35], ['tibialis', 0.15]],
  [['glut_max', 0.7], ['glut_med', 0.3]],
];
const ARM_IDS = ['bizeps', 'trizeps', 'brachialis', 'brachiorad', 'ua_beuger', 'ua_strecker', 'delt_v', 'delt_s', 'delt_h'];

export function AvatarModell({ daten, zustand, darstellung, auswahl, hautton, akzent, gluehStart, bewegung, position, basis = import.meta.env.BASE_URL, pose = true, aoStaerke = 0.85, onWahl, onMasken, onMorphMs }: Props) {
  const invalidate = useThree(s => s.invalidate);
  const verformer = useMemo(() => new Verformer(daten.koerper), [daten]);
  // Haltung: Arme locker seitlich (Skelett und Gewichte aus MakeHuman); gilt ab der nächsten Verformung
  const poseM = useMemo(() => (daten.skelett ? poseMatrizen(daten.skelett) : null), [daten]);
  useMemo(() => verformer.setzePose(daten.haut, pose ? poseM : null), [verformer, daten, pose, poseM]);
  const felder = useMemo(() => {
    const bein = beinFelder(daten.koerper, daten.gelenke);
    return [breitenFeld(daten.koerper, daten.gelenke, daten.haut, daten.skelett), bein.oberschenkel, bein.wade, bein.gesaess];
  }, [daten]);
  const feldIdx = useMemo(() => FELD_IDS.map(ids => SEITEN.map(s => ids.map(([id, w]) => [einheitIndex(id, s), w] as [number, number]))), []);
  const masken = useMemo(() => berechneMasken(daten.koerper, daten.gelenke), [daten]);
  const haut = useLoader(THREE.TextureLoader, `${basis}modelle/haut-${daten.geschlecht}-${hautton}.jpg`);
  const akzentFarbe = useMemo(() => new THREE.Color(akzent), [akzent]);
  const { mat, uniforms } = useMemo(() => kleidMaterial(haut, akzentFarbe, daten.gelenke, daten.geschlecht === 'w'), [haut, akzentFarbe, daten]);
  const nUV = daten.koerper.quelle.length;
  const attr = useMemo(() => ({
    farbe: new THREE.BufferAttribute(new Float32Array(nUV * 3), 3),
    dyn: new THREE.BufferAttribute(new Float32Array(nUV * 4), 4),     // Glühen, Auswahl, Definition, –
    stat1: new THREE.BufferAttribute(new Float32Array(nUV * 4), 4),   // Faserphase, Furche, Hautfurche, Bauch
    stat2: new THREE.BufferAttribute(new Float32Array(nUV * 4), 4),   // Sägemuskel, Muskelfläche, Hautzone, Arm
    klasseA: new THREE.BufferAttribute(new Float32Array(nUV * 4), 4),
    klasseB: new THREE.BufferAttribute(new Float32Array(nUV * 4), 4),
    ao: new THREE.BufferAttribute(new Float32Array(nUV).fill(1), 1),
  }), [nUV]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verformer.posUV, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(verformer.norUV, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(daten.koerper.uv, 2));
    g.setAttribute('aFarbe', attr.farbe);
    g.setAttribute('aDyn', attr.dyn);
    g.setAttribute('aStat1', attr.stat1);
    g.setAttribute('aStat2', attr.stat2);
    g.setAttribute('aKlasseA', attr.klasseA);
    g.setAttribute('aKlasseB', attr.klasseB);
    g.setAttribute('aAO', attr.ao);
    g.setIndex(new THREE.BufferAttribute(daten.koerper.dreiecke, 1));
    return g;
  }, [verformer, daten, attr]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useEffect(() => { haut.colorSpace = THREE.SRGBColorSpace; haut.anisotropy = 8; haut.needsUpdate = true; invalidate(); }, [haut, invalidate]);

  // Muskelmitten (für Kameraführung) und Arm-Kennung (Kleidung nie auf den Armen)
  useEffect(() => {
    // Mitten in der Haltung, in der die Figur gezeigt wird (für die Kameraführung)
    const P = daten.koerper.grund, PP = verformer.posiere(P), summe = new Map<number, [number, number, number, number]>();
    for (let i = 0; i < daten.koerper.punkte; i++) {
      const o = i * MAX_JE_PUNKT;
      for (let k = 0; k < MAX_JE_PUNKT; k++) {
        const w = masken.gewicht[o + k];
        if (w < 0.5) break;
        const e = masken.einheit[o + k], s = summe.get(e) ?? [0, 0, 0, 0];
        s[0] += w * PP[3 * i]; s[1] += w * PP[3 * i + 1]; s[2] += w * PP[3 * i + 2]; s[3] += w;
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
      attr.stat2.array[4 * j + 3] = armIds.has(hauptEinheit(masken, i, 0.15)) || Math.abs(P[3 * i]) > aussen ? 1 : 0;
    }

    const an = berechneAnatomie(daten.koerper, daten.gelenke, masken, e => EINHEITEN[e - 1]?.id ?? '');
    // Hautzonen: Kopf oberhalb des Halses, Hände ab dem Handgelenk, Füße unterhalb der Knöchel
    const G = daten.gelenke, hals = G['neck'], hand = G['l-hand'], ell = G['l-elbow'], kn = G['l-ankle'];
    const ua = [hand[0] - ell[0], hand[1] - ell[1], hand[2] - ell[2]], ual = Math.hypot(ua[0], ua[1], ua[2]);
    const zone = (i: number) => {
      const x = Math.abs(P[3 * i]), y = P[3 * i + 1], z = P[3 * i + 2];
      const t = ((x - ell[0]) * ua[0] + (y - ell[1]) * ua[1] + (z - ell[2]) * ua[2]) / (ual * ual);
      const kopf = Math.min(1, Math.max(0, (y - hals[1] + 0.05) / 0.03));   // Hals mit Haut, wo kein Muskel liegt
      const haende = Math.min(1, Math.max(0, (t - 0.9) / 0.08));
      const fuesse = Math.min(1, Math.max(0, (kn[1] + 0.04 - y) / 0.03));
      return Math.max(kopf, haende, fuesse);
    };
    for (let j = 0; j < q.length; j++) {
      const i = q[j];
      const S1 = attr.stat1.array, S2 = attr.stat2.array;
      S1[4 * j] = an.phase[i]; S1[4 * j + 1] = an.rille[i]; S1[4 * j + 2] = an.rilleHaut[i]; S1[4 * j + 3] = an.bauch[i];
      S2[4 * j] = an.serratus[i]; S2[4 * j + 2] = zone(i);
      for (let k = 0; k < 4; k++) { attr.klasseA.array[4 * j + k] = an.klassen[8 * i + k]; attr.klasseB.array[4 * j + k] = an.klassen[8 * i + 4 + k]; }
      let summe = 0;
      for (let k = 0; k < MAX_JE_PUNKT; k++) summe += masken.gewicht[i * MAX_JE_PUNKT + k];
      S2[4 * j + 1] = Math.min(1, summe);
    }
    if (daten.ao) for (let j = 0; j < q.length; j++) attr.ao.array[j] = daten.ao[q[j]] / 255;
    attr.stat1.needsUpdate = attr.stat2.needsUpdate = attr.klasseA.needsUpdate = attr.klasseB.needsUpdate = attr.ao.needsUpdate = true;
  }, [masken, daten, attr, onMasken, verformer, pose, poseM]);

  // Anatomie-Texturpaket: wird erst geladen, wenn Entwicklung oder Anatomie gezeigt werden
  const einheitenTex = useMemo(() => {
    const t = new THREE.DataTexture(new Uint8Array(128 * 2 * 4), 128, 2);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }, []);
  useEffect(() => { uniforms.uEinheiten.value = einheitenTex; }, [uniforms, einheitenTex]);
  const karteIds = useRef<{ n: number; id: Uint8Array } | null>(null);
  const [paketGewollt, setPaketGewollt] = useState(false);
  useEffect(() => { if (darstellung !== 'haut') setPaketGewollt(true); }, [darstellung]);
  useEffect(() => {
    if (!paketGewollt) return;
    let ab = false;
    const pfad = (k: string) => `${basis}modelle/anatomie-${daten.geschlecht}-${k}`;
    const tl = new THREE.TextureLoader(), il = new THREE.ImageLoader();
    const laden = <T,>(f: (ok: (x: T) => void, fehler: (e: unknown) => void) => void) => new Promise<T>((ok, fehler) => f(ok, fehler));
    Promise.all([
      laden<THREE.Texture>((ok, f) => tl.load(pfad('farbe.jpg'), ok, undefined, f)),
      laden<THREE.Texture>((ok, f) => tl.load(pfad('hoehe.png'), ok, undefined, f)),
      laden<HTMLImageElement>((ok, f) => il.load(pfad('karte.png'), ok, undefined, f)),
    ]).then(([farbeT, hoeheT, karteBild]) => {
      if (ab) return;
      farbeT.colorSpace = THREE.SRGBColorSpace; farbeT.anisotropy = 8;
      hoeheT.colorSpace = THREE.NoColorSpace;
      const karteT = new THREE.Texture(karteBild);
      karteT.colorSpace = THREE.NoColorSpace;
      karteT.magFilter = karteT.minFilter = THREE.NearestFilter;   // Einheiten dürfen nicht gemischt werden
      karteT.generateMipmaps = false;
      for (const t of [farbeT, hoeheT, karteT]) { t.flipY = true; t.needsUpdate = true; }
      // Einheit je Pixel auch auf der CPU, damit Antippen genau den gezeichneten Muskel trifft
      const c = document.createElement('canvas');
      c.width = karteBild.width; c.height = karteBild.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(karteBild, 0, 0);
        const roh = ctx.getImageData(0, 0, c.width, c.height).data, id = new Uint8Array(c.width * c.height);
        for (let i = 0; i < id.length; i++) id[i] = roh[4 * i];
        karteIds.current = { n: c.width, id };
      }
      uniforms.uAnatFarbe.value = farbeT; uniforms.uAnatHoehe.value = hoeheT; uniforms.uAnatKarte.value = karteT; uniforms.uKarteAn.value = 1;
      dirty.current = true; invalidate();
    }).catch(() => { /* ohne Paket bleibt die prozedurale Anatomie */ });
    return () => { ab = true; };
  }, [paketGewollt, basis, daten.geschlecht, uniforms, invalidate]);

  // Anzeige-Zustand gleitet auf die Zielwerte zu
  const n = zustand.mu.length;
  const anzeige = useRef<{ mu: Float32Array; omega: number; muRest: number } | null>(null);
  const glow = useRef(new Float32Array(n));
  const dirty = useRef(true);
  const farbAnteil = useRef(0);
  const anatAnteil = useRef(0);
  useEffect(() => { dirty.current = true; invalidate(); }, [zustand, auswahl, darstellung, gluehStart, pose, invalidate]);

  const auswahlMenge = useMemo(() => new Set(typeof auswahl === 'number' ? (auswahl ? [auswahl] : []) : auswahl), [auswahl]);
  const aktualisiere = (mu: Float32Array, muRest: number, omega: number) => {
    const t0 = performance.now();
    const muPunkt = muskelProPunkt(masken, mu, muRest);
    // Ausprägung je Feld und Seite aus den steuernden Muskeln relativ zum Startmuskel (Arcade-Spanne 0,42 → 1,3 = 0,88)
    const mu0 = zustand.bezug?.mu;
    const stark = (liste: [number, number][]) => mu0 === undefined ? 0 : Math.min(1.3, Math.max(0, (liste.reduce((s, [e, w]) => s + w * mu[e], 0) - mu0) / 0.88));
    verformer.setzeFelder(felder.map((feld, k) => ({ feld, L: stark(feldIdx[k][0]), R: stark(feldIdx[k][1]) })));
    verformer.verforme(muPunkt, omega, zustand.bezug);
    // Sichtbare Definition: wächst mit dem Muskel, verschwindet unter Fett
    const glatt = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const fett = 1 - glatt(0.35, 0.95, omega);
    const q = daten.koerper.quelle, F = attr.farbe.array as Float32Array, Dy = attr.dyn.array as Float32Array;
    const mg = masken.gewicht, me = masken.einheit, farbe = zustand.farbe, gl = glow.current;
    for (let j = 0; j < q.length; j++) {
      const o = q[j] * MAX_JE_PUNKT;
      let r = 0, g = 0, b = 0, glu = 0, aus = 0, summe = 0;
      for (let k = 0; k < MAX_JE_PUNKT; k++) {
        const w = mg[o + k];
        if (w === 0) break;
        const e = me[o + k], ton = darstellung === 'atlas' ? 1 + 0.09 * Math.sin(e * 2.399) : 1;
        r += w * ton * farbe[3 * e]; g += w * ton * farbe[3 * e + 1]; b += w * ton * farbe[3 * e + 2];
        glu += w * gl[e];
        if (auswahlMenge.has(e)) aus += w;
        summe += w;
      }
      // Muskelfarbe ohne Sehnenanteil; die Mischung zur Restfarbe macht der Shader mit scharfer Kante
      if (summe > 1e-4) { F[3 * j] = r / summe; F[3 * j + 1] = g / summe; F[3 * j + 2] = b / summe; }
      else { F[3 * j] = farbe[0]; F[3 * j + 1] = farbe[1]; F[3 * j + 2] = farbe[2]; }
      Dy[4 * j] = glu; Dy[4 * j + 1] = aus; Dy[4 * j + 2] = glatt(0.5, 1.25, muPunkt(q[j])) * fett;
    }
    uniforms.uRestFarbe.value.setRGB(farbe[0], farbe[1], farbe[2]);
    const ED = einheitenTex.image.data as Uint8Array;
    for (let e = 0; e < Math.min(128, farbe.length / 3); e++) {
      ED[4 * e] = Math.round(255 * Math.min(1, farbe[3 * e])); ED[4 * e + 1] = Math.round(255 * Math.min(1, farbe[3 * e + 1])); ED[4 * e + 2] = Math.round(255 * Math.min(1, farbe[3 * e + 2])); ED[4 * e + 3] = 255;
      ED[512 + 4 * e] = auswahlMenge.has(e) ? 255 : 0; ED[512 + 4 * e + 1] = Math.round(255 * Math.min(1, gl[e] ?? 0));
    }
    einheitenTex.needsUpdate = true;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    attr.farbe.needsUpdate = attr.dyn.needsUpdate = true;
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
    const az = darstellung === 'atlas' ? 1 : 0, ad = az - anatAnteil.current;
    if (Math.abs(ad) > 0.002) { anatAnteil.current += ad * (bewegung ? Math.min(1, dt * 8) : 1); aktiv = true; } else anatAnteil.current = az;
    uniforms.uAnatomie.value = anatAnteil.current;
    mat.roughness = 0.58 - 0.16 * anatAnteil.current;   // Muskelgewebe glänzt leicht feucht
    uniforms.uAOStaerke.value = aoStaerke;
    mat.clearcoat = 0.001 + 0.08 * anatAnteil.current;     // im Shader nur auf Muskelgewebe
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
    const k = karteIds.current;
    if (k && e.uv) {
      const px = Math.min(k.n - 1, Math.max(0, Math.floor(e.uv.x * k.n))), py = Math.min(k.n - 1, Math.max(0, Math.floor((1 - e.uv.y) * k.n)));
      const id = k.id[py * k.n + px];
      if (id) { onWahl(id); return; }
    }
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
      <mesh geometry={geo} material={mat} onClick={tippen} castShadow receiveShadow />
      {daten.begleiter.map(b => <BegleitNetz key={b.name} b={b} muRest={Math.round(muRest * 50) / 50} omega={Math.round(omega * 50) / 50} bezug={zustand.bezug} basis={basis} />)}
    </group>
  );
}
