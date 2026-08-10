# Morrow Plan 1: Foundation & Deployment Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployable single-container Morrow skeleton: Next.js app with a custom WebSocket-capable server, API-key auth, SQLite persistence, a Docker image containing Camoufox + Xvfb (verified by a real browser smoke test), CI, a release GitHub Action publishing semver images to GHCR, and a jekyo.yaml deployment.

**Architecture:** One Node.js process (`server.ts`: `node:http` + `ws` + Next.js handler). Long-lived concerns (config, db, auth) are plain TypeScript modules outside Next's request lifecycle. Plan 2+ builds profiles/attach/viewer on this skeleton.

**Tech Stack:** Node ≥ 20 (Bun-friendly code), TypeScript, Next.js 15 (App Router), `ws`, better-sqlite3, Tailwind CSS 4 + daisyUI 5, vitest, tsx, camoufox-js, Docker, GitHub Actions, jekyo.

**Spec:** `docs/superpowers/specs/2026-08-10-morrow-v1-design.md`. This is plan 1 of ~6 (foundation → profiles/attach → scrape/OpenAPI → viewer → dashboard/docs → MCP/hardening).

**Amendment to spec:** `GET /api/v1/health` is **unauthenticated** — jekyo/Kubernetes HTTP probes cannot send bearer tokens. The dashboard will verify API keys against an authenticated endpoint (`/api/v1/pressure`) instead (adjust UI doc §2 when Plan 5 lands).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`, `README.md`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "morrow",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server/index.ts",
    "build": "next build",
    "start": "NODE_ENV=production tsx src/server/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install next@latest react@latest react-dom@latest ws better-sqlite3 camoufox-js geist
npm install -D typescript tsx vitest @types/node @types/ws @types/better-sqlite3 tailwindcss @tailwindcss/postcss daisyui @types/react @types/react-dom
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "ws", "camoufox-js"],
};

export default nextConfig;
```

- [ ] **Step 5: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
```

- [ ] **Step 6: Write `postcss.config.mjs`**

```js
export default {
  plugins: { "@tailwindcss/postcss": {} },
};
```

- [ ] **Step 7: Write `src/app/globals.css`** — the morrow daisyUI theme from `docs/design/design-system.md` §14

```css
@import "tailwindcss";
@plugin "daisyui" {
  themes: morrow --default;
}

@plugin "daisyui/theme" {
  name: "morrow";
  default: true;
  prefersdark: true;

  --color-base-100: #0c0b0a;
  --color-base-200: #121110;
  --color-base-300: #201d1a;
  --color-base-content: #f5f1ea;

  --color-primary: #e56f24;
  --color-primary-content: #160c05;
  --color-secondary: #9b9388;
  --color-secondary-content: #0c0b0a;
  --color-accent: #d7a84a;
  --color-accent-content: #160f05;
  --color-neutral: #292622;
  --color-neutral-content: #e8e1d7;

  --color-info: #9b9388;
  --color-info-content: #0c0b0a;
  --color-success: #79a96b;
  --color-success-content: #081007;
  --color-warning: #d7a84a;
  --color-warning-content: #120d05;
  --color-error: #d05c4d;
  --color-error-content: #150605;

  --radius-selector: 0.375rem;
  --radius-field: 0.375rem;
  --radius-box: 0.5rem;

  --border: 1px;
  --depth: 0;
  --noise: 0;
}
```

(If the installed daisyUI 5.x rejects this variable set, consult `npx daisyui@latest --help` / the daisyUI 5 theme docs and adapt names only — the color values are normative.)

- [ ] **Step 8: Write `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Morrow",
  description: "Browsers that remember.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="morrow" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-base-100 text-base-content font-sans antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Write `src/app/page.tsx`** (placeholder — Plan 5 replaces it)

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-widest">MORROW</h1>
        <p className="mt-2 text-sm text-secondary font-mono">browsers that remember.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 10: Write `.gitignore`**

```text
node_modules/
.next/
dist/
data/
*.tsbuildinfo
next-env.d.ts
.env
.env.local
```

- [ ] **Step 11: Write `.env.example`**

```bash
MORROW_API_KEY=change-me
MORROW_PORT=3000
MORROW_DATA_DIR=./data
MORROW_MAX_PROFILES=5
MORROW_LAUNCH_TIMEOUT=60
```

- [ ] **Step 12: Write `README.md`**

```markdown
# Morrow

**Browsers that remember.** Persistent browser infrastructure for humans and machines.

## Run (development)

    cp .env.example .env   # set MORROW_API_KEY
    npm install
    npm run dev            # http://localhost:3000

## Run (Docker)

    docker run -e MORROW_API_KEY=secret -v morrow-data:/data -p 3000:3000 ghcr.io/OWNER/morrow:latest

Docs: `docs/` — vision, v1 spec, UI spec, design system.
```

- [ ] **Step 13: Verify build**

```bash
npm run typecheck && npm run build
```

Expected: both succeed (build emits `.next/`).

- [ ] **Step 14: Commit**

```bash
git add -A && git commit -m "feat: scaffold Next.js app with morrow theme"
```

---

### Task 2: Config module

**Files:**
- Create: `src/server/config.ts`
- Test: `tests/unit/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "@/server/config";

describe("loadConfig", () => {
  it("throws without MORROW_API_KEY", () => {
    expect(() => loadConfig({})).toThrow(/MORROW_API_KEY/);
  });

  it("applies defaults", () => {
    const c = loadConfig({ MORROW_API_KEY: "k" });
    expect(c).toEqual({
      apiKey: "k",
      port: 3000,
      dataDir: "/data",
      maxProfiles: 5,
      launchTimeoutMs: 60_000,
    });
  });

  it("reads overrides", () => {
    const c = loadConfig({
      MORROW_API_KEY: "k",
      MORROW_PORT: "4000",
      MORROW_DATA_DIR: "/tmp/x",
      MORROW_MAX_PROFILES: "2",
      MORROW_LAUNCH_TIMEOUT: "30",
    });
    expect(c.port).toBe(4000);
    expect(c.dataDir).toBe("/tmp/x");
    expect(c.maxProfiles).toBe(2);
    expect(c.launchTimeoutMs).toBe(30_000);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL** (`npm test -- config`) with "Cannot find module".

- [ ] **Step 3: Implement `src/server/config.ts`**

```ts
export interface Config {
  apiKey: string;
  port: number;
  dataDir: string;
  maxProfiles: number;
  launchTimeoutMs: number;
}

type Env = Record<string, string | undefined>;

export function loadConfig(env: Env = process.env): Config {
  const apiKey = env.MORROW_API_KEY;
  if (!apiKey) throw new Error("MORROW_API_KEY is required");
  return {
    apiKey,
    port: parseInt(env.MORROW_PORT ?? "3000", 10),
    dataDir: env.MORROW_DATA_DIR ?? "/data",
    maxProfiles: parseInt(env.MORROW_MAX_PROFILES ?? "5", 10),
    launchTimeoutMs: parseInt(env.MORROW_LAUNCH_TIMEOUT ?? "60", 10) * 1000,
  };
}

let cached: Config | undefined;
/** Process-wide config (Next route handlers and server modules share it). */
export function config(): Config {
  cached ??= loadConfig();
  return cached;
}
```

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: env config module"`

---

### Task 3: Auth module

**Files:**
- Create: `src/server/auth.ts`
- Test: `tests/unit/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { isAuthorized, extractToken } from "@/server/auth";

describe("isAuthorized", () => {
  it("accepts the exact key", () => expect(isAuthorized("secret", "secret")).toBe(true));
  it("rejects wrong key", () => expect(isAuthorized("nope", "secret")).toBe(false));
  it("rejects undefined", () => expect(isAuthorized(undefined, "secret")).toBe(false));
  it("rejects different length", () => expect(isAuthorized("secre", "secret")).toBe(false));
});

describe("extractToken", () => {
  it("reads Bearer header", () =>
    expect(extractToken({ authorization: "Bearer abc" }, null)).toBe("abc"));
  it("reads token query param", () =>
    expect(extractToken({}, new URLSearchParams("token=xyz"))).toBe("xyz"));
  it("prefers header over query", () =>
    expect(extractToken({ authorization: "Bearer a" }, new URLSearchParams("token=b"))).toBe("a"));
  it("returns undefined when absent", () => expect(extractToken({}, null)).toBeUndefined());
});
```

- [ ] **Step 2: Run test — expect FAIL** ("Cannot find module").

- [ ] **Step 3: Implement `src/server/auth.ts`**

```ts
import { timingSafeEqual } from "node:crypto";

export function isAuthorized(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Token from `Authorization: Bearer x` header or `?token=x` query. */
export function extractToken(
  headers: Record<string, string | string[] | undefined>,
  query: URLSearchParams | null
): string | undefined {
  const raw = headers.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return query?.get("token") ?? undefined;
}
```

- [ ] **Step 4: Run test — expect PASS.** Commit: `git commit -am "feat: api key auth helpers"`

---

### Task 4: API error envelope

**Files:**
- Create: `src/server/errors.ts`
- Test: `tests/unit/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { ApiError, toErrorBody } from "@/server/errors";

describe("errors", () => {
  it("serializes ApiError with its code and status", () => {
    const e = new ApiError("profile_not_found", "No such profile", 404);
    expect(e.status).toBe(404);
    expect(toErrorBody(e)).toEqual({ error: { code: "profile_not_found", message: "No such profile" } });
  });

  it("wraps unknown errors as internal_error", () => {
    expect(toErrorBody(new Error("boom"))).toEqual({
      error: { code: "internal_error", message: "boom" },
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/server/errors.ts`**

```ts
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
  }
}

export function toErrorBody(err: unknown): { error: { code: string; message: string } } {
  if (err instanceof ApiError) return { error: { code: err.code, message: err.message } };
  const message = err instanceof Error ? err.message : String(err);
  return { error: { code: "internal_error", message } };
}
```

- [ ] **Step 4: Run — expect PASS.** Commit: `git commit -am "feat: api error envelope"`

---

### Task 5: SQLite layer (schema + repositories)

**Files:**
- Create: `src/server/db.ts`
- Test: `tests/unit/db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type MorrowDb } from "@/server/db";

let db: MorrowDb;
beforeEach(() => {
  db = openDb(":memory:");
});

describe("profiles", () => {
  it("creates and fetches a profile by name", () => {
    const p = db.createProfile({ name: "x-marketing" });
    expect(p.id).toMatch(/^prof_/);
    expect(p.status).toBe("stopped");
    expect(p.fingerprintSeed).toBeTruthy();
    expect(db.getProfileByName("x-marketing")?.id).toBe(p.id);
  });

  it("rejects duplicate names", () => {
    db.createProfile({ name: "a" });
    expect(() => db.createProfile({ name: "a" })).toThrow();
  });

  it("updates status and counts running", () => {
    const p = db.createProfile({ name: "a" });
    db.createProfile({ name: "b" });
    db.setProfileStatus(p.id, "running");
    expect(db.countRunningProfiles()).toBe(1);
    expect(db.listProfiles().map((x) => x.name)).toEqual(["a", "b"]);
  });
});

describe("events", () => {
  it("records and lists events newest-last", () => {
    const p = db.createProfile({ name: "a" });
    db.recordEvent(p.id, "profile.started", { pid: 1 });
    db.recordEvent(p.id, "page.navigation", { url: "https://x.com" });
    const events = db.listEvents(p.id);
    expect(events.map((e) => e.type)).toEqual(["profile.started", "page.navigation"]);
    expect(events[1].data).toEqual({ url: "https://x.com" });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/server/db.ts`**

```ts
import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";

export type ProfileStatus = "stopped" | "starting" | "running" | "stopping";

export interface Profile {
  id: string;
  name: string;
  status: ProfileStatus;
  proxy: string | null;
  locale: string | null;
  timezone: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  fingerprintSeed: string;
  createdAt: string;
  updatedAt: string;
}

export interface MorrowEvent {
  id: number;
  profileId: string | null;
  type: string;
  data: unknown;
  createdAt: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'stopped',
  proxy TEXT,
  locale TEXT,
  timezone TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  fingerprint_seed TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  kind TEXT NOT NULL,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  disconnected_at TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT,
  type TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_profile ON events(profile_id, id);
`;

function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("base64url")}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToProfile(r: any): Profile {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    proxy: r.proxy,
    locale: r.locale,
    timezone: r.timezone,
    viewportWidth: r.viewport_width,
    viewportHeight: r.viewport_height,
    fingerprintSeed: r.fingerprint_seed,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface CreateProfileInput {
  name: string;
  proxy?: string;
  locale?: string;
  timezone?: string;
  viewportWidth?: number;
  viewportHeight?: number;
}

export class MorrowDb {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  createProfile(input: CreateProfileInput): Profile {
    const profileId = id("prof");
    this.db
      .prepare(
        `INSERT INTO profiles (id, name, proxy, locale, timezone, viewport_width, viewport_height, fingerprint_seed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        profileId,
        input.name,
        input.proxy ?? null,
        input.locale ?? null,
        input.timezone ?? null,
        input.viewportWidth ?? null,
        input.viewportHeight ?? null,
        randomBytes(16).toString("hex")
      );
    return this.getProfileById(profileId)!;
  }

  getProfileById(profileId: string): Profile | undefined {
    const r = this.db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(profileId);
    return r ? rowToProfile(r) : undefined;
  }

  getProfileByName(name: string): Profile | undefined {
    const r = this.db.prepare(`SELECT * FROM profiles WHERE name = ?`).get(name);
    return r ? rowToProfile(r) : undefined;
  }

  listProfiles(): Profile[] {
    return this.db.prepare(`SELECT * FROM profiles ORDER BY name`).all().map(rowToProfile);
  }

  setProfileStatus(profileId: string, status: ProfileStatus): void {
    this.db
      .prepare(`UPDATE profiles SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, profileId);
  }

  countRunningProfiles(): number {
    const r = this.db
      .prepare(`SELECT COUNT(*) AS n FROM profiles WHERE status IN ('starting','running')`)
      .get() as { n: number };
    return r.n;
  }

  /** Boot reconciliation: container restarted, nothing is actually running. */
  resetRunningProfiles(): void {
    this.db.prepare(`UPDATE profiles SET status = 'stopped' WHERE status != 'stopped'`).run();
  }

  recordEvent(profileId: string | null, type: string, data?: unknown): void {
    this.db
      .prepare(`INSERT INTO events (profile_id, type, data) VALUES (?, ?, ?)`)
      .run(profileId, type, data === undefined ? null : JSON.stringify(data));
  }

  listEvents(profileId: string, limit = 200): MorrowEvent[] {
    return (
      this.db
        .prepare(`SELECT * FROM events WHERE profile_id = ? ORDER BY id DESC LIMIT ?`)
        .all(profileId, limit) as any[]
    )
      .reverse()
      .map((r) => ({
        id: r.id,
        profileId: r.profile_id,
        type: r.type,
        data: r.data === null ? undefined : JSON.parse(r.data),
        createdAt: r.created_at,
      }));
  }
}

export function openDb(path: string): MorrowDb {
  return new MorrowDb(path);
}

let singleton: MorrowDb | undefined;
/** Process-wide database, stored at <dataDir>/morrow.db. */
export function getDb(dataDir: string): MorrowDb {
  singleton ??= new MorrowDb(`${dataDir}/morrow.db`);
  return singleton;
}
```

- [ ] **Step 4: Run — expect PASS** (`npm test -- db`).

- [ ] **Step 5: Commit** — `git commit -am "feat: sqlite layer with profiles/sessions/events"`

---

### Task 6: WebSocket upgrade routing

**Files:**
- Create: `src/server/ws.ts`
- Test: `tests/unit/ws.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { matchWsRoute } from "@/server/ws";

describe("matchWsRoute", () => {
  it("matches playwright route", () =>
    expect(matchWsRoute("/playwright/x-marketing")).toEqual({
      kind: "playwright",
      profileName: "x-marketing",
    }));
  it("matches viewer route", () =>
    expect(matchWsRoute("/viewer/my-profile")).toEqual({ kind: "viewer", profileName: "my-profile" }));
  it("decodes URL-encoded names", () =>
    expect(matchWsRoute("/viewer/x%20marketing")).toEqual({ kind: "viewer", profileName: "x marketing" }));
  it("rejects other paths", () => {
    expect(matchWsRoute("/other/x")).toBeUndefined();
    expect(matchWsRoute("/playwright/")).toBeUndefined();
    expect(matchWsRoute("/playwright/a/b")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/server/ws.ts`**

```ts
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { extractToken, isAuthorized } from "@/server/auth";
import type { Config } from "@/server/config";

export type WsRoute = { kind: "playwright" | "viewer"; profileName: string };

export function matchWsRoute(pathname: string): WsRoute | undefined {
  const m = pathname.match(/^\/(playwright|viewer)\/([^/]+)$/);
  if (!m) return undefined;
  return { kind: m[1] as WsRoute["kind"], profileName: decodeURIComponent(m[2]) };
}

export type WsHandler = (ws: WebSocket, route: WsRoute, req: IncomingMessage) => void;

/**
 * Returns the node:http 'upgrade' listener. Plan 2 registers the playwright
 * passthrough handler; Plan 4 registers the viewer handler. Until then any
 * authorized upgrade is closed with 4404.
 */
export function createUpgradeHandler(cfg: Config, handlers: Partial<Record<WsRoute["kind"], WsHandler>> = {}) {
  const wss = new WebSocketServer({ noServer: true });

  return (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://internal");
    const route = matchWsRoute(url.pathname);
    if (!route) {
      socket.destroy();
      return;
    }
    const token = extractToken(req.headers, url.searchParams);
    if (!isAuthorized(token, cfg.apiKey)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const handler = handlers[route.kind];
      if (handler) handler(ws, route, req);
      else ws.close(4404, "not_implemented");
    });
  };
}
```

- [ ] **Step 4: Run — expect PASS.** Commit: `git commit -am "feat: ws upgrade routing with auth"`

---

### Task 7: Server entry + health & pressure routes

**Files:**
- Create: `src/server/index.ts`
- Create: `src/app/api/v1/health/route.ts`, `src/app/api/v1/pressure/route.ts`
- Create: `src/server/api.ts`
- Test: `tests/unit/api.test.ts`

- [ ] **Step 1: Write the failing test** for the route-handler auth guard

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { requireAuth } from "@/server/api";

afterEach(() => vi.unstubAllEnvs());

describe("requireAuth", () => {
  it("returns 401 response for missing/wrong token", async () => {
    vi.stubEnv("MORROW_API_KEY", "secret");
    const res = requireAuth(new Request("http://x/api/v1/pressure"));
    expect(res?.status).toBe(401);
    expect(await res!.json()).toEqual({ error: { code: "unauthorized", message: "Invalid API key" } });
  });

  it("returns undefined for correct bearer token", () => {
    vi.stubEnv("MORROW_API_KEY", "secret");
    const res = requireAuth(
      new Request("http://x/api/v1/pressure", { headers: { authorization: "Bearer secret" } })
    );
    expect(res).toBeUndefined();
  });
});
```

Note: `requireAuth` re-reads the key per call (no cached `config()`) precisely so tests can stub env; see implementation.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/server/api.ts`**

```ts
import { NextResponse } from "next/server";
import { extractToken, isAuthorized } from "@/server/auth";
import { loadConfig } from "@/server/config";
import { toErrorBody, ApiError } from "@/server/errors";

/** Guard for authenticated route handlers. Returns a 401 response, or undefined if OK. */
export function requireAuth(req: Request): NextResponse | undefined {
  const { apiKey } = loadConfig();
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));
  if (isAuthorized(extractToken(headers, url.searchParams), apiKey)) return undefined;
  return NextResponse.json(
    { error: { code: "unauthorized", message: "Invalid API key" } },
    { status: 401 }
  );
}

/** Wraps a handler body, mapping thrown ApiError/Error to the envelope. */
export async function handle(fn: () => Promise<NextResponse> | NextResponse): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Write `src/app/api/v1/health/route.ts`** (public — probes can't send tokens)

```ts
import { NextResponse } from "next/server";
import pkg from "../../../../../package.json";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, version: pkg.version });
}
```

- [ ] **Step 6: Write `src/app/api/v1/pressure/route.ts`** (authenticated)

```ts
import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(() => {
    const cfg = config();
    const db = getDb(cfg.dataDir);
    return NextResponse.json({
      runningProfiles: db.countRunningProfiles(),
      maxProfiles: cfg.maxProfiles,
      memory: process.memoryUsage.rss(),
      queued: 0,
    });
  });
}
```

- [ ] **Step 7: Write `src/server/index.ts`**

```ts
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import next from "next";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { createUpgradeHandler } from "@/server/ws";

const dev = process.env.NODE_ENV !== "production";

async function main() {
  const cfg = config();
  mkdirSync(cfg.dataDir, { recursive: true });

  const db = getDb(cfg.dataDir);
  db.resetRunningProfiles(); // boot reconciliation (spec §3 lifecycle)

  const app = next({ dev });
  const handleRequest = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => handleRequest(req, res));
  server.on("upgrade", createUpgradeHandler(cfg));

  server.listen(cfg.port, () => {
    console.log(`morrow listening on :${cfg.port} (data: ${cfg.dataDir})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 8: Verify manually**

```bash
MORROW_API_KEY=secret MORROW_DATA_DIR=./data npm run dev &
sleep 8
curl -s localhost:3000/api/v1/health                       # {"ok":true,"version":"0.1.0"}
curl -s localhost:3000/api/v1/pressure                     # 401 envelope
curl -s -H "Authorization: Bearer secret" localhost:3000/api/v1/pressure
# {"runningProfiles":0,"maxProfiles":5,"memory":…,"queued":0}
kill %1
```

- [ ] **Step 9: Run full suite** — `npm test && npm run typecheck` — expect PASS.

- [ ] **Step 10: Commit** — `git commit -am "feat: custom server with health and pressure endpoints"`

---

### Task 8: Camoufox smoke script (local)

**Files:**
- Create: `scripts/camoufox-smoke.ts`

- [ ] **Step 1: Fetch the Camoufox browser locally**

```bash
npx camoufox-js fetch
```

Expected: downloads the Camoufox build into the user cache (idempotent).

- [ ] **Step 2: Write `scripts/camoufox-smoke.ts`**

```ts
/**
 * Proves the Camoufox browser can launch and render in this environment.
 * Used locally and as the Docker image verification.
 */
import { Camoufox } from "camoufox-js";

const browser = await Camoufox({ headless: true });
const page = await browser.newPage();
await page.goto("data:text/html,<title>morrow-ok</title>");
const title = await page.title();
await browser.close();

if (title !== "morrow-ok") {
  console.error(`FAIL: unexpected title ${JSON.stringify(title)}`);
  process.exit(1);
}
console.log("camoufox smoke: OK");
```

(If the installed camoufox-js exposes a different entry — check `node_modules/camoufox-js/README.md` — adapt the import, keeping behavior: launch, load data URL, assert title.)

- [ ] **Step 3: Run it**

```bash
npx tsx scripts/camoufox-smoke.ts
```

Expected: `camoufox smoke: OK`.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: camoufox smoke script"`

---

### Task 9: Dockerfile

**Files:**
- Create: `Dockerfile`, `.dockerignore`

- [ ] **Step 1: Write `.dockerignore`**

```text
node_modules
.next
.git
data
docs
.env
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
FROM node:22-bookworm-slim AS base

# Firefox/Camoufox runtime libs + Xvfb (per-profile displays in Plan 2) + curl for probes
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11-utils curl ca-certificates \
    libgtk-3-0 libdbus-glib-1-2 libasound2 libx11-xcb1 libxtst6 \
    libxrandr2 libpangocairo-1.0-0 libatk1.0-0 libcairo-gobject2 \
    libgdk-pixbuf-2.0-0 libxcomposite1 libxcursor1 libxdamage1 libxi6 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Download the Camoufox browser into the image
RUN npx camoufox-js fetch

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV MORROW_DATA_DIR=/data
VOLUME /data
EXPOSE 3000

CMD ["node_modules/.bin/tsx", "src/server/index.ts"]
```

- [ ] **Step 3: Build**

```bash
docker build -t morrow:dev .
```

Expected: build succeeds. If a shared library is missing at the smoke step below, `apt-get install` it in the deps layer (the error names the exact `.so`).

- [ ] **Step 4: Smoke-test the image — browser first, then server**

```bash
docker run --rm morrow:dev node_modules/.bin/tsx scripts/camoufox-smoke.ts
# camoufox smoke: OK

docker run --rm -d --name morrow-dev -e MORROW_API_KEY=secret -p 3100:3000 morrow:dev
sleep 8
curl -s localhost:3100/api/v1/health    # {"ok":true,"version":"0.1.0"}
docker rm -f morrow-dev
```

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: docker image with camoufox and xvfb"`

---

### Task 10: Bun compatibility spike

**Files:**
- Create: `docs/notes/bun-spike.md`

- [ ] **Step 1: Run the suite and smoke under Bun** (install Bun if absent: `curl -fsSL https://bun.sh/install | bash`)

```bash
bun run --bun vitest run          # unit tests under Bun's runtime
bun scripts/camoufox-smoke.ts     # the critical one: Playwright driver under Bun
```

- [ ] **Step 2: Record results in `docs/notes/bun-spike.md`**

```markdown
# Bun compatibility spike — 2026-08-10

Decision input for switching Morrow's runtime from Node to Bun (spec §2).

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `bun run --bun vitest run` | PASS/FAIL + notes |
| Camoufox launch | `bun scripts/camoufox-smoke.ts` | PASS/FAIL + notes |
| better-sqlite3 native module | covered by unit tests | PASS/FAIL |

**Outcome:** stay on Node for v1 / switch to Bun (delete one).
**Blockers found:** (exact errors, or "none")
```

Fill the table with actual observed results — this file is the decision record. Whatever the outcome, **this plan continues on Node**; a PASS just green-lights revisiting after Plan 2.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "docs: bun compatibility spike results"`

---

### Task 11: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Commit** — `git add -A && git commit -m "ci: typecheck, test, build on push"`

---

### Task 12: Release workflow (semver → GHCR image)

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write `.github/workflows/release.yml`**

Triggered by pushing a semver tag (`v0.1.0` first). Publishes `ghcr.io/<owner>/morrow` tagged `0.1.0`, `0.1`, and `latest`.

```yaml
name: Release

on:
  push:
    tags: ["v*.*.*"]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Note: `ghcr.io/${{ github.repository }}` resolves to `ghcr.io/<owner>/morrow` since the repo is named `morrow`. If the GitHub repo name differs, hardcode the image as `ghcr.io/<owner>/morrow`.

- [ ] **Step 2: Commit** — `git add -A && git commit -m "ci: build and push ghcr image on semver release"`

- [ ] **Step 3: Release process (documented, executed when the user pushes to GitHub)**

```bash
git tag v0.1.0 && git push origin main --tags
```

Expected: Action publishes `ghcr.io/<owner>/morrow:{0.1.0,0.1,latest}`. If the GHCR package stays private, deployment needs `jekyo registry login ghcr.io` once (see Task 13).

---

### Task 13: jekyo deployment

**Files:**
- Create: `jekyo.yaml`
- Create: `docs/deploy.md`

- [ ] **Step 1: Write `jekyo.yaml`**

```yaml
app: morrow
description: Persistent browser infrastructure — browsers that remember.

services:
  morrow:
    image: ghcr.io/OWNER/morrow:0.1.0   # replace OWNER; bump tag per release
    port: 3000
    http:
      domain: morrow.example.com        # replace with your domain
    env:
      MORROW_API_KEY: ${MORROW_API_KEY}
    health:
      path: /api/v1/health
    resources:
      cpu: 500m
      memory: 1Gi
      memory-max: 4Gi
    volumes:
      data: /data

volumes:
  data:
    size: 10Gi
```

Memory rationale: each running Camoufox profile is a real Firefox (~300–500 MB); 4Gi cap fits `MORROW_MAX_PROFILES=5` with the app itself.

- [ ] **Step 2: Validate**

```bash
jekyo context show      # confirm the target server
jekyo render            # must emit Kubernetes YAML with no validation errors
```

- [ ] **Step 3: Write `docs/deploy.md`**

```markdown
# Deploying Morrow with jekyo

1. Edit `jekyo.yaml`: set your GHCR owner in `image:` and your domain in `http.domain`.
2. If the GHCR package is private: `jekyo registry login ghcr.io` (once per context).
3. Create `.env` next to jekyo.yaml with `MORROW_API_KEY=<strong random key>`.
4. Deploy: `jekyo render && jekyo up --env-file .env`
5. Check: `jekyo ps morrow`, `jekyo logs morrow -f`, then open `https://<your-domain>`.

Upgrades: bump the image tag in `jekyo.yaml` after a release, re-run `jekyo up`.
Profile data lives in the `data` volume; it survives `jekyo down` (only
`jekyo down --volumes` deletes it). Consider `backup:` on the volume once
real profiles exist.
```

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: jekyo deployment config"`

---

## Acceptance for Plan 1

- `npm test` and `npm run typecheck` pass; CI green.
- `docker build` succeeds; in-container `camoufox-smoke` prints OK; `/api/v1/health` responds from the container.
- Pushing tag `v0.1.0` publishes semver-tagged images to GHCR.
- `jekyo render` validates the deployment file.
- `docs/notes/bun-spike.md` records a real PASS/FAIL outcome.

Plan 2 (profiles, lifecycle, Playwright attach) builds directly on `MorrowDb`, `createUpgradeHandler`'s `handlers` slot, and the Docker image's Camoufox/Xvfb.
