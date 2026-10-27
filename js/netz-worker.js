// Baut und vernetzt den Körper im Hintergrund, damit die Oberfläche flüssig bleibt.
import { koerperBauen, vernetzen } from './koerper.js';

self.onmessage = (e) => {
  const { auftrag, param, h } = e.data;
  try {
    const t0 = performance.now();
    const netz = vernetzen(koerperBauen(param), { h });
    netz.info.ms = Math.round(performance.now() - t0);
    const transfer = [netz.pos.buffer, netz.nor.buffer, netz.ao.buffer, netz.mid.buffer, netz.rand.buffer, netz.art.buffer, netz.idx.buffer];
    self.postMessage({ auftrag, netz }, transfer);
  } catch (fehler) {
    self.postMessage({ auftrag, fehler: String(fehler) });
  }
};
