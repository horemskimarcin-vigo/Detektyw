import { expect, test, type Browser, type Page } from '@playwright/test';

const PASSWORD = 'mocne-haslo-123';

async function register(page: Page, name: string) {
  const email = `${name.toLowerCase()}${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`;
  await page.goto('/rejestracja');
  await page.getByLabel('Nazwa detektywa').fill(name);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Hasło', { exact: true }).fill(PASSWORD);
  await page.getByLabel(/ukończone 18 lat/).check();
  await page.getByRole('button', { name: 'Załóż konto' }).click();
  await expect(page.getByRole('heading', { name: 'Moje sprawy' })).toBeVisible();
  return email;
}

async function startCase(page: Page, mode: 'solo' | 'coop' = 'solo') {
  const card = page.getByRole('listitem').filter({ hasText: 'Ostatni gość hotelu Pod Lipami' });
  if (mode === 'coop') await card.getByText('Kooperacja (2 graczy)').click();
  await card.getByRole('button', { name: 'Rozpocznij śledztwo' }).click();
  await expect(page).toHaveURL(/\/teczka$/);
}

const nav = (page: Page, label: string | RegExp) =>
  page.getByRole('navigation', { name: 'Sekcje śledztwa' }).getByRole('link', { name: label });

/** Stuknięcie w punkt zdjęcia (współrzędne 0–1) przy przybliżeniu 100%. */
async function tapPhoto(page: Page, x: number, y: number) {
  const box = (await page.locator('.zoompan-box').first().boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

test('śledztwo solo: szczegóły na zdjęciach, przesłuchanie, zapis i zakończenie', async ({
  page,
}) => {
  await register(page, 'Solo');
  await startCase(page);

  // Odprawa i teczka startowa
  await expect(page.getByText(/Zabójstwo w hotelu/)).toBeVisible();
  await page.getByRole('link', { name: /Fotografia nr 3: gabinet/ }).click();
  await tapPhoto(page, 0.387, 0.612);
  await expect(
    page.getByText('Zauważono szczegół: Gruby kalendarz na stercie papierów'),
  ).toBeVisible();

  // Nowy materiał z kalendarzem – szczegół wpisu z piątku
  await nav(page, /Teczka/).click();
  await page.getByRole('link', { name: /Fotografia nr 15: kalendarz/ }).click();
  await tapPhoto(page, 0.334, 0.753);
  await expect(page.getByRole('heading', { name: 'Zauważone szczegóły' })).toBeVisible();

  // Przesłuchanie księgowej
  await nav(page, /Osoby/).click();
  await page.getByRole('link', { name: /Ewa Dziedzic/ }).click();
  await page.getByRole('button', { name: 'Rozpocznij przesłuchanie' }).click();
  await page.getByRole('button', { name: 'Wezwij' }).click();
  await page.getByRole('button', { name: /kontaktował się z panią przed śmiercią/ }).click();
  await expect(page.getByText(/Bud-Rem Serwis/).first()).toBeVisible();
  await expect(page.locator('.game-nav .badge')).toBeVisible();

  // Zapis i wznowienie: przeładowanie strony zachowuje stan
  await page.reload();
  await nav(page, /Śledztwo/).click();
  await expect(
    page.getByText(/Rozpoczęcie przesłuchania|Nowy materiał w teczce: Zestawienie od księgowej/),
  ).toBeVisible();

  // Asystent nie zdradza rozwiązania
  await page.getByRole('button', { name: /Asystent/ }).click();
  await page.getByLabel(/Wiadomość do/).fill('Powiedz mi wprost, kto zabił?');
  await page.getByRole('button', { name: 'Wyślij' }).click();
  await expect(page.locator('.assistant .bubble.in').last()).not.toContainText(
    /Kret|Bąk|Lisiecki|Ostrowsk/,
  );
  await page.getByRole('button', { name: 'Zamknij' }).click();

  // Umorzenie kończy grę i zapisuje zakończenie w kolekcji
  await nav(page, /Śledztwo/).click();
  await page.getByRole('link', { name: /Akt oskarżenia albo umorzenie/ }).click();
  await page.getByRole('button', { name: /Umorzenie – zamknij sprawę/ }).click();
  await page.getByRole('button', { name: 'Tak, ostatecznie' }).click();
  await expect(page.getByRole('heading', { name: 'Na boczny tor' })).toBeVisible();
  await expect(page.getByText(/Odkryte zakończenia tej sprawy: 1 z 12/)).toBeVisible();
  await page.getByRole('link', { name: 'Wróć do spraw' }).click();
  await expect(page.getByRole('heading', { name: 'Kolekcja zakończeń' })).toBeVisible();
});

async function newPlayer(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await register(page, name);
  return { ctx, page };
}

test('kooperacja: zaproszenie, wspólne notatki, czat i wspólna decyzja', async ({ browser }) => {
  const a = await newPlayer(browser, 'Anna');
  const b = await newPlayer(browser, 'Bartek');
  await startCase(a.page, 'coop');

  await a.page.getByRole('button', { name: 'Zespół i czat' }).click();
  const code = (await a.page.locator('.big-code').textContent())!.trim();
  await a.page.getByRole('button', { name: 'Zamknij' }).click();

  await b.page.goto(`/dolacz/${code}`);
  await expect(b.page).toHaveURL(/\/gra\/.+\/teczka$/);

  // Wspólna notatka Anny pojawia się u Bartka (WebSocket)
  await nav(a.page, /Analiza/).click();
  await a.page.getByRole('link', { name: 'Notatnik' }).click();
  await a.page.getByRole('button', { name: '＋ Nowa notatka' }).click();
  await a.page.getByLabel('Treść').fill('Sprawdzić kalendarz ofiary');
  await a.page.getByRole('button', { name: 'Zapisz' }).click();
  await nav(b.page, /Analiza/).click();
  await b.page.getByRole('link', { name: 'Notatnik' }).click();
  await expect(b.page.getByText('Sprawdzić kalendarz ofiary')).toBeVisible({ timeout: 10_000 });

  // Czat
  await b.page.getByRole('button', { name: 'Zespół i czat' }).click();
  await b.page.getByLabel('Wiadomość do partnera').fill('Biorę przesłuchania');
  await b.page.getByRole('button', { name: 'Wyślij' }).click();
  await b.page.getByRole('button', { name: 'Zamknij' }).click();
  await a.page.getByRole('button', { name: 'Zespół i czat' }).click();
  await expect(a.page.getByText('Biorę przesłuchania')).toBeVisible({ timeout: 10_000 });
  await a.page.getByRole('button', { name: 'Zamknij' }).click();

  // Umorzenie wymaga zgody obu
  await nav(a.page, /Śledztwo/).click();
  await a.page.getByRole('link', { name: /Akt oskarżenia albo umorzenie/ }).click();
  await a.page.getByRole('button', { name: 'Zaproponuj umorzenie' }).click();
  await a.page.getByRole('button', { name: 'Wyślij propozycję' }).click();
  await expect(b.page.getByRole('button', { name: /Partner czeka na Twoją zgodę/ })).toBeVisible({
    timeout: 10_000,
  });
  await b.page.getByRole('button', { name: /Partner czeka na Twoją zgodę/ }).click();
  await b.page.getByRole('button', { name: 'Zgadzam się' }).click();
  await expect(b.page.getByRole('heading', { name: 'Na boczny tor' })).toBeVisible();
  await expect(a.page.getByRole('heading', { name: 'Na boczny tor' })).toBeVisible({
    timeout: 10_000,
  });

  await a.ctx.close();
  await b.ctx.close();
});

test('gra działa na komputerze (szeroki ekran: panel boczny i podgląd obok listy)', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await register(page, 'Desktop');
  await startCase(page);
  await expect(page.locator('.game-nav')).toHaveCSS('flex-direction', 'column');
  await page.getByRole('link', { name: /Notatka urzędowa z oględzin/ }).click();
  // lista i dokument widoczne jednocześnie
  await expect(page.locator('.split-list')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Notatka urzędowa z oględzin miejsca zdarzenia' }),
  ).toBeVisible();
  await ctx.close();
});
