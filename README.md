# Detektyw

Gra detektywistyczna po polsku, działająca w przeglądarce na telefonie i na komputerze. Na telefonie można ją też zainstalować jak aplikację (PWA).
Analizujesz materiały dowodowe, przesłuchujesz podejrzanych, podejmujesz decyzje śledcze w ramach budżetu i na końcu wskazujesz sprawcę.
Grasz solo albo w kooperacji z drugą osobą.

> Treści dla osób pełnoletnich (tematyka zbrodni). Wszystkie postaci i zdarzenia są fikcyjne.

**Uwaga na spoilery:** jeśli chcesz zagrać, nie otwieraj `content/cases/zawierzbie/` ani commitów z treścią tej sprawy.
Ten README, `docs/` i kod gry niczego nie zdradzają.

---

## Jak uruchomić grę

### Opcja A – najprościej, na własnym komputerze (Windows, macOS, Linux)

Wymagany jest tylko **Node.js 22** (https://nodejs.org – wersja LTS 22.x). Baza danych jest wbudowana, nic więcej nie trzeba instalować.

```bash
git clone https://github.com/horemskimarcin-vigo/Detektyw.git
cd Detektyw
npm install
npm run seed      # opcjonalnie: dwa konta testowe (patrz niżej)
npm run play      # buduje grę (za pierwszym razem ok. minuty) i uruchamia ją
```

Otwórz **http://localhost:3000** w przeglądarce (Chrome, Edge, Firefox, Safari). Załóż konto albo zaloguj się kontem testowym:

| E-mail                | Hasło           |
| --------------------- | --------------- |
| detektyw1@example.com | haslo-testowe-1 |
| detektyw2@example.com | haslo-testowe-1 |

- Postęp zapisuje się automatycznie po każdej akcji (w katalogu `.data/`). Grę można przerwać (Ctrl+C) i wznowić później.
- `npm run seed` uruchamiaj przy zatrzymanej grze.
- Po aktualizacji kodu (`git pull`) uruchom `npm install` i `npm run play -- --build`.

**Gra na telefonie w tej samej sieci Wi-Fi:** sprawdź adres IP komputera (np. `192.168.1.20`) i otwórz na telefonie
`http://192.168.1.20:3000`. Możesz grać w przeglądarce. Instalacja na ekranie głównym i tryb offline wymagają HTTPS,
czyli wdrożenia z opcji C.

**Kooperacja:** obie osoby muszą mieć dostęp do tego samego serwera (ta sama sieć albo serwer w internecie).
Jedna osoba zakłada sprawę w trybie „Kooperacja”, a w panelu 👥 w grze dostaje kod lub link zaproszenia dla partnera.

### Opcja B – Docker na komputerze

```bash
docker compose up -d --build        # gra + PostgreSQL → http://localhost:3000
```

Dane są w wolumenie `pgdata`. Konta testowe: `docker compose exec -e NODE_ENV=development app node dist/seed.js`.
Z podglądem e-maili (reset hasła): `docker compose --profile dev up -d --build`, a skrzynka jest pod http://localhost:8025.

### Opcja C – serwer w internecie (VPS) z HTTPS

Potrzebny jest serwer z Dockerem i domena skierowana rekordem A na jego adres IP.

```bash
git clone https://github.com/horemskimarcin-vigo/Detektyw.git && cd Detektyw
cp .env.example .env
# w .env ustaw: APP_URL=https://twoja-domena.pl, DOMAIN=twoja-domena.pl, POSTGRES_PASSWORD=<długie hasło>,
#               TRUST_PROXY=true, NODE_ENV nie jest potrzebny (obraz działa w trybie produkcyjnym)
#               opcjonalnie SMTP_URL i MAIL_FROM – bez nich linki resetu hasła trafiają tylko do logu
docker compose --profile https up -d --build
```

Caddy sam uzyska certyfikat TLS. Gra jest wtedy pod `https://twoja-domena.pl`, można ją zainstalować na telefonie
(„Dodaj do ekranu głównego”) i czytać pobrane materiały offline.
Aktualizacja: `git pull && docker compose --profile https up -d --build`. Migracje bazy wykonują się automatycznie.

### Opcjonalnie: asystent z modelem językowym

Asystent działa w pełni bez sztucznej inteligencji: ma drabinki podpowiedzi zapisane w danych sprawy.
Opcjonalnie może przeformułowywać podpowiedzi w stylu postaci przez Claude API. Warstwa LLM nie zna rozwiązania,
a każdą jej odpowiedź sprawdza filtr. Przy błędzie gra wraca do tekstu z danych.

```
ASSISTANT_LLM=on
ANTHROPIC_API_KEY=sk-ant-...
ASSISTANT_LLM_MAX_PER_HOUR=30   # limit zapytań na grę na godzinę
```

### Opcjonalnie: nagrane głosy postaci (ElevenLabs)

Postacie z ustawionym głosem ElevenLabs (`voice.elevenlabs.voiceId` w danych sprawy) mogą mówić nagranymi głosami.
Nagrania tworzy się raz, na swoim komputerze:

```
ELEVENLABS_API_KEY=...          # w pliku .env (nie wysyłaj go na GitHuba)
npm run voices -- --dry         # policz znaki (bez kosztów)
npm run voices                  # nagraj brakujące kwestie
```

Skrypt nie wypisuje treści kwestii, więc nie zdradza sprawy. Bez nagrań gra używa głosu przeglądarki.

---

## Dla programistów

```bash
npm install
cp .env.example .env
npm run dev          # serwer :3000 + klient z hot reload :5173 → http://localhost:5173
npm run check        # typy + testy + walidacja spraw + build + kontrola paczki klienta
npm run e2e          # testy Playwright (telefon i komputer); CHROMIUM_PATH=… jeśli trzeba wskazać przeglądarkę
npm run validate     # walidator spraw (martwe punkty, zakończenia, podpowiedzi, wycieki)
npm run playthrough  # „przejdź sprawę”: scenariusze każdego zakończenia + automatyczny śledczy
```

### Architektura

```
apps/client       PWA (Vite + React + TanStack Query). Zna tylko kontrakty z packages/shared.
apps/server       Fastify: konta, sesje, API gry, WebSocket, zasoby, opcjonalny LLM
packages/engine   czysty silnik gry (bez I/O): stan, akcje, warunki, budżet, zakończenia,
                  projekcja stanu dla gracza, asystent, walidator, automatyczny śledczy
packages/shared   typy API i walidacja wspólna klient–serwer (bez treści spraw)
content/cases     sprawy w YAML + grafiki (czytane wyłącznie przez serwer)
e2e               testy Playwright
tools             walidator, playthrough, kontrola paczki, ikony, zrzuty ekranu
deploy            konfiguracja Caddy (HTTPS)
```

- **Logika rozstrzygająca jest po stronie serwera.** Klient wysyła tylko intencje (`GameAction`) i dostaje projekcję stanu (`GameView`):
  odblokowane materiały, znalezione szczegóły, dostępne pytania i decyzje. Położenie nieodkrytych szczegółów, warunki, flagi i rozwiązanie
  nigdy nie opuszczają serwera. Grafiki są wydawane tylko graczom, którzy odblokowali dany materiał.
- **Autozapis:** każda akcja to jedna transakcja (nowy stan + wpis w dzienniku zdarzeń). Akcje w jednej grze są szeregowane.
- **Kooperacja:** WebSocket powiadamia o zmianach partnera i obecności, a po rozłączeniu łączy się ponownie i dociąga zmiany.
  Kluczowe decyzje i oskarżenie przechodzą przez propozycję i zgodę obu graczy. Materiały „prywatne” trzeba świadomie przekazać.
- **Bezpieczeństwo:** argon2id, sesje w bazie (ciasteczko httpOnly, w bazie skrót tokenu), CSRF (double submit), CSP, limity zapytań
  i prób logowania, walidacja wejścia (zod). RODO: eksport i usunięcie konta w profilu, logi logowań kasowane po 24 h.

Format spraw i instrukcja dodawania nowej: **[docs/FORMAT-SPRAWY.md](docs/FORMAT-SPRAWY.md)**. Pierwotny plan: [docs/PLAN.md](docs/PLAN.md).

### Testy

| Zakres                                                                                                            | Gdzie                                    |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Silnik: odblokowania, blokady, budżet, termin, przesłuchania, zakończenia, kooperacja, tablica                    | `packages/engine/test`                   |
| Asystent: stopniowe podpowiedzi, cooldown, odporność na wyciąganie rozwiązania                                    | `packages/engine/test/assistant.test.ts` |
| Walidator: wykrywanie błędów, sprawa główna                                                                       | `packages/engine/test/validator.test.ts` |
| Serwer: konta, CSRF, limity, reset hasła, RODO, API gry, wycieki w API, grafiki, kooperacja, WebSocket, filtr LLM | `apps/server/test`                       |
| E2E: rejestracja, reset hasła, śledztwo solo, zapis i wznowienie, kooperacja dwóch graczy, układ na komputer      | `e2e/`                                   |
