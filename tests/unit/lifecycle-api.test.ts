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
      return { context: {} as RunningBrowser["context"], wsEndpoint: "ws://fake", closed, close: async () => resolveClosed() };
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
