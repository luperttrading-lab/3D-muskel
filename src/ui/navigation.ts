// Einfache Navigation über den URL-Anker (#home, #atlas …), ohne zusätzliche Bibliothek.
import { create } from 'zustand';

export type SeiteId = 'home' | 'atlas' | 'training' | 'evolution' | 'coach' | 'einstellungen';
const GUELTIG: SeiteId[] = ['home', 'atlas', 'training', 'evolution', 'coach', 'einstellungen'];
const ausAnker = (): SeiteId => { const h = location.hash.replace('#', '').split('?')[0] as SeiteId; return GUELTIG.includes(h) ? h : 'home'; };

export const useNavigation = create<{ seite: SeiteId; geheZu: (s: SeiteId) => void }>((set) => ({
  seite: typeof location !== 'undefined' ? ausAnker() : 'home',
  geheZu: (seite) => {
    set({ seite });
    if (location.hash !== '#' + seite) history.replaceState(null, '', '#' + seite);
    document.getElementById('inhalt')?.scrollTo({ top: 0 });
  },
}));
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => useNavigation.setState({ seite: ausAnker() }));
