# Morrow Plan 2: Profiles & Lifecycle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistent browser profiles that actually remember: full REST CRUD + lifecycle (start/stop/clone/reset), a Camoufox runtime with stable fingerprints, and an integration test proving a login cookie survives stop→start. Plus the attach spike whose decision record shapes Plan 3.

**Architecture:** A `ProfileManager` (globalThis-shared singleton so Next route handlers and the custom server see the same instance) supervises Camoufox persistent contexts launched via camoufox-js (`user_data_dir` → `launchPersistentContext`). Fingerprints are generated once per profile, stored as JSON, and passed on every start — that's what makes the identity stable. REST routes are thin wrappers over the manager.

**Tech Stack:** Existing foundation + zod (request validation). No new services.

**Spec:** `docs/superpowers/specs/2026-08-10-morrow-v1-design.md` §3 (domain model, lifecycle), §4 (profiles REST). Plan 2 of ~6.

**Key finding driving scope (2026-08-12 investigation):** stock Playwright cannot serve a *persistent* context over WebSocket — `launchServer()` has no `userDataDir` (verified against installed playwright-core types), and `launchPersistentContext()` exposes no ws endpoint. Therefore the Playwright attach endpoint moves to **Plan 3**, informed by this plan's Task 1 spike (which tests the non-public escape hatches). Profiles in this plan run as Morrow-owned persistent contexts — which is what viewer/scrape/MCP need anyway.

**Deferred (noted, deliberate):** `GET /sessions` endpoint (nothing creates sessions until attach/viewer land); control locks (no competing controllers yet).

---

### Task 1: Attach spike (decision record for Plan 3)

**Files:**
- Create: `scripts/spike-attach.ts`, `docs/notes/attach-spike.md`

This task produces NO production code. It answers: *how can an external stock-Playwright client drive a Morrow persistent profile?* Test in order, record verbatim results:

- [ ] **Step 1: Approach A — browser server + profile dir args.** Write and run a throwaway script (`scripts/spike-attach.ts`, committed for reproducibility): `launchServer` from camoufox-js with `args: ["-profile", "/tmp/spike-profile"]` (also try with `ignoreDefaultArgs: ["-profile"]`-style variations if playwright injects its own). Client: `firefox.connect(wsEndpoint)` → newContext → page → set a cookie via a data: URL + `context.addCookies` → close everything → relaunch server same args → fresh client → read cookies. Record: does the cookie survive? (Expected: no — juggler contexts are memory-isolated; prove it.)

- [ ] **Step 2: Approach B — playwright's non-public server modes.** Investigate whether the installed playwright-core can serve an EXISTING browser/context over ws: look for "reuse-browser" / `run-server` machinery reachable at runtime (exports are locked to `./lib/coreBundle` etc. — try `require('playwright-core/lib/coreBundle')` in a scratch script and inspect what it exposes; also check `npx playwright run-server --help` behavior and whether connect() against it can target a server-launched persistent context). Time-box: 60 minutes. Record exactly what is/isn't reachable.

- [ ] **Step 3: Write `docs/notes/attach-spike.md`** with observed results for A and B and a recommendation among:
  1. ship attach via a working non-public mechanism (record exact imports/flags),
  2. attach = ephemeral contexts on a launchServer sharing nothing with the profile (document the semantic split honestly),
  3. attach = Morrow-mediated only (SDK/MCP/REST drive the persistent context; no stock `firefox.connect` in v1 — spec §13 amendment required).
  Include a "what Browserless does" note for context (their persistence story is CDP/Chromium-only, which Firefox lacks — that's WHY this is hard).

- [ ] **Step 4: Commit** — `docs: attach spike results and plan 3 recommendation`

---

### Task 2: DB migrations + profile fingerprint & CRUD helpers

**Files:**
- Modify: `src/server/db.ts`
- Test: `tests/unit/db.test.ts` (extend)

- [ ] **Step 1: Write failing tests** (append to `tests/unit/db.test.ts`):

```ts
describe("fingerprint", () => {
  it("stores and retrieves fingerprint json", () => {
    const p = db.createProfile({ name: "a" });
    expect(db.getFingerprint(p.id)).toBeUndefined();
    db.setFingerprint(p.id, { navigator: { platform: "Linux x86_64" } });
    expect(db.getFingerprint(p.id)).toEqual({ navigator: { platform: "Linux x86_64" } });
  });
});

describe("update/delete", () => {
  it("updates config fields and bumps updated_at", () => {
    const p = db.createProfile({ name: "a" });
    db.updateProfile(p.id, { proxy: "http://u:p@h:1", locale: "de-DE" });
    const q = db.getProfileById(p.id)!;
    expect(q.proxy).toBe("http://u:p@h:1");
    expect(q.locale).toBe("de-DE");
    expect(q.timezone).toBeNull();
  });

  it("clears a field with null", () => {
    const p = db.createProfile({ name: "a", locale: "en-US" });
    db.updateProfile(p.id, { locale: null });
    expect(db.getProfileById(p.id)!.locale).toBeNull();
  });

  it("deletes profile and its events", () => {
    const p = db.createProfile({ name: "a" });
    db.recordEvent(p.id, "profile.created");
    db.deleteProfile(p.id);
    expect(db.getProfileById(p.id)).toBeUndefined();
    expect(db.listEvents(p.id)).toEqual([]);
  });
});

describe("migrations", () => {
  it("stamps user_version", () => {
    expect(db.schemaVersion()).toBe(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (missing methods).

- [ ] **Step 3: Implement in `src/server/db.ts`:**

Add `fingerprint TEXT` to the profiles CREATE TABLE in `SCHEMA`, and introduce versioned migrations so existing `/data` volumes upgrade in place:

```ts
const MIGRATIONS: string[] = [
  // 1: fingerprint column (fresh installs already have it via SCHEMA)
  `ALTER TABLE profiles ADD COLUMN fingerprint TEXT`,
];

function migrate(db: Database.Database): void {
  const fresh = !db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='profiles'`).get();
  db.exec(SCHEMA);
  const current = (db.pragma("user_version", { simple: true }) as number) ?? 0;
  if (fresh) {
    db.pragma(`user_version = ${MIGRATIONS.length}`);
    return;
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec(MIGRATIONS[v]);
    db.pragma(`user_version = ${v + 1}`);
  }
}
```

Call `migrate(this.db)` in the constructor instead of `this.db.exec(SCHEMA)`. New methods on `MorrowDb`:

```ts
  schemaVersion(): number {
    return this.db.pragma("user_version", { simple: true }) as number;
  }

  getFingerprint(profileId: string): unknown {
    const r = this.db.prepare(`SELECT fingerprint FROM profiles WHERE id = ?`).get(profileId) as
      | { fingerprint: string | null }
      | undefined;
    return r?.fingerprint ? JSON.parse(r.fingerprint) : undefined;
  }

  setFingerprint(profileId: string, fp: unknown): void {
    this.db
      .prepare(`UPDATE profiles SET fingerprint = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(fp), profileId);
  }

  updateProfile(
    profileId: string,
    patch: Partial<Pick<Profile, "proxy" | "locale" | "timezone" | "viewportWidth" | "viewportHeight">> &
      { [K in "proxy" | "locale" | "timezone"]?: string | null }
  ): void {
    const cols: Record<string, string> = {
      proxy: "proxy",
      locale: "locale",
      timezone: "timezone",
      viewportWidth: "viewport_width",
      viewportHeight: "viewport_height",
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, col] of Object.entries(cols)) {
      if (key in patch) {
        sets.push(`${col} = ?`);
        values.push((patch as Record<string, unknown>)[key] ?? null);
      }
    }
    if (!sets.length) return;
    values.push(profileId);
    this.db
      .prepare(`UPDATE profiles SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`)
      .run(...values);
  }

  deleteProfile(profileId: string): void {
    this.db.prepare(`DELETE FROM events WHERE profile_id = ?`).run(profileId);
    this.db.prepare(`DELETE FROM sessions WHERE profile_id = ?`).run(profileId);
    this.db.prepare(`DELETE FROM profiles WHERE id = ?`).run(profileId);
  }
```

(Column names in `sets` come from the fixed `cols` map, never from input — no injection surface.)

- [ ] **Step 4: Run — expect PASS.** Full suite + typecheck green.
- [ ] **Step 5: Commit** — `feat: db migrations, fingerprint storage, profile update/delete`

---

### Task 3: Cross-bundle singletons

Next's route-handler bundle and the tsx-run custom server each load their own copy of `src/server/*` modules (proven in Plan 1 review: two fds on morrow.db from one process). Browser processes must have ONE owner.

**Files:**
- Create: `src/server/global.ts`
- Modify: `src/server/db.ts` (getDb), `src/server/config.ts` (config)
- Test: `tests/unit/global.test.ts`

- [ ] **Step 1: Failing test** `tests/unit/global.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { globalSingleton } from "@/server/global";

describe("globalSingleton", () => {
  it("creates once and reuses", () => {
    let calls = 0;
    const a = globalSingleton("test-key", () => ({ n: ++calls }));
    const b = globalSingleton("test-key", () => ({ n: ++calls }));
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/server/global.ts`:**

```ts
/**
 * Process-wide singletons that survive Next.js bundling. The custom server
 * and Next's route-handler bundle each get their own module instances, so
 * module-level `let` caches are NOT shared — globalThis is.
 */
const store = ((globalThis as Record<string, unknown>).__morrow ??= {}) as Record<string, unknown>;

export function globalSingleton<T>(key: string, create: () => T): T {
  if (!(key in store)) store[key] = create();
  return store[key] as T;
}
```

- [ ] **Step 4: Rewire.** In `db.ts` replace the `let singleton` block:

```ts
import { globalSingleton } from "@/server/global";

/** Process-wide database, stored at <dataDir>/morrow.db. */
export function getDb(dataDir: string): MorrowDb {
  return globalSingleton("db", () => new MorrowDb(`${dataDir}/morrow.db`));
}
```

In `config.ts` replace the `let cached` block:

```ts
import { globalSingleton } from "@/server/global";

/** Process-wide config (Next route handlers and server modules share it). */
export function config(): Config {
  return globalSingleton("config", () => loadConfig());
}
```

- [ ] **Step 5: Full suite + typecheck + build green** (build matters: globals.ts must not break Next bundling).
- [ ] **Step 6: Commit** — `fix: share db/config singletons across next and server bundles`

---

### Task 4: Camoufox runtime

**Files:**
- Create: `src/server/browser/runtime.ts`, `src/server/browser/camoufox.ts`
- Test: `tests/unit/camoufox-options.test.ts`

- [ ] **Step 1: Interface `src/server/browser/runtime.ts`** (no test — types only):

```ts
import type { BrowserContext } from "playwright-core";
import type { Profile } from "@/server/db";

export interface RunningBrowser {
  context: BrowserContext;
  /** Resolves when the browser exits — graceful close or crash alike. */
  closed: Promise<void>;
  close(): Promise<void>;
}

export interface BrowserRuntime {
  /** Generate the fingerprint that will pin this profile's identity. */
  generateFingerprint(profile: Profile): unknown;
  start(profile: Profile, opts: { profileDir: string; fingerprint: unknown }): Promise<RunningBrowser>;
}
```

- [ ] **Step 2: Failing test** `tests/unit/camoufox-options.test.ts` for the pure option-builder:

```ts
import { describe, it, expect } from "vitest";
import { buildCamoufoxOptions } from "@/server/browser/camoufox";
import type { Profile } from "@/server/db";

const base: Profile = {
  id: "prof_x", name: "x", status: "stopped", proxy: null, locale: null,
  timezone: null, viewportWidth: null, viewportHeight: null,
  fingerprintSeed: "s", createdAt: "", updatedAt: "",
};

describe("buildCamoufoxOptions", () => {
  it("always sets persistent dir, headless and fingerprint", () => {
    const o = buildCamoufoxOptions(base, { profileDir: "/data/profiles/prof_x", fingerprint: { f: 1 } });
    expect(o.user_data_dir).toBe("/data/profiles/prof_x");
    expect(o.headless).toBe(true);
    expect(o.fingerprint).toEqual({ f: 1 });
  });

  it("maps proxy, locale and window from profile config", () => {
    const o = buildCamoufoxOptions(
      { ...base, proxy: "http://u:p@h:1", locale: "de-DE", viewportWidth: 1280, viewportHeight: 800 },
      { profileDir: "/d", fingerprint: {} }
    );
    expect(o.proxy).toBe("http://u:p@h:1");
    expect(o.locale).toBe("de-DE");
    expect(o.window).toEqual([1280, 800]);
  });

  it("omits unset optionals", () => {
    const o = buildCamoufoxOptions(base, { profileDir: "/d", fingerprint: {} });
    expect("proxy" in o).toBe(false);
    expect("locale" in o).toBe(false);
    expect("window" in o).toBe(false);
  });
});
```

- [ ] **Step 3: Run — FAIL.**
- [ ] **Step 4: Implement `src/server/browser/camoufox.ts`:**

```ts
import { Camoufox } from "camoufox-js";
import { generateFingerprint } from "camoufox-js/dist/fingerprints.js";
import type { Profile } from "@/server/db";
import type { BrowserRuntime, RunningBrowser } from "@/server/browser/runtime";

/** Everything Camoufox needs to resurrect this exact browser identity. */
export function buildCamoufoxOptions(
  profile: Profile,
  opts: { profileDir: string; fingerprint: unknown }
): Record<string, unknown> {
  const o: Record<string, unknown> = {
    user_data_dir: opts.profileDir,
    fingerprint: opts.fingerprint,
    headless: true,
    // Camoufox handles cache persistence inside the profile dir
    enable_cache: true,
  };
  if (profile.proxy) o.proxy = profile.proxy;
  if (profile.locale) o.locale = profile.locale;
  if (profile.viewportWidth && profile.viewportHeight)
    o.window = [profile.viewportWidth, profile.viewportHeight];
  return o;
}

export class CamoufoxRuntime implements BrowserRuntime {
  generateFingerprint(profile: Profile): unknown {
    const window: [number, number] | undefined =
      profile.viewportWidth && profile.viewportHeight
        ? [profile.viewportWidth, profile.viewportHeight]
        : undefined;
    return generateFingerprint(window, { operatingSystems: ["linux"] });
  }

  async start(profile: Profile, opts: { profileDir: string; fingerprint: unknown }): Promise<RunningBrowser> {
    const context = await Camoufox({
      ...buildCamoufoxOptions(profile, opts),
      user_data_dir: opts.profileDir,
    } as Parameters<typeof Camoufox>[0]);
    let resolveClosed!: () => void;
    const closed = new Promise<void>((r) => (resolveClosed = r));
    context.on("close", resolveClosed);
    return {
      context,
      closed,
      close: async () => {
        await context.close().catch(() => {});
      },
    };
  }
}
```

Adaptation notes for the implementer: (a) verify the deep import path `camoufox-js/dist/fingerprints.js` resolves (package has no exports map restriction — check `node_modules/camoufox-js/package.json`; if it does restrict, import `generateFingerprint` however the package allows and report); (b) `generateFingerprint`'s second arg type is `Partial<FingerprintGeneratorOptions>` — if `operatingSystems: ["linux"]` doesn't typecheck, check the fingerprint-generator types for the correct field (it may be `operatingSystems: [OperatingSystemsName.linux]` or plain strings) and adapt; (c) `Camoufox()` with `user_data_dir` returns `BrowserContext` per its types — if TS needs the generic hint, use `Camoufox<string>(...)`.

- [ ] **Step 5: Run — PASS. Typecheck green.**
- [ ] **Step 6: Commit** — `feat: camoufox runtime with stable fingerprint options`

---

### Task 5: ProfileManager

**Files:**
- Create: `src/server/profiles.ts`
- Test: `tests/unit/profiles.test.ts`

- [ ] **Step 1: Failing tests** `tests/unit/profiles.test.ts` — uses a fake runtime, real in-memory db:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type MorrowDb } from "@/server/db";
import { ProfileManager } from "@/server/profiles";
import type { BrowserRuntime, RunningBrowser } from "@/server/browser/runtime";
import { ApiError } from "@/server/errors";

function fakeRuntime(behavior?: { failStart?: boolean; hang?: boolean }) {
  const started: { close: () => void }[] = [];
  const runtime: BrowserRuntime = {
    generateFingerprint: () => ({ fake: true }),
    async start(): Promise<RunningBrowser> {
      if (behavior?.failStart) throw new Error("boom: no display");
      if (behavior?.hang) await new Promise(() => {});
      let resolveClosed!: () => void;
      const closed = new Promise<void>((r) => (resolveClosed = r));
      const handle = { close: resolveClosed };
      started.push(handle);
      return {
        context: {} as RunningBrowser["context"],
        closed,
        close: async () => resolveClosed(),
      };
    },
  };
  return { runtime, started };
}

let db: MorrowDb;
beforeEach(() => {
  db = openDb(":memory:");
});

const cfg = { apiKey: "k", port: 0, dataDir: "/tmp/pm-test", maxProfiles: 2, launchTimeoutMs: 200 };

describe("ProfileManager", () => {
  it("starts a profile: status transitions, fingerprint persisted, event recorded", async () => {
    const { runtime } = fakeRuntime();
    const pm = new ProfileManager(db, runtime, cfg);
    const p = db.createProfile({ name: "a" });
    await pm.start("a");
    expect(db.getProfileById(p.id)!.status).toBe("running");
    expect(db.getFingerprint(p.id)).toEqual({ fake: true });
    expect(pm.isRunning("a")).toBe(true);
    expect(db.listEvents(p.id).map((e) => e.type)).toContain("profile.started");
  });

  it("reuses the stored fingerprint on subsequent starts", async () => {
    const { runtime } = fakeRuntime();
    const pm = new ProfileManager(db, runtime, cfg);
    const p = db.createProfile({ name: "a" });
    db.setFingerprint(p.id, { pinned: 1 });
    await pm.start("a");
    expect(db.getFingerprint(p.id)).toEqual({ pinned: 1 });
  });

  it("stop closes the browser and records the event", async () => {
    const { runtime } = fakeRuntime();
    const pm = new ProfileManager(db, runtime, cfg);
    const p = db.createProfile({ name: "a" });
    await pm.start("a");
    await pm.stop("a");
    expect(db.getProfileById(p.id)!.status).toBe("stopped");
    expect(pm.isRunning("a")).toBe(false);
    expect(db.listEvents(p.id).map((e) => e.type)).toContain("profile.stopped");
  });

  it("start is idempotent while running", async () => {
    const { runtime } = fakeRuntime();
    const pm = new ProfileManager(db, runtime, cfg);
    db.createProfile({ name: "a" });
    const h1 = await pm.start("a");
    const h2 = await pm.start("a");
    expect(h2).toBe(h1);
  });

  it("enforces maxProfiles with too_many_profiles", async () => {
    const { runtime } = fakeRuntime();
    const pm = new ProfileManager(db, runtime, cfg);
    db.createProfile({ name: "a" });
    db.createProfile({ name: "b" });
    db.createProfile({ name: "c" });
    await pm.start("a");
    await pm.start("b");
    await expect(pm.start("c")).rejects.toMatchObject({ code: "too_many_profiles", status: 429 });
  });

  it("launch failure → stopped + crashed event + browser_launch_failed", async () => {
    const { runtime } = fakeRuntime({ failStart: true });
    const pm = new ProfileManager(db, runtime, cfg);
    const p = db.createProfile({ name: "a" });
    await expect(pm.start("a")).rejects.toMatchObject({ code: "browser_launch_failed" });
    expect(db.getProfileById(p.id)!.status).toBe("stopped");
  });

  it("launch timeout → browser_launch_failed", async () => {
    const { runtime } = fakeRuntime({ hang: true });
    const pm = new ProfileManager(db, runtime, cfg);
    db.createProfile({ name: "a" });
    await expect(pm.start("a")).rejects.toMatchObject({ code: "browser_launch_failed" });
  });

  it("unexpected browser exit → crash event + stopped", async () => {
    const { runtime, started } = fakeRuntime();
    const pm = new ProfileManager(db, runtime, cfg);
    const p = db.createProfile({ name: "a" });
    await pm.start("a");
    started[0].close(); // simulate the process dying
    await new Promise((r) => setTimeout(r, 10));
    expect(db.getProfileById(p.id)!.status).toBe("stopped");
    expect(db.listEvents(p.id).map((e) => e.type)).toContain("profile.crashed");
    expect(pm.isRunning("a")).toBe(false);
  });

  it("unknown profile → profile_not_found", async () => {
    const { runtime } = fakeRuntime();
    const pm = new ProfileManager(db, runtime, cfg);
    await expect(pm.start("nope")).rejects.toMatchObject({ code: "profile_not_found", status: 404 });
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/server/profiles.ts`:**

```ts
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "@/server/config";
import { config } from "@/server/config";
import type { MorrowDb, Profile } from "@/server/db";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";
import { globalSingleton } from "@/server/global";
import type { BrowserRuntime, RunningBrowser } from "@/server/browser/runtime";
import { CamoufoxRuntime } from "@/server/browser/camoufox";

export interface RunningProfile {
  profile: Profile;
  browser: RunningBrowser;
  startedAt: Date;
}

export class ProfileManager {
  private running = new Map<string, RunningProfile>(); // key: profile id
  private starting = new Set<string>();
  private stopping = new Set<string>();

  constructor(
    private db: MorrowDb,
    private runtime: BrowserRuntime,
    private cfg: Pick<Config, "dataDir" | "maxProfiles" | "launchTimeoutMs">
  ) {}

  private mustGet(name: string): Profile {
    const p = this.db.getProfileByName(name);
    if (!p) throw new ApiError("profile_not_found", `No profile named ${JSON.stringify(name)}`, 404);
    return p;
  }

  isRunning(name: string): boolean {
    const p = this.db.getProfileByName(name);
    return !!p && this.running.has(p.id);
  }

  getRunning(name: string): RunningProfile | undefined {
    const p = this.db.getProfileByName(name);
    return p ? this.running.get(p.id) : undefined;
  }

  runningCount(): number {
    return this.running.size;
  }

  async start(name: string): Promise<RunningProfile> {
    const profile = this.mustGet(name);
    const existing = this.running.get(profile.id);
    if (existing) return existing;
    if (this.starting.has(profile.id) || this.stopping.has(profile.id))
      throw new ApiError("profile_busy", `Profile ${name} is ${this.starting.has(profile.id) ? "starting" : "stopping"}`, 409);
    if (this.running.size >= this.cfg.maxProfiles)
      throw new ApiError("too_many_profiles", `Limit of ${this.cfg.maxProfiles} running profiles reached`, 429);

    this.starting.add(profile.id);
    this.db.setProfileStatus(profile.id, "starting");
    try {
      let fingerprint = this.db.getFingerprint(profile.id);
      if (fingerprint === undefined) {
        fingerprint = this.runtime.generateFingerprint(profile);
        this.db.setFingerprint(profile.id, fingerprint);
      }
      const profileDir = this.profileDir(profile.id);
      mkdirSync(profileDir, { recursive: true });

      const browser = await this.withTimeout(
        this.runtime.start(profile, { profileDir, fingerprint }),
        this.cfg.launchTimeoutMs
      );

      const rp: RunningProfile = { profile, browser, startedAt: new Date() };
      this.running.set(profile.id, rp);
      this.db.setProfileStatus(profile.id, "running");
      this.db.recordEvent(profile.id, "profile.started");

      void browser.closed.then(() => {
        if (this.running.delete(profile.id) && !this.stopping.has(profile.id)) {
          this.db.setProfileStatus(profile.id, "stopped");
          this.db.recordEvent(profile.id, "profile.crashed");
        }
      });
      return rp;
    } catch (err) {
      this.db.setProfileStatus(profile.id, "stopped");
      this.db.recordEvent(profile.id, "profile.crashed", {
        message: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof ApiError) throw err;
      throw new ApiError("browser_launch_failed", "Browser failed to launch", 500);
    } finally {
      this.starting.delete(profile.id);
    }
  }

  async stop(name: string): Promise<void> {
    const profile = this.mustGet(name);
    const rp = this.running.get(profile.id);
    if (!rp) return; // already stopped — idempotent
    this.stopping.add(profile.id);
    this.db.setProfileStatus(profile.id, "stopping");
    try {
      await rp.browser.close();
      await rp.browser.closed;
    } finally {
      this.running.delete(profile.id);
      this.stopping.delete(profile.id);
      this.db.setProfileStatus(profile.id, "stopped");
      this.db.recordEvent(profile.id, "profile.stopped");
    }
  }

  private profileDir(profileId: string): string {
    return join(this.cfg.dataDir, "profiles", profileId);
  }

  private async withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let timer!: NodeJS.Timeout;
    try {
      return await Promise.race([
        p,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`launch timed out after ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Process-wide manager (shared across Next and custom-server bundles). */
export function getProfileManager(): ProfileManager {
  return globalSingleton("profileManager", () => {
    const cfg = config();
    return new ProfileManager(getDb(cfg.dataDir), new CamoufoxRuntime(), cfg);
  });
}
```

Note: the crash-event data intentionally records `err.message` in the EVENT LOG (server-side, authenticated) — that is not the API error envelope, which stays redacted.

- [ ] **Step 4: Run — PASS. Full suite + typecheck.**
- [ ] **Step 5: Commit** — `feat: profile manager with lifecycle, timeout, and crash detection`

---

### Task 6: REST — profiles CRUD

**Files:**
- Create: `src/app/api/v1/profiles/route.ts`, `src/app/api/v1/profiles/[name]/route.ts`, `src/server/validation.ts`, `src/server/serialize.ts`
- Test: `tests/unit/profiles-api.test.ts`
- Modify: `package.json` (add zod)

Note: Next.js validates route-file exports at build time — route.ts may only export handlers/route config, so the shared `profileJson` serializer lives in `src/server/serialize.ts`, never in a route file.

- [ ] **Step 1: `npm install zod`**

- [ ] **Step 2: Failing tests** `tests/unit/profiles-api.test.ts` — route handlers are plain functions; call them with `Request` objects. Use a temp dataDir so `getDb` binds to a scratch file, and stub env before importing anything that touches config:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "morrow-api-"));
  vi.stubEnv("MORROW_API_KEY", "secret");
  vi.stubEnv("MORROW_DATA_DIR", dir);
  (globalThis as Record<string, unknown>).__morrow = {}; // reset singletons per test
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

const auth = { authorization: "Bearer secret" };

async function POST_profiles(body: unknown) {
  const { POST } = await import("@/app/api/v1/profiles/route");
  return POST(new Request("http://x/api/v1/profiles", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("POST /profiles", () => {
  it("creates a profile", async () => {
    const res = await POST_profiles({ name: "x-marketing", locale: "en-US" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("x-marketing");
    expect(json.status).toBe("stopped");
    expect(json.id).toMatch(/^prof_/);
  });

  it("rejects invalid names", async () => {
    const res = await POST_profiles({ name: "Bad Name!" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_request");
  });

  it("rejects duplicates with profile_exists", async () => {
    await POST_profiles({ name: "a" });
    const res = await POST_profiles({ name: "a" });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("profile_exists");
  });

  it("requires auth", async () => {
    const { POST } = await import("@/app/api/v1/profiles/route");
    const res = await POST(new Request("http://x/api/v1/profiles", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });
});

describe("GET /profiles + /profiles/:name", () => {
  it("lists and gets", async () => {
    await POST_profiles({ name: "a" });
    const { GET } = await import("@/app/api/v1/profiles/route");
    const list = await GET(new Request("http://x/api/v1/profiles", { headers: auth }));
    expect((await list.json()).profiles.map((p: { name: string }) => p.name)).toEqual(["a"]);

    const { GET: GET_ONE } = await import("@/app/api/v1/profiles/[name]/route");
    const one = await GET_ONE(new Request("http://x/api/v1/profiles/a", { headers: auth }), {
      params: Promise.resolve({ name: "a" }),
    });
    expect((await one.json()).name).toBe("a");
    const missing = await GET_ONE(new Request("http://x/api/v1/profiles/zz", { headers: auth }), {
      params: Promise.resolve({ name: "zz" }),
    });
    expect(missing.status).toBe(404);
  });
});

describe("PATCH + DELETE /profiles/:name", () => {
  it("updates config", async () => {
    await POST_profiles({ name: "a" });
    const { PATCH } = await import("@/app/api/v1/profiles/[name]/route");
    const res = await PATCH(
      new Request("http://x/api/v1/profiles/a", {
        method: "PATCH",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ proxy: "http://u:p@h:1" }),
      }),
      { params: Promise.resolve({ name: "a" }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).proxy).toBe("http://u:p@h:1");
  });

  it("deletes a stopped profile", async () => {
    await POST_profiles({ name: "a" });
    const { DELETE } = await import("@/app/api/v1/profiles/[name]/route");
    const res = await DELETE(new Request("http://x/api/v1/profiles/a", { method: "DELETE", headers: auth }), {
      params: Promise.resolve({ name: "a" }),
    });
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 3: Run — FAIL.**

- [ ] **Step 4: Implement `src/server/validation.ts`:**

```ts
import { z } from "zod";
import { ApiError } from "@/server/errors";

export const profileName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "lowercase letters, digits and dashes; must start alphanumeric");

export const createProfileSchema = z.object({
  name: profileName,
  proxy: z.string().min(1).optional(),
  locale: z.string().min(2).optional(),
  timezone: z.string().min(1).optional(),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
});

export const updateProfileSchema = z.object({
  proxy: z.string().min(1).nullable().optional(),
  locale: z.string().min(2).nullable().optional(),
  timezone: z.string().min(1).nullable().optional(),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
});

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("invalid_request", "Body must be JSON", 400);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiError("invalid_request", `${first.path.join(".") || "body"}: ${first.message}`, 400);
  }
  return result.data;
}
```

- [ ] **Step 5: Implement `src/server/serialize.ts`:**

```ts
import type { Profile } from "@/server/db";

export function profileJson(p: Profile, running: boolean) {
  return {
    id: p.id,
    name: p.name,
    status: running ? "running" : p.status,
    proxy: p.proxy,
    locale: p.locale,
    timezone: p.timezone,
    viewport: p.viewportWidth && p.viewportHeight ? { width: p.viewportWidth, height: p.viewportHeight } : null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
```

Then `src/app/api/v1/profiles/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";
import { getProfileManager } from "@/server/profiles";
import { profileJson } from "@/server/serialize";
import { createProfileSchema, parseBody } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(() => {
    const db = getDb(config().dataDir);
    const pm = getProfileManager();
    return NextResponse.json({ profiles: db.listProfiles().map((p) => profileJson(p, pm.isRunning(p.name))) });
  });
}

export async function POST(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const body = await parseBody(req, createProfileSchema);
    const db = getDb(config().dataDir);
    if (db.getProfileByName(body.name)) throw new ApiError("profile_exists", `Profile ${body.name} already exists`, 409);
    const p = db.createProfile({
      name: body.name,
      proxy: body.proxy,
      locale: body.locale,
      timezone: body.timezone,
      viewportWidth: body.viewport?.width,
      viewportHeight: body.viewport?.height,
    });
    db.recordEvent(p.id, "profile.created");
    return NextResponse.json(profileJson(p, false), { status: 201 });
  });
}
```

- [ ] **Step 6: Implement `src/app/api/v1/profiles/[name]/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb, type Profile } from "@/server/db";
import { ApiError } from "@/server/errors";
import { getProfileManager } from "@/server/profiles";
import { profileJson } from "@/server/serialize";
import { updateProfileSchema, parseBody } from "@/server/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

function mustGet(name: string): Profile {
  const p = getDb(config().dataDir).getProfileByName(name);
  if (!p) throw new ApiError("profile_not_found", `No profile named ${JSON.stringify(name)}`, 404);
  return p;
}

export async function GET(req: Request, ctx: Ctx) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const { name } = await ctx.params;
    const p = mustGet(name);
    return NextResponse.json(profileJson(p, getProfileManager().isRunning(name)));
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const { name } = await ctx.params;
    const p = mustGet(name);
    const body = await parseBody(req, updateProfileSchema);
    const db = getDb(config().dataDir);
    db.updateProfile(p.id, {
      ...("proxy" in body ? { proxy: body.proxy ?? null } : {}),
      ...("locale" in body ? { locale: body.locale ?? null } : {}),
      ...("timezone" in body ? { timezone: body.timezone ?? null } : {}),
      ...(body.viewport ? { viewportWidth: body.viewport.width, viewportHeight: body.viewport.height } : {}),
    });
    return NextResponse.json(profileJson(db.getProfileByName(name)!, getProfileManager().isRunning(name)));
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const { name } = await ctx.params;
    const p = mustGet(name);
    if (getProfileManager().isRunning(name))
      throw new ApiError("profile_not_stopped", "Stop the profile before deleting it", 409);
    const cfg = config();
    getDb(cfg.dataDir).deleteProfile(p.id);
    rmSync(join(cfg.dataDir, "profiles", p.id), { recursive: true, force: true });
    return new NextResponse(null, { status: 204 });
  });
}
```

(If Next 16 route-handler context types differ from `{ params: Promise<...> }`, match the installed version's convention — check an existing typed example or `.next/types` after a build — and mirror it in the tests.)

- [ ] **Step 7: Run — PASS. Full suite + typecheck + build.**
- [ ] **Step 8: Commit** — `feat: profiles crud api with zod validation`

---

### Task 7: REST — lifecycle, clone/reset, events

**Files:**
- Create: `src/app/api/v1/profiles/[name]/start/route.ts`, `.../stop/route.ts`, `.../clone/route.ts`, `.../reset/route.ts`, `.../events/route.ts`
- Test: `tests/unit/lifecycle-api.test.ts`

- [ ] **Step 1: Failing tests** `tests/unit/lifecycle-api.test.ts`. Same env-stub/reset pattern as Task 6 (temp dir, `__morrow = {}`), PLUS a fake runtime injected by pre-seeding the singleton store before route import:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProfileManager } from "@/server/profiles";
import { openDb } from "@/server/db";
import type { BrowserRuntime, RunningBrowser } from "@/server/browser/runtime";

let dir: string;
const auth = { authorization: "Bearer secret" };

function fakeRuntime(): BrowserRuntime {
  return {
    generateFingerprint: () => ({ fake: true }),
    async start(): Promise<RunningBrowser> {
      let resolveClosed!: () => void;
      const closed = new Promise<void>((r) => (resolveClosed = r));
      return { context: {} as RunningBrowser["context"], closed, close: async () => resolveClosed() };
    },
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "morrow-lc-"));
  vi.stubEnv("MORROW_API_KEY", "secret");
  vi.stubEnv("MORROW_DATA_DIR", dir);
  const db = openDb(`${dir}/morrow.db`);
  const store: Record<string, unknown> = {};
  store["db"] = db;
  store["profileManager"] = new ProfileManager(db, fakeRuntime(), {
    dataDir: dir,
    maxProfiles: 5,
    launchTimeoutMs: 1000,
  });
  (globalThis as Record<string, unknown>).__morrow = store;
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

async function createProfile(name: string) {
  const { POST } = await import("@/app/api/v1/profiles/route");
  return POST(new Request("http://x/api/v1/profiles", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ name }),
  }));
}

function call(mod: Promise<{ POST: (r: Request, c: { params: Promise<{ name: string }> }) => Promise<Response> }>, name: string) {
  return mod.then(({ POST }) =>
    POST(new Request(`http://x/api/v1/profiles/${name}/x`, { method: "POST", headers: auth }), {
      params: Promise.resolve({ name }),
    })
  );
}

describe("lifecycle routes", () => {
  it("start → running, stop → stopped", async () => {
    await createProfile("a");
    const started = await call(import("@/app/api/v1/profiles/[name]/start/route"), "a");
    expect(started.status).toBe(200);
    expect((await started.json()).status).toBe("running");

    const stopped = await call(import("@/app/api/v1/profiles/[name]/stop/route"), "a");
    expect(stopped.status).toBe(200);
    expect((await stopped.json()).status).toBe("stopped");
  });

  it("events endpoint returns the timeline", async () => {
    await createProfile("a");
    await call(import("@/app/api/v1/profiles/[name]/start/route"), "a");
    const { GET } = await import("@/app/api/v1/profiles/[name]/events/route");
    const res = await GET(new Request("http://x/api/v1/profiles/a/events", { headers: auth }), {
      params: Promise.resolve({ name: "a" }),
    });
    const { events } = await res.json();
    expect(events.map((e: { type: string }) => e.type)).toEqual(["profile.created", "profile.started"]);
  });

  it("clone copies the profile dir and row", async () => {
    await createProfile("a");
    const db = ((globalThis as Record<string, unknown>).__morrow as Record<string, unknown>)["db"] as import("@/server/db").MorrowDb;
    const src = db.getProfileByName("a")!;
    mkdirSync(join(dir, "profiles", src.id), { recursive: true });
    writeFileSync(join(dir, "profiles", src.id, "cookies.sqlite"), "fake");

    const { POST } = await import("@/app/api/v1/profiles/[name]/clone/route");
    const res = await POST(
      new Request("http://x/api/v1/profiles/a/clone", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ name: "a-clone" }),
      }),
      { params: Promise.resolve({ name: "a" }) }
    );
    expect(res.status).toBe(201);
    const clone = db.getProfileByName("a-clone")!;
    expect(existsSync(join(dir, "profiles", clone.id, "cookies.sqlite"))).toBe(true);
    expect(db.getFingerprint(clone.id)).toBeUndefined(); // clone gets a NEW identity by default
  });

  it("reset wipes the profile dir but keeps the row", async () => {
    await createProfile("a");
    const db = ((globalThis as Record<string, unknown>).__morrow as Record<string, unknown>)["db"] as import("@/server/db").MorrowDb;
    const p = db.getProfileByName("a")!;
    mkdirSync(join(dir, "profiles", p.id), { recursive: true });
    writeFileSync(join(dir, "profiles", p.id, "cookies.sqlite"), "fake");

    const { POST } = await import("@/app/api/v1/profiles/[name]/reset/route");
    const res = await POST(new Request("http://x/api/v1/profiles/a/reset", { method: "POST", headers: auth }), {
      params: Promise.resolve({ name: "a" }),
    });
    expect(res.status).toBe(200);
    expect(existsSync(join(dir, "profiles", p.id, "cookies.sqlite"))).toBe(false);
    expect(db.getProfileByName("a")).toBeDefined();
  });

  it("clone/reset refuse while running", async () => {
    await createProfile("a");
    await call(import("@/app/api/v1/profiles/[name]/start/route"), "a");
    const reset = await call(import("@/app/api/v1/profiles/[name]/reset/route"), "a");
    expect(reset.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement the five routes.** All follow the same shape; start/stop:

`src/app/api/v1/profiles/[name]/start/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { getProfileManager } from "@/server/profiles";
import { profileJson } from "@/server/serialize";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ name: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const { name } = await ctx.params;
    await getProfileManager().start(name);
    return NextResponse.json(profileJson(getDb(config().dataDir).getProfileByName(name)!, true));
  });
}
```

`.../stop/route.ts` — same but `await getProfileManager().stop(name)` and `profileJson(..., false)`.

`.../events/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ name: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const { name } = await ctx.params;
    const db = getDb(config().dataDir);
    const p = db.getProfileByName(name);
    if (!p) throw new ApiError("profile_not_found", `No profile named ${JSON.stringify(name)}`, 404);
    const limitRaw = new URL(req.url).searchParams.get("limit");
    const limit = Math.max(1, Math.min(limitRaw ? parseInt(limitRaw, 10) || 200 : 200, 1000));
    return NextResponse.json({ events: db.listEvents(p.id, limit) });
  });
}
```

`.../clone/route.ts` (new identity by default — copies browser state, NOT the fingerprint):
```ts
import { NextResponse } from "next/server";
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";
import { getProfileManager } from "@/server/profiles";
import { profileJson } from "@/server/serialize";
import { parseBody, createProfileSchema } from "@/server/validation";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ name: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const { name } = await ctx.params;
    const cfg = config();
    const db = getDb(cfg.dataDir);
    const src = db.getProfileByName(name);
    if (!src) throw new ApiError("profile_not_found", `No profile named ${JSON.stringify(name)}`, 404);
    if (getProfileManager().isRunning(name))
      throw new ApiError("profile_not_stopped", "Stop the profile before cloning it", 409);
    const body = await parseBody(req, createProfileSchema.pick({ name: true }));
    if (db.getProfileByName(body.name)) throw new ApiError("profile_exists", `Profile ${body.name} already exists`, 409);

    const clone = db.createProfile({
      name: body.name,
      proxy: src.proxy ?? undefined,
      locale: src.locale ?? undefined,
      timezone: src.timezone ?? undefined,
      viewportWidth: src.viewportWidth ?? undefined,
      viewportHeight: src.viewportHeight ?? undefined,
    });
    const srcDir = join(cfg.dataDir, "profiles", src.id);
    if (existsSync(srcDir)) cpSync(srcDir, join(cfg.dataDir, "profiles", clone.id), { recursive: true });
    db.recordEvent(clone.id, "profile.created", { clonedFrom: src.name });
    return NextResponse.json(profileJson(clone, false), { status: 201 });
  });
}
```

`.../reset/route.ts`:
```ts
import { NextResponse } from "next/server";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";
import { getProfileManager } from "@/server/profiles";
import { profileJson } from "@/server/serialize";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ name: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const { name } = await ctx.params;
    const cfg = config();
    const db = getDb(cfg.dataDir);
    const p = db.getProfileByName(name);
    if (!p) throw new ApiError("profile_not_found", `No profile named ${JSON.stringify(name)}`, 404);
    if (getProfileManager().isRunning(name))
      throw new ApiError("profile_not_stopped", "Stop the profile before resetting it", 409);
    rmSync(join(cfg.dataDir, "profiles", p.id), { recursive: true, force: true });
    db.recordEvent(p.id, "profile.reset");
    return NextResponse.json(profileJson(db.getProfileByName(name)!, false));
  });
}
```

- [ ] **Step 4: Run — PASS. Full suite + typecheck + build.**
- [ ] **Step 5: Commit** — `feat: profile lifecycle, clone, reset and events api`

---

### Task 8: Integration test — the persistence promise

**Files:**
- Create: `tests/integration/persistence.test.ts`
- Modify: `package.json` (script), `.github/workflows/ci.yml` (camoufox cache + integration job)

- [ ] **Step 1: Write `tests/integration/persistence.test.ts`** (real Camoufox; skipped unless opted in):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type MorrowDb } from "@/server/db";
import { ProfileManager } from "@/server/profiles";
import { CamoufoxRuntime } from "@/server/browser/camoufox";

const enabled = process.env.MORROW_IT === "1";

describe.runIf(enabled)("persistence across restart (real camoufox)", () => {
  let dir: string;
  let db: MorrowDb;
  let pm: ProfileManager;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "morrow-it-"));
    db = openDb(`${dir}/morrow.db`);
    pm = new ProfileManager(db, new CamoufoxRuntime(), {
      dataDir: dir,
      maxProfiles: 2,
      launchTimeoutMs: 120_000,
    });
  });

  afterAll(async () => {
    await pm.stop("it").catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  });

  it("a cookie set before stop is still there after restart", async () => {
    db.createProfile({ name: "it" });

    const run1 = await pm.start("it");
    await run1.browser.context.addCookies([
      { name: "morrow_it", value: "remembered", domain: "example.com", path: "/", expires: Math.floor(Date.now() / 1000) + 3600 },
    ]);
    // Firefox flushes cookies.sqlite on clean shutdown
    await pm.stop("it");

    const run2 = await pm.start("it");
    const cookies = await run2.browser.context.cookies("https://example.com");
    await pm.stop("it");

    expect(cookies.map((c) => `${c.name}=${c.value}`)).toContain("morrow_it=remembered");
  }, 300_000);

  it("fingerprint is identical across restarts", async () => {
    const before = db.getFingerprint(db.getProfileByName("it")!.id);
    const run = await pm.start("it");
    const ua = await run.browser.context.pages()[0]?.evaluate?.(() => navigator.userAgent);
    await pm.stop("it");
    expect(db.getFingerprint(db.getProfileByName("it")!.id)).toEqual(before);
    if (ua !== undefined) expect(typeof ua).toBe("string");
  }, 300_000);
});
```

(If the persistent context opens no initial page, `pages()[0]` is undefined — the optional chain handles it; the fingerprint-stability assertion is the DB equality, which is the real invariant.)

- [ ] **Step 2: Add script to `package.json`:** `"test:integration": "MORROW_IT=1 vitest run tests/integration --testTimeout=300000"`

- [ ] **Step 3: Run locally:** `npm run test:integration` — expect 2 passed (slow; camoufox already fetched locally).

- [ ] **Step 4: Extend `.github/workflows/ci.yml`** — append a job:

```yaml
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - uses: actions/cache@v4
        with:
          path: ~/.cache/camoufox
          key: camoufox-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
      - run: npx camoufox-js fetch
      - run: npm run test:integration
```

- [ ] **Step 5: Commit** — `test: persistence-across-restart integration suite with ci job`

---

### Task 9: Docs touch-up + release

- [ ] **Step 1:** Update `README.md` — add a "Profiles API" section: create/start/stop curl examples (bearer key), one sentence on persistence semantics.
- [ ] **Step 2:** Bump `package.json` version to `0.2.0`. Run full gates: `npm test && npm run typecheck && npm run build`.
- [ ] **Step 3: Commit** — `chore: release v0.2.0` — merge to main, tag `v0.2.0`, push, verify CI + Release actions green.

---

## Acceptance for Plan 2

- All unit suites green; build green.
- Integration proof: cookie set → stop → start → cookie present (real Camoufox), fingerprint JSON unchanged across restarts.
- REST: create/list/get/patch/delete/start/stop/clone/reset/events all functional with correct error codes (`profile_not_found` 404, `profile_exists` 409, `profile_not_stopped` 409, `too_many_profiles` 429, `browser_launch_failed` 500, `invalid_request` 400).
- `docs/notes/attach-spike.md` contains real experimental results + a Plan 3 recommendation.
- `ghcr.io/jekyo/morrow:0.2.0` published.
