import type { BrowserContext } from "playwright-core";
import type { Profile } from "@/server/db";

export interface RunningBrowser {
  /** The profile's persistent context (shared default context of the browser server). */
  context: BrowserContext;
  /** Playwright ws endpoint serving this persistent context (Plan 3 attach). */
  wsEndpoint: string;
  /**
   * localhost RFB port of this profile's x11vnc, when it launched headful into
   * a virtual display for the noVNC viewer; undefined if running headless.
   */
  vncPort?: number;
  /** Resolves when the browser exits — graceful close or crash alike. */
  closed: Promise<void>;
  close(): Promise<void>;
}

export interface BrowserRuntime {
  /** Generate the fingerprint that will pin this profile's identity. */
  generateFingerprint(profile: Profile): unknown;
  start(
    profile: Profile,
    opts: { profileDir: string; fingerprint: unknown; vnc?: boolean }
  ): Promise<RunningBrowser>;
}
