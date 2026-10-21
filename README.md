# Detektyw

Mobilna gra detektywistyczna (PWA) po polsku: analizujesz materiały dowodowe, przesłuchujesz podejrzanych,
podejmujesz decyzje śledcze i wskazujesz sprawcę. Solo lub w kooperacji dwóch graczy.

> Treści dla osób pełnoletnich (tematyka zbrodni). Wszystkie postaci i zdarzenia są fikcyjne.

Plan i architektura: [docs/PLAN.md](docs/PLAN.md).

## Stan prac

| Kamień milowy                                              | Stan |
| ---------------------------------------------------------- | ---- |
| 1. Szkielet monorepo, PWA, Docker                          | ✅   |
| 2. Konta, logowanie, reset hasła, profil, RODO, zapis gier | ✅   |
| 3. Silnik gry, format sprawy, walidator                    | ⏳   |
| 4–10                                                       | ⏳   |

## Uruchomienie lokalne

Wymagania: Node.js 22.

```bash
npm install
cp .env.example .env         # domyślnie wbudowany Postgres (PGlite) w .data/
npm run seed                 # konta testowe: detektyw1@example.com / detektyw2@example.com, hasło: haslo-testowe-1
npm run dev                  # serwer :3000 + klient :5173 → http://localhost:5173
```

Bez skonfigurowanego `SMTP_URL` e-maile (reset hasła) są wypisywane w logu serwera.

## Testy

```bash
npm run typecheck
npm test                     # testy jednostkowe/integracyjne (Vitest, Postgres w pamięci)
npm run e2e                  # Playwright, viewport telefonu
```

Jeśli Playwright nie ma własnej przeglądarki, wskaż Chromium: `CHROMIUM_PATH=/ścieżka/do/chrome npm run e2e`.

## Wdrożenie (VPS)

```bash
docker compose up -d --build          # app + Postgres; http://localhost:3000
docker compose --profile dev up -d    # dodatkowo Mailpit (http://localhost:8025)
```

Na produkcji ustaw w `.env` obok `docker-compose.yml`:

- `APP_URL=https://twoja-domena.pl` (włącza ciasteczka `Secure`),
- `POSTGRES_PASSWORD`, `SMTP_URL`, `MAIL_FROM`,
- `TRUST_PROXY=true`, jeśli przed aplikacją stoi reverse proxy (np. Caddy: `reverse_proxy app:3000`).

Migracje bazy uruchamiają się automatycznie przy starcie serwera.

## Struktura

```
apps/client      PWA (Vite + React), nie ma dostępu do treści spraw
apps/server      Fastify: konta, API gry, logika rozstrzygająca
packages/shared  typy i walidacja współdzielone klient–serwer
content/cases    sprawy (YAML) – czytane wyłącznie przez serwer
e2e              testy Playwright
tools            skrypty pomocnicze (ikony, walidator spraw)
```

Format sprawy i instrukcja dodawania nowych spraw pojawią się w kamieniu 3.

## Bezpieczeństwo i prywatność

- Hasła: argon2id. Sesje: losowy token w ciasteczku httpOnly/SameSite=Lax, w bazie tylko jego skrót.
- CSRF: double-submit cookie. Nagłówki bezpieczeństwa (CSP, frame-ancestors) przez helmet.
- Limity: globalny rate limit, blokada logowania po 8 nieudanych próbach / 15 min.
- RODO: minimum danych (e-mail, nazwa, hash hasła, postęp gry), eksport danych i usunięcie konta w profilu,
  logi prób logowania kasowane po 24 h.
