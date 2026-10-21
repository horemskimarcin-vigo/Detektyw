import { expect, test } from '@playwright/test';

const unique = () => `gracz${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
const PASSWORD = 'mocne-haslo-123';

test('rejestracja, nowa sprawa, wylogowanie i ponowne logowanie', async ({ page }) => {
  const email = unique();
  await page.goto('/');
  await expect(page).toHaveURL(/\/logowanie$/);
  await page.getByRole('link', { name: 'Załóż konto' }).click();

  await page.getByLabel('Nazwa detektywa').fill('Komisarz Test');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Hasło', { exact: true }).fill(PASSWORD);
  await page.getByLabel(/ukończone 18 lat/).check();
  await page.getByRole('button', { name: 'Załóż konto' }).click();

  await expect(page.getByRole('heading', { name: 'Moje sprawy' })).toBeVisible();
  await page.getByRole('button', { name: 'Rozpocznij śledztwo' }).first().click();
  await expect(page).toHaveURL(/\/gra\//);

  await page.getByRole('link', { name: 'Wróć do listy spraw' }).click();
  await expect(page.getByRole('link', { name: 'Wznów' })).toHaveCount(1);

  await page.getByRole('link', { name: 'Profil' }).click();
  await page.getByRole('button', { name: 'Wyloguj' }).click();
  await expect(page).toHaveURL(/\/logowanie$/);

  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Hasło').fill(PASSWORD);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  // Zapis przetrwał wylogowanie (wznowienie na „innym urządzeniu”).
  await expect(page.getByRole('link', { name: 'Wznów' })).toHaveCount(1);
});

test('reset hasła przez link z e-maila', async ({ page, request }) => {
  const email = unique();
  await page.goto('/rejestracja');
  await page.getByLabel('Nazwa detektywa').fill('Zapominalski');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Hasło', { exact: true }).fill(PASSWORD);
  await page.getByLabel(/ukończone 18 lat/).check();
  await page.getByRole('button', { name: 'Załóż konto' }).click();
  await page.getByRole('link', { name: 'Profil' }).click();
  await page.getByRole('button', { name: 'Wyloguj' }).click();

  await page.getByRole('link', { name: 'Nie pamiętasz hasła?' }).click();
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Wyślij link' }).click();
  await expect(page.getByText(/wiadomość z linkiem jest już w drodze/)).toBeVisible();

  const outbox = await (await request.get('/api/test/outbox')).json();
  const mail = outbox.mails.findLast((m: { to: string }) => m.to === email);
  const link = mail.text.match(/http\S+reset-hasla\/\S+/)[0];
  await page.goto(new URL(link).pathname);
  await page.getByLabel('Nowe hasło').fill('zupelnie-nowe-456');
  await page.getByRole('button', { name: 'Ustaw nowe hasło' }).click();
  await page.getByRole('link', { name: 'Zaloguj się' }).click();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Hasło').fill('zupelnie-nowe-456');
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page.getByRole('heading', { name: 'Moje sprawy' })).toBeVisible();
});

test('błędne logowanie pokazuje komunikat', async ({ page }) => {
  await page.goto('/logowanie');
  await page.getByLabel('E-mail').fill('nikt@example.com');
  await page.getByLabel('Hasło').fill('cokolwiek-123');
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page.getByRole('alert')).toContainText('Nieprawidłowy e-mail lub hasło');
});
