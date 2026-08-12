# Morrow

**Browsers that remember.** Persistent browser infrastructure for humans and machines.

## Run (development)

    cp .env.example .env   # set MORROW_API_KEY
    npm install
    npm run dev            # http://localhost:3000

## Run (Docker)

    docker run -e MORROW_API_KEY=secret -v morrow-data:/data -p 3000:3000 ghcr.io/jekyo/morrow:latest

## Profiles API

Profiles are persistent Camoufox browser identities: create one, start it, drive it, stop it — cookies, local/session storage and logins are written to disk and are still there next time you start it. All requests need `Authorization: Bearer $MORROW_API_KEY`.

Create a profile:

    curl -X POST http://localhost:3000/api/v1/profiles \
      -H "Authorization: Bearer $MORROW_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"name": "research-eu", "locale": "de-DE"}'

Start it (launches the browser and pins its fingerprint for future starts):

    curl -X POST http://localhost:3000/api/v1/profiles/research-eu/start \
      -H "Authorization: Bearer $MORROW_API_KEY"

Stop it (flushes browser state to disk):

    curl -X POST http://localhost:3000/api/v1/profiles/research-eu/stop \
      -H "Authorization: Bearer $MORROW_API_KEY"

Profile state (cookies, storage, logins) persists on disk across restarts, so stopping and starting the same profile resumes exactly where it left off.

## Scraping

Browserless-style HTTP endpoints for one-shot page work — screenshots, raw HTML,
and cleaned markdown/article extraction. All requests need
`Authorization: Bearer $MORROW_API_KEY` and a `url` or `html` target.

Get markdown from a page:

    curl -X POST http://localhost:3000/api/v1/scrape \
      -H "Authorization: Bearer $MORROW_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"url": "https://example.com", "format": "markdown"}'

`format` also accepts `text` (plain innerText) and `article` (Readability
title/byline/excerpt/content/text plus a markdown rendering).

Take a screenshot:

    curl -X POST http://localhost:3000/api/v1/screenshot \
      -H "Authorization: Bearer $MORROW_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"url": "https://example.com", "fullPage": true}' \
      -o screenshot.png

Get the rendered HTML:

    curl -X POST http://localhost:3000/api/v1/content \
      -H "Authorization: Bearer $MORROW_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"url": "https://example.com"}'

Add `"profile": "research-eu"` to any of the three requests to run the scrape
inside that profile's persistent, logged-in browser context instead of a
throwaway one — no cookie or session management required for sites you're
already authenticated with.

All three also accept page options: `gotoOptions`, `waitForSelector`,
`waitForTimeout`, `waitForFunction`, `viewport`, `rejectResourceTypes`,
`rejectRequestPattern`, `setExtraHTTPHeaders`, `bestAttempt`.

Full request/response shapes are documented at `/api-docs` (a themed Swagger
UI), backed by an OpenAPI 3 document at `/api/v1/openapi.json` — point any
OpenAPI client generator at it to produce a typed SDK.

## Connect with Playwright

Any stock Playwright (>= matching 1.60.x) attaches straight to a profile's
persistent browser — the profile auto-starts on connect:

```ts
import { firefox } from "playwright";

const browser = await firefox.connect(
  "ws://localhost:3000/playwright/x-marketing?token=" + process.env.MORROW_API_KEY
);
const context = browser.contexts()[0]; // the profile's persistent context
const page = await context.newPage();
await page.goto("https://x.com");
```

Everything you do — logins, cookies, storage — lands in the profile and is
still there tomorrow. Client playwright version must match the server's
major.minor (currently 1.60.x).

Docs: `docs/` — vision, v1 spec, UI spec, design system.
