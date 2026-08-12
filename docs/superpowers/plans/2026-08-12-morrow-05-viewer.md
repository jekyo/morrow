# Morrow Plan 5: Remote Viewer & Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The human side of Morrow — a streaming remote browser (`/viewer/:name` ws: JPEG frames out, input in, a control lock) and a Next.js dashboard (login, profiles list + create, profile detail with the live viewer, metrics). This closes the MVP loop: a human opens a profile, sees the browser, takes control, logs in.

**Architecture:** A `ViewerHub` per running profile drives a screencast loop (poll `page.screenshot({type:"jpeg"})` on a frame budget) and fans frames to connected viewer sockets; input messages from the lock holder are applied via `page.mouse`/`page.keyboard`. The dashboard is client components under the existing Next app, talking to the REST API with the stored key, and opening the viewer ws directly.

**Spec:** v1 design §11 (remote browser), §22 (control lock), UI design doc (all sections). Plan 5 of ~6.

**Scope discipline:** v1 viewer uses screenshot-polling (simple, engine-agnostic), NOT CDP screencast (Firefox lacks it). Target ~10 fps at moderate quality — good enough to log in, not a video stream. Multi-tab: show the active page only; tab switching deferred to a follow-up. Mobile viewer read-only per UI doc.

---

### Task 1: Control lock

**Files:**
- Create: `src/server/lock.ts`
- Test: `tests/unit/lock.test.ts`

- [ ] **Step 1: Failing test** `tests/unit/lock.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ControlLock } from "@/server/lock";

describe("ControlLock", () => {
  it("grants to the first requester and reports the holder", () => {
    const lock = new ControlLock();
    expect(lock.holder()).toBeNull();
    expect(lock.take("viewer-1")).toBe(true);
    expect(lock.holder()).toBe("viewer-1");
  });

  it("refuses a second holder but is idempotent for the same one", () => {
    const lock = new ControlLock();
    lock.take("viewer-1");
    expect(lock.take("viewer-2")).toBe(false);
    expect(lock.take("viewer-1")).toBe(true);
    expect(lock.holder()).toBe("viewer-1");
  });

  it("releases so another can take", () => {
    const lock = new ControlLock();
    lock.take("viewer-1");
    lock.release("viewer-2"); // not the holder — no-op
    expect(lock.holder()).toBe("viewer-1");
    lock.release("viewer-1");
    expect(lock.holder()).toBeNull();
    expect(lock.take("viewer-2")).toBe(true);
  });

  it("has() checks whether a given id holds control", () => {
    const lock = new ControlLock();
    lock.take("a");
    expect(lock.has("a")).toBe(true);
    expect(lock.has("b")).toBe(false);
  });
});
```

- [ ] **Step 2: FAIL. Step 3: Implement `src/server/lock.ts`:**

```ts
/** In-memory single-controller lock for one running profile. Automation is the
 *  implicit holder unless a viewer takes control; see ViewerHub. */
export class ControlLock {
  private current: string | null = null;

  holder(): string | null {
    return this.current;
  }
  has(id: string): boolean {
    return this.current === id;
  }
  take(id: string): boolean {
    if (this.current === null || this.current === id) {
      this.current = id;
      return true;
    }
    return false;
  }
  release(id: string): void {
    if (this.current === id) this.current = null;
  }
}
```

- [ ] **Step 4: PASS + gates. Commit** — `feat: control lock`

---

### Task 2: ViewerHub — frame loop + input

**Files:**
- Create: `src/server/viewer.ts`
- Test: `tests/unit/viewer.test.ts`

- [ ] **Step 1: Failing test** — fake page/context capturing screenshots + input, driving the hub with a fake clock:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ViewerHub, type ViewerPage } from "@/server/viewer";

function fakePage() {
  const calls: string[] = [];
  let shot = 0;
  const page: ViewerPage = {
    async screenshot() { shot++; return Buffer.from([shot]); },
    url: () => "https://x.com/home",
    mouse: {
      move: async (x, y) => { calls.push(`move:${x},${y}`); },
      down: async () => { calls.push("down"); },
      up: async () => { calls.push("up"); },
      wheel: async (dx, dy) => { calls.push(`wheel:${dx},${dy}`); },
    },
    keyboard: {
      type: async (t) => { calls.push(`type:${t}`); },
      press: async (k) => { calls.push(`press:${k}`); },
    },
  };
  return { page, calls, shots: () => shot };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ViewerHub", () => {
  it("streams frames to a subscriber while running", async () => {
    const { page, shots } = fakePage();
    const hub = new ViewerHub(page, { fps: 10 });
    const frames: Buffer[] = [];
    const unsub = hub.subscribe((f) => frames.push(f.data));
    hub.start();
    await vi.advanceTimersByTimeAsync(350); // ~3 frames at 10fps
    expect(shots()).toBeGreaterThanOrEqual(3);
    expect(frames.length).toBeGreaterThanOrEqual(3);
    unsub();
    hub.stop();
  });

  it("stops the loop when the last subscriber leaves", async () => {
    const { page, shots } = fakePage();
    const hub = new ViewerHub(page, { fps: 10 });
    const unsub = hub.subscribe(() => {});
    hub.start();
    await vi.advanceTimersByTimeAsync(150);
    const before = shots();
    unsub();
    await vi.advanceTimersByTimeAsync(300);
    expect(shots()).toBe(before); // no new frames after everyone left
  });

  it("applies input only from the control holder", async () => {
    const { page, calls } = fakePage();
    const hub = new ViewerHub(page, { fps: 10 });
    hub.lock.take("v1");
    await hub.input("v1", { type: "mouse", action: "move", x: 10, y: 20 });
    await hub.input("v2", { type: "mouse", action: "move", x: 99, y: 99 }); // not holder
    await hub.input("v1", { type: "key", action: "type", text: "hello" });
    expect(calls).toEqual(["move:10,20", "type:hello"]);
  });

  it("reports current url with frames", async () => {
    const { page } = fakePage();
    const hub = new ViewerHub(page, { fps: 10 });
    let meta: string | undefined;
    hub.subscribe((f) => { meta = f.url; });
    hub.start();
    await vi.advanceTimersByTimeAsync(150);
    expect(meta).toBe("https://x.com/home");
    hub.stop();
  });
});
```

- [ ] **Step 2: FAIL. Step 3: Implement `src/server/viewer.ts`:**

```ts
import { ControlLock } from "@/server/lock";

export interface ViewerPage {
  screenshot(opts?: { type?: "jpeg"; quality?: number }): Promise<Buffer>;
  url(): string;
  mouse: {
    move(x: number, y: number): Promise<void>;
    down(): Promise<void>;
    up(): Promise<void>;
    wheel(dx: number, dy: number): Promise<void>;
  };
  keyboard: {
    type(text: string): Promise<void>;
    press(key: string): Promise<void>;
  };
}

export interface Frame { data: Buffer; url: string; seq: number }

export type InputMessage =
  | { type: "mouse"; action: "move" | "down" | "up"; x?: number; y?: number }
  | { type: "mouse"; action: "wheel"; dx: number; dy: number }
  | { type: "key"; action: "type"; text: string }
  | { type: "key"; action: "press"; key: string };

type Subscriber = (frame: Frame) => void;

export class ViewerHub {
  readonly lock = new ControlLock();
  private subs = new Set<Subscriber>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private busy = false;

  constructor(private page: ViewerPage, private opts: { fps: number; quality?: number } = { fps: 10 }) {}

  subscribe(fn: Subscriber): () => void {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
      if (this.subs.size === 0) this.stop();
    };
  }

  start(): void {
    if (this.timer) return;
    const interval = Math.max(1, Math.floor(1000 / this.opts.fps));
    this.timer = setInterval(() => void this.tick(), interval);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private async tick(): Promise<void> {
    if (this.busy || this.subs.size === 0) return;
    this.busy = true;
    try {
      const data = await this.page.screenshot({ type: "jpeg", quality: this.opts.quality ?? 60 });
      const frame: Frame = { data, url: this.page.url(), seq: ++this.seq };
      for (const fn of this.subs) fn(frame);
    } catch {
      // transient (page navigating/closing) — skip this frame
    } finally {
      this.busy = false;
    }
  }

  async input(controllerId: string, msg: InputMessage): Promise<void> {
    if (!this.lock.has(controllerId)) return;
    if (msg.type === "mouse") {
      if (msg.action === "move") await this.page.mouse.move(msg.x ?? 0, msg.y ?? 0);
      else if (msg.action === "down") await this.page.mouse.down();
      else if (msg.action === "up") await this.page.mouse.up();
      else if (msg.action === "wheel") await this.page.mouse.wheel(msg.dx, msg.dy);
    } else {
      if (msg.action === "type") await this.page.keyboard.type(msg.text);
      else if (msg.action === "press") await this.page.keyboard.press(msg.key);
    }
  }
}
```

- [ ] **Step 4: PASS + gates. Commit** — `feat: viewer hub with frame loop and input routing`

---

### Task 3: Viewer ws handler + wiring

**Files:**
- Create: `src/server/viewer-handler.ts`
- Modify: `src/server/index.ts` (register viewer handler), `src/server/profiles.ts` (expose active page for a running profile), `src/server/viewer.ts` (hub registry keyed by profile)
- Test: `tests/unit/viewer-handler.test.ts`

- [ ] **Step 1:** Add a hub registry to `viewer.ts`:

```ts
import { globalSingleton } from "@/server/global";

const hubs = () => globalSingleton("viewerHubs", () => new Map<string, ViewerHub>());

export function getOrCreateHub(profileId: string, page: ViewerPage, fps = 10): ViewerHub {
  const map = hubs();
  let hub = map.get(profileId);
  if (!hub) { hub = new ViewerHub(page, { fps }); map.set(profileId, hub); }
  return hub;
}

export function dropHub(profileId: string): void {
  const map = hubs();
  map.get(profileId)?.stop();
  map.delete(profileId);
}
```

Add to `ProfileManager` a way to get the active page of a running profile (first page of the persistent context, or `context.newPage()` if none):

```ts
  async activePage(name: string) {
    const rp = this.running.get(this.mustGet(name).id);
    if (!rp) throw new ApiError("profile_not_stopped", `Profile ${name} is not running`, 409);
    const pages = rp.browser.context.pages();
    return pages[0] ?? (await rp.browser.context.newPage());
  }
```

Also `dropHub(profile.id)` in the ProfileManager stop path and the crash cleanup (so a stopped profile's hub goes away).

- [ ] **Step 2: Failing test** `tests/unit/viewer-handler.test.ts` — real ws front server + fake deps (fake hub with controllable subscribe/input), asserting: connect → receives frames; sends input JSON → routed with the socket's viewer id; takeControl/releaseControl toggle the lock; bad profile closes 4404. Model it on the attach test structure (real WebSocketServer via createUpgradeHandler, fake `ViewerDeps`).

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { createUpgradeHandler } from "@/server/ws";
import { viewerHandler, type ViewerDeps } from "@/server/viewer-handler";

let front: Server; let port: number; let log: string[];
const cfg = { apiKey: "k", port: 0, dataDir: "/tmp", maxProfiles: 5, launchTimeoutMs: 1000 };

function deps(): ViewerDeps {
  const subs = new Set<(f: { data: Buffer; url: string; seq: number }) => void>();
  return {
    async attach(name) {
      if (name === "missing") { const e = new Error("no") as Error & { code?: string }; e.code = "profile_not_found"; throw e; }
      return {
        profileId: "prof_1",
        lockHolder: () => null,
        takeControl: (id) => { log.push(`take:${id}`); return true; },
        releaseControl: (id) => { log.push(`release:${id}`); },
        input: async (id, msg) => { log.push(`input:${id}:${msg.type}:${(msg as {action:string}).action}`); },
        subscribe: (fn) => { subs.add(fn); setTimeout(() => fn({ data: Buffer.from([1]), url: "https://x.com", seq: 1 }), 10); return () => subs.delete(fn); },
        onDisconnect: (id) => { log.push(`disconnect:${id}`); },
      };
    },
  };
}

beforeEach(async () => {
  log = [];
  front = createServer();
  front.on("upgrade", createUpgradeHandler(cfg, { viewer: viewerHandler(deps()) }));
  await new Promise<void>((r) => front.listen(0, r));
  port = (front.address() as AddressInfo).port;
});
afterEach(async () => { await new Promise((r) => front.close(r)); });

function client() { return new WebSocket(`ws://127.0.0.1:${port}/viewer/a?token=k`); }

describe("viewer handler", () => {
  it("streams frame messages as binary and metadata as json", async () => {
    const ws = client();
    const messages: unknown[] = [];
    ws.on("message", (data, isBinary) => messages.push(isBinary ? "binary" : JSON.parse(String(data))));
    await new Promise((r) => setTimeout(r, 120));
    // expect at least one frame (binary) and one status/lock json
    expect(messages).toContain("binary");
    ws.close();
  });

  it("routes input and control from the client", async () => {
    const ws = client();
    await new Promise((r) => ws.on("open", r));
    ws.send(JSON.stringify({ type: "takeControl" }));
    ws.send(JSON.stringify({ type: "input", input: { type: "mouse", action: "move", x: 1, y: 2 } }));
    ws.send(JSON.stringify({ type: "releaseControl" }));
    await new Promise((r) => setTimeout(r, 80));
    expect(log.some((l) => l.startsWith("take:"))).toBe(true);
    expect(log.some((l) => l.startsWith("input:") && l.includes("mouse:move"))).toBe(true);
    expect(log.some((l) => l.startsWith("release:"))).toBe(true);
    ws.close();
  });

  it("closes 4404 for unknown profile", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/viewer/missing?token=k`);
    const code = await new Promise<number>((r) => ws.on("close", (c) => r(c)));
    expect(code).toBe(4404);
  });
});
```

- [ ] **Step 3: FAIL. Step 4: Implement `src/server/viewer-handler.ts`:**

```ts
import { randomBytes } from "node:crypto";
import type { WsHandler } from "@/server/ws";
import type { InputMessage } from "@/server/viewer";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";
import { getProfileManager } from "@/server/profiles";
import { getOrCreateHub } from "@/server/viewer";

export interface ViewerAttachment {
  profileId: string;
  lockHolder(): string | null;
  takeControl(viewerId: string): boolean;
  releaseControl(viewerId: string): void;
  input(viewerId: string, msg: InputMessage): Promise<void>;
  subscribe(fn: (f: { data: Buffer; url: string; seq: number }) => void): () => void;
  onDisconnect(viewerId: string): void;
}
export interface ViewerDeps {
  attach(name: string): Promise<ViewerAttachment>;
}

const CLOSE_CODES: Record<string, number> = {
  profile_not_found: 4404, too_many_profiles: 4429, profile_busy: 4409, browser_launch_failed: 4500,
};

export function viewerHandler(deps: ViewerDeps): WsHandler {
  return (ws, route) => {
    const viewerId = `viewer_${randomBytes(6).toString("hex")}`;
    void run(ws, route.profileName, viewerId, deps).catch((err) => {
      console.error("viewer failed", err);
      try { ws.close(1011, "internal_error"); } catch { /* gone */ }
    });
  };
}

async function run(ws: import("ws").WebSocket, name: string, viewerId: string, deps: ViewerDeps): Promise<void> {
  let att: ViewerAttachment;
  try {
    att = await deps.attach(name);
  } catch (err) {
    const code = (err as { code?: string }).code;
    try { ws.close((code && CLOSE_CODES[code]) || 1011, code ?? "viewer_failed"); } catch { /* gone */ }
    return;
  }
  if (ws.readyState !== ws.OPEN) { att.onDisconnect(viewerId); return; }

  const sendStatus = () => {
    if (ws.readyState === ws.OPEN)
      ws.send(JSON.stringify({ type: "lock", holder: att.lockHolder(), you: viewerId }));
  };

  const unsub = att.subscribe((f) => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ type: "frameMeta", url: f.url, seq: f.seq }));
    ws.send(f.data, { binary: true });
  });
  sendStatus();

  ws.on("message", (raw) => {
    let msg: { type: string; input?: InputMessage };
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.type === "takeControl") { att.takeControl(viewerId); sendStatus(); }
    else if (msg.type === "releaseControl") { att.releaseControl(viewerId); sendStatus(); }
    else if (msg.type === "input" && msg.input) void att.input(viewerId, msg.input);
  });

  const cleanup = () => { unsub(); att.releaseControl(viewerId); att.onDisconnect(viewerId); };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
}

/** Production wiring. */
export function defaultViewerDeps(): ViewerDeps {
  return {
    async attach(name) {
      const pm = getProfileManager();
      let rp;
      try { rp = await pm.start(name); }
      catch (err) { if (err instanceof ApiError) throw Object.assign(new Error(err.message), { code: err.code }); throw err; }
      const page = await pm.activePage(name);
      const hub = getOrCreateHub(rp.profile.id, page as never);
      hub.start();
      const db = getDb(config().dataDir);
      let sessionId: string | undefined;
      return {
        profileId: rp.profile.id,
        lockHolder: () => hub.lock.holder(),
        takeControl: (id) => hub.lock.take(id),
        releaseControl: (id) => hub.lock.release(id),
        input: (id, msg) => hub.input(id, msg),
        subscribe: (fn) => {
          const un = hub.subscribe(fn);
          const s = db.createSession(rp!.profile.id, "viewer");
          sessionId = s.id;
          db.recordEvent(rp!.profile.id, "session.connected", { sessionId: s.id, kind: "viewer" });
          return un;
        },
        onDisconnect: () => {
          if (sessionId) { db.closeSession(sessionId); db.recordEvent(rp!.profile.id, "session.disconnected", { sessionId, kind: "viewer" }); }
        },
      };
    },
  };
}
```

- [ ] **Step 5:** Wire in `src/server/index.ts`: `{ playwright: …, viewer: viewerHandler(defaultViewerDeps()) }`.
- [ ] **Step 6: PASS + gates. Manual smoke:** boot dev, create+start a profile, open the viewer ws in a node script, confirm binary frames arrive and `takeControl` returns a lock json. Commit — `feat: viewer websocket handler and wiring`

---

### Task 4: Dashboard — API client, auth, shell

**Files:**
- Create: `src/lib/api.ts` (client), `src/lib/useApi.ts` (hooks), `src/app/(dash)/layout.tsx` (sidebar shell), `src/app/(dash)/login/page.tsx`, middleware or client guard
- Modify: `src/app/page.tsx` (redirect to /profiles)
- Test: `tests/unit/api-client.test.ts`

Build the dashboard as client components (`"use client"`) using the design system tokens already in globals.css. The API key lives in `localStorage`; a small client wrapper attaches it as a bearer.

- [ ] **Step 1: Failing test** for the client wrapper (mock fetch):

```ts
import { describe, it, expect, vi } from "vitest";
import { MorrowClient } from "@/lib/api";

describe("MorrowClient", () => {
  it("attaches bearer token and parses json", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ profiles: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    const c = new MorrowClient("secret", fetchMock as unknown as typeof fetch);
    const r = await c.get("/profiles");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/profiles", expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer secret" }),
    }));
    expect(r).toEqual({ profiles: [] });
  });

  it("throws ApiClientError with the envelope code on failure", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code: "profile_not_found", message: "x" } }), { status: 404, headers: { "content-type": "application/json" } }));
    const c = new MorrowClient("secret", fetchMock as unknown as typeof fetch);
    await expect(c.get("/profiles/zz")).rejects.toMatchObject({ code: "profile_not_found", status: 404 });
  });
});
```

- [ ] **Step 2: FAIL. Step 3: Implement `src/lib/api.ts`:**

```ts
export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

export class MorrowClient {
  constructor(private token: string, private fetchImpl: typeof fetch = fetch) {}

  private async req(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await this.fetchImpl(`/api/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return null;
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const data = isJson ? await res.json() : await res.text();
    if (!res.ok) {
      const env = (data as { error?: { code?: string; message?: string } }).error;
      throw new ApiClientError(env?.code ?? "error", env?.message ?? res.statusText, res.status);
    }
    return data;
  }
  get(path: string) { return this.req("GET", path); }
  post(path: string, body?: unknown) { return this.req("POST", path, body); }
  patch(path: string, body: unknown) { return this.req("PATCH", path, body); }
  del(path: string) { return this.req("DELETE", path); }
}
```

- [ ] **Step 4:** Implement `src/lib/useApi.ts` (a `useClient()` hook reading the key from localStorage + redirecting to `/login` if absent; a `useProfiles()` SWR-style hook — keep it dependency-free with `useEffect` + `useState`, no new libs), the `(dash)` layout with the Morrow sidebar (Profiles, Metrics, Docs, API links per UI doc §1), and `login/page.tsx` (key input → verify via `GET /pressure` → store → redirect to `/profiles`). `src/app/page.tsx` redirects to `/profiles`.

- [ ] **Step 5: PASS (api-client test) + gates (build must pass — client components).** Commit — `feat: dashboard api client, auth, and shell`

---

### Task 5: Dashboard — profiles list + create + detail (with viewer)

**Files:**
- Create: `src/app/(dash)/profiles/page.tsx`, `src/app/(dash)/profiles/[name]/page.tsx`, `src/components/CreateProfileModal.tsx`, `src/components/BrowserViewer.tsx`, `src/components/Timeline.tsx`, `src/app/(dash)/metrics/page.tsx`
- Modify: add `GET /api/v1/metrics` route (`src/app/api/v1/metrics/route.ts`) + serializer

- [ ] **Step 1: Metrics route** (small, no test beyond a smoke — but add one auth+shape unit test `tests/unit/metrics-api.test.ts` like sessions-api): returns `{ profiles: {total,running}, sessions: {active}, scrapes: {total24h,failed24h}, system: {memory,uptime} }` from db counts + process. Wire it. TDD the shape.

- [ ] **Step 2: Profiles list page** — client component: `useProfiles()`, dense daisyUI table (status glyph + label, last active, sessions, proxy, actions), `+ New Profile` opening `CreateProfileModal`, empty state, per-row Start/Open/Stop + overflow (clone/reset/delete with confirm). Uses design tokens; status colors per UI doc §19-20.

- [ ] **Step 3: Create modal** — name (validated), proxy, locale, timezone, viewport, Browser field fixed to "Camoufox" (disabled). On success → navigate to detail.

- [ ] **Step 4: Profile detail page** — the centerpiece: `BrowserViewer` component (opens `/viewer/:name?token=…` ws, draws binary frames onto a `<canvas>`, forwards mouse/keyboard/wheel as input JSON when holding control; Take Control/Release button reads the lock json; URL bar + reload; stopped/starting/reconnecting states), right rail (status, controller, sessions, proxy, connect snippets: playwright ws + scrape curl), `Timeline` component (events, terminal-styled, polled). Toolbar: Take Control, Screenshot (download current frame), Stop.

- [ ] **Step 5: Metrics page** — stat cards (total/running profiles, active sessions, scrapes 24h, memory) + a simple sparkline-ish list; poll every 15s.

- [ ] **Step 6:** Build MUST pass. Manual: boot dev, log in through the UI, create a profile, open detail, start it, confirm the viewer shows live frames and Take Control lets you click. Report with a screenshot path if possible (use the take-screenshot flow or describe what rendered). Commit — `feat: profiles dashboard with live browser viewer`

---

### Task 6: Release v0.5.0

- [ ] **Step 1:** README — "Dashboard" section (open `/`, enter key, create/open/control a profile). Update UI doc §2 note that login verifies against `/pressure` (already implemented that way).
- [ ] **Step 2:** Bump package.json → `0.5.0`, jekyo.yaml image → `0.5.0`.
- [ ] **Step 3:** Full gates + integration. Manual dashboard smoke recorded. Commit — `chore: release v0.5.0`. Merge/tag/push/verify.

---

## Acceptance for Plan 5

- `/viewer/:name` streams JPEG frames; the lock holder's mouse/keyboard/wheel drive the real browser; take/release control works; non-holders are view-only.
- Dashboard: login with API key; profiles list with create/start/stop/open; profile detail with a working live viewer where a human can log into a site; metrics page.
- The MVP loop is demonstrable through the UI: create → open → start → take control → log in → stop → start → still logged in.
- `ghcr.io/jekyo/morrow:0.5.0` published.
