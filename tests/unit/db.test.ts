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
