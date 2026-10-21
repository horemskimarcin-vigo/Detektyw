// Zrzuty ekranu przykładowej rozgrywki (sprawa testowa) na telefonie i komputerze.
// Użycie: node tools/screenshots.mjs <katalog-wyjściowy> [adres]  (serwer musi działać z NODE_ENV=test)
import { chromium, devices } from '@playwright/test';

const out = process.argv[2] ?? '.';
const base = process.argv[3] ?? 'http://localhost:4100';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const errors = [];

async function run(name, ctxOpts) {
  const ctx = await b.newContext(ctxOpts);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${name} console: ${m.text()}`));
  const nav = (label) =>
    p.getByRole('navigation', { name: 'Sekcje śledztwa' }).getByRole('link', { name: label });
  await p.goto(`${base}/rejestracja`);
  await p.getByLabel('Nazwa detektywa').fill('Komisarz');
  await p.getByLabel('E-mail').fill(`${name}${Date.now()}@example.com`);
  await p.getByLabel('Hasło', { exact: true }).fill('haslo-testowe-1');
  await p.getByLabel(/18 lat/).check();
  await p.getByRole('button', { name: 'Załóż konto' }).click();
  await p.getByRole('button', { name: 'Rozpocznij śledztwo' }).first().click();
  await p.waitForURL(/teczka/);
  await p.screenshot({ path: `${out}/${name}-1-folder.png` });
  await p.getByRole('link', { name: /Zdjęcie sali/ }).click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/${name}-2-photo.png`, fullPage: true });
  await nav(/Teczka/).click();
  await p.getByRole('link', { name: /Notatka służbowa/ }).click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${name}-2b-doc.png`, fullPage: true });
  await nav(/Osoby/).click();
  await p.getByRole('link', { name: /Jan Piekarz/ }).click();
  await p.getByRole('button', { name: 'Rozpocznij przesłuchanie' }).click();
  await p.getByRole('button', { name: 'Wezwij' }).click();
  await p.getByText('Empatycznie').click();
  await p.getByRole('button', { name: /Widział pan kogoś/ }).click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${name}-3-interview.png`, fullPage: true });
  await nav(/Śledztwo/).click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${name}-4-investigation.png`, fullPage: true });
  await nav(/Analiza/).click();
  await p.getByRole('button', { name: '＋ Dodaj' }).click();
  await p.getByRole('button', { name: /Marek Zięba/ }).click();
  await p.getByRole('button', { name: /Notatka służbowa/ }).click();
  await p.getByRole('button', { name: 'Zamknij' }).click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${name}-5-board.png`, fullPage: true });
  await p.getByRole('button', { name: /Asystent/ }).click();
  await p.getByRole('button', { name: /Poproś o wskazówkę/ }).click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${name}-6-assistant.png` });
  await ctx.close();
}

for (const [n, o] of [
  ['mobile', { ...devices['Pixel 7'] }],
  ['desktop', { viewport: { width: 1440, height: 900 } }],
]) {
  try {
    await run(n, o);
  } catch (e) {
    errors.push(`${n} FAILED: ${e.message.split('\n')[0]}`);
  }
}
console.log(errors.join('\n') || 'bez błędów');
await b.close();
