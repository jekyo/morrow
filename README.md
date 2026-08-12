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

Docs: `docs/` — vision, v1 spec, UI spec, design system.
