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
