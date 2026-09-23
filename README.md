# Aplikacja kierowcy – system zarządzania dokumentami

Responsywna aplikacja webowa (PWA) dla kierowców: zdjęcie dokumentu przewozowego (CMR, WZ) telefonem, kadrowanie i kompresja, szyfrowane przechowywanie, statusy i wersjonowanie dokumentów.

Projekt zaliczeniowy z przedmiotu _Systemy Szkieletowe_ (Społeczna Akademia Nauk).

> Stan: **Etap 1 – szkielet repozytorium.** Kontenery Docker, API i ekrany aplikacji powstają w kolejnych etapach.

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

## Uruchomienie (tryb deweloperski)

```bash
npm install
cp .env.example .env      # uzupełnij sekrety
npm run dev               # backend: http://localhost:3000, frontend: http://localhost:5173
```

## Polecenia

| Polecenie             | Działanie                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run dev`         | Backend (`tsx watch`) i frontend (Vite) jednocześnie                                                  |
| `npm run build`       | Kompilacja `shared`, backendu i frontendu                                                             |
| `npm run lint`        | ESLint + kontrola formatowania Prettier                                                               |
| `npm run format`      | Formatowanie kodu Prettierem                                                                          |
| `npm run typecheck`   | Kontrola typów TypeScript we wszystkich pakietach                                                     |
| `npm test`            | Testy Vitest we wszystkich pakietach                                                                  |
| `npm run test:e2e`    | Testy Playwright (przed pierwszym uruchomieniem: `npm run install:browsers -w e2e`)                   |
| `npm run docs:report` | Buduje `docs/sprawozdanie/build/main.pdf` w Dockerze (`texlive/texlive`); `-- --clean` buduje od zera |
