import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "@/server/db";

let dir: string;
const auth = { authorization: "Bearer secret" };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "morrow-metrics-"));
  vi.stubEnv("MORROW_API_KEY", "secret");
  vi.stubEnv("MORROW_DATA_DIR", dir);
  const db = openDb(`${dir}/morrow.db`);
  (globalThis as Record<string, unknown>).__morrow = { db };
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /metrics", () => {
  it("requires auth", async () => {
    const { GET } = await import("@/app/api/v1/metrics/route");
    const res = await GET(new Request("http://x/api/v1/metrics"));
    expect(res.status).toBe(401);
  });

  it("returns profile, session, scrape and system counts", async () => {
    const db = ((globalThis as Record<string, unknown>).__morrow as { db: import("@/server/db").MorrowDb }).db;
    const a = db.createProfile({ name: "a" });
    db.createProfile({ name: "b" });
    db.createSession(a.id, "playwright");
    const closed = db.createSession(a.id, "viewer");
    db.closeSession(closed.id);

    const { GET } = await import("@/app/api/v1/metrics/route");
    const res = await GET(new Request("http://x/api/v1/metrics", { headers: auth }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toMatchObject({
      profiles: { total: 2, running: 0 },
      sessions: { active: 1 },
      scrapes: { total24h: 0, failed24h: 0 },
    });
    expect(typeof body.system.memory).toBe("number");
    expect(body.system.memory).toBeGreaterThan(0);
    expect(typeof body.system.uptime).toBe("number");
    expect(body.system.uptime).toBeGreaterThanOrEqual(0);
  });

  it("includes a 7-day activity series with zero-filled gaps", async () => {
    const db = ((globalThis as Record<string, unknown>).__morrow as { db: import("@/server/db").MorrowDb }).db;
    const p = db.createProfile({ name: "a" });
    const today = new Date().toISOString().slice(0, 10);
    db.recordEvent(p.id, "profile.started", undefined, `${today} 08:00:00`);
    db.recordEvent(p.id, "session.connected", undefined, `${today} 08:01:00`);
    db.recordEvent(p.id, "session.connected", undefined, `${today} 08:02:00`);

    const { GET } = await import("@/app/api/v1/metrics/route");
    const res = await GET(new Request("http://x/api/v1/metrics", { headers: auth }));
    const body = await res.json();

    expect(Array.isArray(body.activity)).toBe(true);
    expect(body.activity).toHaveLength(7);
    for (const bucket of body.activity) {
      expect(bucket).toMatchObject({
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        sessions: expect.any(Number),
        starts: expect.any(Number),
        total: expect.any(Number),
      });
    }
    const todayBucket = body.activity[body.activity.length - 1];
    expect(todayBucket).toEqual({ date: today, sessions: 2, starts: 1, total: 3 });
  });

  it("counts running profiles separately from total", async () => {
    const db = ((globalThis as Record<string, unknown>).__morrow as { db: import("@/server/db").MorrowDb }).db;
    const p = db.createProfile({ name: "a" });
    db.setProfileStatus(p.id, "running");

    const { GET } = await import("@/app/api/v1/metrics/route");
    const res = await GET(new Request("http://x/api/v1/metrics", { headers: auth }));
    const body = await res.json();
    expect(body.profiles).toEqual({ total: 1, running: 1 });
  });
});
