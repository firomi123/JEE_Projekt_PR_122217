# Aplikacja kierowcy – system zarządzania dokumentami

Responsywna aplikacja webowa (PWA) dla kierowców: zdjęcie dokumentu przewozowego (CMR, WZ) telefonem, kadrowanie i kompresja, szyfrowane przechowywanie, statusy i wersjonowanie dokumentów.

Projekt zaliczeniowy z przedmiotu _Systemy Szkieletowe_ (Społeczna Akademia Nauk).

> Stan: **Etap 9 – zdjęcie dokumentu aparatem, kadrowanie i kompresja.** API: rejestracja i logowanie (JWT), profil kierowcy, dokumenty z plikami JPG/PNG/PDF szyfrowanymi przed zapisem w MinIO (AES-256-GCM, szyfrowanie kopertowe), wersje, statusy, historia zmian, dokumentacja OpenAPI. Interfejs użytkownika powstaje w kolejnych etapach.

## Struktura

| Katalog              | Zawartość                                                        |
| -------------------- | ---------------------------------------------------------------- |
| `backend/`           | REST API (Node.js, Express, TypeScript)                          |
| `frontend/`          | Aplikacja React + TypeScript (Vite, PWA)                         |
| `shared/`            | Schematy walidacji, typy i enumy wspólne dla frontu i backendu   |
| `e2e/`               | Funkcjonalne testy interfejsu (Playwright)                       |
| `monitoring/`        | Konfiguracja Prometheus, Grafana i alertów                       |
| `docs/sprawozdanie/` | Sprawozdanie w LaTeX (szablon uczelni, rozdziały w `rozdzialy/`) |
| `scripts/`           | Skrypty pomocnicze (budowanie sprawozdania w Dockerze)           |

## Wymagania

- Node.js 22 lub nowszy, npm 10+
- Docker (do budowania sprawozdania, a od Etapu 2 do uruchamiania całego systemu)

## Uruchomienie w Dockerze

```bash
npm install
npm run env:init          # tworzy .env z losowymi hasłami i kluczami
npm run docker:up         # docker compose up -d --build --wait
```

| Usługa                 | Adres                                         |
| ---------------------- | --------------------------------------------- |
| Aplikacja (nginx)      | http://localhost:8090                         |
| API przez nginx        | http://localhost:8090/api/health/ready        |
| Dokumentacja API       | http://localhost:8090/api/docs                |
| Grafana                | http://localhost:3001 (hasło admina w `.env`) |
| Prometheus             | http://127.0.0.1:9090                         |
| Konsola MinIO          | http://127.0.0.1:9001                         |
| PostgreSQL (dla hosta) | 127.0.0.1:5432                                |

Zatrzymanie: `npm run docker:down` (dane zostają w wolumenach; `docker compose down -v` je usuwa).

## Uruchomienie (tryb deweloperski)

```bash
npm install
npm run env:init          # jeśli nie ma jeszcze .env
npm run dev               # backend: http://localhost:3000, frontend: http://localhost:5173 (proxy /api)
```

## Test na telefonie z Androidem (aparat)

Aparat (`getUserMedia`) działa tylko w bezpiecznym kontekście – HTTPS albo `localhost`. Telefon podłączony przez USB (debugowanie USB włączone) otwiera aplikację jako `localhost` dzięki przekierowaniu portu:

```bash
adb devices -l                                   # telefon widoczny i autoryzowany
adb reverse tcp:8090 tcp:8090                    # stos Docker (nginx)
adb shell am start -a android.intent.action.VIEW -d http://localhost:8090
adb exec-out screencap -p > ekran.png            # zrzut ekranu
```

Podgląd konsoli i sieci z telefonu: `chrome://inspect#devices` w Chrome na komputerze.

## Polecenia

| Polecenie                                           | Działanie                                                                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                       | Backend (`tsx watch`) i frontend (Vite) jednocześnie                                                                                         |
| `npm run build`                                     | Kompilacja `shared`, backendu i frontendu                                                                                                    |
| `npm run lint`                                      | ESLint + kontrola formatowania Prettier                                                                                                      |
| `npm run format`                                    | Formatowanie kodu Prettierem                                                                                                                 |
| `npm run typecheck`                                 | Kontrola typów TypeScript we wszystkich pakietach                                                                                            |
| `npm test`                                          | Testy Vitest we wszystkich pakietach (backend wymaga `npm run test:infra:up`)                                                                |
| `npm run db:migrate -w backend -- --name <zmiana>`  | Nowa migracja Prisma po zmianie `backend/prisma/schema.prisma`                                                                               |
| `npm run test:e2e`                                  | Testy Playwright (przed pierwszym uruchomieniem: `npm run install:browsers -w e2e`)                                                          |
| `npm run env:init`                                  | Tworzy `.env` z `.env.example` i generuje sekrety                                                                                            |
| `npm run docker:up` / `docker:down` / `docker:logs` | Start (z budowaniem, czeka na `healthy`), zatrzymanie i logi całego stosu                                                                    |
| `npm run test:infra:up` / `test:infra:down`         | Tymczasowe PostgreSQL (5433) i MinIO (9100) dla testów, dane w tmpfs                                                                         |
| `npm run docs:report`                               | Buduje `docs/sprawozdanie/build/main.pdf` w Dockerze (diagramy PlantUML z `docs/diagramy/` + `texlive/texlive`); `-- --clean` buduje od zera |
