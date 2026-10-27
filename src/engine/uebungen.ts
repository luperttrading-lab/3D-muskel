// Übungskatalog mit Modellgewichten (Anteil des Trainingsreizes je Muskel).
// Die Koeffizienten sind vorsichtige Designannahmen, keine gemessene Muskelaktivierung.
// Griff und Variante verändern die Verteilung: Hammer-Curls und Reverse Curls sind darum eigene Übungen.

export type Geraet = 'Kurzhantel' | 'Langhantel' | 'Kabel' | 'Maschine' | 'Körpergewicht' | 'Stange';
export const GERAETE: Geraet[] = ['Kurzhantel', 'Langhantel', 'Kabel', 'Maschine', 'Körpergewicht', 'Stange'];

export interface UebungsMuskel { muskel: string; koeffizient: number; rolle: 'primär' | 'sekundär' }
export interface Uebung {
  id: string;
  name: string;
  kategorie: string;
  geraet: Geraet;
  einseitig?: boolean;            // üblicherweise einarmig/einbeinig ausgeführt
  muskeln: UebungsMuskel[];
  hinweis?: string;               // Sicherheits-/Technikhinweis
}

function u(id: string, name: string, kategorie: string, geraet: Geraet, w: Record<string, number>, extra: Partial<Uebung> = {}): Uebung {
  return {
    id, name, kategorie, geraet, ...extra,
    muskeln: Object.entries(w).map(([muskel, koeffizient]) => ({ muskel, koeffizient, rolle: koeffizient >= 0.6 ? 'primär' : 'sekundär' })),
  };
}

export const UEBUNGEN: Uebung[] = [
  u('bankdruecken', 'Bankdrücken', 'Brust', 'Langhantel', { brust_u: 1, brust_o: 0.6, delt_v: 0.5, trizeps: 0.5, serratus: 0.2 }, { hinweis: 'Mit Sicherung oder Ablagen trainieren.' }),
  u('kh_bankdruecken', 'Kurzhantel-Bankdrücken', 'Brust', 'Kurzhantel', { brust_u: 1, brust_o: 0.6, delt_v: 0.5, trizeps: 0.45, serratus: 0.25 }),
  u('schraegbank', 'Schrägbankdrücken', 'Brust', 'Kurzhantel', { brust_o: 1, brust_u: 0.5, delt_v: 0.6, trizeps: 0.4, serratus: 0.2 }),
  u('liegestuetz', 'Liegestütze', 'Brust', 'Körpergewicht', { brust_u: 0.8, brust_o: 0.5, delt_v: 0.45, trizeps: 0.45, serratus: 0.35, bauch_q: 0.3, bauch_g: 0.2 }),
  u('dips', 'Dips', 'Brust', 'Körpergewicht', { trizeps: 0.9, brust_u: 0.7, delt_v: 0.6, brust_o: 0.2 }, { hinweis: 'Bei Schulterbeschwerden Bewegungsumfang begrenzen.' }),
  u('butterfly', 'Butterfly', 'Brust', 'Maschine', { brust_u: 1, brust_o: 0.7, delt_v: 0.3 }),
  u('schulterdruecken', 'Schulterdrücken', 'Schulter', 'Kurzhantel', { delt_v: 1, delt_s: 0.5, trizeps: 0.5, serratus: 0.3, trapez_o: 0.3, brust_o: 0.2 }),
  u('seitheben', 'Seitheben', 'Schulter', 'Kurzhantel', { delt_s: 1, trapez_o: 0.3, rotatoren: 0.3, delt_v: 0.2 }),
  u('facepull', 'Face Pulls', 'Schulter', 'Kabel', { delt_h: 1, trapez_m: 0.6, rotatoren: 0.6 }),
  u('reverse_fly', 'Reverse Flys', 'Schulter', 'Kurzhantel', { delt_h: 1, trapez_m: 0.5, rotatoren: 0.3 }),
  u('klimmzug', 'Klimmzüge', 'Rücken', 'Stange', { lat: 1, bizeps: 0.55, brachialis: 0.55, trapez_m: 0.5, brachiorad: 0.45, ua_beuger: 0.4, delt_h: 0.35, bauch_g: 0.15 }),
  u('latzug', 'Latziehen', 'Rücken', 'Kabel', { lat: 1, bizeps: 0.5, brachialis: 0.5, trapez_m: 0.45, brachiorad: 0.4, ua_beuger: 0.3, delt_h: 0.3 }),
  u('rudern', 'Langhantelrudern', 'Rücken', 'Langhantel', { trapez_m: 1, lat: 0.8, delt_h: 0.6, strecker: 0.5, bizeps: 0.4, brachialis: 0.4, brachiorad: 0.35, ua_beuger: 0.3 }, { hinweis: 'Rücken neutral halten.' }),
  u('kh_rudern', 'Kurzhantelrudern einarmig', 'Rücken', 'Kurzhantel', { lat: 1, trapez_m: 0.8, delt_h: 0.5, brachialis: 0.4, bizeps: 0.35, brachiorad: 0.3 }, { einseitig: true }),
  u('shrugs', 'Shrugs', 'Rücken', 'Kurzhantel', { trapez_o: 1, ua_beuger: 0.3 }),
  u('kreuzheben', 'Rumänisches Kreuzheben', 'Rücken', 'Langhantel', { hamstrings: 1, glut_max: 0.8, strecker: 0.7, adduktoren: 0.35, ua_beuger: 0.35, trapez_o: 0.3, lat: 0.2 }, { hinweis: 'Hüftgelenk beugen, Rücken neutral.' }),
  u('hyperext', 'Rückenstrecken', 'Rücken', 'Maschine', { strecker: 1, glut_max: 0.5, hamstrings: 0.4 }),
  u('bizepscurl', 'Bizepscurls', 'Arme', 'Kurzhantel', { bizeps: 1, brachialis: 0.75, brachiorad: 0.55, ua_beuger: 0.25 }),
  u('hammercurl', 'Hammer-Curls', 'Arme', 'Kurzhantel', { brachialis: 1, brachiorad: 0.9, bizeps: 0.6, ua_beuger: 0.2 }),
  u('konzcurl', 'Konzentrationscurls', 'Arme', 'Kurzhantel', { bizeps: 1, brachialis: 0.7, brachiorad: 0.4 }, { einseitig: true }),
  u('reverse_curl', 'Reverse Curls', 'Arme', 'Langhantel', { brachiorad: 1, ua_strecker: 0.6, brachialis: 0.6, bizeps: 0.3 }),
  u('handgelenkcurl', 'Handgelenkcurls', 'Arme', 'Kurzhantel', { ua_beuger: 1 }),
  u('handgelenk_reverse', 'Handgelenkstrecken', 'Arme', 'Kurzhantel', { ua_strecker: 1, brachiorad: 0.3 }),
  u('farmers_walk', 'Farmer’s Walk', 'Arme', 'Kurzhantel', { ua_beuger: 1, trapez_o: 0.6, ua_strecker: 0.4, bauch_s: 0.3, bauch_q: 0.3 }),
  u('trizepsdruecken', 'Trizepsdrücken am Kabel', 'Arme', 'Kabel', { trizeps: 1, ua_strecker: 0.2 }),
  u('french_press', 'French Press', 'Arme', 'Kurzhantel', { trizeps: 1 }),
  u('kniebeuge', 'Kniebeugen', 'Beine', 'Langhantel', { vast_lat: 1, vast_med: 1, vast_int: 1, glut_max: 0.7, rect_fem: 0.6, adduktoren: 0.6, strecker: 0.4, bauch_q: 0.3, soleus: 0.15, sartorius: 0.3 }, { hinweis: 'Knie in Richtung der Zehen, Tiefe nach Beweglichkeit.' }),
  u('beinpresse', 'Beinpresse', 'Beine', 'Maschine', { vast_lat: 1, vast_med: 1, vast_int: 1, rect_fem: 0.5, glut_max: 0.5, adduktoren: 0.4, sartorius: 0.25 }),
  u('ausfall', 'Ausfallschritte', 'Beine', 'Kurzhantel', { vast_lat: 0.9, vast_med: 0.9, vast_int: 0.9, glut_max: 0.8, rect_fem: 0.5, glut_med: 0.4, adduktoren: 0.4, sartorius: 0.4 }),
  u('bulgarian', 'Bulgarische Split-Kniebeuge', 'Beine', 'Kurzhantel', { vast_lat: 1, vast_med: 1, vast_int: 1, glut_max: 0.9, glut_med: 0.5, adduktoren: 0.5, rect_fem: 0.4, sartorius: 0.4 }, { einseitig: true }),
  u('beinstrecker', 'Beinstrecker', 'Beine', 'Maschine', { rect_fem: 1, vast_lat: 1, vast_med: 1, vast_int: 1 }),
  u('beinbeuger', 'Beinbeuger', 'Beine', 'Maschine', { hamstrings: 1, gastro: 0.3, sartorius: 0.3 }),
  u('adduktion', 'Adduktion', 'Beine', 'Maschine', { adduktoren: 1 }),
  u('hipthrust', 'Hip Thrust', 'Gesäß', 'Langhantel', { glut_max: 1, hamstrings: 0.6, adduktoren: 0.3, glut_med: 0.3, strecker: 0.2 }),
  u('abduktion', 'Abduktion', 'Gesäß', 'Maschine', { glut_med: 1, glut_min: 0.7, glut_max: 0.3, sartorius: 0.25 }),
  u('wade_steh', 'Wadenheben stehend', 'Waden', 'Maschine', { gastro: 1, soleus: 0.6 }),
  u('wade_sitz', 'Wadenheben sitzend', 'Waden', 'Maschine', { soleus: 1, gastro: 0.35 }),
  u('tibia_raise', 'Tibialis Raises', 'Waden', 'Körpergewicht', { tibialis: 1 }),
  u('crunch', 'Bauchpressen', 'Bauch', 'Körpergewicht', { bauch_g: 1, bauch_s: 0.4, bauch_q: 0.3 }),
  u('beinheben', 'Beinheben hängend', 'Bauch', 'Stange', { bauch_g: 1, iliopsoas: 0.8, bauch_s: 0.5, bauch_q: 0.3, ua_beuger: 0.3, sartorius: 0.5 }),
  u('seitstuetz', 'Seitstütz', 'Bauch', 'Körpergewicht', { bauch_s: 1, bauch_q: 0.6, glut_med: 0.3 }, { einseitig: true }),
  u('holzhacker', 'Holzhacker am Kabel', 'Bauch', 'Kabel', { bauch_s: 1, bauch_q: 0.5, bauch_g: 0.3 }),
  u('plank', 'Unterarmstütz', 'Bauch', 'Körpergewicht', { bauch_q: 1, bauch_g: 0.5, bauch_s: 0.4 }),
];

export const UEBUNG: Record<string, Uebung> = Object.fromEntries(UEBUNGEN.map(x => [x.id, x]));
export const KATEGORIEN = [...new Set(UEBUNGEN.map(x => x.kategorie))];

export function hauptmuskel(uebung: Uebung): string {
  return [...uebung.muskeln].sort((a, b) => b.koeffizient - a.koeffizient)[0].muskel;
}

// Trainingspläne: [Übung, Sätze]
export interface Plan { id: string; name: string; beschreibung: string; uebungen: [string, number][] }
export const PLAENE: Plan[] = [
  { id: 'ganzkoerper', name: 'Ganzkörper', beschreibung: 'Alle großen Muskelgruppen, 2–3× pro Woche', uebungen: [['kniebeuge', 3], ['bankdruecken', 3], ['rudern', 3], ['schulterdruecken', 2], ['bizepscurl', 2], ['trizepsdruecken', 2], ['plank', 2]] },
  { id: 'push', name: 'Push', beschreibung: 'Brust, Schultern, Trizeps', uebungen: [['bankdruecken', 4], ['schraegbank', 3], ['schulterdruecken', 3], ['seitheben', 3], ['trizepsdruecken', 3]] },
  { id: 'pull', name: 'Pull', beschreibung: 'Rücken, hintere Schulter, Bizeps', uebungen: [['klimmzug', 4], ['rudern', 3], ['facepull', 3], ['bizepscurl', 3], ['hammercurl', 2]] },
  { id: 'beine', name: 'Legs', beschreibung: 'Oberschenkel, Gesäß, Waden', uebungen: [['kniebeuge', 4], ['kreuzheben', 3], ['beinpresse', 3], ['beinbeuger', 3], ['wade_steh', 4]] },
  { id: 'oberkoerper', name: 'Oberkörper', beschreibung: 'Drücken und Ziehen im Wechsel', uebungen: [['bankdruecken', 3], ['latzug', 3], ['schulterdruecken', 3], ['kh_rudern', 3], ['bizepscurl', 2], ['trizepsdruecken', 2]] },
  { id: 'unterkoerper', name: 'Unterkörper & Core', beschreibung: 'Beine, Gesäß, Rumpf', uebungen: [['kniebeuge', 3], ['hipthrust', 3], ['ausfall', 3], ['hyperext', 3], ['crunch', 3], ['beinbeuger', 3]] },
  { id: 'arme', name: 'Arme & Unterarme', beschreibung: 'Bizeps, Trizeps, Unterarme', uebungen: [['bizepscurl', 3], ['hammercurl', 3], ['reverse_curl', 2], ['trizepsdruecken', 3], ['handgelenkcurl', 2]] },
  { id: 'frei', name: 'Frei', beschreibung: 'Übungen selbst wählen', uebungen: [] },
];
export const PLAN: Record<string, Plan> = Object.fromEntries(PLAENE.map(p => [p.id, p]));
