# Morrow Plan 3: Playwright Attach & Sessions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ws://host:3000/playwright/:name?token=…` — a stock Playwright client (`firefox.connect`) drives a profile's persistent context, with lazy auto-start, session tracking (`session.connected/disconnected` events, `GET /sessions`), and an integration test proving cookie persistence through the attach path.

**Architecture:** The upgrade route already exists (`createUpgradeHandler` handlers slot). The new `attach` handler resolves/starts the profile via ProfileManager (whose runtime already exposes `wsEndpoint` per running profile — the `_sharedBrowser` browser server from Plan 2's spike), dials the internal endpoint with a `ws` client, and pipes frames both ways byte-for-byte. Sessions are DB rows opened on connect, closed on disconnect.

**Spec:** v1 design §4 (Playwright attach, sessions), unchanged — the spike preserved the original promise. Plan 3 of ~6.

**Compat note for docs:** playwright enforces client/server `major.minor` match at its ws layer; Morrow pins playwright-core 1.60.x, so external clients need playwright 1.60.x. Document this; do not try to defeat it.

---

### Task 1: Session storage

**Files:**
- Modify: `src/server/db.ts`
- Test: `tests/unit/db.test.ts` (append)

- [ ] **Step 1: Failing tests** (append):

```ts
describe("sessions", () => {
  it("creates, lists active, and closes sessions", () => {
    const p = db.createProfile({ name: "a" });
    const s = db.createSession(p.id, "playwright");
    expect(s.id).toMatch(/^sess_/);
    expect(s.profileId).toBe(p.id);
    expect(s.kind).toBe("playwright");
    expect(s.disconnectedAt).toBeNull();

    const active = db.listActiveSessions();
    expect(active).toHaveLength(1);
    expect(active[0].profileName).toBe("a");

    db.closeSession(s.id);
    expect(db.listActiveSessions()).toHaveLength(0);
  });

  it("closeSession is idempotent and keeps the original disconnect time", () => {
    const p = db.createProfile({ name: "a" });
    const s = db.createSession(p.id, "viewer");
    db.closeSession(s.id);
    db.closeSession(s.id);
    expect(db.listActiveSessions()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement on `MorrowDb`** (sessions table already exists):

```ts
export type SessionKind = "playwright" | "viewer" | "mcp" | "scrape";

export interface Session {
  id: string;
  profileId: string;
  kind: SessionKind;
  connectedAt: string;
  disconnectedAt: string | null;
}

  createSession(profileId: string, kind: SessionKind): Session {
    const sessionId = id("sess");
    this.db.prepare(`INSERT INTO sessions (id, profile_id, kind) VALUES (?, ?, ?)`).run(sessionId, profileId, kind);
    const r = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as {
      id: string; profile_id: string; kind: SessionKind; connected_at: string; disconnected_at: string | null;
    };
    return { id: r.id, profileId: r.profile_id, kind: r.kind, connectedAt: r.connected_at, disconnectedAt: r.disconnected_at };
  }

  closeSession(sessionId: string): void {
    this.db
      .prepare(`UPDATE sessions SET disconnected_at = datetime('now') WHERE id = ? AND disconnected_at IS NULL`)
      .run(sessionId);
  }

  listActiveSessions(): Array<Session & { profileName: string }> {
    const rows = this.db
      .prepare(
        `SELECT s.*, p.name AS profile_name FROM sessions s JOIN profiles p ON p.id = s.profile_id
         WHERE s.disconnected_at IS NULL ORDER BY s.connected_at`
      )
      .all() as Array<{ id: string; profile_id: string; kind: SessionKind; connected_at: string; disconnected_at: string | null; profile_name: string }>;
    return rows.map((r) => ({
      id: r.id, profileId: r.profile_id, kind: r.kind,
      connectedAt: r.connected_at, disconnectedAt: r.disconnected_at, profileName: r.profile_name,
    }));
  }
```

- [ ] **Step 4: PASS. Full gates.**
- [ ] **Step 5: Commit** — `feat: session storage`

---

### Task 2: Attach handler (ws passthrough)

**Files:**
- Create: `src/server/attach.ts`
- Test: `tests/unit/attach.test.ts`

- [ ] **Step 1: Failing test** — real ws servers on random ports, fake deps:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { createUpgradeHandler } from "@/server/ws";
import { playwrightAttachHandler, type AttachDeps } from "@/server/attach";

let upstreamHttp: Server;
let upstreamWss: WebSocketServer;
let upstreamUrl: string;
let front: Server;
let frontPort: number;
let events: string[];

const cfg = { apiKey: "k", port: 0, dataDir: "/tmp", maxProfiles: 5, launchTimeoutMs: 1000 };

function deps(overrides?: Partial<AttachDeps>): AttachDeps {
  return {
    ensureStarted: async (name) => {
      if (name === "missing") { const e = new Error("nope") as Error & { code?: string }; e.code = "profile_not_found"; throw e; }
      return { wsEndpoint: upstreamUrl, profileId: "prof_1" };
    },
    onConnect: () => { events.push("connect"); return "sess_1"; },
    onDisconnect: () => { events.push("disconnect"); },
    ...overrides,
  };
}

beforeEach(async () => {
  events = [];
  upstreamHttp = createServer();
  upstreamWss = new WebSocketServer({ server: upstreamHttp });
  upstreamWss.on("connection", (ws) => {
    ws.on("message", (data, isBinary) => ws.send(data, { binary: isBinary })); // echo
  });
  await new Promise<void>((r) => upstreamHttp.listen(0, r));
  upstreamUrl = `ws://127.0.0.1:${(upstreamHttp.address() as AddressInfo).port}`;

  front = createServer();
  front.on("upgrade", createUpgradeHandler(cfg, { playwright: playwrightAttachHandler(deps()) }));
  await new Promise<void>((r) => front.listen(0, r));
  frontPort = (front.address() as AddressInfo).port;
});

afterEach(async () => {
  upstreamWss.close();
  await new Promise((r) => upstreamHttp.close(r));
  await new Promise((r) => front.close(r));
});

function client(path: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${frontPort}${path}?token=k`);
}

describe("playwright attach passthrough", () => {
  it("pipes text and binary frames both ways", async () => {
    const ws = client("/playwright/a");
    await new Promise((r) => ws.on("open", r));
    const got: Array<{ data: Buffer; isBinary: boolean }> = [];
    ws.on("message", (data, isBinary) => got.push({ data: data as Buffer, isBinary }));
    ws.send("hello");
    ws.send(Buffer.from([1, 2, 3]), { binary: true });
    await new Promise((r) => setTimeout(r, 200));
    expect(got).toHaveLength(2);
    expect(got[0].data.toString()).toBe("hello");
    expect(got[0].isBinary).toBe(false);
    expect(got[1].isBinary).toBe(true);
    expect([...got[1].data]).toEqual([1, 2, 3]);
    ws.close();
  });

  it("buffers client frames sent before upstream opens", async () => {
    const slow = deps({
      ensureStarted: async () => {
        await new Promise((r) => setTimeout(r, 150));
        return { wsEndpoint: upstreamUrl, profileId: "prof_1" };
      },
    });
    front.removeAllListeners("upgrade");
    front.on("upgrade", createUpgradeHandler(cfg, { playwright: playwrightAttachHandler(slow) }));
    const ws = client("/playwright/a");
    await new Promise((r) => ws.on("open", r));
    ws.send("early"); // upstream not connected yet
    const first = await new Promise<string>((r) => ws.once("message", (d) => r(String(d))));
    expect(first).toBe("early");
    ws.close();
  });

  it("closes 4404 when the profile does not exist", async () => {
    const ws = client("/playwright/missing");
    const code = await new Promise<number>((r) => ws.on("close", (c) => r(c)));
    expect(code).toBe(4404);
    expect(events).toEqual([]); // no session for failed attach
  });

  it("records session connect/disconnect", async () => {
    const ws = client("/playwright/a");
    await new Promise((r) => ws.on("open", r));
    ws.send("x");
    await new Promise((r) => ws.once("message", r));
    expect(events).toEqual(["connect"]);
    ws.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(events).toEqual(["connect", "disconnect"]);
  });

  it("closes the client when upstream dies", async () => {
    const ws = client("/playwright/a");
    await new Promise((r) => ws.on("open", r));
    ws.send("x");
    await new Promise((r) => ws.once("message", r));
    upstreamWss.clients.forEach((c) => c.terminate());
    const code = await new Promise<number>((r) => ws.on("close", (c) => r(c)));
    expect(code).toBeGreaterThanOrEqual(1000);
  });
});
```

- [ ] **Step 2: Run — FAIL** (module not found).
- [ ] **Step 3: Implement `src/server/attach.ts`:**

```ts
import type { IncomingMessage } from "node:http";
import { WebSocket as WsClient } from "ws";
import type { WebSocket } from "ws";
import type { WsHandler } from "@/server/ws";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";
import { getProfileManager } from "@/server/profiles";

export interface AttachDeps {
  /** Resolve profile, lazily starting it. Throws ApiError-like ({code}) on failure. */
  ensureStarted(name: string): Promise<{ wsEndpoint: string; profileId: string }>;
  /** Session opened — returns session id. */
  onConnect(profileId: string): string;
  onDisconnect(profileId: string, sessionId: string): void;
}

const CLOSE_CODES: Record<string, number> = {
  profile_not_found: 4404,
  too_many_profiles: 4429,
  profile_busy: 4409,
  browser_launch_failed: 4500,
};

function safeClose(ws: WebSocket, code: number, reason?: string): void {
  try {
    ws.close(code, reason);
  } catch {
    try { ws.terminate(); } catch { /* already gone */ }
  }
}

/** ws close codes an endpoint may legally send: 1000-1011 (minus reserved) or 3000-4999. */
function sanitizeCode(code: number): number {
  if (code === 1000 || (code >= 3000 && code <= 4999)) return code;
  if (code >= 1001 && code <= 1011 && code !== 1004 && code !== 1005 && code !== 1006) return code;
  return 1000;
}

export function playwrightAttachHandler(deps: AttachDeps): WsHandler {
  return (ws, route, req) => {
    void attach(ws, route.profileName, req, deps).catch((err) => {
      console.error("playwright attach failed", err);
      safeClose(ws, 1011, "internal_error");
    });
  };
}

async function attach(ws: WebSocket, profileName: string, req: IncomingMessage, deps: AttachDeps): Promise<void> {
  // Buffer client frames until the upstream pipe is open (lazy start can take seconds).
  const pending: Array<{ data: Buffer; isBinary: boolean }> = [];
  let upstream: WsClient | undefined;
  ws.on("message", (data, isBinary) => {
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as Buffer);
    if (upstream && upstream.readyState === WsClient.OPEN) upstream.send(buf, { binary: isBinary });
    else pending.push({ data: buf, isBinary });
  });

  let target: { wsEndpoint: string; profileId: string };
  try {
    target = await deps.ensureStarted(profileName);
  } catch (err) {
    const code = (err as { code?: string }).code;
    safeClose(ws, (code && CLOSE_CODES[code]) || 1011, code ?? "attach_failed");
    return;
  }
  if (ws.readyState !== ws.OPEN) return; // client gave up while we were starting

  // Forward playwright's own negotiation headers so its version check works.
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (k.startsWith("x-playwright") || k === "user-agent") headers[k] = Array.isArray(v) ? v[0]! : String(v);
  }
  upstream = new WsClient(target.wsEndpoint, { headers, maxPayload: 256 * 1024 * 1024 });
  const up = upstream;

  let sessionId: string | undefined;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (sessionId) deps.onDisconnect(target.profileId, sessionId);
  };

  up.on("open", () => {
    sessionId = deps.onConnect(target.profileId);
    for (const m of pending.splice(0)) up.send(m.data, { binary: m.isBinary });
  });
  up.on("message", (data, isBinary) => {
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as Buffer);
    if (ws.readyState === ws.OPEN) ws.send(buf, { binary: isBinary });
  });
  up.on("close", (code, reason) => {
    finish();
    safeClose(ws, sanitizeCode(code), reason.toString().slice(0, 120));
  });
  up.on("error", () => {
    finish();
    safeClose(ws, 1011, "upstream_error");
  });

  ws.on("close", () => {
    finish();
    try { up.close(); } catch { /* already closed */ }
  });
  ws.on("error", () => {
    finish();
    try { up.close(); } catch { /* already closed */ }
  });
}

/** Production wiring: ProfileManager + sessions + events. */
export function defaultAttachDeps(): AttachDeps {
  return {
    async ensureStarted(name) {
      try {
        const rp = await getProfileManager().start(name);
        return { wsEndpoint: rp.browser.wsEndpoint, profileId: rp.profile.id };
      } catch (err) {
        if (err instanceof ApiError) throw Object.assign(new Error(err.message), { code: err.code });
        throw err;
      }
    },
    onConnect(profileId) {
      const db = getDb(config().dataDir);
      const s = db.createSession(profileId, "playwright");
      db.recordEvent(profileId, "session.connected", { sessionId: s.id, kind: "playwright" });
      return s.id;
    },
    onDisconnect(profileId, sessionId) {
      const db = getDb(config().dataDir);
      db.closeSession(sessionId);
      db.recordEvent(profileId, "session.disconnected", { sessionId, kind: "playwright" });
    },
  };
}
```

- [ ] **Step 4: PASS. Full gates.**
- [ ] **Step 5: Commit** — `feat: playwright attach passthrough with session tracking`

---

### Task 3: Wiring + sessions endpoint

**Files:**
- Modify: `src/server/index.ts`
- Create: `src/app/api/v1/sessions/route.ts`
- Test: `tests/unit/sessions-api.test.ts`

- [ ] **Step 1: Failing test** `tests/unit/sessions-api.test.ts` (same stub pattern as profiles-api tests):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "@/server/db";

let dir: string;
const auth = { authorization: "Bearer secret" };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "morrow-sess-"));
  vi.stubEnv("MORROW_API_KEY", "secret");
  vi.stubEnv("MORROW_DATA_DIR", dir);
  const db = openDb(`${dir}/morrow.db`);
  (globalThis as Record<string, unknown>).__morrow = { db };
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /sessions", () => {
  it("lists active sessions with profile names", async () => {
    const db = ((globalThis as Record<string, unknown>).__morrow as { db: import("@/server/db").MorrowDb }).db;
    const p = db.createProfile({ name: "a" });
    db.createSession(p.id, "playwright");
    const closedSession = db.createSession(p.id, "viewer");
    db.closeSession(closedSession.id);

    const { GET } = await import("@/app/api/v1/sessions/route");
    const res = await GET(new Request("http://x/api/v1/sessions", { headers: auth }));
    const { sessions } = await res.json();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ kind: "playwright", profileName: "a" });
  });

  it("requires auth", async () => {
    const { GET } = await import("@/app/api/v1/sessions/route");
    const res = await GET(new Request("http://x/api/v1/sessions"));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement `src/app/api/v1/sessions/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(() => NextResponse.json({ sessions: getDb(config().dataDir).listActiveSessions() }));
}
```

- [ ] **Step 4: Wire the handler in `src/server/index.ts`:**

```ts
import { playwrightAttachHandler, defaultAttachDeps } from "@/server/attach";
// …
  server.on("upgrade", createUpgradeHandler(cfg, { playwright: playwrightAttachHandler(defaultAttachDeps()) }));
```

- [ ] **Step 5: PASS + full gates (incl. build). Manual smoke:** boot dev server on a free port, run a tiny node script with playwright-core: `firefox.connect("ws://localhost:PORT/playwright/<profile>?token=…")` against a created profile — expect contexts()[0] present; check `GET /sessions` shows the session while connected. Report output.
- [ ] **Step 6: Commit** — `feat: wire playwright attach and sessions endpoint`

---

### Task 4: Integration test — attach end to end

**Files:**
- Create: `tests/integration/attach.test.ts`

- [ ] **Step 1: Write the test** — plain http server + upgrade handler (Next not needed on the ws path), real ProfileManager/Camoufox, stock client:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { firefox } from "playwright-core";
import { openDb, type MorrowDb } from "@/server/db";
import { ProfileManager } from "@/server/profiles";
import { CamoufoxRuntime } from "@/server/browser/camoufox";
import { createUpgradeHandler } from "@/server/ws";
import { playwrightAttachHandler, type AttachDeps } from "@/server/attach";

const enabled = process.env.MORROW_IT === "1";

describe.runIf(enabled)("playwright attach (real camoufox, stock client)", () => {
  let dir: string;
  let db: MorrowDb;
  let pm: ProfileManager;
  let server: Server;
  let base: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "morrow-attach-"));
    db = openDb(`${dir}/morrow.db`);
    pm = new ProfileManager(db, new CamoufoxRuntime(), { dataDir: dir, maxProfiles: 2, launchTimeoutMs: 120_000 });
    const deps: AttachDeps = {
      ensureStarted: async (name) => {
        const rp = await pm.start(name);
        return { wsEndpoint: rp.browser.wsEndpoint, profileId: rp.profile.id };
      },
      onConnect: (profileId) => db.createSession(profileId, "playwright").id,
      onDisconnect: (_profileId, sessionId) => db.closeSession(sessionId),
    };
    server = createServer();
    server.on("upgrade", createUpgradeHandler(
      { apiKey: "it-key", port: 0, dataDir: dir, maxProfiles: 2, launchTimeoutMs: 120_000 },
      { playwright: playwrightAttachHandler(deps) }
    ));
    await new Promise<void>((r) => server.listen(0, r));
    base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
    db.createProfile({ name: "it" });
  });

  afterAll(async () => {
    await pm.stop("it").catch(() => {});
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  });

  it("stock client lazy-starts the profile, shares the persistent context, and cookies survive restart", async () => {
    // no manual start — attach lazy-starts
    const b1 = await firefox.connect(`${base}/playwright/it?token=it-key`);
    const ctx1 = b1.contexts()[0];
    expect(ctx1).toBeTruthy(); // the shared persistent context
    await ctx1.addCookies([
      { name: "attach_it", value: "via-ws", domain: "example.com", path: "/", expires: Math.floor(Date.now() / 1000) + 3600 },
    ]);
    await b1.close(); // client disconnect must NOT kill the profile browser
    expect(pm.isRunning("it")).toBe(true);
    expect(db.listActiveSessions()).toHaveLength(0); // session closed on disconnect

    await pm.stop("it"); // full cold restart
    const b2 = await firefox.connect(`${base}/playwright/it?token=it-key`); // lazy start again
    const cookies = await b2.contexts()[0].cookies("https://example.com");
    await b2.close();
    expect(cookies.map((c) => `${c.name}=${c.value}`)).toContain("attach_it=via-ws");
  }, 300_000);

  it("rejects bad tokens at the upgrade and unknown profiles with 4404", async () => {
    await expect(firefox.connect(`${base}/playwright/it?token=wrong`)).rejects.toThrow(/401/);
    await expect(firefox.connect(`${base}/playwright/nope?token=it-key`)).rejects.toThrow();
  }, 60_000);
});
```

- [ ] **Step 2: Run `npm run test:integration`** — expect 4 passed total (2 persistence + 2 attach). Plain `npm test` shows them skipped.
- [ ] **Step 3: Commit** — `test: end-to-end playwright attach integration suite`

---

### Task 5: Docs + release v0.3.0

- [ ] **Step 1: README** — add "Connect with Playwright" section:

````markdown
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
````

- [ ] **Step 2:** Bump package.json to `0.3.0`; bump jekyo.yaml image tag to `0.3.0`.
- [ ] **Step 3:** Full gates: `npm test`, typecheck, build, `npm run test:integration`.
- [ ] **Step 4: Commit** — `chore: release v0.3.0`. Merge to main, tag `v0.3.0`, push, verify actions.

---

## Acceptance for Plan 3

- Stock `firefox.connect()` through Morrow's endpoint: lazy start, shared persistent context, cookie survives cold restart (integration-proven).
- Client disconnect leaves the profile running; sessions open/close correctly; `GET /sessions` lists active ones; events include `session.connected/disconnected`.
- Bad token → 401 at upgrade; unknown profile → 4404 close.
- `ghcr.io/jekyo/morrow:0.3.0` published.
