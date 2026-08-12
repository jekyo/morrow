import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type MorrowDb } from "@/server/db";

let db: MorrowDb;
beforeEach(() => {
  db = openDb(":memory:");
});

describe("profiles", () => {
  it("creates and fetches a profile by name", () => {
    const p = db.createProfile({ name: "x-marketing" });
    expect(p.id).toMatch(/^prof_/);
    expect(p.status).toBe("stopped");
    expect(p.fingerprintSeed).toBeTruthy();
    expect(db.getProfileByName("x-marketing")?.id).toBe(p.id);
  });

  it("rejects duplicate names", () => {
    db.createProfile({ name: "a" });
    expect(() => db.createProfile({ name: "a" })).toThrow();
  });

  it("updates status and counts running", () => {
    const p = db.createProfile({ name: "a" });
    db.createProfile({ name: "b" });
    db.setProfileStatus(p.id, "running");
    expect(db.countRunningProfiles()).toBe(1);
    expect(db.listProfiles().map((x) => x.name)).toEqual(["a", "b"]);
  });
});

describe("events", () => {
  it("records and lists events newest-last", () => {
    const p = db.createProfile({ name: "a" });
    db.recordEvent(p.id, "profile.started", { pid: 1 });
    db.recordEvent(p.id, "page.navigation", { url: "https://x.com" });
    const events = db.listEvents(p.id);
    expect(events.map((e) => e.type)).toEqual(["profile.started", "page.navigation"]);
    expect(events[1].data).toEqual({ url: "https://x.com" });
  });
});

describe("activitySeries", () => {
  it("buckets events by day, filling gaps with zero", () => {
    const p = db.createProfile({ name: "a" });
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const yesterday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
    const yesterdayKey = yesterday.toISOString().slice(0, 10);

    db.recordEvent(p.id, "session.connected", undefined, `${yesterdayKey} 10:00:00`);
    db.recordEvent(p.id, "profile.started", undefined, `${yesterdayKey} 10:05:00`);
    db.recordEvent(p.id, "profile.started", undefined, `${todayKey} 09:00:00`);
    db.recordEvent(p.id, "session.connected", undefined, `${todayKey} 09:01:00`);
    db.recordEvent(p.id, "session.connected", undefined, `${todayKey} 09:02:00`);
    db.recordEvent(p.id, "page.navigation", undefined, `${todayKey} 09:03:00`);

    const series = db.activitySeries(7);
    expect(series).toHaveLength(7);
    expect(series[series.length - 1].date).toBe(todayKey);
    expect(series[series.length - 2].date).toBe(yesterdayKey);

    const yesterdayBucket = series.find((s) => s.date === yesterdayKey)!;
    expect(yesterdayBucket).toEqual({ date: yesterdayKey, sessions: 1, starts: 1, total: 2 });

    const todayBucket = series.find((s) => s.date === todayKey)!;
    expect(todayBucket).toEqual({ date: todayKey, sessions: 2, starts: 1, total: 4 });

    // Days with no events are still present, zero-filled — continuous axis.
    const oldest = series[0];
    expect(oldest).toEqual({ date: oldest.date, sessions: 0, starts: 0, total: 0 });
  });

  it("defaults to 7 days and handles a fresh db with no events", () => {
    const series = db.activitySeries();
    expect(series).toHaveLength(7);
    for (const bucket of series) {
      expect(bucket).toMatchObject({ sessions: 0, starts: 0, total: 0 });
      expect(bucket.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("supports a custom window size", () => {
    expect(db.activitySeries(1)).toHaveLength(1);
    expect(db.activitySeries(30)).toHaveLength(30);
  });
});

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

  it("closeAllSessions closes every open session (boot reconciliation)", () => {
    const p = db.createProfile({ name: "a" });
    db.createSession(p.id, "playwright");
    db.createSession(p.id, "viewer");
    db.closeAllSessions();
    expect(db.listActiveSessions()).toHaveLength(0);
  });
});
