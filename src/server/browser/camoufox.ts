import { launchServer } from "camoufox-js";
import { generateFingerprint } from "camoufox-js/dist/fingerprints.js";
import { firefox } from "playwright-core";
import type { Profile } from "@/server/db";
import type { BrowserRuntime, RunningBrowser } from "@/server/browser/runtime";

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
  const o: Record<string, unknown> = {
    _userDataDir: opts.profileDir,
    _sharedBrowser: true,
    fingerprint: opts.fingerprint,
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
    return generateFingerprint(window, { operatingSystems: ["linux"] });
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
