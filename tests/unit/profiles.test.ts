import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type MorrowDb } from "@/server/db";
import { ProfileManager } from "@/server/profiles";
import type { BrowserRuntime, RunningBrowser } from "@/server/browser/runtime";

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
        wsEndpoint: "ws://fake",
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
