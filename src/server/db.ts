import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { globalSingleton } from "@/server/global";

export type ProfileStatus = "stopped" | "starting" | "running" | "stopping";

export interface Profile {
  id: string;
  name: string;
  status: ProfileStatus;
  proxy: string | null;
  locale: string | null;
  timezone: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  fingerprintSeed: string;
  createdAt: string;
  updatedAt: string;
}

export interface MorrowEvent {
  id: number;
  profileId: string | null;
  type: string;
  data: unknown;
  createdAt: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'stopped',
  proxy TEXT,
  locale TEXT,
  timezone TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  fingerprint_seed TEXT NOT NULL,
  fingerprint TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  kind TEXT NOT NULL,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  disconnected_at TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT,
  type TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_profile ON events(profile_id, id);
`;

function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("base64url")}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToProfile(r: any): Profile {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    proxy: r.proxy,
    locale: r.locale,
    timezone: r.timezone,
    viewportWidth: r.viewport_width,
    viewportHeight: r.viewport_height,
    fingerprintSeed: r.fingerprint_seed,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface CreateProfileInput {
  name: string;
  proxy?: string;
  locale?: string;
  timezone?: string;
  viewportWidth?: number;
  viewportHeight?: number;
}

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

export class MorrowDb {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    migrate(this.db);
  }

  createProfile(input: CreateProfileInput): Profile {
    const profileId = id("prof");
    this.db
      .prepare(
        `INSERT INTO profiles (id, name, proxy, locale, timezone, viewport_width, viewport_height, fingerprint_seed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        profileId,
        input.name,
        input.proxy ?? null,
        input.locale ?? null,
        input.timezone ?? null,
        input.viewportWidth ?? null,
        input.viewportHeight ?? null,
        randomBytes(16).toString("hex")
      );
    return this.getProfileById(profileId)!;
  }

  getProfileById(profileId: string): Profile | undefined {
    const r = this.db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(profileId);
    return r ? rowToProfile(r) : undefined;
  }

  getProfileByName(name: string): Profile | undefined {
    const r = this.db.prepare(`SELECT * FROM profiles WHERE name = ?`).get(name);
    return r ? rowToProfile(r) : undefined;
  }

  listProfiles(): Profile[] {
    return this.db.prepare(`SELECT * FROM profiles ORDER BY name`).all().map(rowToProfile);
  }

  setProfileStatus(profileId: string, status: ProfileStatus): void {
    this.db
      .prepare(`UPDATE profiles SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, profileId);
  }

  countRunningProfiles(): number {
    const r = this.db
      .prepare(`SELECT COUNT(*) AS n FROM profiles WHERE status IN ('starting','running')`)
      .get() as { n: number };
    return r.n;
  }

  /** Boot reconciliation: container restarted, nothing is actually running. */
  resetRunningProfiles(): void {
    this.db.prepare(`UPDATE profiles SET status = 'stopped' WHERE status != 'stopped'`).run();
  }

  recordEvent(profileId: string | null, type: string, data?: unknown): void {
    this.db
      .prepare(`INSERT INTO events (profile_id, type, data) VALUES (?, ?, ?)`)
      .run(profileId, type, data === undefined ? null : JSON.stringify(data));
  }

  listEvents(profileId: string, limit = 200): MorrowEvent[] {
    return (
      this.db
        .prepare(`SELECT * FROM events WHERE profile_id = ? ORDER BY id DESC LIMIT ?`)
        .all(profileId, limit) as any[]
    )
      .reverse()
      .map((r) => ({
        id: r.id,
        profileId: r.profile_id,
        type: r.type,
        data: r.data === null ? undefined : JSON.parse(r.data),
        createdAt: r.created_at,
      }));
  }

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
}

export function openDb(path: string): MorrowDb {
  return new MorrowDb(path);
}

/** Process-wide database, stored at <dataDir>/morrow.db. */
export function getDb(dataDir: string): MorrowDb {
  return globalSingleton("db", () => new MorrowDb(`${dataDir}/morrow.db`));
}
