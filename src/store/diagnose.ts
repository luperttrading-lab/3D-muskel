// Diagnose: Ereignisprotokoll und Umgebungsdaten für das Debug-Panel (sichtbar statt stiller Fehler).
import { create } from 'zustand';

export interface LogEintrag { zeit: number; art: 'info' | 'warnung' | 'fehler'; text: string }
interface Diagnose {
  log: LogEintrag[];
  webgl: { version: string; renderer: string; maxTextur: number } | null;
  webglFehler: string | null;
  assets: Record<string, { status: 'lädt' | 'ok' | 'fehler'; ms?: number; info?: string }>;
  fps: number;
  morphMs: number;
}
export const useDiagnose = create<Diagnose>(() => ({ log: [], webgl: null, webglFehler: null, assets: {}, fps: 0, morphMs: 0 }));

export function protokoll(art: LogEintrag['art'], text: string) {
  useDiagnose.setState(s => ({ log: [...s.log.slice(-199), { zeit: Date.now(), art, text }] }));
  if (art === 'fehler') console.error('[MuscleAtlas]', text); else if (art === 'warnung') console.warn('[MuscleAtlas]', text);
}
export function assetStatus(name: string, status: 'lädt' | 'ok' | 'fehler', ms?: number, info?: string) {
  useDiagnose.setState(s => ({ assets: { ...s.assets, [name]: { status, ms, info } } }));
}

// WebGL-Fähigkeit vorab prüfen, damit bei Problemen eine Erklärung statt einer leeren Fläche erscheint
export function pruefeWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) { useDiagnose.setState({ webglFehler: 'Dieser Browser stellt kein WebGL bereit.' }); return false; }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    useDiagnose.setState({
      webgl: {
        version: gl.getParameter(gl.VERSION) as string,
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string : (gl.getParameter(gl.RENDERER) as string),
        maxTextur: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      },
    });
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch (e) {
    useDiagnose.setState({ webglFehler: 'WebGL-Prüfung fehlgeschlagen: ' + (e as Error).message });
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', e => protokoll('fehler', `${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`));
  window.addEventListener('unhandledrejection', e => protokoll('fehler', 'Unbehandelt: ' + String((e.reason as Error)?.message ?? e.reason)));
}
