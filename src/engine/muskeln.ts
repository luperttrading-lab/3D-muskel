// Muskeldefinitionen. Jeder Muskel existiert links und rechts als eigene Einheit.
// masse: grobe Modellannahme in kg je Seite beim Durchschnittsmann (für Magermasse und Gewichtung).

export type Seite = 'L' | 'R';
export const SEITEN: Seite[] = ['L', 'R'];

export type Region = 'brust' | 'schulter' | 'oberarm' | 'unterarm' | 'ruecken' | 'bauch' | 'gesaess' | 'oberschenkel' | 'waden';
export type Ansicht = 'vorn' | 'hinten' | 'seite';

export interface MuskelDefinition {
  id: string;
  name: string;
  latein: string;
  gruppe: string;
  region: Region;
  sichtbar: boolean;     // oberflächlich (verformt die Oberfläche) oder tief (nur berechnet)
  masse: number;
  oben: boolean;         // Oberkörper (für den Frauenfaktor der Muskelmasse)
  amax?: number;         // erreichbare Entwicklung relativ zu 1
  ansicht: Ansicht;      // aus welcher Richtung der Muskel am besten zu sehen ist
  antagonisten?: string[];
}

export const MUSKELN: MuskelDefinition[] = [
  { id: 'brust_o', name: 'Brust oben', latein: 'M. pectoralis major, Pars clavicularis', gruppe: 'Brust', region: 'brust', sichtbar: true, masse: 0.10, oben: true, ansicht: 'vorn', antagonisten: ['trapez_m'] },
  { id: 'brust_u', name: 'Brust unten', latein: 'M. pectoralis major, Pars sternocostalis', gruppe: 'Brust', region: 'brust', sichtbar: true, masse: 0.22, oben: true, ansicht: 'vorn', antagonisten: ['lat'] },
  { id: 'serratus', name: 'Sägemuskel', latein: 'M. serratus anterior', gruppe: 'Brust', region: 'brust', sichtbar: true, masse: 0.15, oben: true, ansicht: 'seite' },
  { id: 'delt_v', name: 'Vordere Schulter', latein: 'M. deltoideus, Pars clavicularis', gruppe: 'Schulter', region: 'schulter', sichtbar: true, masse: 0.13, oben: true, ansicht: 'vorn', antagonisten: ['delt_h'] },
  { id: 'delt_s', name: 'Seitliche Schulter', latein: 'M. deltoideus, Pars acromialis', gruppe: 'Schulter', region: 'schulter', sichtbar: true, masse: 0.15, oben: true, ansicht: 'seite' },
  { id: 'delt_h', name: 'Hintere Schulter', latein: 'M. deltoideus, Pars spinalis', gruppe: 'Schulter', region: 'schulter', sichtbar: true, masse: 0.12, oben: true, ansicht: 'hinten', antagonisten: ['delt_v'] },
  { id: 'rotatoren', name: 'Rotatorenmanschette', latein: 'Mm. supraspinatus, infraspinatus, teres minor, subscapularis', gruppe: 'Schulter', region: 'schulter', sichtbar: false, masse: 0.12, oben: true, amax: 0.8, ansicht: 'hinten' },
  { id: 'bizeps', name: 'Bizeps', latein: 'M. biceps brachii', gruppe: 'Arme', region: 'oberarm', sichtbar: true, masse: 0.15, oben: true, ansicht: 'vorn', antagonisten: ['trizeps'] },
  { id: 'brachialis', name: 'Oberarmmuskel', latein: 'M. brachialis', gruppe: 'Arme', region: 'oberarm', sichtbar: true, masse: 0.12, oben: true, ansicht: 'seite' },
  { id: 'trizeps', name: 'Trizeps', latein: 'M. triceps brachii', gruppe: 'Arme', region: 'oberarm', sichtbar: true, masse: 0.35, oben: true, ansicht: 'hinten', antagonisten: ['bizeps'] },
  { id: 'brachiorad', name: 'Oberarmspeichenmuskel', latein: 'M. brachioradialis', gruppe: 'Arme', region: 'unterarm', sichtbar: true, masse: 0.06, oben: true, amax: 0.85, ansicht: 'vorn' },
  { id: 'ua_beuger', name: 'Unterarmbeuger', latein: 'Mm. flexores antebrachii', gruppe: 'Arme', region: 'unterarm', sichtbar: true, masse: 0.20, oben: true, amax: 0.85, ansicht: 'vorn', antagonisten: ['ua_strecker'] },
  { id: 'ua_strecker', name: 'Unterarmstrecker', latein: 'Mm. extensores antebrachii', gruppe: 'Arme', region: 'unterarm', sichtbar: true, masse: 0.15, oben: true, amax: 0.85, ansicht: 'hinten', antagonisten: ['ua_beuger'] },
  { id: 'lat', name: 'Latissimus', latein: 'M. latissimus dorsi', gruppe: 'Rücken', region: 'ruecken', sichtbar: true, masse: 0.35, oben: true, ansicht: 'hinten', antagonisten: ['brust_u'] },
  { id: 'trapez_o', name: 'Trapez oben', latein: 'M. trapezius, Pars descendens', gruppe: 'Rücken', region: 'ruecken', sichtbar: true, masse: 0.12, oben: true, ansicht: 'hinten' },
  { id: 'trapez_m', name: 'Trapez Mitte & Rautenmuskeln', latein: 'M. trapezius, Pars transversa et ascendens; Mm. rhomboidei', gruppe: 'Rücken', region: 'ruecken', sichtbar: true, masse: 0.20, oben: true, ansicht: 'hinten' },
  { id: 'strecker', name: 'Rückenstrecker', latein: 'M. erector spinae', gruppe: 'Rücken', region: 'ruecken', sichtbar: true, masse: 0.40, oben: true, ansicht: 'hinten', antagonisten: ['bauch_g'] },
  { id: 'bauch_g', name: 'Gerader Bauchmuskel', latein: 'M. rectus abdominis', gruppe: 'Bauch & Hüfte', region: 'bauch', sichtbar: true, masse: 0.12, oben: true, ansicht: 'vorn', antagonisten: ['strecker'] },
  { id: 'bauch_s', name: 'Schräge Bauchmuskeln', latein: 'Mm. obliqui externus et internus abdominis', gruppe: 'Bauch & Hüfte', region: 'bauch', sichtbar: true, masse: 0.30, oben: true, ansicht: 'vorn' },
  { id: 'bauch_q', name: 'Querer Bauchmuskel', latein: 'M. transversus abdominis', gruppe: 'Bauch & Hüfte', region: 'bauch', sichtbar: false, masse: 0.08, oben: true, amax: 0.8, ansicht: 'vorn' },
  { id: 'iliopsoas', name: 'Hüftbeuger', latein: 'M. iliopsoas', gruppe: 'Bauch & Hüfte', region: 'bauch', sichtbar: false, masse: 0.30, oben: false, amax: 0.8, ansicht: 'vorn', antagonisten: ['glut_max'] },
  { id: 'glut_max', name: 'Großer Gesäßmuskel', latein: 'M. gluteus maximus', gruppe: 'Gesäß', region: 'gesaess', sichtbar: true, masse: 0.80, oben: false, ansicht: 'hinten', antagonisten: ['iliopsoas'] },
  { id: 'glut_med', name: 'Mittlerer Gesäßmuskel', latein: 'M. gluteus medius', gruppe: 'Gesäß', region: 'gesaess', sichtbar: true, masse: 0.25, oben: false, ansicht: 'seite', antagonisten: ['adduktoren'] },
  { id: 'glut_min', name: 'Kleiner Gesäßmuskel', latein: 'M. gluteus minimus', gruppe: 'Gesäß', region: 'gesaess', sichtbar: false, masse: 0.08, oben: false, amax: 0.8, ansicht: 'seite' },
  { id: 'vast_lat', name: 'Quadrizeps außen', latein: 'M. vastus lateralis', gruppe: 'Beine', region: 'oberschenkel', sichtbar: true, masse: 0.75, oben: false, ansicht: 'vorn', antagonisten: ['hamstrings'] },
  { id: 'vast_med', name: 'Quadrizeps innen', latein: 'M. vastus medialis', gruppe: 'Beine', region: 'oberschenkel', sichtbar: true, masse: 0.55, oben: false, ansicht: 'vorn', antagonisten: ['hamstrings'] },
  { id: 'rect_fem', name: 'Quadrizeps Mitte', latein: 'M. rectus femoris', gruppe: 'Beine', region: 'oberschenkel', sichtbar: true, masse: 0.30, oben: false, ansicht: 'vorn', antagonisten: ['hamstrings'] },
  { id: 'vast_int', name: 'Quadrizeps tief', latein: 'M. vastus intermedius', gruppe: 'Beine', region: 'oberschenkel', sichtbar: false, masse: 0.40, oben: false, ansicht: 'vorn' },
  { id: 'hamstrings', name: 'Beinbeuger', latein: 'Mm. biceps femoris, semitendinosus, semimembranosus', gruppe: 'Beine', region: 'oberschenkel', sichtbar: true, masse: 0.90, oben: false, ansicht: 'hinten', antagonisten: ['rect_fem'] },
  { id: 'adduktoren', name: 'Adduktoren', latein: 'Mm. adductores', gruppe: 'Beine', region: 'oberschenkel', sichtbar: true, masse: 1.00, oben: false, ansicht: 'vorn', antagonisten: ['glut_med'] },
  { id: 'gastro', name: 'Zwillingswadenmuskel', latein: 'M. gastrocnemius', gruppe: 'Waden', region: 'waden', sichtbar: true, masse: 0.35, oben: false, amax: 0.75, ansicht: 'hinten', antagonisten: ['tibialis'] },
  { id: 'soleus', name: 'Schollenmuskel', latein: 'M. soleus', gruppe: 'Waden', region: 'waden', sichtbar: true, masse: 0.40, oben: false, amax: 0.75, ansicht: 'hinten' },
  { id: 'tibialis', name: 'Schienbeinmuskel', latein: 'M. tibialis anterior', gruppe: 'Waden', region: 'waden', sichtbar: true, masse: 0.10, oben: false, amax: 0.7, ansicht: 'vorn', antagonisten: ['gastro'] },
];

export const MUSKEL: Record<string, MuskelDefinition> = Object.fromEntries(MUSKELN.map(m => [m.id, m]));

// Einheiten: 0 = kein Muskel, dann je Muskel L und R. Der Index ist die gemeinsame Sprache von Engine und Avatar.
export interface Einheit { index: number; id: string; seite: Seite }
export const EINHEITEN: Einheit[] = MUSKELN.flatMap((m, i) => SEITEN.map((s, k) => ({ index: 1 + 2 * i + k, id: m.id, seite: s })));
export const ANZAHL_EINHEITEN = EINHEITEN.length + 1;
export function einheitIndex(id: string, seite: Seite): number {
  const i = MUSKELN.findIndex(m => m.id === id);
  if (i < 0) throw new Error('Unbekannter Muskel: ' + id);
  return 1 + 2 * i + (seite === 'R' ? 1 : 0);
}
export const einheit = (index: number): Einheit | undefined => EINHEITEN[index - 1];

export function amax(id: string): number { return MUSKEL[id].amax ?? 1; }
export function muskelMasse(id: string, geschlecht: 'm' | 'w'): number {
  const m = MUSKEL[id];
  return m.masse * (geschlecht === 'm' ? 1 : m.oben ? 0.6 : 0.67);
}
