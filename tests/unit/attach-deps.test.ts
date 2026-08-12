import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type MorrowDb } from "@/server/db";
import { defaultAttachDeps } from "@/server/attach";

let dir: string;
let db: MorrowDb;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "morrow-attach-deps-"));
  vi.stubEnv("MORROW_API_KEY", "secret");
  vi.stubEnv("MORROW_DATA_DIR", dir);
  db = openDb(`${dir}/morrow.db`);
  (globalThis as Record<string, unknown>).__morrow = { db };
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as Record<string, unknown>).__morrow;
  rmSync(dir, { recursive: true, force: true });
});

/**
 * The production wiring behind the attach handler. Every other attach test
 * injects fake deps, so this is the only place the real session + event
 * recording is exercised (plan 3 acceptance: events include
 * session.connected/disconnected).
 */
describe("defaultAttachDeps", () => {
  it("opens a session and records session.connected", () => {
    const p = db.createProfile({ name: "a" });
    const sessionId = defaultAttachDeps().onConnect(p.id);

    const active = db.listActiveSessions();
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ id: sessionId, kind: "playwright", profileName: "a" });

    const ev = db.listEvents(p.id).find((e) => e.type === "session.connected");
    expect(ev).toBeTruthy();
    expect(ev!.data).toEqual({ sessionId, kind: "playwright" });
  });

  it("closes the session and records session.disconnected", () => {
    const p = db.createProfile({ name: "a" });
    const deps = defaultAttachDeps();
    const sessionId = deps.onConnect(p.id);

    deps.onDisconnect(p.id, sessionId);

    expect(db.listActiveSessions()).toHaveLength(0);
    const ev = db.listEvents(p.id).find((e) => e.type === "session.disconnected");
    expect(ev).toBeTruthy();
    expect(ev!.data).toEqual({ sessionId, kind: "playwright" });
  });
});
