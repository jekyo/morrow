import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
    // the server sees the socket close a tick after the client's close() resolves
    await vi.waitFor(() => expect(db.listActiveSessions()).toHaveLength(0), { timeout: 5_000 }); // session closed on disconnect

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
