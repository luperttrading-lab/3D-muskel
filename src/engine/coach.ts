// Coach ATLAS: deterministische, sichere Empfehlungen. Keine Diagnosen, keine Heilversprechen.

import { erhaltung, REGELN, type MuskelZustand, type Optionen, type PerformedSet, type Ansicht } from './modell';
import { EINHEITEN, MUSKEL, MUSKELN } from './muskeln';
import { PLAENE } from './uebungen';
import { isoWoche } from './xp';

export type CoachStil = 'kumpel' | 'drill' | 'wissenschaft' | 'gamemaster';
export const COACH_STILE: { id: CoachStil; name: string }[] = [
  { id: 'kumpel', name: 'Kumpel' },
  { id: 'drill', name: 'Drill-Instructor' },
  { id: 'wissenschaft', name: 'Wissenschaftler' },
  { id: 'gamemaster', name: 'Game-Master' },
];

export interface CoachEmpfehlung {
  id: string;
  titel: string;
  text: string;
  begruendung: string;
  sicherheit?: string;
  aktion?: { typ: 'plan'; planId: string } | { typ: 'ruhetag' };
  prioritaet: number;
}

type Texte = Record<CoachStil, string>;
const t = (texte: Texte, stil: CoachStil) => texte[stil];

export interface CoachEingabe {
  saetze: PerformedSet[];
  zustand: MuskelZustand[];
  ansicht: Ansicht;
  optionen: Optionen;
  jetzt: number;
  trainingstage: number;
  stil: CoachStil;
  workoutsDieseWoche: number;
}

const TAG = 86_400_000;
const REGION_PLAN: Record<string, string> = {
  brust: 'push', schulter: 'push', oberarm: 'arme', unterarm: 'arme', ruecken: 'pull', bauch: 'unterkoerper',
  gesaess: 'unterkoerper', oberschenkel: 'beine', waden: 'beine',
};

export function empfehlungen(e: CoachEingabe): CoachEmpfehlung[] {
  const out: CoachEmpfehlung[] = [];
  const { stil, jetzt } = e;
  const letzte48 = e.saetze.filter(s => jetzt - s.completedAt < 2 * TAG);
  const schmerz = e.saetze.filter(s => s.pain && jetzt - s.completedAt < 7 * TAG);

  if (schmerz.length) {
    out.push({
      id: 'schmerz', prioritaet: 100,
      titel: 'Schmerzen gemeldet',
      text: t({
        kumpel: 'Du hast Schmerzen eingetragen. Bitte nichts durchziehen – lass das abklären, bevor du die Übung wieder belastest.',
        drill: 'Schmerz ist kein Trainingsziel. Übung pausieren und ärztlich abklären lassen. Das ist ein Befehl mit Herz.',
        wissenschaft: 'Schmerz ist ein Warnsignal, keine Messgröße für Trainingsqualität. Eine Abklärung durch Fachleute ist sinnvoll.',
        gamemaster: 'Statuseffekt »Schmerz« erkannt. Quest pausiert, bis ein Heiler (Ärztin/Arzt) draufgeschaut hat.',
      }, stil),
      begruendung: `${schmerz.length} Satz/Sätze mit Schmerzangabe in den letzten 7 Tagen.`,
      sicherheit: 'MuscleAtlas stellt keine Diagnosen.',
    });
  }

  const volumen = letzte48.length;
  if (volumen >= 30) {
    out.push({
      id: 'erholung', prioritaet: 80, aktion: { typ: 'ruhetag' },
      titel: 'Erholung einplanen',
      text: t({
        kumpel: `Starke ${volumen} Sätze in zwei Tagen! Heute gönnst du dir Pause – das zählt auch als Fortschritt.`,
        drill: `${volumen} Sätze in 48 Stunden. Heute: Ruhetag. Muskeln wachsen in der Pause.`,
        wissenschaft: `${volumen} Arbeitssätze in 48 h. Zusätzliche Sätze bringen im Modell kaum noch Reiz; Regeneration ist jetzt der bessere Hebel.`,
        gamemaster: `Ausdauerleiste leer (${volumen} Sätze in 48 h). Rasten bringt +25 XP und füllt die Leiste.`,
      }, stil),
      begruendung: 'Viel Volumen in kurzer Zeit; im Modell sinkt der Grenznutzen weiterer Sätze stark.',
    });
  }

  // Seitenunterschied
  let groesste = { d: 0, id: '', schwach: 'L' as 'L' | 'R' };
  for (const m of MUSKELN) {
    if (!m.sichtbar) continue;
    const l = e.ansicht.entwicklung[1 + 2 * MUSKELN.indexOf(m)], r = e.ansicht.entwicklung[2 + 2 * MUSKELN.indexOf(m)];
    const d = Math.abs(l - r) / Math.max(0.05, Math.max(l, r));
    if (d > groesste.d && Math.max(l, r) > 0.05) groesste = { d, id: m.id, schwach: l < r ? 'L' : 'R' };
  }
  if (groesste.d > 0.2) {
    const name = MUSKEL[groesste.id].name, seite = groesste.schwach === 'L' ? 'links' : 'rechts';
    out.push({
      id: 'seiten', prioritaet: 60,
      titel: `${name}: Seiten ausgleichen`,
      text: t({
        kumpel: `Dein ${name} ${seite} hinkt hinterher. Ein, zwei einseitige Sätze für ${seite} bringen das wieder ins Lot.`,
        drill: `${name} ${seite} liegt zurück. Einseitig trainieren, schwächere Seite zuerst.`,
        wissenschaft: `Entwicklungsdifferenz ${Math.round(groesste.d * 100)} % zwischen links und rechts beim ${name}. Einseitige Sätze mit der schwächeren Seite beginnen.`,
        gamemaster: `Nebenquest: ${name} ${seite} aufholen. Einseitige Sätze zählen doppelt für den Ausgleich.`,
      }, stil),
      begruendung: `Unterschied ${Math.round(groesste.d * 100)} % (Modellwerte).`,
    });
  }

  // Vernachlässigte Regionen und beginnender Abbau
  const regionTage: Record<string, number> = {};
  for (const ein of EINHEITEN) {
    const z = e.zustand[ein.index], m = MUSKEL[ein.id];
    if (!m.sichtbar || z.peak <= 0) continue;
    const tage = (jetzt - z.lastStimulusAt) / TAG;
    regionTage[m.region] = Math.max(regionTage[m.region] ?? 0, tage);
  }
  const abbauend = EINHEITEN.filter(ein => MUSKEL[ein.id].sichtbar && erhaltung(e.zustand[ein.index], jetzt, e.optionen).status === 'abbau');
  if (abbauend.length) {
    const namen = [...new Set(abbauend.map(x => MUSKEL[x.id].name))].slice(0, 3).join(', ');
    const region = MUSKEL[abbauend[0].id].region;
    out.push({
      id: 'abbau', prioritaet: 55, aktion: { typ: 'plan', planId: REGION_PLAN[region] ?? 'ganzkoerper' },
      titel: 'Erhalt sichern',
      text: t({
        kumpel: `${namen} könnten mal wieder etwas Aufmerksamkeit vertragen. Kein Stress – dein Höchststand bleibt gespeichert.`,
        drill: `${namen}: Reiz fehlt seit über ${REGELN[e.optionen.modus].gnadeTage} Tagen. Eine kurze Einheit reicht für den Erhalt.`,
        wissenschaft: `${namen}: Schonfrist abgelaufen, das Modell baut langsam ab. Wenige harte Sätze pro Woche genügen zum Erhalt; Muskelgedächtnis beschleunigt den Wiederaufbau.`,
        gamemaster: `${namen} verlieren langsam Glanz. Eine Quest-Einheit stoppt das – alte Bestwerte sind gesichert.`,
      }, stil),
      begruendung: 'Abbau beginnt im Modell erst nach der Schonfrist und verläuft langsam.',
    });
  }

  // Unterkörper vs. Oberkörper (Discopumper-Tendenz)
  const summe = (ids: string[]) => ids.reduce((s, id) => s + e.ansicht.entwicklung[1 + 2 * MUSKELN.findIndex(m => m.id === id)] + e.ansicht.entwicklung[2 + 2 * MUSKELN.findIndex(m => m.id === id)], 0);
  const oben = summe(['brust_u', 'brust_o', 'delt_v', 'delt_s', 'bizeps', 'trizeps', 'lat']) / 7;
  const unten = summe(['vast_lat', 'vast_med', 'rect_fem', 'hamstrings', 'glut_max', 'gastro', 'adduktoren']) / 7;
  if (oben > 0.08 && unten < 0.5 * oben) {
    out.push({
      id: 'beine', prioritaet: 50, aktion: { typ: 'plan', planId: 'beine' },
      titel: 'Beine nicht vergessen',
      text: t({
        kumpel: 'Oben läuft’s richtig gut – Zeit, dass die Beine nachziehen. Wie wär’s mit einem Leg Day?',
        drill: 'Oberkörper stark, Beine schwach. Nächste Einheit: Legs. Ohne Diskussion.',
        wissenschaft: 'Die Entwicklung der Beinmuskulatur liegt unter 50 % des Oberkörpers. Für Balance und Alltag lohnt ein Bein-Schwerpunkt.',
        gamemaster: 'Warnung: Archetyp »Discopumper« in Reichweite. Leg-Day-Quest verfügbar.',
      }, stil),
      begruendung: 'Verhältnis Unter- zu Oberkörper im Modell unter 0,5.',
    });
  }

  // Wochenziel
  const offen = Math.max(0, e.trainingstage - e.workoutsDieseWoche);
  if (offen > 0) {
    // Plan für die Region mit dem längsten Abstand
    const [region] = Object.entries(regionTage).sort((a, b) => b[1] - a[1])[0] ?? ['ganzkoerper'];
    const planId = REGION_PLAN[region] ?? 'ganzkoerper';
    out.push({
      id: 'woche', prioritaet: 40, aktion: { typ: 'plan', planId },
      titel: `Noch ${offen} Workout${offen > 1 ? 's' : ''} bis zum Wochenziel`,
      text: t({
        kumpel: `Diese Woche fehlen noch ${offen}. Vorschlag: ${PLAENE.find(p => p.id === planId)?.name}.`,
        drill: `${offen} Einheit${offen > 1 ? 'en' : ''} offen. Nächste: ${PLAENE.find(p => p.id === planId)?.name}.`,
        wissenschaft: `Geplant sind ${e.trainingstage} Einheiten, erledigt ${e.workoutsDieseWoche} (${isoWoche(jetzt)}). Empfohlen: ${PLAENE.find(p => p.id === planId)?.name}.`,
        gamemaster: `Wochenquest: ${e.workoutsDieseWoche}/${e.trainingstage}. Belohnung +150 XP.`,
      }, stil),
      begruendung: 'Am längsten nicht trainierte Region zuerst.',
    });
  }

  if (!e.saetze.length) {
    out.push({
      id: 'start', prioritaet: 90, aktion: { typ: 'plan', planId: 'ganzkoerper' },
      titel: 'Los geht’s',
      text: t({
        kumpel: 'Willkommen! Starte mit einem Ganzkörper-Workout – jeder Satz zeigt sich sofort an deinem Avatar.',
        drill: 'Erste Einheit: Ganzkörper. Saubere Technik vor Gewicht.',
        wissenschaft: 'Für den Einstieg eignet sich Ganzkörpertraining 2–3× pro Woche mit 1–3 Wiederholungen Reserve.',
        gamemaster: 'Neue Kampagne gestartet. Erste Quest: Ganzkörper.',
      }, stil),
      begruendung: 'Noch keine Trainingsdaten.',
    });
  }

  return out.sort((a, b) => b.prioritaet - a.prioritaet);
}
