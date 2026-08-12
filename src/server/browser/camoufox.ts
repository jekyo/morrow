import { launchServer } from "camoufox-js";
import { generateFingerprint } from "camoufox-js/dist/fingerprints.js";
import { firefox } from "playwright-core";
import type { Profile } from "@/server/db";
import type { BrowserRuntime, RunningBrowser } from "@/server/browser/runtime";

/**
 * The three properties camoufox-js's launchOptions() randomizes on EVERY
 * launch unless supplied via its `config` option (camoufox-js/dist/utils.js,
 * in launchOptions(), right after the browserforge fingerprint is merged in):
 *
 *   const randint = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
 *   const knownProperties = loadProperties(executable_path);
 *   for (const seed of ["fonts:spacing_seed", "audio:seed", "canvas:seed"]) {
 *       if (seed in knownProperties) {
 *           setInto(config, seed, randint(1, 4_294_967_295));
 *       }
 *   }
 *
 * `setInto` only sets a key if it's absent, so a caller-supplied `config`
 * value pins it. Without a pinned audio:seed/canvas:seed, every launch of the
 * "same" profile gets fresh audio/canvas noise and font-spacing jitter — a
 * "same machine, different identity every time" tell. We generate these the
 * same way (same range, same RNG) once per profile and persist them.
 */
export interface CamoufoxSeeds {
  "audio:seed": number;
  "canvas:seed": number;
  "fonts:spacing_seed": number;
}

/** What we persist per profile: the browserforge fingerprint plus the pinned seeds. */
export interface StoredFingerprint {
  fingerprint: unknown;
  seeds: CamoufoxSeeds;
}

/** camoufox-js SUPPORTED_OS (camoufox-js/dist/fingerprints.js) — kept in sync manually. */
const SUPPORTED_OS = ["windows", "macos", "linux"] as const;
export type CamoufoxOs = (typeof SUPPORTED_OS)[number];

/**
 * Windows is by far the most common real-world desktop population, so it's
 * the default for profiles that don't pick an OS — see docs/notes/fingerprint-audit.md
 * P0-OS (a hardcoded `linux` population is rare and mildly suspicious).
 */
const DEFAULT_OS: CamoufoxOs = "windows";

/** Validates a profile's `os` field, falling back to the default for anything unrecognized. */
function resolveOs(os: string | null | undefined): CamoufoxOs {
  return (SUPPORTED_OS as readonly string[]).includes(os ?? "") ? (os as CamoufoxOs) : DEFAULT_OS;
}

function randomSeeds(): CamoufoxSeeds {
  const randint = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  return {
    "audio:seed": randint(1, 4_294_967_295),
    "canvas:seed": randint(1, 4_294_967_295),
    "fonts:spacing_seed": randint(1, 4_294_967_295),
  };
}

/**
 * Everything Camoufox/playwright need to resurrect this exact browser identity
 * as a shared persistent browser server (see docs/notes/attach-spike.md —
 * _userDataDir/_sharedBrowser are non-public playwright options, verified and
 * pinned via package.json overrides).
 */
export function buildCamoufoxOptions(
  profile: Profile,
  opts: { profileDir: string; fingerprint: unknown; geoip?: boolean }
): Record<string, unknown> {
  const stored = opts.fingerprint as StoredFingerprint;
  // Pins camoufox-js's per-launch audio/canvas/font seeds (see StoredFingerprint above)
  // so they're identical on every start instead of randomized.
  const config: Record<string, unknown> = { ...stored.seeds };
  const o: Record<string, unknown> = {
    _userDataDir: opts.profileDir,
    _sharedBrowser: true,
    fingerprint: stored.fingerprint,
    config,
    headless: true,
    // Camoufox handles cache persistence inside the profile dir
    enable_cache: true,
  };
  if (profile.proxy) o.proxy = profile.proxy;
  if (profile.locale) o.locale = profile.locale;
  if (profile.timezone) {
    // Explicit timezone forces the browser clock and disables IP-based geo:
    // geoip would otherwise overwrite `config.timezone` with the egress-IP zone.
    config.timezone = profile.timezone;
  } else if (opts.geoip !== false) {
    // No explicit timezone → derive timezone, locale, geolocation and WebRTC IP
    // from the egress IP (through the proxy if set), so the browser's clock and
    // location stay consistent with its exit IP instead of the container's. This
    // uses Camoufox's bundled MaxMind GeoLite2 database — no external service.
    o.geoip = true;
  }
  if (profile.viewportWidth && profile.viewportHeight)
    o.window = [profile.viewportWidth, profile.viewportHeight];
  // Aligns fonts and other OS-partitioned launch behavior with the chosen OS
  // (camoufox-js/dist/utils.js launchOptions() destructures `os`). Harmless
  // when a fingerprint is already supplied (our case): camoufox-js only
  // consults `operatingSystems` for fresh fingerprint generation, which we
  // do ourselves in generateFingerprint() below — but it's the OS-aligned
  // font/webgl config path camoufox-js documents this option for, so pass it
  // through for forward-compatibility and correctness if that changes.
  o.os = resolveOs(profile.os);
  return o;
}

/** Whether a launch error came from geoip's live public-IP lookup failing. */
export function isGeoipLookupError(err: unknown): boolean {
  const m = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return /InvalidIP|public .*IP address|geoip/i.test(m);
}

export class CamoufoxRuntime implements BrowserRuntime {
  generateFingerprint(profile: Profile): unknown {
    const window: [number, number] | undefined =
      profile.viewportWidth && profile.viewportHeight
        ? [profile.viewportWidth, profile.viewportHeight]
        : undefined;
    const stored: StoredFingerprint = {
      fingerprint: generateFingerprint(window, { operatingSystems: [resolveOs(profile.os)] }),
      seeds: randomSeeds(),
    };
    return stored;
  }

  async start(profile: Profile, opts: { profileDir: string; fingerprint: unknown }): Promise<RunningBrowser> {
    let server;
    try {
      server = await launchServer(buildCamoufoxOptions(profile, opts) as Parameters<typeof launchServer>[0]);
    } catch (err) {
      // geoip does a live public-IP lookup (through the proxy) before the browser
      // process spawns; if every IP endpoint is unreachable it throws. Don't brick
      // the profile — retry once without geoip (falls back to the host timezone).
      if (isGeoipLookupError(err) && !profile.timezone) {
        console.warn(
          `geoip lookup failed for profile ${profile.name}, starting without it:`,
          err instanceof Error ? err.message : err
        );
        server = await launchServer(
          buildCamoufoxOptions(profile, { ...opts, geoip: false }) as Parameters<typeof launchServer>[0]
        );
      } else {
        throw err;
      }
    }
    const wsEndpoint = server.wsEndpoint();
    // Morrow's own handle on the shared persistent context — a stock client
    // connection, exactly like an external attach client will be in Plan 3.
    const internal = await firefox.connect(wsEndpoint);
    const context = internal.contexts()[0];
    if (!context) {
      await server.close().catch(() => {});
      throw new Error(
        "browser server exposed no shared context — _sharedBrowser regression, see attach-spike.md"
      );
    }
    // Best-effort: log the timezone the browser actually resolved to, so the
    // egress-IP → timezone mapping is observable in the server logs.
    void context
      .pages()[0]
      ?.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
      .then((tz) => console.log(`profile ${profile.name} browser timezone: ${tz}`))
      .catch(() => {});
    let resolveClosed!: () => void;
    const closed = new Promise<void>((r) => (resolveClosed = r));
    server.on("close", resolveClosed);
    return {
      context,
      wsEndpoint,
      closed,
      close: async () => {
        await server.close().catch(() => {});
      },
    };
  }
}
