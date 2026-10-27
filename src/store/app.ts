// Anwendungszustand (Zustand-Store): lädt, speichert und leitet Muskelzustand, XP und Evolution ab.
import { create } from 'zustand';
import { ansichtZu, rekonstruiere, satzAnwenden, type Ansicht, type MuskelZustand, type Optionen, type PerformedSet, type SatzWirkung } from '../engine/modell';
import { xpEreignisse, datum, isoWoche, type Ruhetag, type Session, type XpEreignis } from '../engine/xp';
import { evolution, type EvolutionsStand } from '../engine/archetypen';
import { UEBUNG, hauptmuskel } from '../engine/uebungen';
import { EINHEITEN, MUSKEL, einheitIndex, type Seite } from '../engine/muskeln';
import { oeffneSpeicher, pruefeImport, type Daten, type ExportDatei, type Speicher } from './speicher';
import { neuesProfil, type Profil } from './profil';
import { protokoll } from './diagnose';

const TAG = 86_400_000;
export const uuid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export interface SatzFeedback {
  id: string;
  zeit: number;            // performance.now() beim Auslösen (für die Animation)
  wirkung: SatzWirkung[];
  xp: number;
  uebung: string;
}
export type Darstellung = 'haut' | 'entwicklung' | 'atlas';
export type { Kameraziel } from '../avatar/Buehne';
import type { Kameraziel } from '../avatar/Buehne';

interface Zustand {
  bereit: boolean;
  speicherArt: string;
  profil: Profil;
  sessions: Session[];
  saetze: PerformedSet[];
  ruhetage: Ruhetag[];
  // abgeleitet
  muskelZustand: MuskelZustand[];
  ansicht: Ansicht;
  xp: XpEreignis[];
  xpGesamt: number;
  evolution: EvolutionsStand;
  jetzt: number;
  // Oberfläche
  aktiveSession: string | null;
  feedback: SatzFeedback | null;
  darstellung: Darstellung;
  auswahl: number;
  kamera: Kameraziel;
  muskelMitten: Map<number, [number, number, number]>;
  hinweis: { text: string; art: 'info' | 'xp' | 'fehler'; zeit: number } | null;

  start(): Promise<void>;
  profilAendern(p: Partial<Profil>): Promise<void>;
  sessionStarten(planId: string): Promise<string>;
  sessionBeenden(abbrechen?: boolean): Promise<void>;
  satzAbschliessen(s: { exerciseId: string; reps: number; weight: number | null; rir: number; side: 'B' | Seite; pain?: boolean }): Promise<SatzFeedback>;
  satzLoeschen(id: string): Promise<void>;
  ruhetagMarkieren(): Promise<void>;
  setzeDarstellung(d: Darstellung): void;
  waehle(einheit: number, fahren?: boolean): void;
  fahreZu(z: Omit<Kameraziel, 'schluessel'>): void;
  setzeMuskelMitten(m: Map<number, [number, number, number]>): void;
  zeige(text: string, art?: 'info' | 'xp' | 'fehler'): void;
  exportieren(): ExportDatei;
  importieren(json: unknown): Promise<void>;
  allesLoeschen(): Promise<void>;
  neuBerechnen(): void;
}

let speicher: Speicher | null = null;

export const optionen = (p: Profil): Optionen => ({ modus: p.modus, unterStart: p.unterStart, profilStart: p.erstellt });
export const jetztFuer = (p: Profil) => Date.now() + p.zeitversatzTage * TAG;

function ableiten(p: Profil, saetze: PerformedSet[], sessions: Session[], ruhetage: Ruhetag[]) {
  const o = optionen(p), jetzt = jetztFuer(p);
  const muskelZustand = rekonstruiere(saetze, o);
  const ansicht = ansichtZu(muskelZustand, jetzt, o);
  const xp = xpEreignisse(saetze, sessions, ruhetage, p.trainingstage);
  return { muskelZustand, ansicht, xp, xpGesamt: xp.reduce((s, e) => s + e.punkte, 0), evolution: evolution(saetze, o, jetzt, p.geschlecht), jetzt };
}

// Blickrichtung zu einem Muskel: vorn, hinten oder seitlich – leicht zur Körperseite des Muskels gedreht
export function blickAuf(index: number, mitten: Map<number, [number, number, number]>): Omit<Kameraziel, 'schluessel'> {
  const e = EINHEITEN[index - 1];
  if (!e) return {};
  const m = MUSKEL[e.id], s = e.seite === 'L' ? 1 : -1;
  const azimut = m.ansicht === 'vorn' ? 0.35 * s : m.ansicht === 'hinten' ? Math.PI - 0.35 * s : 1.05 * s;
  const nah = m.region === 'oberarm' || m.region === 'unterarm' || m.region === 'schulter';
  const [x = 0, hoehe = 1.1] = mitten.get(index) ?? [];
  return { azimut, hoehe: Math.max(0.45, Math.min(1.45, hoehe)), seitlich: x * (nah ? 0.7 : 0.3), abstand: nah ? 1.75 : m.region === 'waden' ? 1.9 : 2.4 };
}

export const useApp = create<Zustand>((set, get) => ({
  bereit: false,
  speicherArt: '–',
  profil: neuesProfil(Date.now()),
  sessions: [], saetze: [], ruhetage: [],
  muskelZustand: [], ansicht: ansichtZu(rekonstruiere([], optionen(neuesProfil(Date.now()))), Date.now(), optionen(neuesProfil(Date.now()))),
  xp: [], xpGesamt: 0,
  evolution: { rang: 'lauch', archetyp: 'lauch', kandidat: 'lauch', kandidatSeit: null, freigeschaltet: ['lauch'], verlauf: [] },
  jetzt: Date.now(),
  aktiveSession: null,
  feedback: null,
  darstellung: 'haut',
  auswahl: 0,
  kamera: { schluessel: 0 },
  muskelMitten: new Map(),
  hinweis: null,

  async start() {
    try {
      speicher = await oeffneSpeicher();
      const d = await speicher.ladeAlles();
      const profil = d.profil ?? neuesProfil(Date.now());
      if (!d.profil) await speicher.profil(profil);
      const aktiv = d.sessions.filter(s => s.status === 'aktiv').sort((a, b) => b.startedAt - a.startedAt)[0];
      set({ bereit: true, speicherArt: speicher.art, profil, sessions: d.sessions, saetze: d.saetze, ruhetage: d.ruhetage, aktiveSession: aktiv?.id ?? null, ...ableiten(profil, d.saetze, d.sessions, d.ruhetage) });
      protokoll('info', `Daten geladen (${speicher.art}): ${d.saetze.length} Sätze, ${d.sessions.length} Workouts`);
      await speicher.xp(get().xp);
    } catch (e) {
      protokoll('fehler', 'Start fehlgeschlagen: ' + (e as Error).message);
      set({ bereit: true, speicherArt: 'Fehler' });
    }
  },

  neuBerechnen() {
    const { profil, saetze, sessions, ruhetage } = get();
    set(ableiten(profil, saetze, sessions, ruhetage));
  },

  async profilAendern(teil) {
    const profil = { ...get().profil, ...teil };
    set({ profil });
    await speicher?.profil(profil);
    get().neuBerechnen();
  },

  async sessionStarten(planId) {
    const offen = get().aktiveSession;
    if (offen) return offen;
    const s: Session = { id: uuid(), planId, startedAt: jetztFuer(get().profil), status: 'aktiv' };
    set({ sessions: [...get().sessions, s], aktiveSession: s.id });
    await speicher?.session(s);
    protokoll('info', `Workout gestartet (${planId})`);
    return s.id;
  },

  async sessionBeenden(abbrechen = false) {
    const id = get().aktiveSession;
    if (!id) return;
    const sessions = get().sessions.map(s => s.id === id ? { ...s, status: abbrechen ? 'abgebrochen' as const : 'beendet' as const, finishedAt: jetztFuer(get().profil) } : s);
    const vorher = get().xpGesamt;
    set({ sessions, aktiveSession: null });
    await speicher?.session(sessions.find(s => s.id === id)!);
    get().neuBerechnen();
    await speicher?.xp(get().xp);
    const plus = get().xpGesamt - vorher;
    if (plus > 0) get().zeige(`+${plus} XP · Workout abgeschlossen`, 'xp');
  },

  async satzAbschliessen(eingabe) {
    const st = get();
    const sessionId = st.aktiveSession ?? await get().sessionStarten('frei');
    const satz: PerformedSet = { id: uuid(), sessionId, completedAt: jetztFuer(st.profil), ...eingabe };
    // Sofort anwenden (inkrementell), danach dauerhaft speichern
    const zustand = get().muskelZustand.map(z => ({ ...z }));
    const wirkung = satzAnwenden(zustand, satz, optionen(st.profil));
    const saetze = [...get().saetze, satz];
    const xp = xpEreignisse(saetze, get().sessions, get().ruhetage, st.profil.trainingstage);
    const xpGesamt = xp.reduce((s, e) => s + e.punkte, 0);
    const plus = xpGesamt - st.xpGesamt;
    const feedback: SatzFeedback = { id: satz.id, zeit: performance.now(), wirkung, xp: plus, uebung: eingabe.exerciseId };
    const haupt = einheitIndex(hauptmuskel(UEBUNG[eingabe.exerciseId]), eingabe.side === 'R' ? 'R' : 'L');
    set({
      saetze, muskelZustand: zustand, ansicht: ansichtZu(zustand, satz.completedAt, optionen(st.profil)), xp, xpGesamt, feedback,
      evolution: evolution(saetze, optionen(st.profil), satz.completedAt, st.profil.geschlecht), jetzt: satz.completedAt,
    });
    if (st.profil.animationen) get().fahreZu(blickAuf(haupt, get().muskelMitten));
    try {
      await speicher?.satz(satz);
      await speicher?.xp(xp.filter(e => e.quelle === satz.id || e.zeit >= satz.completedAt));
    } catch (e) {
      protokoll('fehler', 'Satz konnte nicht gespeichert werden: ' + (e as Error).message);
      get().zeige('Satz nicht gespeichert – Speicher prüfen', 'fehler');
    }
    return feedback;
  },

  async satzLoeschen(id) {
    const saetze = get().saetze.filter(s => s.id !== id);
    set({ saetze });
    await speicher?.satzLoeschen(id);
    get().neuBerechnen();
  },

  async ruhetagMarkieren() {
    const p = get().profil, heute = datum(jetztFuer(p));
    if (get().ruhetage.some(r => r.datum === heute)) { get().zeige('Heute ist bereits als Ruhetag markiert'); return; }
    if (get().saetze.some(s => datum(s.completedAt) === heute)) { get().zeige('Heute wurde trainiert – kein Ruhetag nötig'); return; }
    const r: Ruhetag = { datum: heute, markiertAm: jetztFuer(p) };
    const vorher = get().xpGesamt;
    set({ ruhetage: [...get().ruhetage, r] });
    await speicher?.ruhetag(r);
    get().neuBerechnen();
    await speicher?.xp(get().xp);
    const plus = get().xpGesamt - vorher;
    get().zeige(plus > 0 ? `Ruhetag eingetragen · +${plus} XP` : `Ruhetag eingetragen (Wochenkontingent für XP erreicht, ${isoWoche(r.markiertAm)})`, plus > 0 ? 'xp' : 'info');
  },

  setzeDarstellung(darstellung) { set({ darstellung }); },
  waehle(einheit, fahren = true) {
    set({ auswahl: einheit });
    if (einheit && fahren && get().profil.animationen) get().fahreZu(blickAuf(einheit, get().muskelMitten));
  },
  fahreZu(z) { set({ kamera: { ...z, schluessel: get().kamera.schluessel + 1 } }); },
  setzeMuskelMitten(m) { set({ muskelMitten: m }); },
  zeige(text, art = 'info') { set({ hinweis: { text, art, zeit: Date.now() } }); },

  exportieren() {
    const { profil, sessions, saetze, ruhetage, xp } = get();
    return { app: 'MuscleAtlas 3D', version: 1, exportiertAm: new Date().toISOString(), daten: { profil, sessions, saetze, ruhetage, xp } };
  },
  async importieren(json) {
    const d: Daten = pruefeImport(json);
    await speicher?.ersetzeAlles(d);
    const profil = d.profil ?? neuesProfil(Date.now());
    set({ profil, sessions: d.sessions, saetze: d.saetze, ruhetage: d.ruhetage, aktiveSession: null, ...ableiten(profil, d.saetze, d.sessions, d.ruhetage) });
    get().zeige(`Import: ${d.saetze.length} Sätze übernommen`);
  },
  async allesLoeschen() {
    await speicher?.loescheAlles();
    const profil = neuesProfil(Date.now());
    await speicher?.profil(profil);
    set({ profil, sessions: [], saetze: [], ruhetage: [], aktiveSession: null, feedback: null, auswahl: 0, ...ableiten(profil, [], [], []) });
  },
}));

