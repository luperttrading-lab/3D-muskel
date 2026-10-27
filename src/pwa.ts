// Updates auf dem iPhone: Service Worker »Netz zuerst«, aktive Versionsprüfung beim Zurückholen der App,
// Prüfung per Tipp auf die Versionsnummer und eine einmalige Meldung nach einem Update.
import { create } from 'zustand';

declare global { interface Window { APP_VERSION?: string } }
export const APP_VERSION = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev';

interface Banner { text: string; art: 'info' | 'update'; unten: boolean; an: boolean; schluessel: number }
export const useUpdate = create<Banner>(() => ({ text: '', art: 'info', unten: false, an: false, schluessel: 0 }));

let infoTimer: ReturnType<typeof setTimeout> | undefined;
function kante(ausloeser?: Element | null) {
  if (!ausloeser) return false;
  const r = ausloeser.getBoundingClientRect();
  return r.top + r.height / 2 > window.innerHeight / 2;
}
export function zeigeInfo(text: string, sekunden = 2, ausloeser?: Element | null) {
  clearTimeout(infoTimer);
  useUpdate.setState(s => ({ text, art: 'info', unten: kante(ausloeser), an: true, schluessel: s.schluessel + 1 }));
  if (sekunden) infoTimer = setTimeout(() => useUpdate.setState({ an: false }), sekunden * 1000);
}
export function zeigeUpdate(text: string) {
  clearTimeout(infoTimer);
  useUpdate.setState(s => ({ text, art: 'update', unten: false, an: true, schluessel: s.schluessel + 1 }));
}
export const verstecke = () => useUpdate.setState({ an: false });

let pruefend = false, gemeldet: string | null = null;
const tipptGerade = () => { const a = document.activeElement; return !!a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName); };

export async function pruefeUpdate(manuell = false, ausloeser?: Element | null) {
  if (pruefend || APP_VERSION === 'dev') { if (manuell && APP_VERSION === 'dev') zeigeInfo('Entwicklungsversion – keine Prüfung', 2, ausloeser); return; }
  if (!manuell && document.visibilityState !== 'visible') return;
  if (!navigator.onLine) { if (manuell) zeigeInfo('Offline – Prüfung nicht möglich', 2, ausloeser); return; }
  pruefend = true;
  try {
    const res = await fetch('index.html', { cache: 'no-store' });
    if (!res.ok) { if (manuell) zeigeInfo('Prüfung fehlgeschlagen', 2, ausloeser); return; }
    const m = (await res.text()).match(/APP_VERSION = '([^']+)'/);
    if (m && m[1] !== APP_VERSION) {
      if (gemeldet === m[1] && !manuell) return;
      gemeldet = m[1];
      zeigeUpdate(`Neue Version ${m[1]} ist da`);
      // Daten liegen bereits in IndexedDB; nicht neu laden, solange jemand tippt
      if (manuell || !tipptGerade()) setTimeout(() => location.reload(), manuell ? 1500 : 3000);
    } else if (manuell) zeigeInfo(`Version ${APP_VERSION} ist aktuell`, 4, ausloeser);
  } catch {
    if (manuell) zeigeInfo('Prüfung fehlgeschlagen', 2, ausloeser);
  } finally { pruefend = false; }
}

export function starteUpdates() {
  if (typeof window === 'undefined') return;
  window.addEventListener('pageshow', () => setTimeout(() => pruefeUpdate(), 800));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pruefeUpdate(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* z. B. in eingebetteten Vorschauen nicht erlaubt */ }); });
  }
  const GESEHEN = 'muscleatlas3d.gesehen';
  let vorher: string | null = null;
  try { vorher = localStorage.getItem(GESEHEN); } catch { /* privat */ }
  if (vorher !== APP_VERSION) {
    try { localStorage.setItem(GESEHEN, APP_VERSION); } catch { /* privat */ }
    if (vorher) setTimeout(() => zeigeInfo(`Version ${APP_VERSION} ist geladen`, 4), 400);
  }
}
