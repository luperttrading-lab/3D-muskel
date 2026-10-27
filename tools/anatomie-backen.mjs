// Backt das Anatomie-Texturpaket für Mann und Frau nach public/modelle (siehe tools/anatomie-kern.ts).
// Aufruf: node tools/anatomie-backen.mjs [kantenlaenge=2048]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';

const N = Number(process.argv[2] ?? 2048);
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { backe } = await server.ssrLoadModule('/tools/anatomie-kern.ts');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anatomie-'));
  for (const g of ['m', 'w']) {
    const t0 = Date.now();
    const r = backe(g, N);
    for (const k of ['farbe', 'hoehe', 'karte']) fs.writeFileSync(path.join(tmp, `${g}-${k}.bin`), r[k]);
    console.log(g, 'gebacken in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  }
  execFileSync('python3', ['tools/anatomie-bilder.py', tmp, 'public/modelle', String(N)], { stdio: 'inherit' });
  fs.rmSync(tmp, { recursive: true });
} finally {
  await server.close();
}
