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
