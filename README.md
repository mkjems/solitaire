# Solitaire

Klondike solitaire for desktop and mobile browsers. See [docs/PLAN.md](docs/PLAN.md) for the plan and [docs/RulesOfTheGame.md](docs/RulesOfTheGame.md) for the rules the engine implements.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Installs the tools (once) |
| `npm run dev` | Runs the game at http://localhost:5173 |
| `npm run check` | Type-checks, lints and runs the engine tests |
| `npm run test:e2e` | Plays real games in Chrome at desktop and phone sizes |
| `npm run build` | Builds the site into `dist/` |
| `npm run cards` | Rebuilds `public/cards` (standard and large-print faces) from the art in `art/` |
| `npm run icons` | Renders the app icons in `public/icons` from `art/icon.svg` |

The first `npm run test:e2e` may need `npx playwright install chromium`.

## Address options

- `?deal=1234` plays numbered deal 1234 (instead of offering to continue a saved game)
- `?draw=3` plays draw three
- `?scoring=none|standard|timed|vegas` sets the scoring
- `?lang=da` or `?lang=en` sets the language (otherwise taken from the browser)

## Keys

| Key | Action |
|---|---|
| Space or D | Draw from the stock |
| H | Hint |
| Z or U, Ctrl/⌘+Z | Undo |
| R, Ctrl/⌘+Y, Ctrl/⌘+Shift+Z | Redo |
| N | New game |
| F | Full screen |

## Layout

- `src/engine/`: the rules, with no browser code. Fully unit-tested.
- `src/ui/`: the table, layout, spring animation, cards, sound, controls, statistics, saving.
- `art/`: source card art. `scripts/prepare-cards.mjs` styles it into `public/cards/`.
- `e2e/`: browser tests.

## What is saved in the browser

Settings, statistics and the game in progress are kept in `localStorage` under keys starting `solitaire.`. Clearing site data resets them.

## Deploying

Live at https://solitaire.mkjems.dk. Every push to `main` runs
[.github/workflows/deploy.yml](.github/workflows/deploy.yml): the checks and browser tests, then a
Docker image (the built game served by nginx, see [Dockerfile](Dockerfile) and
[docker/nginx.conf](docker/nginx.conf)) pushed to `ghcr.io/mkjems/solitaire`, then
`docker compose pull && up` in `/opt/solitaire` on the VPS. The container listens on
`127.0.0.1:8086`; Caddy, configured in the separate infrastructure repository, serves it publicly.
[compose.yaml](compose.yaml) is a copy of the one on the VPS.

Built scripts and styles are cached for a year (their names change with every build). Everything
else is revalidated on each visit, so new card art and service worker updates arrive at once.
