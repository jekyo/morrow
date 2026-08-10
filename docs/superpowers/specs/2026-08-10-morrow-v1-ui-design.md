# Morrow v1 — UI Design Document

**Status:** Approved draft
**Date:** 2026-08-10
**Depends on:** `docs/design/design-system.md` (normative tokens/components), `2026-08-10-morrow-v1-design.md` (product scope)

v1 web surface, deliberately small: **dashboard (profiles + metrics + viewer)**, **docs**, **Swagger API reference**. Everything is one Next.js app under the `morrow` daisyUI theme.

---

## 1. Information architecture

```text
/                    → redirect to /profiles
/login               API key prompt (only unauthenticated page)
/profiles            Profiles list + create modal
/profiles/[name]     Profile detail: viewer, timeline, config, connect
/metrics             Metrics cards + charts
/docs/**             MDX docs (public, no key required)
/api-docs            Swagger UI over /api/v1/openapi.json (public)
```

Sidebar (v1 — trimmed from the full design-system nav):

```text
MORROW

WORKSPACE
  Profiles
  Metrics

RESOURCES
  Docs
  API
```

Active item: `#201D1A` background, 2px ember left border. No Workflows/Workers/Proxies entries in v1 — they don't exist yet and empty nav items are noise.

## 2. Auth screen (`/login`)

System-dialog styling, centered, no illustration: wordmark, one password-type input ("API key"), one `btn-primary` ("Connect"). Key is verified against `GET /health` with the bearer token, stored in `localStorage`, attached by a small API client. Wrong key → inline `text-error` line under the field, no toast.

## 3. Profiles list (`/profiles`)

Dense daisyUI table (per design system §25), one row per profile:

```text
PROFILE          STATUS      LAST ACTIVE   SESSIONS   PROXY          ACTIONS
X - Marketing    ● RUNNING   2m ago        2          us-nyc         [Open] ···
LinkedIn Sales   ○ STOPPED   1h ago        —          —              [Start] ···
```

- Status uses the design-system glyph set + semantic colors; text label always present (never color-only).
- Primary row action flips by state: `Open` (running → detail page) / `Start` (stopped).
- Overflow menu: Start/Stop, Clone, Reset, Delete (destructive, confirm modal).
- Header: `Profiles` H1, count subline, search input (client-side filter), `+ New Profile` `btn-primary`.
- Empty state (typography only): "No profiles yet. Create a persistent browser profile to get started. [ Create Profile ]".
- Loading: skeleton rows.

**Create Profile modal** (design system §30): Name (required, uniqueness error inline), Proxy (optional text, `user:pass@host:port` placeholder), Locale + Timezone (selects with sane defaults), Viewport (select: common presets). Browser field is shown but fixed to "Camoufox" (disabled select) — honest about v1, telegraphs the future. Cancel / Create right-aligned. On create → navigate to detail page.

## 4. Profile detail (`/profiles/[name]`) — the core screen

Layout: viewer dominates; right rail for state; bottom panel for timeline.

```text
┌──────────────────────────────────────────────────────┬───────────────┐
│ ● X - Marketing                    ● AUTOMATED  LIVE │  STATE        │
│ ← → ↻  [ https://x.com/home              ] [tabs ▾] │  Status       │
│ ┌──────────────────────────────────────────────────┐ │  ● RUNNING    │
│ │                                                  │ │  Controller   │
│ │                 live frames                      │ │  automation   │
│ │                                                  │ │  Sessions     │
│ │                                                  │ │  2 connected  │
│ └──────────────────────────────────────────────────┘ │  Proxy        │
│ [ Take Control ]  [ Screenshot ]  [ Stop ]           │  us-nyc       │
├──────────────────────────────────────────────────────┤  CONNECT      │
│ Timeline │ Config                                    │  ws snippet   │
│ 13:02:31  profile.started                            │  scrape curl  │
│ 13:02:34  page.navigation  x.com                     │  MCP config   │
└──────────────────────────────────────────────────────┴───────────────┘
```

**Viewer component** (design system §21): renders `frame` messages onto a `<canvas>`, letterboxed on the warm-black surface, 8px radius, 1px `#292622` border. Toolbar: back/forward/reload, editable URL bar (Geist Mono), tab strip dropdown (v1: switch/new/close via `tabAction`). Statuses:

- Profile stopped → viewer area becomes an empty state: "This browser is stopped." + `[ Start & Open ]` (ember).
- Starting → skeleton viewport + `◌ STARTING`.
- Connected, watching → frames render, `Take Control` visible.
- Controlling → border glows ember (subtle), `● HUMAN CONTROL` indicator, `Release` button; canvas captures mouse/keyboard/wheel/paste and forwards as `input` messages.
- Someone else controls → `● HUMAN CONTROL — viewer 2` in gold; Take Control replaced by "Request" is **not** in v1; you can still take (single-key deployments are one operator).

Control indicator is always visible (design system §22): `● AUTOMATED` (neutral), `● HUMAN CONTROL` (ember), gold reserved for future `WAITING FOR HUMAN`.

**Right rail**: status block (monospace values), controller, connected sessions (kind + duration), proxy/locale/timezone summary. **Connect block** — copyable snippets with real values inlined:

```text
Playwright   ws://host:3000/playwright/x-marketing?token=•••
Scrape       curl -X POST …/api/v1/scrape -d '{"profile":"x-marketing",…}'
MCP          { "url": "http://host:3000/mcp", … }
```

Token masked with reveal-on-click.

**Bottom tabs**: Timeline (terminal-styled event log per design system §24, live-updating, newest last, auto-scroll toggle) and Config (same fields as create modal + Clone / Reset / Delete danger zone; edits apply on next start, noted inline).

## 5. Metrics (`/metrics`)

Stat cards row + two charts, all warm/dense, no colorful dashboard:

- Cards: Total profiles · Running now · Active sessions · Scrapes (24h) · Scrape failures (24h) · Memory. Big numeric (Geist Sans 32), tiny mono label, no icons-for-decoration.
- Charts: scrapes over time (24h, thin ember line on `#181614`, like the brand board's stats card) and sessions by kind (compact bars). One accent color; semantic red only on the failure series.
- Data from `GET /api/v1/metrics`, polled every 15s. Skeletons on load.

## 6. Docs (`/docs`)

MDX rendered in the same shell, docs-local left nav: Quickstart, Profiles, Remote Viewer, Playwright, Scraping APIs, MCP, Generate a client (OpenAPI codegen walkthrough), Self-hosting, Security. Prose width ~68ch on the warm-black background; code blocks Geist Mono on `#121110` with copy buttons. Public (no API key) — self-hosters may front it with their own auth.

## 7. API reference (`/api-docs`)

Swagger UI over `/api/v1/openapi.json`, restyled with CSS variables to the morrow theme (warm black surfaces, ember accents, Geist type) — same trick your Browserless instance uses with ReDoc. A visible "Download OpenAPI spec" link supports the codegen story. If Swagger UI resists theming beyond acceptable, fall back to Scalar (also spec-driven, easier to theme); either way the URL and the spec are the contract, the renderer is swappable.

## 8. Toasts & errors

Quiet toasts bottom-right (design system §29): profile started/stopped, scrape completed, copy confirmations. Errors: inline where local (forms), toast with `text-error` glyph where async (start failed — includes "view timeline" link to the stderr event). Never modal error dialogs.

## 9. States checklist (per screen)

Every screen ships with: loading (skeleton), empty (typography + action), error (inline message + retry), unauthorized (redirect to `/login`). The viewer additionally: stopped, starting, reconnecting (ws drop → auto-retry with backoff + "Reconnecting…" pill), crashed (`× ERROR` + stderr-tail from latest event + Restart button).

## 10. v1 component build list

From the design-system inventory, v1 actually builds: Button, Input, Select, Toggle, Badge/StatusBadge, Table, Modal, Toast, Skeleton, Tooltip, Sidebar, Topbar, Profile Card (mobile list fallback), Activity Timeline/Log Viewer, Browser Viewer (+ Toolbar, URL Bar, Tab dropdown, Control Indicator), Stat Card, Empty State. Everything else in the inventory waits.

## 11. Mobile

Read-mostly: profiles list (cards instead of table), start/stop, status, timeline. Viewer renders read-only frames (watch, no control) — input on mobile is out of scope for v1.
