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

Profile state (cookies, storage, logins) persists on disk across restarts, so stopping and starting the same profile resumes exactly where it left off. A connect/attach endpoint for driving a running profile with a stock browser client ships in the next release.

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
