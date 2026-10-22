import { expect, test } from '@playwright/test';

const SHOTS = process.env.VOICE_SHOTS; // katalog na zrzuty (podgląd animacji), opcjonalnie

test('przesłuchanie z głosem: mówiący portret i napisy', async ({ page }) => {
  const email = `glos${Date.now()}@example.com`;
  await page.goto('/rejestracja');
  await page.getByLabel('Nazwa detektywa').fill('Głos');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Hasło', { exact: true }).fill('mocne-haslo-123');
  await page.getByLabel(/ukończone 18 lat/).check();
  await page.getByRole('button', { name: 'Załóż konto' }).click();
  const card = page.getByRole('listitem').filter({ hasText: 'Ostatni gość hotelu Pod Lipami' });
  await card.getByRole('button', { name: 'Rozpocznij śledztwo' }).click();

  await page
    .getByRole('navigation', { name: 'Sekcje śledztwa' })
    .getByRole('link', { name: /Osoby/ })
    .click();
  await page.getByRole('link', { name: /Agnieszka Wrona/ }).click();
  await page.getByRole('button', { name: 'Rozpocznij przesłuchanie' }).click();
  await page.getByRole('button', { name: 'Wezwij' }).click();

  // Kwestia z powitania (po pauzie dialogowej) w napisach, narracja nie
  const subtitle = page.locator('.iv-subtitle');
  await expect(subtitle).toContainText('Nie mogę uwierzyć');
  await expect(subtitle).not.toContainText('ściska w dłoniach');

  await page.getByRole('button', { name: /O której pani wyszła/ }).click();
  await expect(page.getByRole('img', { name: 'Agnieszka Wrona mówi' })).toBeVisible();
  await expect(subtitle).toContainText('O ósmej. Szef był w gabinecie.');
  if (SHOTS)
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(170);
      await page.locator('.iv-stage').screenshot({ path: `${SHOTS}/voice-${i}.png` });
    }

  // Przerwanie, powtórzenie i wyłączenie głosu
  await page.getByRole('button', { name: /Przerwij/ }).click();
  await expect(page.getByRole('button', { name: /Powtórz/ })).toBeVisible();
  await page.getByRole('button', { name: /Głos: wł\./ }).click();
  await expect(page.getByRole('button', { name: /Głos: wył\./ })).toBeVisible();

  // Postać bez głosu nie ma sceny
  await page.getByRole('button', { name: 'Zakończ rozmowę' }).click();
  await page.getByRole('button', { name: '← Osoby' }).click();
  await page.getByRole('link', { name: /Ewa Dziedzic/ }).click();
  await expect(page.getByRole('heading', { name: 'Ewa Dziedzic' })).toBeVisible();
  await expect(page.locator('.iv-stage')).toHaveCount(0);
});
