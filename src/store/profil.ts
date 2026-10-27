import type { CoachStil } from '../engine/coach';
import type { Modus } from '../engine/modell';
import type { Geraet } from '../engine/uebungen';
import type { Geschlecht } from '../avatar/daten';

export type Hautton = 'hell' | 'mittel' | 'dunkel';
export type Koerperform = 'schmal' | 'mittel' | 'kraeftig';
export type Akzent = 'blau' | 'pink' | 'gruen';

export interface Profil {
  id: 'ich';
  erstellt: number;
  onboardingFertig: boolean;
  geschlecht: Geschlecht;
  hautton: Hautton;
  akzent: Akzent;
  koerperform: Koerperform;
  groesseCm?: number;
  gewichtKg?: number;
  ziel: 'muskelaufbau' | 'fitness' | 'kraft' | 'gesundheit';
  erfahrung: 'einsteiger' | 'fortgeschritten' | 'erfahren';
  geraete: Geraet[];
  trainingstage: number;
  coachStil: CoachStil;
  modus: Modus;
  animationen: boolean;
  unterStart: boolean;
  neutralerStartname: boolean;
  zeitversatzTage: number;     // nur für Tests: verschiebt »jetzt«
}

// Körperform → Körperfett-Parameter der MakeHuman-Formen (0,5 = MakeHuman-Mittel). Startmuskulatur untrainiert.
export const KOERPERFORMEN: Record<Koerperform, { name: string; omega: Record<Geschlecht, number> }> = {
  schmal: { name: 'Schmal', omega: { m: 0.55, w: 0.52 } },
  mittel: { name: 'Mittel', omega: { m: 0.76, w: 0.72 } },
  kraeftig: { name: 'Kräftig', omega: { m: 0.92, w: 0.9 } },
};
export const MU_START = 0.42;
export const AKZENTE: Record<Akzent, { name: string; farbe: string }> = {
  blau: { name: 'Neonblau', farbe: '#2f8bff' },
  pink: { name: 'Pink', farbe: '#ff3fa4' },
  gruen: { name: 'Grün', farbe: '#22d38a' },
};

export function neuesProfil(jetzt: number): Profil {
  return {
    id: 'ich', erstellt: jetzt, onboardingFertig: false, geschlecht: 'm', hautton: 'hell', akzent: 'blau', koerperform: 'mittel',
    ziel: 'muskelaufbau', erfahrung: 'einsteiger', geraete: ['Kurzhantel', 'Langhantel', 'Kabel', 'Maschine', 'Körpergewicht', 'Stange'],
    trainingstage: 3, coachStil: 'kumpel', modus: 'arcade', animationen: true, unterStart: false, neutralerStartname: false, zeitversatzTage: 0,
  };
}
