// 3D-Bühne: Kamera, Licht, Umgebung, Drehen/Zoomen und Kameraführung zu einem Muskel.
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export interface Kameraziel {
  azimut?: number;         // Drehung um die Hochachse (0 = von vorn)
  hoehe?: number;          // Blickziel in Metern
  abstand?: number;
  seitlich?: number;       // Blickziel seitlich der Körpermitte (Meter), z. B. zum Arm hin
  schluessel: number;      // neuer Wert = neue Fahrt
}

function Umgebung() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.32;
    return () => { scene.environment = null; env.dispose(); pm.dispose(); };
  }, [gl, scene]);
  return null;
}

function Boden({ akzent }: { akzent: string }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    r.addColorStop(0, 'rgba(0,0,0,0.65)'); r.addColorStop(0.35, 'rgba(0,0,0,0.35)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = akzent; g.globalAlpha = 0.85; g.lineWidth = 3;
    g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.25; g.lineWidth = 10; g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [akzent]);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, -0.11]} raycast={() => null}>
      <planeGeometry args={[1.25, 1.25]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

function Fuehrung({ ziel, mitte, steuerung }: { ziel?: Kameraziel; mitte: THREE.Vector3; steuerung: React.RefObject<OrbitControlsImpl | null> }) {
  const fahrt = useRef<{ az0: number; az1: number; h0: number; h1: number; x0: number; x1: number; d0: number; d1: number; t: number } | null>(null);
  const { camera, invalidate } = useThree();
  useEffect(() => {
    const c = steuerung.current;
    if (!ziel || !c) return;
    const az0 = c.getAzimuthalAngle();
    let az1 = ziel.azimut ?? az0;
    while (az1 - az0 > Math.PI) az1 -= 2 * Math.PI;
    while (az1 - az0 < -Math.PI) az1 += 2 * Math.PI;
    fahrt.current = { az0, az1, h0: c.target.y, h1: ziel.hoehe ?? c.target.y, x0: c.target.x, x1: mitte.x + (ziel.seitlich ?? 0), d0: camera.position.distanceTo(c.target), d1: ziel.abstand ?? camera.position.distanceTo(c.target), t: 0 };
    invalidate();
  }, [ziel?.schluessel]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    const f = fahrt.current, c = steuerung.current;
    if (!f || !c) return;
    f.t = Math.min(1, f.t + dt / 0.9);
    const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
    const az = f.az0 + (f.az1 - f.az0) * e, h = f.h0 + (f.h1 - f.h0) * e, x = f.x0 + (f.x1 - f.x0) * e, d = f.d0 + (f.d1 - f.d0) * e;
    const polar = c.getPolarAngle();
    c.target.set(x, h, mitte.z);
    camera.position.set(x + d * Math.sin(polar) * Math.sin(az), h + d * Math.cos(polar), mitte.z + d * Math.sin(polar) * Math.cos(az));
    c.update();
    if (f.t >= 1) fahrt.current = null; else invalidate();
  });
  return null;
}

interface BuehneProps {
  children: ReactNode;
  groesse: number;
  akzent: string;
  ziel?: Kameraziel;
  startAzimut?: number;
  abstand?: number;
  onFehler?: (e: string) => void;
  bewegung?: boolean;
  className?: string;
  ladeAnzeige?: ReactNode;
  onDaneben?: () => void;
}

export function Buehne({ children, groesse, akzent, ziel, startAzimut = 0.35, abstand, onFehler, bewegung = true, className, ladeAnzeige, onDaneben }: BuehneProps) {
  const steuerung = useRef<OrbitControlsImpl>(null);
  const mitte = useMemo(() => new THREE.Vector3(0, groesse * 0.53, -0.11), [groesse]);
  const d = abstand ?? groesse * 2.25;
  const start: [number, number, number] = [Math.sin(startAzimut) * d, mitte.y + 0.12, mitte.z + Math.cos(startAzimut) * d];
  return (
    <Canvas
      className={className}
      dpr={[1, 2]}
      frameloop="demand"
      onPointerMissed={onDaneben}
      camera={{ fov: 30, near: 0.05, far: 30, position: start }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.92;
        gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onFehler?.('WebGL-Kontext verloren – die Darstellung wird neu aufgebaut.'); });
      }}
    >
      <Umgebung />
      <hemisphereLight args={['#c9d8ff', '#1a1410', 0.4]} />
      <directionalLight position={[2.4, 3.0, 1.8]} intensity={2.6} color="#fff1e4" />
      <directionalLight position={[-2.6, 1.2, 1.4]} intensity={0.45} color="#9db9ff" />
      <directionalLight position={[0, 2.2, -3]} intensity={0.5} color="#b8c8ff" />
      <Suspense fallback={ladeAnzeige ?? null}>
        {children}
      </Suspense>
      <Boden akzent={akzent} />
      <OrbitControls ref={steuerung} target={mitte} enablePan={false} minDistance={0.7} maxDistance={6.5}
        minPolarAngle={0.35} maxPolarAngle={1.75} enableDamping={bewegung} dampingFactor={0.12} rotateSpeed={0.7} zoomSpeed={0.8} />
      <Fuehrung ziel={ziel} mitte={mitte} steuerung={steuerung} />
    </Canvas>
  );
}
