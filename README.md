# Morrow

**Browsers that remember.** Persistent browser infrastructure for humans and machines.

## Run (development)

    cp .env.example .env   # set MORROW_API_KEY
    npm install
    npm run dev            # http://localhost:3000

## Run (Docker)

    docker run -e MORROW_API_KEY=secret -v morrow-data:/data -p 3000:3000 ghcr.io/OWNER/morrow:latest

Docs: `docs/` — vision, v1 spec, UI spec, design system.
