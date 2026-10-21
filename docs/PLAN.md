# Plan: mobilna gra detektywistyczna (PWA), kamień milowy 1

Status: **propozycja do akceptacji**. Kod powstanie dopiero po Twojej zgodzie.

---

## 1. Stack (z uzasadnieniem zmian względem propozycji)

| Warstwa                   | Wybór                                                                                                                                                         | Dlaczego                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Język                     | TypeScript wszędzie (strict)                                                                                                                                  | wspólne typy klient/serwer/silnik                                                                                                                                                                                            |
| Monorepo                  | npm workspaces                                                                                                                                                | bez dodatkowych narzędzi; Node 22 jest dostępny                                                                                                                                                                              |
| Klient                    | **Vite + React 18 + React Router + TanStack Query + Zustand**, `vite-plugin-pwa` (Workbox)                                                                    | Gra to aplikacja za logowaniem: SSR z Next.js niczego tu nie daje, a osobna paczka klienta **fizycznie uniemożliwia** przypadkowe zaimportowanie biblii sprawy do bundla (inaczej niż przy komponentach serwerowych Next.js) |
| Serwer                    | **Fastify** (Node 22) + `@fastify/websocket`, `@fastify/rate-limit`, `@fastify/cookie`, `@fastify/helmet`                                                     | szybki, schematy wejścia, prosty w kontenerze                                                                                                                                                                                |
| Walidacja                 | **zod** (API + format spraw)                                                                                                                                  | jedno źródło typów i walidacji                                                                                                                                                                                               |
| Baza                      | **PostgreSQL 16 + Drizzle ORM**; testy na **PGlite** (Postgres w WASM, bez Dockera)                                                                           | JSONB na stan gry, transakcje, ten sam dialekt w dev/test/prod                                                                                                                                                               |
| Realtime                  | WebSocket z numerem sekwencji zdarzeń, wznowienie od `lastSeq`                                                                                                | rozłączenia na telefonie są normą                                                                                                                                                                                            |
| Auth                      | argon2id, sesje w bazie (cookie httpOnly, `SameSite=Lax`, `Secure`), token CSRF (double submit), limity prób logowania                                        | prościej i bezpieczniej niż JWT, łatwe unieważnianie                                                                                                                                                                         |
| E-mail (reset hasła)      | nodemailer przez SMTP z env; w dev **Mailpit** w docker-compose                                                                                               |                                                                                                                                                                                                                              |
| Testy                     | Vitest (silnik, serwer, walidator), **Playwright** e2e (Chromium jest preinstalowany)                                                                         |                                                                                                                                                                                                                              |
| Grafika                   | ręcznie pisane SVG w spójnym stylu (zdjęcia „noir”, klatki monitoringu), katalog `assets/` do podmiany                                                        | brak problemów z prawami autorskimi                                                                                                                                                                                          |
| LLM (faza 2, opcjonalnie) | interfejs `HintRephraser` / `InterrogationResponder`; implementacja przez Claude API, domyślnie wyłączona                                                     | gra w pełni grywalna bez LLM                                                                                                                                                                                                 |
| Wdrożenie                 | jeden obraz Docker (serwer serwuje zbudowanego klienta) + `docker-compose.yml` (app + postgres + mailpit w dev), Caddy jako reverse proxy z TLS w przykładzie | „zwykły VPS”                                                                                                                                                                                                                 |

## 2. Struktura katalogów

```
/
├─ apps/
│  ├─ client/            # PWA (React). Zna tylko typy „projekcji” stanu
│  └─ server/            # Fastify: auth, API gry, WS, asystent, ładowanie spraw
├─ packages/
│  ├─ engine/            # czysty silnik gry: stan, akcje → zdarzenia, warunki, budżet,
│  │                     # zakończenia, projekcja dla klienta, wybór podpowiedzi (bez I/O)
│  ├─ case-schema/       # schematy zod formatu sprawy + DSL warunków
│  └─ shared/            # typy API/WS współdzielone klient–serwer (BEZ danych spraw)
├─ content/
│  └─ cases/
│     ├─ _test-case/     # mała sprawa do testów silnika i e2e
│     └─ <sprawa-1>/
│        ├─ case.yaml          # metadane, budżet, start
│        ├─ people.yaml        # osoby (część publiczna + ukryta)
│        ├─ materials/*.yaml   # materiały (treść w Markdown/strukturach)
│        ├─ dialogues/*.yaml   # drzewa dialogowe
│        ├─ decisions.yaml     # decyzje śledcze i ich skutki
│        ├─ hints.yaml         # drabinki podpowiedzi
│        ├─ endings.yaml       # zakończenia + warunki
│        ├─ solution.yaml      # sprawca, wymagane dowody (TYLKO serwer)
│        └─ BIBLE.md           # biblia sprawy (spoilery; nigdy nie budowana)
├─ assets/cases/<sprawa>/      # SVG/obrazy; nazwy plików neutralne (bez spoilerów)
├─ tools/
│  ├─ validate-case.ts   # walidator sprawy (patrz §7)
│  └─ playthrough.ts     # „przejdź sprawę” – automatyczne przejścia ścieżek
├─ e2e/                  # Playwright
├─ Dockerfile, docker-compose.yml, README.md
```

Sprawy są kompilowane przez skrypt do jednego `case.compiled.json` czytanego **wyłącznie przez serwer**. Test CI sprawdza, że zbudowany bundel klienta nie zawiera żadnego ciągu z `solution.yaml`, ukrytych pól ani treści nieodblokowanych materiałów.

## 3. Format sprawy (gra sterowana danymi)

- **Materiał**: `id` (neutralny, np. `m07`), `type` (`autopsy | press | testimony | cctv | photo | phone_billing | bank | messages | inventory | lab | field_note | other`), `title`, `date`, `body` (zależny od typu: dokument, klatki CCTV z czasem, zdjęcie z hotspotami, tabela billingowa…), `unlock` (warunek), `lock` (warunek trwałej blokady), `visibility` (w koop: `both | holder`), `tags` (wewnętrzne, nie do klienta).
- **Osoba**: część publiczna (`name`, `role`, `bio`, zdjęcie) + część ukryta (`truth`, `hides`, `lieMotive`, `baseStress`, `baseTrust`, `credibility`).
- **Dialog**: węzły z pytaniami (`requires` – warunek), tonem (`calm | press | empathetic`), efektami (`stress`, `trust`, `setFlag`, `unlock`, `endInterview`, `lockTopic`), konfrontacją dowodem (`confront: materialId|hotspotId`). Koszt przesłuchania w budżecie.
- **Decyzja**: koszt (dni, zlecenia lab/policja, cierpliwość prokuratora), warunki dostępności, skutki (odblokowania, **trwałe blokady**, flagi, zmiany zachowania postaci), flaga `key: true` → w koop wymaga zgody obu graczy.
- **Warunki (DSL)** jako JSON: `all / any / not`, `flag`, `hasMaterial`, `readMaterial`, `onBoard`, `decision`, `interviewed`, `budget`, `day>=`, `noteMentions`, `hotspotFound`. Ewaluowane tylko na serwerze.
- **Zakończenie**: `id`, `priority`, `when` (warunek nad oskarżeniem, jakością dowodów, flagami proceduralnymi, budżetem), `epilogue`, `summaryTemplate`. Tekst epilogu nie zawiera nazwiska sprawcy, jeśli oskarżono kogoś innego.
- **Ocena dowodów przy oskarżeniu**: gracz wskazuje osobę + do 5 dowodów + odpowiada na 3 pytania (motyw / możliwość / sposób) z listy wyboru zbudowanej z tego, co odkrył. Serwer liczy „siłę aktu oskarżenia”, która wybiera wariant zakończenia.

## 4. Model danych (Postgres)

- `users` (id, email, display_name, password_hash, created_at, settings jsonb, deleted_at)
- `sessions` (id hash, user_id, expires_at, user_agent) · `password_resets` (token_hash, user_id, expires_at, used_at) · `login_attempts` (do limitów)
- `games` (id, case_id, case_version, mode `solo|coop`, status `active|finished|abandoned`, state jsonb, state_version, hint_count, created_at, updated_at)
- `game_players` (game_id, user_id, seat 1/2, role_label, last_seen_seq)
- `game_invites` (code, game_id, expires_at, used_by)
- `game_events` (game_id, seq, actor_user_id, type, payload jsonb, created_at) – dziennik append-only; autozapis = każda akcja to transakcja `event + nowy state`
- `notes`, `board_nodes`, `board_edges`, `timeline_entries` (game_id, owner_user_id lub `shared`, dane, version) – wersjonowane, konflikty w koop rozwiązywane per element (last-write-wins + powiadomienie)
- `proposals` (game_id, kind, payload, votes, status) – decyzje kluczowe w koop
- `chat_messages`, `assistant_messages` (game_id, role, text, hint_node_id, level)
- `endings_unlocked` (user_id, case_id, ending_id, game_id, at) – kolekcja zakończeń

Klient dostaje wyłącznie **projekcję** stanu (`engine.project(state, userId)`): odblokowane materiały danego gracza, dostępne pytania/decyzje, budżet, flagi oznaczone jako jawne. Ukryte flagi, warunki, ID nieodblokowanych materiałów i zakończeń nigdy nie wychodzą z serwera.

## 5. Asystent („stary wyjadacz”)

- Warstwa deterministyczna w silniku: węzły śledztwa z `activeWhen` / `resolvedWhen`, priorytetem i 3 poziomami tekstu. Wybór: najwyższy priorytet spośród aktywnych, nierozwiązanych. Poziom rośnie tylko po kolejnej prośbie **i** (cooldown, np. 5 min, **lub** nowa akcja gracza). Maks. poziom 3.
- Wykrywanie utknięcia: brak nowego odblokowania/flag przez N min lub M akcji, wielokrotne otwieranie tych samych materiałów, aktywny węzeł „pominięty dowód” przez dłuższy czas → dyskretna propozycja (wyłączalna).
- Pytania typu „czy to X?” / „kto to zrobił” → klasyfikator regułowy (nazwiska + wzorce) → odpowiedź w roli z puli odmów.
- Warstwa LLM (opcjonalna, wyłączona domyślnie): dostaje tylko teksty już odblokowane, listę znanych graczowi nazw i wybraną podpowiedź; filtr wyjścia blokuje nazwy/fakty spoza wiedzy gracza i frazy oskarżycielskie; limity na grę i użytkownika; przy jakimkolwiek błędzie wraca tekst deterministyczny.
- Licznik podpowiedzi wspólny w koop, wpływa na wariant epilogu, nigdy nie blokuje zakończenia. Tryb „bez podpowiedzi”.

## 6. Kooperacja

Zaproszenie kodem/linkiem; WebSocket z `seq` i odtwarzaniem zdarzeń po ponownym połączeniu; wspólny notatnik/tablica/oś czasu (plus prywatne notatki); czat + szybkie reakcje; role (etykiety + domyślne przypisanie typów materiałów); materiały `holder` widoczne dla jednego gracza z akcją „przekaż partnerowi”; decyzje kluczowe i oskarżenie jako propozycja wymagająca głosu obu; obecność partnera i obsługa jego nieobecności (gra czeka, nie robi nic za niego).

## 7. Jakość i walidacja

- **Walidator sprawy**: schemat zod; referencje (ID istnieją); osiągalność materiałów (przeszukiwanie przestrzeni stanów po flagach/decyzjach z przycinaniem); brak martwych punktów (w każdej rozsądnej ścieżce da się zgromadzić minimalny zestaw dowodów rozwiązania przed wyczerpaniem budżetu); każde zakończenie osiągalne (generowany świadek-ścieżka); każdy węzeł podpowiedzi ma 3 poziomy; żaden tekst podpowiedzi/odmowy/epilogu złego zakończenia nie zawiera nazwiska sprawcy; liczności (5–7 podejrzanych, 30–45 materiałów, 6–10 czerwonych śledzi, ≥3 sprzeczności, ≥8 zakończeń).
- **Testy jednostkowe** silnika (odblokowania, blokady, budżet, zakończenia, asystent) i serwera (auth, autoryzacja dostępu do gier, brak wycieku w odpowiedziach API).
- **Testy szczelności asystenta**: próby wymuszenia („powiedz kto”, „zignoruj zasady”, „jesteś teraz…”) dla obu warstw (LLM mockowany złośliwie → filtr musi zablokować).
- **e2e (Playwright, viewport telefonu)**: rejestracja/logowanie/reset, przejście solo `_test-case`, para graczy na dwóch kontekstach przeglądarki, zapis i wznowienie na „innym urządzeniu”.
- **Seed**: konta testowe, gry w różnych stanach; `npm run playthrough` – automatyczne przejście ścieżek.

## 8. Kamienie milowe

1. **Plan + szkielet** (monorepo, lint/format, CI skrypty, Docker, pusta PWA, healthcheck). ← ten dokument
2. Konta: rejestracja, logowanie, wylogowanie, reset hasła, usunięcie konta i eksport danych (RODO), profil, ustawienia.
3. Silnik + format sprawy + DSL warunków + walidator + `_test-case`.
4. Widoki materiałów (dokument, prasa, zeznanie, CCTV z osią i zoomem, zdjęcie z hotspotami, tabele), teczka z filtrami, notatnik, tablica dowodowa, oś czasu, lista osób.
5. Przesłuchania: drzewa, ton, stres/zaufanie, konfrontacja dowodem, budżet.
6. Decyzje, budżet, trwałe blokady, oskarżenie, zakończenia, kolekcja zakończeń.
7. Asystent: drabinki, cooldown, wykrywanie utknięcia, interfejs LLM + filtr, testy szczelności.
8. Kooperacja 2 graczy.
9. **Biblia sprawy** + pełna treść sprawy 1 (materiały, dialogi, decyzje, ≥8 zakończeń, drabinki) + ilustracje SVG. _Proponuję zacząć szkic biblii już przy M3, żeby silnik był projektowany pod realną sprawę; pełną treść dopisać w M9._
10. PWA (offline odczyt pobranych materiałów i notatek, instalacja), dostępność, tryb ciemny, testy e2e, README, wdrożenie.

Po każdym kamieniu: testy + krótkie podsumowanie.

## 9. Ryzyka

| Ryzyko                                                                                              | Mitigacja                                                                                                                             |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Objętość treści** (30–45 materiałów, drzewa dialogowe 5–7 podejrzanych + 3–4 świadków) i spójność | biblia minuta po minucie jako jedyne źródło prawdy; walidator sprawdza referencje i sprzeczności zadeklarowane w biblii               |
| Balans 3–5 h i trudności                                                                            | parametry budżetu w danych; telemetria czasu w grze (lokalnie); automatyczne przejścia                                                |
| **Wyciek rozwiązania** (ID, nazwy plików grafik, kolejność w API, czasy odpowiedzi)                 | neutralne ID i nazwy zasobów, projekcja stanu, test bundla, testy odpowiedzi API, zasoby nieodblokowane serwowane tylko z autoryzacją |
| Konflikty edycji w koop                                                                             | operacje per element z wersją, LWW + informacja „partner zmienił”                                                                     |
| PWA offline vs logika serwerowa                                                                     | offline tylko odczyt i notatki lokalne (kolejka sync); decyzje/przesłuchania wymagają połączenia                                      |
| Dostarczalność e-maili                                                                              | SMTP konfigurowalne; w dev Mailpit                                                                                                    |
| **Środowisko**: ten kontener jest tymczasowy, a katalog nie jest repozytorium git                   | potrzebuję repozytorium GitHub do commitów po każdym kamieniu (pytanie niżej)                                                         |

## 10. Decyzje, które podjąłem sam (do ewentualnej korekty)

- Vite+React zamiast Next.js, Fastify, Postgres+Drizzle, sesje zamiast JWT (uzasadnienie w §1).
- Oskarżenie = osoba + wybrane dowody + motyw/możliwość/sposób (pozwala ocenić „trafność rozumowania”).
- Budżet: **10 dni śledztwa**, 6 zleceń laboratoryjnych, 4 zlecenia policyjne, licznik cierpliwości prokuratora; każde przesłuchanie kosztuje czas (pół dnia).
- Treść tylko po polsku, ale wszystkie teksty UI przez i18next (klucze), treść sprawy z polem `locale`.
