# Contributing to Morrow

Thanks for your interest in Morrow — persistent browser infrastructure for
humans and machines. This guide gets you from clone to a green pull request.

## Development setup

Requirements: **Node ≥ 20** (22 is what CI and the Docker image use) and the
build tools for native modules (`python3`, `make`, `g++` — for `better-sqlite3`).

```bash
git clone https://github.com/jekyo/morrow.git
cd morrow
cp .env.example .env          # set MORROW_API_KEY to anything for local dev
npm install
npx camoufox-js fetch         # download the Camoufox browser (~700 MB, one time)
npm run dev                   # http://localhost:3000
```

Open `http://localhost:3000` and log in with the key you set. If you reach the
dev server from anything other than `localhost` (a LAN IP, hostname, or
tunnel), list those hosts in `MORROW_DEV_ORIGINS` or Next will block its dev
assets — see the README's "Run (development)" section.

## The workflow we follow

Morrow is built test-first. Please keep it that way:

- **Write the failing test first**, watch it fail, then make it pass. Unit
  tests live in `tests/unit/`, real-browser integration tests in
  `tests/integration/` (gated behind `MORROW_IT=1`).
- **Keep files focused.** One clear responsibility per module; server logic
  lives in `src/server/`, routes in `src/app/api/v1/`, UI in `src/app` and
  `src/components`.
- **Match the design system** for any UI work — see `docs/design/design-system.md`.

## Before you push

All four must pass:

```bash
npm test              # unit suite (integration specs auto-skip)
npm run typecheck     # tsc --noEmit
npm run build         # next build
npm run test:integration   # real Camoufox — needs the browser fetched
```

## Commits and pull requests

- **Conventional commits**: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
  `chore:`, `ci:`. Keep the subject imperative and under ~72 chars.
- Branch off `main`; open a PR against `main`. Describe what changed and how you
  verified it. Small, reviewable PRs are much preferred.
- CI (typecheck, unit tests, build, and the integration suite) must be green.
- Releases are cut by tagging `vX.Y.Z`, which builds and publishes the GHCR
  image; maintainers handle version bumps.

## Reporting bugs and requesting features

Use the GitHub issue templates. For anything security-sensitive, follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## Code of Conduct

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). Be
excellent to each other.
