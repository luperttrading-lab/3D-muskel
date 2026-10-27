// Rauchtest im echten Browser (Chromium, iPhone-Maße): Onboarding → Satz → sichtbare Änderung → Reload → Fortschritt da.
// Aufruf: node e2e/rauchtest.cjs [url] [ausgabeordner]
const { chromium } = require('playwright');
const url = process.argv[2] ?? 'http://localhost:5180/';
const aus = process.argv[3] ?? 'test-results';
require('fs').mkdirSync(aus, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'de-DE' });
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') fehler.push('console: ' + m.text().slice(0, 300)); });
  const bild = async (name) => { await page.screenshot({ path: `${aus}/${name}.png` }); console.log('Bild', name); };
  const pruefe = (ok, text) => { console.log(ok ? '✓' : '✗', text); if (!ok) process.exitCode = 1; };

  await page.goto(url);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.waitForTimeout(2500);
  await bild('01-onboarding');
  await page.getByRole('button', { name: 'Los geht’s' }).click();
  await page.waitForTimeout(3000);
  await bild('02-home');

  await page.getByRole('navigation').getByRole('button', { name: 'Training' }).click();
  await page.getByRole('button', { name: /^Arme & Unterarme/ }).click();
  await page.waitForTimeout(2500);
  await page.getByRole('group', { name: 'Seite' }).getByRole('button', { name: 'Links' }).click();
  await bild('03-training-vorher');
  const satz = page.getByRole('button', { name: /Satz abschließen/ });
  await satz.click();
  await page.waitForTimeout(350);
  await bild('04-satz-sofort');
  await page.waitForTimeout(1800);
  await bild('05-satz-danach');
  for (let i = 0; i < 4; i++) { await satz.click(); await page.waitForTimeout(400); }
  await page.waitForTimeout(1200);
  await bild('06-fuenf-saetze');
  const xpVorher = await page.locator('header').innerText();

  await page.reload();
  await page.waitForTimeout(3500);
  const xpNachher = await page.locator('header').innerText();
  pruefe(xpVorher.split('\n').pop() === xpNachher.split('\n').pop(), `XP nach Reload erhalten (${xpNachher.replace(/\n/g, ' | ')})`);
  pruefe(await page.getByText('Sätze dieses Workouts').isVisible(), 'Workout und Sätze nach Reload vorhanden');
  await page.getByRole('button', { name: 'Workout beenden' }).click();
  await page.waitForTimeout(800);
  await bild('07-zusammenfassung');

  await page.getByRole('navigation').getByRole('button', { name: 'Muskelatlas' }).click();
  await page.getByRole('button', { name: 'Entwicklung' }).click();
  await page.waitForTimeout(2500);
  await bild('08-atlas-entwicklung');

  await page.getByRole('navigation').getByRole('button', { name: 'Evolution' }).click();
  await page.waitForTimeout(3000);
  await bild('09-evolution');

  await page.getByRole('button', { name: 'Einstellungen und Diagnose' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('heading', { name: 'Diagnose' }).scrollIntoViewIfNeeded();
  await bild('10-diagnose');

  pruefe(fehler.length === 0, `keine Fehler in der Konsole${fehler.length ? ': ' + fehler.join(' || ') : ''}`);
  await browser.close();
})();
