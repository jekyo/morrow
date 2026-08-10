# Morrow — Vision

## Browsers that remember.

> Founding vision document (2026-08-10), as written. v1 scope decisions that
> narrow or amend this document live in `docs/superpowers/specs/`.
> Notable v1 amendments: the built-in AI agent is replaced by an MCP server;
> everything ships in a single container (no Postgres/Redis/worker fleet yet).

### 1. Introduction

The modern web is increasingly difficult to interact with programmatically.

Websites are dynamic, stateful, authenticated, personalized, and increasingly designed around real browsers rather than simple HTTP requests. Traditional scraping tools treat every browser session as disposable, while browser automation platforms primarily focus on launching and controlling browsers.

Morrow takes a different approach.

**Morrow treats the browser profile as a first-class persistent identity.**

A profile can have its own browser state, cookies, local storage, fingerprint, proxy, authentication state, downloads, and browsing environment. It can be opened and controlled by automation, accessed remotely by a human, or handed between the two.

A user can create a browser once, log into a website, close it, and return later with the same browser state. An automation agent can then use that same browser. A human can take control when authentication or manual interaction is required.

The goal is to create a shared browser environment where **humans, automation, and AI agents can operate the same persistent browser identity.**

## 2. Vision

Morrow should become the infrastructure layer for persistent browsers.

Instead of thinking "launch a browser and perform a task," Morrow should enable: **"give me a browser identity and let me use it."**

A Morrow browser should feel less like a temporary Playwright session and more like a persistent computer. It should remember: who it is, where it is, what websites it is logged into, its browser state, its network identity, its preferences, its previous sessions.

The browser can then be used by developers, automation, scraping systems, AI agents, human operators, and QA/testing systems.

## 3. Core Concept

The fundamental Morrow abstraction is the **Profile** — a persistent browser identity.

```text
Profile
├── Browser state
├── Cookies
├── Local storage
├── Cache
├── Browser configuration
├── Fingerprint
├── Proxy
├── Downloads
└── Authentication state
```

A profile may be stopped without losing its state. When started again, the browser resumes from its previous state. States: `stopped → starting → running → suspended`.

## 4. Human + Automation

Morrow does not split browsers into "human browsers" and "automation browsers." The same browser is accessible through multiple interfaces:

```text
                    Profile
                       │
                  Camoufox
                       │
          ┌────────────┼────────────┐
          │            │            │
       Human       Playwright      Agent
       Viewer        Session       Session
```

The handoff mechanism is fundamental, not an edge case:

```text
Agent starts task → Authentication required → Human opens profile →
Human logs in → Human releases browser → Agent continues
```

## 5. Product Principles

- **Persistent by default** — browser state survives restarts.
- **Profiles are first-class** — manageable independently of browser processes.
- **Human and machine control** — accessible to both people and software.
- **Playwright-compatible** — familiar APIs for developers.
- **Browser-engine agnostic architecture** — Camoufox first, not coupled to it.
- **API-first** — everything in the dashboard is ultimately available via API.
- **Observable** — activity, sessions, errors, network, artifacts inspectable.
- **Self-hostable** — runs locally or on private infrastructure.

## 6. Architecture (long-term)

```text
                         Morrow Dashboard
                               │
                     ┌─────────▼─────────┐
                     │   Morrow Control  │
                     │       Plane       │
                     └─────────┬─────────┘
                               │
                       Browser Scheduler
                               │
                ┌──────────────┼──────────────┐
          Browser Worker  Browser Worker  Browser Worker
             Camoufox       Camoufox       Camoufox
             Profile A      Profile B      Profile C
```

Control plane manages lifecycle and state; workers run browser processes; the separation lets Morrow scale independently from browser execution. (v1 collapses this into one container while keeping the seam in code.)

## 7. Technology

- **Browser:** Camoufox (initial runtime + fingerprinting), wrapped, never exposed directly.
- **Automation:** Node.js + TypeScript + Playwright as the developer-facing interface.
- **Storage:** `/profiles/<profile-id>/` initially; longer term Postgres (metadata), object storage (artifacts), Redis (coordination), filesystem/object storage (profiles).

## 8. Core Domain Objects

**Profile** (persistent identity), **Browser** (running process for a profile), **Session** (a connection to a running browser — Playwright, dashboard viewer, automation, agent), **Viewer** (human-facing remote connection).

## 9. Profile Management

Create / List / Get / Update / Delete; Start / Stop / Restart; Open / Clone / Reset. Human-readable names ("X - Vali", "LinkedIn - Sales", "Amazon - Research").

## 10. Persistent Browser State

At minimum: cookies, localStorage, sessionStorage where applicable, IndexedDB, cache, preferences, downloads, authentication state — following the underlying engine's capabilities.

## 11. Remote Browser

Click **Open Browser** → interactive remote browser supporting mouse, keyboard, scrolling, navigation, tabs, copy/paste where possible, downloads, uploads. Implemented as a streaming/control layer, not an embedded iframe.

## 12. Human Takeover

`AUTOMATED → WAITING_FOR_HUMAN → HUMAN_CONTROL → RELEASED → AUTOMATED`. Use cases: login, OAuth, MFA, consent screens, CAPTCHA/challenges, manual configuration, troubleshooting. Automation can explicitly request human intervention.

## 13. Playwright API

```ts
const browser = await morrow.connect({ profile: "x-marketing" });
const page = await browser.newPage();
await page.goto("https://x.com");
```

Users never need to understand Camoufox, workers, profile directories, Xvfb, scheduling, or process management.

## 14–16. Scraping

First-class: HTML, text, markdown, readable content, JSON, screenshot, PDF via `POST /scrape`. Readability pipeline: URL → Camoufox → rendered DOM → Readability → clean article → markdown. Because profiles persist authentication, authenticated scraping needs no cookie extraction — the profile owns the auth state.

## 17–18. Snapshots & Cloning (future)

Snapshot create/list/restore/delete/clone-from; profile cloning with configurable copy-vs-regenerate semantics.

## 19–20. Artifacts & Network Inspection (future)

Per-session screenshots, videos, downloads, PDFs, HAR, console logs, network logs, traces; dashboard network inspector with copy-as-cURL/Playwright.

## 21. Session Timeline

Per-session activity log (started, navigated, login detected, takeover, released, connected, scraped, stopped) for debugging and auditability.

## 22. Profile Locking

One controller with write access; multiple observers may watch.

## 23. Events

`profile.*`, `session.*`, `page.*`, `scrape.*`, `authentication.*` — delivered later via webhooks / WebSocket / SSE.

## 24–25. CLI & SDK (future)

`morrow profile create|list|open|stop`, `morrow scrape … --profile … --format markdown`; TypeScript SDK first, Python later.

## 26–28. Future: Workflows, AI Agents, Computer Use

Recorded workflows executable via API and convertible to Playwright code; agents operating inside persistent identities; DOM-based + visual interaction combined.

## 29. Security

Encrypted profile storage and secrets, API keys, profile/session permissions, audit logs, locking, secure artifact access, retention, secure deletion. Credentials never exposed unnecessarily.

## 30. Self-hosting

Minimal: Docker Compose (Morrow, Postgres, Redis, worker). Larger: API + scheduler + independently scaled workers. (v1: a single container.)

## 31. Non-Goals Initially

No dozens of browser APIs, enterprise orchestration, multi-region scheduling, CAPTCHA solving, proxy marketplace, complex agent framework, every engine, Kubernetes-native deployment, or elaborate workflow automation. Prove the core concept.

## 32. The MVP

Create profile → open remotely → navigate to X → human logs in → close → reopen (**still logged in**) → connect Playwright → automate → scrape authenticated page → clean Markdown. If those ten steps feel magical, Morrow has a product.

## 33. Positioning

Not primarily a scraper, browser API, proxy, Playwright host, or AI agent — those are capabilities. Morrow is **persistent browser infrastructure for humans and machines.** The promise: **create a browser once, log in once, come back tomorrow.**

## 34. Long-Term Vision

Make the browser a durable computing primitive: identity → persistent browser → human → automation → AI agent → human → … The goal is to make **"give me a browser"** as simple and programmable as **"give me a database."**

## 35. Taglines

Primary: **Browsers that remember.**
Alternatives: Persistent browsers for humans and agents · Give your agent a browser · A browser that comes back with you · Persistent browser infrastructure · Where humans and agents share a browser.
