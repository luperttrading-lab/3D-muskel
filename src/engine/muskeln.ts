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
  funktion: [string, string?];   // primär, sekundär
}

export const MUSKELN: MuskelDefinition[] = [
  { id: 'brust_o', name: 'Brust oben', latein: 'M. pectoralis major, Pars clavicularis', gruppe: 'Brust', region: 'brust', sichtbar: true, masse: 0.10, oben: true, ansicht: 'vorn', antagonisten: ['trapez_m'], funktion: ['Arm vor dem Körper nach oben und innen führen', 'Oberarm nach innen drehen'] },
  { id: 'brust_u', name: 'Brust unten', latein: 'M. pectoralis major, Pars sternocostalis', gruppe: 'Brust', region: 'brust', sichtbar: true, masse: 0.22, oben: true, ansicht: 'vorn', antagonisten: ['lat'], funktion: ['Arm vor die Brust und an den Körper ziehen', 'Oberarm nach innen drehen, Arm aus der Überkopfposition senken'] },
  { id: 'serratus', name: 'Sägemuskel', latein: 'M. serratus anterior', gruppe: 'Brust', region: 'brust', sichtbar: true, masse: 0.15, oben: true, ansicht: 'seite', funktion: ['Schulterblatt nach vorn um den Brustkorb ziehen', 'Schulterblatt beim Armheben über Kopf nach oben drehen'] },
  { id: 'delt_v', name: 'Vordere Schulter', latein: 'M. deltoideus, Pars clavicularis', gruppe: 'Schulter', region: 'schulter', sichtbar: true, masse: 0.13, oben: true, ansicht: 'vorn', antagonisten: ['delt_h'], funktion: ['Arm nach vorn heben', 'Oberarm nach innen drehen'] },
  { id: 'delt_s', name: 'Seitliche Schulter', latein: 'M. deltoideus, Pars acromialis', gruppe: 'Schulter', region: 'schulter', sichtbar: true, masse: 0.15, oben: true, ansicht: 'seite', funktion: ['Arm seitlich heben'] },
  { id: 'delt_h', name: 'Hintere Schulter', latein: 'M. deltoideus, Pars spinalis', gruppe: 'Schulter', region: 'schulter', sichtbar: true, masse: 0.12, oben: true, ansicht: 'hinten', antagonisten: ['delt_v'], funktion: ['Arm nach hinten führen', 'Oberarm nach außen drehen'] },
  { id: 'rotatoren', name: 'Rotatorenmanschette', latein: 'Mm. supraspinatus, infraspinatus, teres minor, subscapularis', gruppe: 'Schulter', region: 'schulter', sichtbar: false, masse: 0.12, oben: true, amax: 0.8, ansicht: 'hinten', funktion: ['Oberarmkopf in der Gelenkpfanne zentrieren', 'Oberarm nach außen und innen drehen'] },
  { id: 'bizeps', name: 'Bizeps', latein: 'M. biceps brachii', gruppe: 'Arme', region: 'oberarm', sichtbar: true, masse: 0.15, oben: true, ansicht: 'vorn', antagonisten: ['trizeps'], funktion: ['Ellenbogen beugen', 'Unterarm nach außen drehen (Supination)'] },
  { id: 'brachialis', name: 'Oberarmmuskel', latein: 'M. brachialis', gruppe: 'Arme', region: 'oberarm', sichtbar: true, masse: 0.12, oben: true, ansicht: 'seite', funktion: ['Ellenbogen beugen – in jeder Handstellung'] },
  { id: 'trizeps', name: 'Trizeps', latein: 'M. triceps brachii', gruppe: 'Arme', region: 'oberarm', sichtbar: true, masse: 0.35, oben: true, ansicht: 'hinten', antagonisten: ['bizeps'], funktion: ['Ellenbogen strecken', 'Arm nach hinten führen (langer Kopf)'] },
  { id: 'brachiorad', name: 'Oberarmspeichenmuskel', latein: 'M. brachioradialis', gruppe: 'Arme', region: 'unterarm', sichtbar: true, masse: 0.06, oben: true, amax: 0.85, ansicht: 'vorn', funktion: ['Ellenbogen beugen, besonders mit Daumen nach oben', 'Unterarm in die Mittelstellung drehen'] },
  { id: 'ua_beuger', name: 'Unterarmbeuger', latein: 'Mm. flexores antebrachii', gruppe: 'Arme', region: 'unterarm', sichtbar: true, masse: 0.20, oben: true, amax: 0.85, ansicht: 'vorn', antagonisten: ['ua_strecker'], funktion: ['Handgelenk und Finger beugen – Griffkraft', 'Ellenbogenbeugung unterstützen'] },
  { id: 'ua_strecker', name: 'Unterarmstrecker', latein: 'Mm. extensores antebrachii', gruppe: 'Arme', region: 'unterarm', sichtbar: true, masse: 0.15, oben: true, amax: 0.85, ansicht: 'hinten', antagonisten: ['ua_beuger'], funktion: ['Handgelenk und Finger strecken', 'Handgelenk beim Greifen stabilisieren'] },
  { id: 'lat', name: 'Latissimus', latein: 'M. latissimus dorsi', gruppe: 'Rücken', region: 'ruecken', sichtbar: true, masse: 0.35, oben: true, ansicht: 'hinten', antagonisten: ['brust_u'], funktion: ['Arm von oben nach unten und hinten ziehen', 'Oberarm nach innen drehen, Schulter senken'] },
  { id: 'trapez_o', name: 'Trapez oben', latein: 'M. trapezius, Pars descendens', gruppe: 'Rücken', region: 'ruecken', sichtbar: true, masse: 0.12, oben: true, ansicht: 'hinten', funktion: ['Schultern heben', 'Kopf neigen und drehen'] },
  { id: 'trapez_m', name: 'Trapez Mitte & Rautenmuskeln', latein: 'M. trapezius, Pars transversa et ascendens; Mm. rhomboidei', gruppe: 'Rücken', region: 'ruecken', sichtbar: true, masse: 0.20, oben: true, ansicht: 'hinten', funktion: ['Schulterblätter zusammenziehen', 'Schulterblätter senken und stabilisieren'] },
  { id: 'strecker', name: 'Rückenstrecker', latein: 'M. erector spinae', gruppe: 'Rücken', region: 'ruecken', sichtbar: true, masse: 0.40, oben: true, ansicht: 'hinten', antagonisten: ['bauch_g'], funktion: ['Wirbelsäule strecken und aufrichten', 'Rumpf stabilisieren und seitlich neigen'] },
  { id: 'bauch_g', name: 'Gerader Bauchmuskel', latein: 'M. rectus abdominis', gruppe: 'Bauch & Hüfte', region: 'bauch', sichtbar: true, masse: 0.12, oben: true, ansicht: 'vorn', antagonisten: ['strecker'], funktion: ['Rumpf beugen – Brustkorb zum Becken', 'Becken aufrichten, Rumpf stabilisieren'] },
  { id: 'bauch_s', name: 'Schräge Bauchmuskeln', latein: 'Mm. obliqui externus et internus abdominis', gruppe: 'Bauch & Hüfte', region: 'bauch', sichtbar: true, masse: 0.30, oben: true, ansicht: 'vorn', funktion: ['Rumpf drehen und seitlich neigen', 'Rumpf beugen, Bauchpresse'] },
  { id: 'bauch_q', name: 'Querer Bauchmuskel', latein: 'M. transversus abdominis', gruppe: 'Bauch & Hüfte', region: 'bauch', sichtbar: false, masse: 0.08, oben: true, amax: 0.8, ansicht: 'vorn', funktion: ['Bauch nach innen ziehen, Rumpf stabilisieren', 'Bauchpresse beim Ausatmen und Heben'] },
  { id: 'iliopsoas', name: 'Hüftbeuger', latein: 'M. iliopsoas', gruppe: 'Bauch & Hüfte', region: 'bauch', sichtbar: false, masse: 0.30, oben: false, amax: 0.8, ansicht: 'vorn', antagonisten: ['glut_max'], funktion: ['Hüfte beugen – Bein nach vorn heben', 'Lendenwirbelsäule stabilisieren'] },
  { id: 'glut_max', name: 'Großer Gesäßmuskel', latein: 'M. gluteus maximus', gruppe: 'Gesäß', region: 'gesaess', sichtbar: true, masse: 0.80, oben: false, ansicht: 'hinten', antagonisten: ['iliopsoas'], funktion: ['Hüfte strecken', 'Oberschenkel nach außen drehen'] },
  { id: 'glut_med', name: 'Mittlerer Gesäßmuskel', latein: 'M. gluteus medius', gruppe: 'Gesäß', region: 'gesaess', sichtbar: true, masse: 0.25, oben: false, ansicht: 'seite', antagonisten: ['adduktoren'], funktion: ['Bein seitlich abspreizen', 'Becken im Einbeinstand stabilisieren'] },
  { id: 'glut_min', name: 'Kleiner Gesäßmuskel', latein: 'M. gluteus minimus', gruppe: 'Gesäß', region: 'gesaess', sichtbar: false, masse: 0.08, oben: false, amax: 0.8, ansicht: 'seite', funktion: ['Bein seitlich abspreizen', 'Oberschenkel nach innen drehen, Becken stabilisieren'] },
  { id: 'vast_lat', name: 'Quadrizeps außen', latein: 'M. vastus lateralis', gruppe: 'Beine', region: 'oberschenkel', sichtbar: true, masse: 0.75, oben: false, ansicht: 'vorn', antagonisten: ['hamstrings'], funktion: ['Knie strecken', 'Kniescheibe außen führen'] },
  { id: 'vast_med', name: 'Quadrizeps innen', latein: 'M. vastus medialis', gruppe: 'Beine', region: 'oberschenkel', sichtbar: true, masse: 0.55, oben: false, ansicht: 'vorn', antagonisten: ['hamstrings'], funktion: ['Knie strecken, besonders zum Ende der Streckung', 'Kniescheibe innen stabilisieren'] },
  { id: 'rect_fem', name: 'Quadrizeps Mitte', latein: 'M. rectus femoris', gruppe: 'Beine', region: 'oberschenkel', sichtbar: true, masse: 0.30, oben: false, ansicht: 'vorn', antagonisten: ['hamstrings'], funktion: ['Knie strecken', 'Hüfte beugen'] },
  { id: 'vast_int', name: 'Quadrizeps tief', latein: 'M. vastus intermedius', gruppe: 'Beine', region: 'oberschenkel', sichtbar: false, masse: 0.40, oben: false, ansicht: 'vorn', funktion: ['Knie strecken'] },
  { id: 'hamstrings', name: 'Beinbeuger', latein: 'Mm. biceps femoris, semitendinosus, semimembranosus', gruppe: 'Beine', region: 'oberschenkel', sichtbar: true, masse: 0.90, oben: false, ansicht: 'hinten', antagonisten: ['rect_fem'], funktion: ['Knie beugen', 'Hüfte strecken'] },
  { id: 'adduktoren', name: 'Adduktoren', latein: 'Mm. adductores', gruppe: 'Beine', region: 'oberschenkel', sichtbar: true, masse: 1.00, oben: false, ansicht: 'vorn', antagonisten: ['glut_med'], funktion: ['Bein zur Körpermitte führen', 'Hüftbeugung und -streckung unterstützen'] },
  { id: 'gastro', name: 'Zwillingswadenmuskel', latein: 'M. gastrocnemius', gruppe: 'Waden', region: 'waden', sichtbar: true, masse: 0.35, oben: false, amax: 0.75, ansicht: 'hinten', antagonisten: ['tibialis'], funktion: ['Fuß strecken – auf die Zehenspitzen', 'Knie beugen'] },
  { id: 'soleus', name: 'Schollenmuskel', latein: 'M. soleus', gruppe: 'Waden', region: 'waden', sichtbar: true, masse: 0.40, oben: false, amax: 0.75, ansicht: 'hinten', funktion: ['Fuß strecken, besonders bei gebeugtem Knie', 'Stand stabilisieren'] },
  { id: 'tibialis', name: 'Schienbeinmuskel', latein: 'M. tibialis anterior', gruppe: 'Waden', region: 'waden', sichtbar: true, masse: 0.10, oben: false, amax: 0.7, ansicht: 'vorn', antagonisten: ['gastro'], funktion: ['Fuß anheben', 'Fußgewölbe stützen'] },
  // neu ab 0.3: am Ende angefügt, damit die Einheiten-Indizes gespeicherter Daten gleich bleiben
  { id: 'sartorius', name: 'Schneidermuskel', latein: 'M. sartorius', gruppe: 'Beine', region: 'oberschenkel', sichtbar: true, masse: 0.15, oben: false, amax: 0.8, ansicht: 'vorn', funktion: ['Hüfte beugen und Oberschenkel nach außen drehen', 'Knie beugen'] },
];

export const MUSKEL: Record<string, MuskelDefinition> = Object.fromEntries(MUSKELN.map(m => [m.id, m]));

// Gruppen des Muskelatlas (wie man im Studio denkt, nicht streng anatomisch)
export interface AtlasGruppe { id: string; name: string; muskeln: string[]; ansicht: Ansicht }
export const ATLAS_GRUPPEN: AtlasGruppe[] = [
  { id: 'brust', name: 'Brust', muskeln: ['brust_o', 'brust_u', 'serratus'], ansicht: 'vorn' },
  { id: 'schulter', name: 'Schulter', muskeln: ['delt_v', 'delt_s', 'delt_h', 'rotatoren'], ansicht: 'seite' },
  { id: 'bizeps', name: 'Bizeps', muskeln: ['bizeps', 'brachialis'], ansicht: 'vorn' },
  { id: 'trizeps', name: 'Trizeps', muskeln: ['trizeps'], ansicht: 'hinten' },
  { id: 'unterarm', name: 'Unterarm', muskeln: ['brachiorad', 'ua_beuger', 'ua_strecker'], ansicht: 'vorn' },
  { id: 'ruecken', name: 'Rücken', muskeln: ['lat', 'trapez_o', 'trapez_m', 'strecker'], ansicht: 'hinten' },
  { id: 'bauch', name: 'Bauch', muskeln: ['bauch_g', 'bauch_s', 'bauch_q', 'iliopsoas'], ansicht: 'vorn' },
  { id: 'gesaess', name: 'Gesäß', muskeln: ['glut_max', 'glut_med', 'glut_min'], ansicht: 'hinten' },
  { id: 'beine', name: 'Beine', muskeln: ['rect_fem', 'vast_lat', 'vast_med', 'vast_int', 'sartorius', 'hamstrings', 'adduktoren'], ansicht: 'vorn' },
  { id: 'waden', name: 'Waden', muskeln: ['gastro', 'soleus', 'tibialis'], ansicht: 'hinten' },
];
export const gruppeVon = (id: string) => ATLAS_GRUPPEN.find(g => g.muskeln.includes(id));

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
