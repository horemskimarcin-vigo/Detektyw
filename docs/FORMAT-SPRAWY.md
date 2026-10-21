# Format sprawy i dodawanie nowych spraw

> Ten dokument nie zawiera spoilerów. Przykłady pochodzą z małej sprawy testowej `content/cases/_test-case`.

Gra jest sterowana danymi. Silnik (`packages/engine`) nie zna żadnej konkretnej sprawy, a każda sprawa to katalog plików YAML
w `content/cases/<id>/`. Serwer wczytuje go przy starcie i sprawdza schematem (`packages/engine/src/schema.ts`).
**Klient nigdy nie dostaje definicji sprawy**, tylko projekcję stanu gracza.

## Struktura katalogu

```
content/cases/<id>/
├─ case.yaml          # metadane, kalendarz, budżet, odprawa, tekst terminu
├─ people/*.yaml      # osoby i drzewa przesłuchań
├─ materials/*.yaml   # materiały dowodowe
├─ decisions.yaml     # decyzje śledcze
├─ assistant.yaml     # drabinki podpowiedzi asystenta
├─ solution.yaml      # opcje aktu oskarżenia + rozwiązanie (tylko serwer)
├─ endings.yaml       # zakończenia
├─ playthroughs.yaml  # scenariusze dla walidatora
├─ BIBLE.md           # biblia sprawy (spoilery; loader pomija pliki .md)
├─ art/               # opcjonalny generator grafik
└─ assets/            # grafiki (nazwy neutralne, np. a01.svg) – serwowane tylko po odblokowaniu
```

Pliki YAML są scalane: listy (np. `materials:`) z różnych plików łączą się, a obiekty scalają rekurencyjnie.
Podział na pliki jest więc dowolny.

## Czas i budżet

- Jednostka czasu to **pół dnia** (`rano`/`popołudnie`). `budget.time: 20` oznacza 10 dni.
- Rozmowa (sesja przesłuchania) kosztuje 1 jednostkę. Decyzje mają własny `cost` (`time`, `lab`, `police`, `patience`).
- Po wyczerpaniu czasu gra wchodzi w fazę **terminu**. Wtedy można już tylko analizować materiały i złożyć akt oskarżenia albo umorzyć sprawę.

## Warunki (DSL)

Warunek to `true`/`false` albo obiekt:

| Warunek                                                                                                                                                                 | Znaczenie                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `{ all: [...] }`, `{ any: [...] }`, `{ not: ... }`                                                                                                                      | logika                                                  |
| `{ flag: nazwa }`                                                                                                                                                       | ustawiona flaga                                         |
| `{ has: m01 }` / `{ read: m01 }` / `{ locked: m01 }`                                                                                                                    | materiał odblokowany / przeczytany / trwale zablokowany |
| `{ hotspot: h_x }`                                                                                                                                                      | znaleziony szczegół na zdjęciu                          |
| `{ decision: d_x }`                                                                                                                                                     | podjęta decyzja                                         |
| `{ asked: q_x }` / `{ interviewed: p_x }` / `{ known: p_x }`                                                                                                            | pytanie zadane / osoba przesłuchana / osoba znana       |
| `{ onBoard: id }`                                                                                                                                                       | element na tablicy gracza                               |
| `{ time: { gte: 4, lt: 9 } }`                                                                                                                                           | zużyty czas                                             |
| `{ counter: nazwa, gte: 2 }`                                                                                                                                            | licznik                                                 |
| `{ mode: coop }`                                                                                                                                                        | tryb gry                                                |
| `{ tone: press }`, `{ stress: {gte: 60} }`, `{ trust: {gte: 40} }`, `{ session: {gte: 2} }`                                                                             | tylko w odpowiedziach przesłuchań                       |
| `{ accusedCorrect: true }`, `{ accused: p_x }`, `{ strength: {gte: 7} }`, `{ reasoning: {gte: 2} }`, `{ hints: {lte: 0} }`, `{ timeout: true }`, `{ closedCase: true }` | tylko w zakończeniach                                   |

## Efekty

```yaml
effects:
  unlock: [m05] # odblokuj materiały
  lock: [m09] # bezpowrotnie zablokuj (jeśli jeszcze nieodblokowane)
  set: [flaga] # ustaw flagi
  clear: [flaga]
  inc: { licznik: 1 }
  stress: { p_x: 10 } # zmiana stresu/zaufania osoby
  trust: { p_x: -5 }
  reveal: [p_x] # osoba staje się znana
  budget: { patience: -1, lab: 1, time: -1 }
  lockInterview: [p_x] # osoba odmawia dalszych rozmów
  lockDecision: [d_x]
  journal: 'Tekst do dziennika'
```

## Materiały

```yaml
- id: t_m_photo
  type: photo # autopsy|report|press|testimony|cctv|photo|phone|bank|messages|inventory|lab|field|other
  title: Zdjęcie sali z gablotą
  start: true # albo unlockWhen: <warunek>, albo odblokowanie efektem
  lockWhen: <warunek> # opcjonalnie: przepada, jeśli warunek spełni się wcześniej
  private: true # kooperacja: widzi tylko zdobywca, dopóki nie przekaże
  redHerring: true # metadane (walidator liczy czerwone śledzie)
  onRead: { inc: { grounds: 1 } }
  body:
    kind: photo # document | press | table | messages | photo | cctv
    image: t_photo.svg
    width: 1600
    height: 1000
    caption: Sala główna
    hotspots: # współrzędne 0–1 względem obrazu; klient dostaje je dopiero po znalezieniu
      - {
          id: t_h_ash,
          x: 0.72,
          y: 0.78,
          r: 0.05,
          minZoom: 1,
          label: Popiół,
          description: '…',
          effects: { set: [x] },
        }
```

Teksty dokumentów obsługują prosty Markdown: `#` nagłówki, akapity (pusta linia), listy `-`, tabele `|…|`, `**pogrubienie**`, `*kursywa*`.
Monitoring (`cctv`) ma klatki o proporcjach 16:9 (`frames`) i dziennik (`log`). Na klatkach też mogą być szczegóły.

## Osoby i przesłuchania

```yaml
- id: t_baker
  name: Jan Piekarz
  role: witness # victim | suspect | witness | other
  knownWhen: <warunek> # domyślnie znana od startu
  facts: [{ text: '…', when: <warunek> }]
  interview:
    baseStress: 20
    baseTrust: 40
    breakAt: 90 # przy tym stresie rozmówca przerywa rozmowę
    lockOnBreak: false # czy zerwanie blokuje na stałe
    questionsPerSession: 5
    pressSensitivity: 1
    availableWhen: <warunek>
    opening: '…'
    breakText: '…'
    confrontDefault: '…' # reakcja na dowód bez specjalnej odpowiedzi
    questions:
      - id: t_q_baker_saw
        text: Widział pan kogoś przy galerii?
        requires: <warunek>
        responses: # pierwsza pasująca wygrywa; ostatnia bez warunku = domyślna
          - when: { trust: { gte: 40 } }
            text: '– Chłopaka na rowerze…'
            effects: { set: [baker_saw_bike] }
          - text: '– Nie pamiętam.'
    confrontations:
      - evidence: t_m_cctv # materiał lub szczegół
        responses: [{ text: '…', effects: { … } }]
```

Ton pytania zmienia stres i zaufanie (spokojnie +2/+1, empatycznie −6/+5, naciskając +14×wrażliwość/−6).
Odpowiedź **wymijająca** (gdy istnieje lepsza, warunkowa wersja z efektem) nie zamyka pytania, więc gracz może do niego wrócić.
Między rozmowami stres opada o 25 w stronę poziomu wyjściowego.

## Decyzje

```yaml
- id: t_d_search
  category: warrant # lab|police|warrant|press|arrest|witness|expert|other
  title: Nakaz zatrzymania roweru
  cost: { time: 1, patience: 1 }
  requires: <warunek>
  key: true # w kooperacji wymaga zgody obu graczy
  exclusiveGroup: press # decyzje z grupy wykluczają się
  solverAvoid: true # automatyczny śledczy walidatora jej nie podejmie
  outcomes: # pierwszy pasujący wynik
    - when: <warunek>
      text: Prokurator wydał nakaz.
      effects: { unlock: [t_m_bike] }
      delayed: { after: 2, text: 'Wyniki…', effects: { … } } # wynik po czasie
    - text: Odmowa.
```

## Asystent

Każdy węzeł śledztwa ma 3 poziomy podpowiedzi (pytanie naprowadzające → kierunek → konkretny materiał, bez wniosku):

```yaml
assistant:
  name: …
  nodes:
    - id: t_hint_cctv
      key: true # węzeł kluczowy – walidator wymaga pełnej drabinki
      priority: 10
      activeWhen: <warunek>
      resolvedWhen: <warunek>
      refs: [t_m_cctv] # kooperacja: podpowiedź tylko dla gracza, który ma te materiały
      levels: ['…', '…', '…']
  fallback: ['…', '…', '…']
  refusals: ['…'] # odpowiedzi na „kto to zrobił?”
```

## Oskarżenie, rozwiązanie, zakończenia

- `accusation`: listy motywów, sposobów i okoliczności (każda opcja może mieć `requires`, czyli pojawia się dopiero po odkryciu).
- `solution`: sprawca, poprawne opcje, `keyEvidence` z wagami (to „siła” aktu oskarżenia), `requiredEvidence`
  (element może być listą alternatyw), sprzeczności i punkty zwrotne (dla walidatora).
- `endings`: wybierane według `priority` (najwyższe pierwsze) i warunku `when`. `addenda` dopisują warianty epilogu.
  **Teksty zakończeń nie mogą zawierać nazwiska sprawcy.**

## Walidacja i testy

```bash
npm run validate                          # wszystkie sprawy
npm run validate -- content/cases/<id>    # jedna sprawa
npm run playthrough -- <id>               # scenariusze i automatyczny śledczy
```

Walidator sprawdza:

- schemat i odwołania,
- liczności (dla spraw nie-testowych: 5–7 podejrzanych, 3–4 świadków, 30–45 materiałów, 6–10 czerwonych śledzi, ≥ 3 sprzeczności, 2–3 punkty zwrotne, ≥ 8 zakończeń),
- pełne drabinki podpowiedzi i brak nazwiska sprawcy w tekstach asystenta i zakończeń,
- osiągalność rozwiązania od startu i po losowych „rozsądnych” ścieżkach (brak martwych punktów),
- osiągalność każdego zakończenia (scenariusze `playthroughs.yaml`).

## Nowa sprawa krok po kroku

1. Skopiuj `content/cases/_test-case` do `content/cases/<nowe-id>`, ustaw `id`, `version` i `internal: false`.
2. Napisz `BIBLE.md`: przebieg minuta po minucie, prawda i kłamstwa każdej postaci, mapa dowodów.
3. Uzupełnij osoby, materiały, decyzje, podpowiedzi, oskarżenie, zakończenia i scenariusze.
4. Dodaj grafiki do `assets/` (neutralne nazwy plików).
5. Uruchom `npm run validate` aż do „✓ sprawa poprawna”, potem `npm run check` (w tym kontrola paczki klienta).
6. Zrestartuj serwer. Sprawa pojawi się na liście „Nowa sprawa”.
