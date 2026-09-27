# Aplikacja kierowcy – system zarządzania dokumentami

Responsywna aplikacja webowa (PWA) dla kierowców: zdjęcie dokumentu przewozowego (CMR, WZ) telefonem, kadrowanie i kompresja, szyfrowane przechowywanie, statusy i wersjonowanie dokumentów. Panel biura w przeglądarce na komputerze: przegląd dokumentów wszystkich kierowców, akceptacja albo odrzucenie z podaniem powodu.

Projekt zaliczeniowy z przedmiotu _Systemy Szkieletowe_ (Społeczna Akademia Nauk). Autor: Piotr Roman (nr albumu 122217, grupa 4) – projekt indywidualny.

Sprawozdanie: [Sprawozdanie_PR_122217.pdf](Sprawozdanie_PR_122217.pdf) (źródła LaTeX w `docs/sprawozdanie/`).

## Funkcje

- Rejestracja (formularz z walidacją) i logowanie loginem i hasłem, uwierzytelnianie tokenem JWT.
- Profil kierowcy, do którego przypisane są dokumenty.
- Dokumenty: typ (CMR, WZ, faktura, inny), status z regułami przejść (roboczy → przesłany → zaakceptowany/odrzucony → zarchiwizowany), tytuł, numer, wyszukiwanie i filtry.
- Zdjęcie dokumentu aparatem telefonu (`getUserMedia`), kadrowanie i obrót, kompresja przed wysłaniem (zdjęcie 12 Mpx: ok. 3,7 MB → 0,7–0,8 MB); alternatywnie plik JPG/PNG/PDF do 10 MB.
- Wersje pliku i historia zmian (metadane, statusy, komentarze biura).
- Role: kierowca (rejestracja publiczna) i biuro (konto z `.env`). Panel biura pod `/biuro`: dokumenty do sprawdzenia, filtry (kierowca, typ, status, tekst), podgląd, dane kierowcy, akceptacja / odrzucenie z powodem, który kierowca widzi na telefonie. Kierowca nie może sam zaakceptować dokumentu.
- Pliki szyfrowane AES-256-GCM przed zapisem w MinIO (szyfrowanie kopertowe: osobny klucz każdego pliku, zaszyfrowany kluczem głównym).
- PWA: instalacja na ekranie głównym, start bez sieci (dokumenty nie są zapisywane na urządzeniu).
- Monitoring: metryki Prometheus, dashboardy Grafana, alerty, logi w Loki, automatyczne restarty po awarii i zawieszeniu.
- Dokumentacja API (OpenAPI/Swagger) pod `/api/docs`.

## Struktura

| Katalog              | Zawartość                                                                        |
| -------------------- | -------------------------------------------------------------------------------- |
| `backend/`           | REST API (Node.js, Express 5, Prisma, TypeScript) i jego testy (`backend/test/`) |
| `frontend/`          | Aplikacja React + TypeScript (Vite, PWA), serwowana przez nginx                  |
| `shared/`            | Schematy walidacji (Zod), typy i reguły wspólne dla frontendu i backendu         |
| `e2e/`               | Funkcjonalne testy interfejsu (Playwright, emulacja telefonu)                    |
| `monitoring/`        | Prometheus, alerty, Alertmanager, Grafana, Loki, Alloy, test chaosu              |
| `docs/sprawozdanie/` | Sprawozdanie w LaTeX (szablon uczelni, rozdziały w `rozdzialy/`)                 |
| `docs/diagramy/`     | Diagramy PlantUML (architektura, sekwencje, ERD)                                 |
| `scripts/`           | Skrypty pomocnicze (sekrety `.env`, sprawozdanie, ikony, zrzuty ekranu)          |

## Wymagania

- Docker z Docker Compose v2 (Docker Desktop na Windows/macOS); zalecane co najmniej 6 GB pamięci dla Dockera – limity pamięci wszystkich kontenerów sumują się do ok. 4,5 GB.
- Node.js 22 lub nowszy i npm 10+ (skrypty pomocnicze, tryb deweloperski, testy).
- Wolne porty: 8090 (aplikacja), 3001 (Grafana) oraz lokalne 5432, 9000, 9001, 9090, 9093. Porty można zmienić w `.env`.

## Uruchomienie w Dockerze

```bash
npm install
npm run env:init          # tworzy .env z losowymi hasłami i kluczami (nie nadpisuje istniejącego)
npm run docker:up         # docker compose up -d --build --wait
```

`docker:up` kończy się dopiero, gdy wszystkie usługi są w stanie `healthy`. Pierwsze budowanie obrazów trwa kilka minut. Następnie otwórz http://localhost:8090, załóż konto i dodaj dokument.

**Konto biura:** login `biuro` (`OFFICE_USERNAME`), hasło w `.env` (`OFFICE_PASSWORD`, generowane przez `env:init`). Backend zakłada to konto przy starcie; po zalogowaniu biuro trafia do panelu http://localhost:8090/biuro. Zmiana hasła w `.env` działa po restarcie backendu.

> Jeśli budowanie obrazów kończy się błędem npm („Exit handler never called” / błąd certyfikatu), a antywirus skanuje połączenia HTTPS (np. Norton – zmienna `NODE_EXTRA_CA_CERTS` wskazuje jego certyfikat), kontenery nie ufają jego certyfikatowi. Wyłącz na czas budowania moduł skanujący HTTPS (w Nortonie: Web/Mail Shield) albo dodaj wyjątek dla Dockera.

| Usługa                 | Adres                                                         |
| ---------------------- | ------------------------------------------------------------- |
| Aplikacja (nginx)      | http://localhost:8090                                         |
| Panel biura            | http://localhost:8090/biuro (konto biura z `.env`)            |
| Stan API               | http://localhost:8090/api/health/ready                        |
| Dokumentacja API       | http://localhost:8090/api/docs                                |
| Grafana                | http://localhost:3001 (login i hasło admina w `.env`)         |
| Prometheus             | http://127.0.0.1:9090                                         |
| Alertmanager           | http://127.0.0.1:9093                                         |
| Logi (Loki)            | Grafana → Explore → źródło „Loki”                             |
| Konsola MinIO          | http://127.0.0.1:9001 (dane dostępowe w `.env`)               |
| PostgreSQL (dla hosta) | 127.0.0.1:5432 (baza, użytkownik i hasło w `.env`)            |

Zatrzymanie: `npm run docker:down` (dane zostają w wolumenach; `docker compose down -v` je usuwa). Uruchomienie od zera: `docker compose down -v && npm run docker:up`.

Plik `.env` zawiera sekrety (klucz JWT, klucz główny szyfrowania, hasła) i nie jest commitowany. Utrata `MASTER_ENCRYPTION_KEY` oznacza utratę dostępu do zapisanych plików.

## Uruchomienie (tryb deweloperski)

```bash
npm install
npm run env:init          # jeśli nie ma jeszcze .env
docker compose up -d postgres minio minio-init migrate   # baza i magazyn plików
npm run dev               # backend: http://localhost:<PORT z .env>, frontend: http://localhost:5173 (proxy /api)
```

## Testy

```bash
npm run test:infra:up             # testowe PostgreSQL (5433) i MinIO (9100), dane w pamięci
npm test                          # testy jednostkowe i funkcjonalne API (Vitest)
npm run install:browsers -w e2e   # jednorazowo: przeglądarka Chromium dla Playwright
npm run test:e2e                  # testy interfejsu w emulacji telefonu Pixel 7 (ok. 2–5 min)
npm run test:infra:down
```

- Backend: 189 testów (głównie funkcjonalne – żądania HTTP do API na prawdziwej bazie i MinIO), pakiet `shared`: 109, frontend: 62 testy jednostkowe, Playwright: 36 scenariuszy (w tym pełna ścieżka kierowcy od rejestracji do wylogowania i obieg biuro ↔ kierowca w dwóch przeglądarkach).
- Testów backendu nie uruchamiaj w trakcie testów Playwright – oba korzystają z tej samej bazy testowej, a testy backendu ją czyszczą (także konto biura testów E2E).
- Pokrycie: `npm run test:coverage` (backend ok. 95 % instrukcji) i `npm run test:e2e:coverage` (frontend przez testy w przeglądarce ok. 94 %).
- Testy Playwright na obrazach Docker: `npm run test:e2e:docker` – uruchamia **jednorazową kopię** stosu (osobny projekt Compose `driver-docs-e2e`, puste wolumeny, frontend na :8091), wykonuje testy i usuwa kopię razem z danymi. Gdy testy nie przejdą, kopia **zostaje** (http://localhost:8091, baza na 127.0.0.1:5436), a logi kontenerów trafiają do `e2e/test-results/docker-stack.log` – następne uruchomienie i tak zaczyna od czystych danych. Testy tworzą konta i dokumenty, dlatego nie uruchamiaj ich na stosie z prawdziwymi danymi (:8090) – Playwright odmówi pracy z zewnętrznym adresem bez tego skryptu.
- Monitoring: `npm run monitoring:check` (składnia reguł i konfiguracji), `npm run chaos` (awaria, zawieszenie procesu i zatrzymanie bazy na działającym stosie – sprawdza restarty i alerty).
- CI: `.github/workflows/ci.yml` (lint, typy, build, testy z pokryciem, E2E, stos Docker).

## Test na telefonie z Androidem (aparat, PWA)

Aparat (`getUserMedia`) i service worker działają tylko w bezpiecznym kontekście – HTTPS albo `localhost`. Telefon podłączony przez USB (debugowanie USB włączone, zgoda „Zezwól” na telefonie) otwiera aplikację jako `localhost` dzięki przekierowaniu portu. `adb` jest w Android SDK (`platform-tools`).

```bash
adb devices -l                                   # telefon widoczny i autoryzowany
adb reverse tcp:8090 tcp:8090                    # stos Docker (nginx)
adb shell am start -a android.intent.action.VIEW -d http://localhost:8090
adb exec-out screencap -p > ekran.png            # zrzut ekranu
```

Tryb deweloperski zamiast Dockera: uruchom Vite z `npm run dev -w frontend -- --host 127.0.0.1` (domyślnie nasłuchuje tylko na IPv6 `::1`, a `adb reverse` łączy się z `127.0.0.1`) i przekieruj port 5173.

Sprawdzono na Samsung Galaxy A26 (Android 16, Chrome). Scenariusz ręczny: rejestracja → Dodaj → „Zrób zdjęcie” (zgoda na aparat, tylny aparat) → kadrowanie i obrót → „Użyj zdjęcia” (informacja o kompresji) → zapis → podgląd dokumentu → zmiana statusu. Instalacja PWA: menu Chrome → „Dodaj do ekranu głównego” / „Zainstaluj aplikację”, potem uruchomienie z ikony w trybie wyłączonego internetu (baner o braku połączenia). Podgląd konsoli i sieci z telefonu: `chrome://inspect#devices` w Chrome na komputerze.

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
| `npm run test:coverage`                             | Testy Vitest z raportem pokrycia (`*/coverage/index.html`)                                                                                   |
| `npm run test:e2e:coverage`                         | Testy Playwright z pokryciem kodu frontendu (`e2e/coverage-e2e/index.html`)                                                                  |
| `npm run env:init`                                  | Tworzy `.env` z `.env.example` i generuje sekrety                                                                                            |
| `npm run docker:up` / `docker:down` / `docker:logs` | Start (z budowaniem, czeka na `healthy`), zatrzymanie i logi całego stosu                                                                    |
| `npm run test:infra:up` / `test:infra:down`         | Tymczasowe PostgreSQL (5433) i MinIO (9100) dla testów, dane w tmpfs                                                                         |
| `npm run monitoring:check`                          | Sprawdza reguły alertów i konfigurację (`promtool`, `amtool`)                                                                                |
| `npm run chaos`                                     | Test watchdogów na działającym stosie: awaria procesu, zamrożenie, zatrzymanie bazy (5–8 min, wymaga bash)                                   |
| `npm run docs:code`                                 | Dokumentacja kodu TypeDoc (z opisów TSDoc) w `docs/kod/index.html`                                                                           |
| `npm run docs:screenshots`                          | Dane demonstracyjne (`jan_kowalski` / `Tajne123!`) i zrzuty panelu biura na jednorazowej kopii stosu; z `E2E_KEEP_STACK=1` kopia zostaje na zrzuty z telefonu                                                                 |
| `npm run docs:report`                               | Buduje `docs/sprawozdanie/build/main.pdf` w Dockerze (diagramy PlantUML z `docs/diagramy/` + `texlive/texlive`) i kopiuje go do `Sprawozdanie_PR_122217.pdf`; `-- --clean` buduje od zera |
