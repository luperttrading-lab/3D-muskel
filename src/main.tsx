import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './stil.css';
import { pruefeWebGL, protokoll } from './store/diagnose';
import { starteUpdates } from './pwa';

const ziel = document.getElementById('root')!;
protokoll('info', 'JavaScript gestartet');
if (location.hash.startsWith('#labor')) {
  import('./labor/Labor').then(({ Labor }) => createRoot(ziel).render(<Labor />));
} else {
  pruefeWebGL();
  starteUpdates();
  import('./ui/App').then(({ App }) => createRoot(ziel).render(<StrictMode><App /></StrictMode>));
}
