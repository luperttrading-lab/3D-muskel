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
  // großzügige Frist: die Software-Grafik im Testrechner arbeitet nach Animationen einen Rückstau ab
  const bild = async (name) => { await page.screenshot({ path: `${aus}/${name}.png`, timeout: 120000 }); console.log('Bild', name); };
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
  await page.getByRole('button', { name: 'Anatomie' }).click();
  await page.waitForTimeout(1500);
  await bild('08b-atlas-anatomie');
  await page.getByRole('navigation', { name: 'Muskelgruppen' }).getByRole('button', { name: 'Bizeps' }).click();
  await page.waitForTimeout(1500);
  await bild('08c-atlas-gruppe');
  await page.locator('section').getByRole('button', { name: /^Bizeps/ }).first().click();
  await page.waitForTimeout(1500);
  await bild('08d-atlas-muskel');
  await page.getByRole('main').evaluate(el => el.scrollTo(0, 99999)).catch(() => {});
  await page.locator('#inhalt').evaluate(el => el.scrollTo(0, 99999)).catch(() => {});
  await page.waitForTimeout(400);
  await bild('08e-atlas-muskel-unten');

  await page.getByRole('navigation').getByRole('button', { name: 'Evolution' }).click();
  await page.waitForTimeout(3000);
  await bild('09-evolution');
  // Körper-Vorschau: 26 Wochen abspielen, Anatomie zeigen, zurück zum echten Stand
  const leiste = page.getByRole('group', { name: 'Vorschau abspielen' });
  await page.getByRole('button', { name: '▶ Körper simulieren' }).click();
  await leiste.getByRole('button', { name: 'Nochmal' }).waitFor({ timeout: 60000 });
  await bild('09b-vorschau-woche26');
  pruefe(await page.getByText('Woche 26', { exact: true }).isVisible(), 'Vorschau läuft bis Woche 26');
  await page.getByRole('group', { name: 'Körperfett am Ende' }).getByRole('button', { name: 'definiert' }).click();
  await page.getByRole('group', { name: 'Darstellung' }).getByRole('button', { name: 'Anatomie' }).click();
  await page.waitForTimeout(2500);
  await bild('09c-vorschau-anatomie');
  await page.locator('#inhalt').evaluate(el => el.scrollTo(0, 420)).catch(() => {});
  await page.waitForTimeout(400);
  await bild('09d-vorschau-regler');
  await leiste.getByRole('button', { name: 'Zurück zu jetzt' }).click();
  await page.waitForTimeout(800);
  pruefe(await page.locator('span', { hasText: /^Jetzt$/ }).isVisible(), 'Zurück zu jetzt zeigt wieder den echten Stand');

  await page.getByRole('button', { name: 'Einstellungen und Diagnose' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('heading', { name: 'Diagnose' }).scrollIntoViewIfNeeded();
  await bild('10-diagnose');

  pruefe(fehler.length === 0, `keine Fehler in der Konsole${fehler.length ? ': ' + fehler.join(' || ') : ''}`);
  await browser.close();
})();
