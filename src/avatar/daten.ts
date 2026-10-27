// Lädt und entpackt die Körperdaten (public/modelle/koerper-<m|w>.json, erzeugt von tools/mh-export.mjs).

export type Geschlecht = 'm' | 'w';
export const FORM_STUFEN = ['minmuscle', 'averagemuscle', 'maxmuscle'] as const;
export const GEWICHT_STUFEN = ['minweight', 'averageweight', 'maxweight'] as const;

interface Abschnitt { off: number; n: number; typ: string }
interface RohBegleiter {
  name: string; textur: string; alpha: boolean; punkte: number;
  grund: Abschnitt; formen: Record<string, Abschnitt>; quelle: Abschnitt; uv: Abschnitt; dreiecke: Abschnitt;
}
interface RohDaten {
  version: number; geschlecht: Geschlecht; groesse: number; quant: number; formen: string[];
  koerper: Record<string, Abschnitt> & { punkte: number };
  begleiter: RohBegleiter[];
  gelenke: Record<string, [number, number, number]>;
  daten: string;
}

// Ein verformbares Netz: Grundform + 8 Differenzformen (Muskel × Gewicht), getrennte UV-Punkte über »quelle«
export interface FormNetz {
  punkte: number;                       // gemeinsame Punkte (für Verformung und Normalen)
  grund: Float32Array;                  // punkte × 3
  formen: Map<string, Float32Array>;    // Schlüssel "muskelstufe|gewichtstufe" → Differenz punkte × 3 (Meter)
  quelle: Uint16Array;                  // UV-Punkt → gemeinsamer Punkt
  uv: Float32Array;
  dreiecke: Uint16Array;                // Indizes auf UV-Punkte
}
export interface Begleiter extends FormNetz { name: string; textur: string; alpha: boolean }
export interface KoerperDaten {
  geschlecht: Geschlecht;
  groesse: number;
  koerper: FormNetz;
  begleiter: Begleiter[];
  gelenke: Record<string, [number, number, number]>;
}

function base64ZuBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const TYPEN: Record<string, new (b: ArrayBuffer, off: number, n: number) => ArrayBufferView> = {
  Float32Array, Int16Array, Uint16Array, Uint32Array,
};
function ansicht<T>(puffer: ArrayBuffer, a: Abschnitt): T {
  return new TYPEN[a.typ](puffer, a.off, a.n) as T;
}
function differenz(puffer: ArrayBuffer, a: Abschnitt, quant: number): Float32Array {
  const q = ansicht<Int16Array>(puffer, a);
  const f = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) f[i] = q[i] * quant;
  return f;
}

export function entpacke(roh: RohDaten): KoerperDaten {
  const puffer = base64ZuBytes(roh.daten).buffer as ArrayBuffer;
  const netz = (teil: { grund: Abschnitt; quelle: Abschnitt; uv: Abschnitt; dreiecke: Abschnitt }, formen: Record<string, Abschnitt>, punkte: number): FormNetz => ({
    punkte,
    grund: ansicht<Float32Array>(puffer, teil.grund),
    formen: new Map(roh.formen.map(k => [k, differenz(puffer, formen[k], roh.quant)])),
    quelle: ansicht<Uint16Array>(puffer, teil.quelle),
    uv: ansicht<Float32Array>(puffer, teil.uv),
    dreiecke: ansicht<Uint16Array>(puffer, teil.dreiecke),
  });
  const k = roh.koerper;
  return {
    geschlecht: roh.geschlecht,
    groesse: roh.groesse,
    koerper: netz({ grund: k.grund, quelle: k.quelle, uv: k.uv, dreiecke: k.dreiecke }, k, k.punkte),
    begleiter: roh.begleiter.map(b => ({ ...netz(b, b.formen, b.punkte), name: b.name, textur: b.textur, alpha: b.alpha })),
    gelenke: roh.gelenke,
  };
}

const cache = new Map<Geschlecht, Promise<KoerperDaten>>();
export function ladeKoerper(g: Geschlecht, basis = import.meta.env.BASE_URL): Promise<KoerperDaten> {
  if (!cache.has(g)) {
    cache.set(g, fetch(`${basis}modelle/koerper-${g}.json`).then(async r => {
      if (!r.ok) throw new Error(`Körperdaten nicht geladen (HTTP ${r.status})`);
      return entpacke(await r.json() as RohDaten);
    }).catch(e => { cache.delete(g); throw e; }));
  }
  return cache.get(g)!;
}
