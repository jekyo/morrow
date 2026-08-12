import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "@/server/config";
import { config } from "@/server/config";
import type { MorrowDb, Profile } from "@/server/db";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";
import { globalSingleton } from "@/server/global";
import type { BrowserRuntime, RunningBrowser } from "@/server/browser/runtime";
import { CamoufoxRuntime } from "@/server/browser/camoufox";

export interface RunningProfile {
  profile: Profile;
  browser: RunningBrowser;
  startedAt: Date;
}

/**
 * Stored fingerprint blobs are opaque to ProfileManager, but v0.2.0 changed
 * their shape from a bare fingerprint to `{ fingerprint, seeds }` (seeds pin
 * camoufox's per-launch audio/canvas/font randomization — see
 * src/server/browser/camoufox.ts). No release shipped the old shape, so this
 * only guards dev machines that started a profile before the format changed.
 */
function hasSeeds(fp: unknown): boolean {
  return (
    typeof fp === "object" &&
    fp !== null &&
    "seeds" in fp &&
    typeof (fp as { seeds?: unknown }).seeds === "object" &&
    (fp as { seeds?: unknown }).seeds !== null
  );
}

export class ProfileManager {
  private running = new Map<string, RunningProfile>(); // key: profile id
  private starting = new Set<string>();
  private stopping = new Set<string>();

  constructor(
    private db: MorrowDb,
    private runtime: BrowserRuntime,
    private cfg: Pick<Config, "dataDir" | "maxProfiles" | "launchTimeoutMs">
  ) {}

  private mustGet(name: string): Profile {
    const p = this.db.getProfileByName(name);
    if (!p) throw new ApiError("profile_not_found", `No profile named ${JSON.stringify(name)}`, 404);
    return p;
  }

  isRunning(name: string): boolean {
    const p = this.db.getProfileByName(name);
    return !!p && this.running.has(p.id);
  }

  getRunning(name: string): RunningProfile | undefined {
    const p = this.db.getProfileByName(name);
    return p ? this.running.get(p.id) : undefined;
  }

  runningCount(): number {
    return this.running.size;
  }

  async start(name: string): Promise<RunningProfile> {
    const profile = this.mustGet(name);
    const existing = this.running.get(profile.id);
    if (existing) return existing;
    if (this.starting.has(profile.id) || this.stopping.has(profile.id))
      throw new ApiError(
        "profile_busy",
        `Profile ${name} is ${this.starting.has(profile.id) ? "starting" : "stopping"}`,
        409
      );
    if (this.running.size >= this.cfg.maxProfiles)
      throw new ApiError("too_many_profiles", `Limit of ${this.cfg.maxProfiles} running profiles reached`, 429);

    this.starting.add(profile.id);
    this.db.setProfileStatus(profile.id, "starting");
    try {
      let fingerprint = this.db.getFingerprint(profile.id);
      if (!hasSeeds(fingerprint)) {
        fingerprint = this.runtime.generateFingerprint(profile);
        this.db.setFingerprint(profile.id, fingerprint);
      }
      const profileDir = this.profileDir(profile.id);
      mkdirSync(profileDir, { recursive: true });

      const browser = await this.withTimeout(
        this.runtime.start(profile, { profileDir, fingerprint }),
        this.cfg.launchTimeoutMs
      );

      const rp: RunningProfile = { profile, browser, startedAt: new Date() };
      this.running.set(profile.id, rp);
      this.db.setProfileStatus(profile.id, "running");
      this.db.recordEvent(profile.id, "profile.started");

      void browser.closed.then(() => {
        if (this.running.delete(profile.id) && !this.stopping.has(profile.id)) {
          this.db.setProfileStatus(profile.id, "stopped");
          this.db.recordEvent(profile.id, "profile.crashed");
        }
      });
      return rp;
    } catch (err) {
      this.db.setProfileStatus(profile.id, "stopped");
      this.db.recordEvent(profile.id, "profile.crashed", {
        message: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof ApiError) throw err;
      throw new ApiError("browser_launch_failed", "Browser failed to launch", 500);
    } finally {
      this.starting.delete(profile.id);
    }
  }

  async stop(name: string): Promise<void> {
    const profile = this.mustGet(name);
    const rp = this.running.get(profile.id);
    if (!rp) return; // already stopped — idempotent
    this.stopping.add(profile.id);
    this.db.setProfileStatus(profile.id, "stopping");
    try {
      await rp.browser.close();
      await rp.browser.closed;
    } finally {
      this.running.delete(profile.id);
      this.stopping.delete(profile.id);
      this.db.setProfileStatus(profile.id, "stopped");
      this.db.recordEvent(profile.id, "profile.stopped");
    }
  }

  private profileDir(profileId: string): string {
    return join(this.cfg.dataDir, "profiles", profileId);
  }

  private async withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let timer!: NodeJS.Timeout;
    try {
      return await Promise.race([
        p,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`launch timed out after ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Process-wide manager (shared across Next and custom-server bundles). */
export function getProfileManager(): ProfileManager {
  return globalSingleton("profileManager", () => {
    const cfg = config();
    return new ProfileManager(getDb(cfg.dataDir), new CamoufoxRuntime(), cfg);
  });
}
