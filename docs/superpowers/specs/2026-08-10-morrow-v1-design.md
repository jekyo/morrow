# Morrow v1 — Product & Technical Design

**Status:** Approved draft
**Date:** 2026-08-10
**One-liner:** Browserless's HTTP APIs, but every call can run inside a persistent, logged-in browser identity — and humans can attach to the same browser as automation.

---

## 1. What v1 is

A single Docker container that provides:

1. **Persistent profiles** — create a browser identity once, log into websites, stop it, start it later: still logged in.
2. **Attachable sessions** — stock Playwright connects to a running profile over a WebSocket endpoint; the dashboard viewer attaches to the same browser; both can coexist.
3. **Remote viewer** — a human opens a profile in the dashboard, sees the live browser, takes control, logs in, releases.
4. **Scrape-family HTTP APIs** — Browserless-style `/screenshot`, `/content`, `/scrape`, each optionally running inside a profile (authenticated scraping with zero cookie management).
5. **MCP server** — full browser control tools ("Playwright on steroids") operating on persistent profiles.
6. **OpenAPI-first API** — the OpenAPI document is served by the app with a Swagger UI page so users can generate client libraries.
7. **Dashboard + docs** — profiles, metrics, viewer, MDX docs.

### Explicitly out of scope for v1

- Built-in AI agent (the MCP server replaces it)
- Multi-user accounts / roles (single API key only)
- Multi-worker / distributed scheduling (architecture keeps the seam)
- PDF endpoint, `/function`, `/download` (arbitrary code execution surface)
- CDP/`/json/*`/`/devtools/*` compatibility routes (Chromium-specific)
- Profile snapshots, cloning UI polish beyond basic clone/reset
- Webhooks (events are stored + queryable; delivery mechanisms later)
- Workflows, recording, proxy marketplace, CAPTCHA solving

---

## 2. Stack decisions (settled)

| Decision | Choice | Rationale |
|---|---|---|
| Deployment | **One Docker container**, one exposed port, `/data` volume | Browserless-style operational simplicity |
| Runtime | **Node.js ≥ 20**, written Bun-friendly (no Node-exotic APIs) | Playwright/Camoufox/Next are tested on Node; early implementation task: Bun compat spike — flip runtime if it passes |
| Server | **One Next.js app with a custom server entry** (`server.ts`: `node:http` + `ws`) | User decision: no separate framework; Next handles pages + API route handlers; custom entry handles WebSocket upgrades |
| Browser engine | **Camoufox only** (Firefox-based, anti-fingerprint) behind a `BrowserRuntime` interface | Fingerprint resistance matters for logged-in identities; interface keeps engine-agnostic future open |
| Language | TypeScript everywhere | |
| State | **SQLite** at `/data/morrow.db` (better-sqlite3), profile dirs at `/data/profiles/<id>/` | Single container ⇒ no Postgres/Redis; volume mount = full persistence |
| Auth | **Single API key** via `MORROW_API_KEY` env var, checked on REST, WebSocket upgrades, and MCP | Browserless token model; multi-user later |
| UI | Tailwind CSS + daisyUI, custom `morrow` theme | See design system + UI spec docs |
| Viewer transport | JPEG frames + input events over WebSocket, driven through Playwright | Engine-agnostic, headless-capable, control lock enforced server-side |

### Container layout

```text
morrow container
│
└── node server.ts  (port 3000)
     ├── HTTP → Next.js
     │    ├── Dashboard pages        /
     │    ├── Docs (MDX)             /docs
     │    ├── Swagger UI             /api-docs   (serves /api/v1/openapi.json)
     │    └── API route handlers     /api/v1/*
     │                               /mcp        (MCP streamable HTTP)
     ├── WS upgrade → ws library
     │    ├── /playwright/:profile   (byte passthrough → Camoufox Playwright server)
     │    └── /viewer/:profile       (frames out, input in)
     └── spawns per running profile: Xvfb display + Camoufox process
          └── internal Playwright server ws (random port, localhost only)
```

Two long-lived concerns live **outside** Next's request lifecycle, as plain TypeScript modules held by the server process: the **ProfileManager** (lifecycle, process supervision, control locks) and the **ViewerHub** (frame loops, input routing).

---

## 3. Domain model

Stored in SQLite unless noted.

### Profile
Persistent browser identity.

- `id` (e.g. `prof_x8k2…`), `name` (unique, human-readable, used in URLs)
- `status`: `stopped | starting | running | stopping`
- Config: `proxy`, `locale`, `timezone`, `viewport`, `fingerprintSeed`
- `fingerprintSeed` makes Camoufox regenerate the **same** fingerprint each start — identity stability
- Browser state lives on disk at `/data/profiles/<id>/` as a real Firefox profile dir. Cookies, localStorage, IndexedDB, cache persist for free; Morrow never parses them.

### Session
One client connection to a running profile. `id`, `profileId`, `kind` (`playwright | viewer | mcp | scrape`), `connectedAt`, `disconnectedAt`. Observational in v1: powers "who's connected" + timeline.

### Event
Append-only per-profile log: `profile.created/started/stopped/crashed`, `session.connected/disconnected`, `control.taken/released`, `scrape.started/completed/failed`, `page.navigation`. Powers the timeline and metrics. Queryable via REST.

### ControlLock (in-memory)
At most one controller per running profile: `automation` (default when any Playwright/MCP client is connected) or a named viewer connection. Viewers always may watch; taking control is an explicit UI action. Lock state is exposed on the profile API. Single process ⇒ no distributed locking.

### Lifecycle

- **start**: allocate Xvfb display → launch Camoufox via `camoufox-js` with profile dir + stored fingerprint config → wait for Playwright ws ready → `running`.
- **stop**: graceful close → SIGTERM → SIGKILL after timeout → `stopped`.
- **crash**: process exit detected → `stopped` + `profile.crashed` event (stderr tail attached).
- **boot reconciliation**: any profile marked `running` at server start is reset to `stopped`.
- **clone**: stop if running → copy profile dir + row (new id/name/seed configurable).
- **reset**: wipe profile dir, keep config row.

---

## 4. API surface

All REST under `/api/v1`, `Authorization: Bearer <MORROW_API_KEY>`. The **OpenAPI document is the contract**: request/response schemas defined in zod, converted to OpenAPI, served at `/api/v1/openapi.json`, rendered at `/api-docs`. Client libraries are generated from it by users (that's a supported workflow, documented in the docs).

### Profiles & ops

```text
POST   /profiles                create { name, proxy?, locale?, timezone?, viewport? }
GET    /profiles                list (status + lock + active session counts)
GET    /profiles/:name          get
PATCH  /profiles/:name          update config (applies next start)
DELETE /profiles/:name          delete (must be stopped)
POST   /profiles/:name/start
POST   /profiles/:name/stop
POST   /profiles/:name/clone    { name }
POST   /profiles/:name/reset
GET    /profiles/:name/events   timeline (paginated)
GET    /sessions                active connections across profiles
GET    /health                  liveness
GET    /pressure                { runningProfiles, maxProfiles, memory, queued }
GET    /metrics                 JSON counters + small time series (see §7)
```

### Scrape family (Browserless-inspired)

Shared **page options** accepted by all three:

```text
profile?              run inside this profile (auto-start; auto-stop if we auto-started)
url | html            target URL, or raw HTML to render
gotoOptions?          { waitUntil, timeout }
waitForSelector?      { selector, timeout }
waitForTimeout?       number
waitForFunction?      { fn, timeout }
bestAttempt?          proceed if waits fail (default false)
viewport?             { width, height }
rejectRequestPattern? string[]        (regex)
rejectResourceTypes?  string[]        (image, font, media, …)
setExtraHTTPHeaders?  object
addScriptTag? / addStyleTag?  array
```

No `cookies`/`authenticate` params — **profiles replace them**.

```text
POST /screenshot   + { fullPage?, type?: png|jpeg, quality?, clip?, selector?, scrollPage? }
                   → image bytes
POST /content      → rendered HTML after JS execution
POST /scrape       + { format: markdown | text | article, elements?: [{selector}] }
                   → article = Readability JSON { title, author, description, content, text, markdown, links, images }
                   → elements = per-selector text/attributes/rects (Browserless-style)
```

Without `profile`, an ephemeral context in a shared utility browser is used and destroyed.

### Playwright attach

```text
ws://host:3000/playwright/:name?token=<MORROW_API_KEY>
```

- Stopped profile ⇒ **lazy auto-start** on connect (Browserless-style).
- Raw byte passthrough to the internal Camoufox Playwright server ⇒ any stock Playwright client: `firefox.connect(wsEndpoint)`.
- Connection tracked as a `playwright` session; disconnect does **not** stop the profile (explicit stop or idle policy later).

### Viewer WebSocket

`ws://host:3000/viewer/:name?token=…`, JSON messages:

- server→client: `frame` (base64 JPEG + seq), `tabs` (list, active), `url`, `lock` (holder), `status`
- client→server: `input` (mouse/key/wheel/paste), `navigate`, `tabAction` (new/close/activate), `takeControl`, `releaseControl`
- Input is applied via Playwright APIs **only** from the current lock holder. Frame loop starts with the first viewer, stops with the last.

### MCP (`/mcp`, streamable HTTP, same key)

Tools (all take `profile`): `list_profiles`, `create_profile`, `start_profile`, `stop_profile`, `navigate`, `snapshot` (accessibility-tree text, Playwright-MCP approach), `click`, `type`, `press_key`, `scroll`, `screenshot`, `scrape`, `wait_for`. Sessions persist between calls because the profile stays running — that's the differentiator vs. plain Playwright-MCP.

### Errors

REST: `{ error: { code, message } }` with codes like `profile_not_found`, `profile_locked`, `profile_not_stopped`, `browser_launch_failed`, `scrape_timeout`. WS: coded close reasons. Launch failures land in the event log with stderr tail.

---

## 5. Human/automation handoff (v1 semantics)

Simple coexistence — no formal state machine yet:

- Playwright/MCP clients and viewers connect to the same browser concurrently.
- Control lock shows who's driving; a human clicks **Take Control** in the viewer, acts, clicks **Release**.
- Automation keeps its connection during human control (its inputs aren't blocked by Morrow in v1 — convention, not enforcement; enforcement would require protocol-level filtering, deferred).
- The `AUTOMATED → WAITING_FOR_HUMAN → …` state machine and `authentication.required` API are future work.

---

## 6. Web: dashboard, docs, API reference

Scope deliberately small (user decision):

- **Dashboard**: profiles list (+ create modal), profile detail (viewer, timeline, config, connect snippets), metrics page. No separate sessions/network/logs screens in v1 — those fold into profile detail + metrics.
- **Docs** (`/docs`, MDX): quickstart, profiles concept, Playwright attach, scrape APIs, MCP setup, generating clients from OpenAPI, self-hosting.
- **API reference** (`/api-docs`): Swagger UI (themed to the design system) over `/api/v1/openapi.json`.
- Dashboard auth: API-key prompt, stored client-side, sent as bearer.

Acceptance flow (the demo that must feel magical): create profile in dashboard → open viewer → navigate to x.com → log in → stop profile → start profile → still logged in → `firefox.connect()` from a local script → `POST /scrape` with the profile → markdown of the authenticated feed.

Full UI treatment: see `2026-08-10-morrow-v1-ui-design.md` + `docs/design/design-system.md`.

---

## 7. Metrics (v1)

Counters/gauges from SQLite events + process stats, exposed at `GET /metrics` (JSON) and rendered as dashboard cards:

- profiles: total, running
- sessions: active by kind, total connects (24h)
- scrapes: total, failed (24h), p50/p95 duration
- system: memory, uptime, pressure

Prometheus text format: later, endpoint shape leaves room for it.

---

## 7b. Configuration (env vars)

```text
MORROW_API_KEY        required — the single access token
MORROW_PORT           default 3000
MORROW_DATA_DIR       default /data
MORROW_MAX_PROFILES   default 5 — max concurrently running profiles; start/attach
                      beyond it returns 429 `too_many_profiles` (feeds /pressure)
MORROW_LAUNCH_TIMEOUT default 60s
```

## 8. Security notes (v1 posture)

- One API key gates everything; ws upgrades check the token before proxying.
- Profiles contain real logged-in sessions ⇒ docs prominently warn: run on trusted networks / behind a reverse proxy with TLS.
- Internal Playwright servers bind to localhost inside the container only.
- No arbitrary code execution endpoints (`/function` excluded from v1 for exactly this reason).
- Secrets (proxy credentials) stored in SQLite; encryption-at-rest is future work, documented as such.

---

## 9. Testing

- **Unit**: ProfileManager state transitions, control lock, page-options parsing, markdown/Readability pipeline (fixtures), OpenAPI schema validity.
- **Integration** (real Camoufox, headless, in CI via the shipped Docker image): start/stop/persistence-across-restart (cookie survives), Playwright attach round-trip, scrape endpoints, lazy auto-start, crash detection.
- **Viewer protocol**: against a real profile with a local test page — frame delivery, input round-trip, lock enforcement.
- **MCP**: tool-call integration tests over streamable HTTP.

---

## 10. Milestones (build order sketch)

1. Skeleton: Next app + custom server + ws upgrade routing + auth + SQLite layer + Docker image with Camoufox/Xvfb. **Bun compat spike** happens here.
2. ProfileManager + lifecycle + Playwright attach passthrough (MVP steps 1–8 minus UI).
3. Scrape family + OpenAPI doc + Swagger UI.
4. Viewer (server frame/input loop + dashboard component).
5. Dashboard (profiles, detail, metrics) + docs content.
6. MCP server.
7. Hardening: crash handling, pressure limits, CI, acceptance flow test.
