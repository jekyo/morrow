import { launchServer } from "camoufox-js";
import { generateFingerprint } from "camoufox-js/dist/fingerprints.js";
import { firefox } from "playwright-core";
import type { Profile } from "@/server/db";
import type { BrowserRuntime, RunningBrowser } from "@/server/browser/runtime";
import { resolveProxyEgress, type ProxyEgress } from "@/server/browser/geo";
import { startDisplay, type DisplaySession } from "@/server/browser/display";

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
  opts: {
    profileDir: string;
    fingerprint: unknown;
    geoip?: boolean;
    /**
     * The proxy's real egress IP, resolved by Morrow itself (see geo.ts) —
     * NOT camoufox's own `geoip:true`, whose impit-based lookup doesn't
     * reliably route through the proxy (docs/notes/fingerprint-audit.md
     * P0-WEBRTC). `undefined` when not applicable (no proxy, or the caller
     * didn't resolve one — falls back to the old geoip:true behavior).
     * `null` when resolution was attempted but the proxy was unreachable
     * (falls back to geoip:true too, same as undefined).
     */
    proxyEgress?: ProxyEgress | null;
    /**
     * When present, the browser runs HEADFUL into this profile's private Xvfb
     * display (so x11vnc/noVNC can stream it) instead of headless. Headful in a
     * virtual display is also less fingerprintable than true headless. See
     * display.ts for the recipe and the env/pref flags required.
     */
    display?: DisplaySession;
  }
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
    // Camoufox handles cache persistence inside the profile dir
    enable_cache: true,
  };
  if (opts.display) {
    // Render into the profile's Xvfb display. `browserEnv` already carries the
    // DISPLAY, software-GL flags, and stripped Wayland vars (display.ts).
    o.headless = false;
    o.env = opts.display.browserEnv;
    o.firefox_user_prefs = {
      ...(o.firefox_user_prefs as Record<string, unknown> | undefined),
      // No GPU in Xvfb: force the software WebRender backend or the window
      // never paints (framebuffer stays black).
      "gfx.webrender.software": true,
      "layers.acceleration.disabled": true,
    };
  } else {
    o.headless = true;
  }
  if (profile.proxy) o.proxy = profile.proxy;
  if (profile.locale) o.locale = profile.locale;
  if (profile.timezone) {
    // Explicit timezone forces the browser clock and disables IP-based geo:
    // geoip would otherwise overwrite `config.timezone` with the egress-IP zone.
    config.timezone = profile.timezone;
  } else if (opts.proxyEgress) {
    // We resolved the proxy's real egress IP ourselves (through the proxy, via
    // undici's ProxyAgent — see geo.ts). Mirror what camoufox's geoip:true does,
    // but seeded from the CORRECT IP instead of impit's unreliable lookup: pin
    // webrtc:ipv4 to it, disable IPv6 (so WebRTC can't leak an IPv6 host
    // candidate instead), and derive timezone/geolocation/locale from it. We
    // deliberately do NOT set o.geoip here — that would re-trigger camoufox's
    // own (unreliable-through-proxy) lookup and clobber this.
    const egress = opts.proxyEgress;
    config["webrtc:ipv4"] = egress.ip;
    o.firefox_user_prefs = {
      ...(o.firefox_user_prefs as Record<string, unknown> | undefined),
      "network.dns.disableIPv6": true,
    };
    if (egress.timezone) config.timezone = egress.timezone;
    if (egress.latitude !== undefined) config["geolocation:latitude"] = egress.latitude;
    if (egress.longitude !== undefined) config["geolocation:longitude"] = egress.longitude;
    if (egress.country) config["locale:region"] = egress.country;
    if (egress.locale) config["locale:language"] = egress.locale.split("-")[0];
    if (egress.rotating) {
      // A rotating proxy's next request can exit through a different IP than the
      // one we just pinned into webrtc:ipv4 — a fixed WebRTC candidate would then
      // mismatch the live HTTP exit, which is itself a correlation tell. Blocking
      // WebRTC outright is safer than a stale/mismatched IP for rotating proxies.
      o.block_webrtc = true;
    }
  } else if (opts.geoip !== false) {
    // No explicit timezone, and no (or unresolved) proxy egress → derive timezone,
    // locale, geolocation and WebRTC IP from camoufox's own egress-IP lookup, so the
    // browser's clock and location stay consistent with its exit IP instead of the
    // container's. This uses Camoufox's bundled MaxMind GeoLite2 database — no
    // external service. (For a proxied profile this is the "couldn't verify the
    // proxy ourselves" fallback — see CamoufoxRuntime.start.)
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

  async start(
    profile: Profile,
    opts: { profileDir: string; fingerprint: unknown; vnc?: boolean }
  ): Promise<RunningBrowser> {
    // Resolve the proxy's real egress IP ourselves (see geo.ts / P0-WEBRTC) before
    // launch, so webrtc:ipv4/timezone/geo can be seeded from the CORRECT IP instead
    // of camoufox's own geoip:true (which doesn't reliably route its lookup through
    // the proxy). Only relevant when a proxy is set and the profile doesn't already
    // pin an explicit timezone (which disables geoip entirely — see buildCamoufoxOptions).
    // Never throws: an unreachable proxy resolves to null and buildCamoufoxOptions
    // falls back to the existing geoip:true path below.
    const proxyEgress =
      profile.proxy && !profile.timezone ? await resolveProxyEgress(profile.proxy).catch(() => null) : undefined;

    // Bring up the profile's private Xvfb+x11vnc desktop so it can be viewed
    // over noVNC (opts.vnc). Best-effort: if the display stack can't start
    // (tooling missing, etc.) we fall back to headless rather than failing the
    // launch — the browser still works, just without a live view.
    let display: DisplaySession | undefined;
    if (opts.vnc !== false) {
      const [width, height] =
        profile.viewportWidth && profile.viewportHeight
          ? [profile.viewportWidth, profile.viewportHeight]
          : [1280, 800];
      try {
        display = await startDisplay({ width, height });
      } catch (err) {
        console.warn(
          `viewer display unavailable for profile ${profile.name}, starting headless:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    let server;
    try {
      try {
        server = await launchServer(
          buildCamoufoxOptions(profile, { ...opts, proxyEgress, display }) as Parameters<typeof launchServer>[0]
        );
      } catch (err) {
        // geoip does a live public-IP lookup (through the proxy) before the browser
        // process spawns; if every IP endpoint is unreachable it throws. Don't brick
        // the profile — retry once without geoip (falls back to the host timezone).
        // (Only reachable when proxyEgress is null/undefined — the resolved-egress
        // path above never sets geoip:true, see buildCamoufoxOptions.)
        if (isGeoipLookupError(err) && !profile.timezone) {
          console.warn(
            `geoip lookup failed for profile ${profile.name}, starting without it:`,
            err instanceof Error ? err.message : err
          );
          server = await launchServer(
            buildCamoufoxOptions(profile, { ...opts, geoip: false, proxyEgress, display }) as Parameters<typeof launchServer>[0]
          );
        } else {
          throw err;
        }
      }
    } catch (err) {
      await display?.close().catch(() => {});
      throw err;
    }
    const wsEndpoint = server.wsEndpoint();
    // Morrow's own handle on the shared persistent context — a stock client
    // connection, exactly like an external attach client will be in Plan 3.
    const internal = await firefox.connect(wsEndpoint);
    const context = internal.contexts()[0];
    if (!context) {
      await server.close().catch(() => {});
      await display?.close().catch(() => {});
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
    // A crash (server 'close' without an explicit close()) must also tear down
    // the display stack so we don't leak Xvfb/x11vnc processes. close() is
    // idempotent, so calling it here and from close() below is safe.
    server.on("close", () => {
      void display?.close().catch(() => {});
      resolveClosed();
    });
    return {
      context,
      wsEndpoint,
      vncPort: display?.vncPort,
      closed,
      close: async () => {
        await server.close().catch(() => {});
        await display?.close().catch(() => {});
      },
    };
  }
}
