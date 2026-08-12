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
  opts: { profileDir: string; fingerprint: unknown }
): Record<string, unknown> {
  const stored = opts.fingerprint as StoredFingerprint;
  const o: Record<string, unknown> = {
    _userDataDir: opts.profileDir,
    _sharedBrowser: true,
    fingerprint: stored.fingerprint,
    // Pins camoufox-js's per-launch audio/canvas/font seeds (see StoredFingerprint above)
    // so they're identical on every start instead of randomized.
    config: { ...stored.seeds },
    headless: true,
    // Camoufox handles cache persistence inside the profile dir
    enable_cache: true,
  };
  if (profile.proxy) o.proxy = profile.proxy;
  if (profile.locale) o.locale = profile.locale;
  if (profile.viewportWidth && profile.viewportHeight)
    o.window = [profile.viewportWidth, profile.viewportHeight];
  return o;
}

export class CamoufoxRuntime implements BrowserRuntime {
  generateFingerprint(profile: Profile): unknown {
    const window: [number, number] | undefined =
      profile.viewportWidth && profile.viewportHeight
        ? [profile.viewportWidth, profile.viewportHeight]
        : undefined;
    const stored: StoredFingerprint = {
      fingerprint: generateFingerprint(window, { operatingSystems: ["linux"] }),
      seeds: randomSeeds(),
    };
    return stored;
  }

  async start(profile: Profile, opts: { profileDir: string; fingerprint: unknown }): Promise<RunningBrowser> {
    const server = await launchServer(
      buildCamoufoxOptions(profile, opts) as Parameters<typeof launchServer>[0]
    );
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
