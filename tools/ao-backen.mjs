// Backt die Umgebungsverdeckung je Körperpunkt für Mann und Frau nach public/modelle/ao-{m,w}.bin
// (siehe tools/ao-kern.ts). Aufruf: node tools/ao-backen.mjs
import fs from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { backeAO } = await server.ssrLoadModule('/tools/ao-kern.ts');
  for (const g of ['m', 'w']) {
    const t0 = Date.now();
    fs.writeFileSync(`public/modelle/ao-${g}.bin`, backeAO(g));
    console.log(g, 'gebacken in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  }
} finally {
  await server.close();
}
