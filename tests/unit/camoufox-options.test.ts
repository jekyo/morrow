import { describe, it, expect } from "vitest";
import { buildCamoufoxOptions, isGeoipLookupError } from "@/server/browser/camoufox";
import { CamoufoxRuntime } from "@/server/browser/camoufox";
import type { Profile } from "@/server/db";
import type { ProxyEgress } from "@/server/browser/geo";

const base: Profile = {
  id: "prof_x",
  name: "x",
  status: "stopped",
  proxy: null,
  locale: null,
  timezone: null,
  viewportWidth: null,
  viewportHeight: null,
  os: null,
  fingerprintSeed: "s",
  createdAt: "",
  updatedAt: "",
};

// Shape returned by generateFingerprint(): the raw browserforge fingerprint
// plus the audio/canvas/font seeds camoufox-js would otherwise randomize on
// every launch (see camoufox-js/dist/utils.js launchOptions()).
const storedFingerprint = {
  fingerprint: { f: 1 },
  seeds: { "audio:seed": 111, "canvas:seed": 222, "fonts:spacing_seed": 333 },
};

describe("buildCamoufoxOptions", () => {
  it("always sets shared persistent server dir, headless and fingerprint", () => {
    const o = buildCamoufoxOptions(base, { profileDir: "/data/profiles/prof_x", fingerprint: storedFingerprint });
    expect(o._userDataDir).toBe("/data/profiles/prof_x");
    expect(o._sharedBrowser).toBe(true);
    expect("user_data_dir" in o).toBe(false);
    expect(o.headless).toBe(true);
    expect(o.fingerprint).toEqual({ f: 1 });
  });

  it("puts the stored seeds into the camoufox config option so they're pinned every launch", () => {
    const o = buildCamoufoxOptions(base, { profileDir: "/d", fingerprint: storedFingerprint });
    expect(o.config).toEqual({ "audio:seed": 111, "canvas:seed": 222, "fonts:spacing_seed": 333 });
  });

  it("maps proxy, locale and window from profile config", () => {
    const o = buildCamoufoxOptions(
      { ...base, proxy: "http://u:p@h:1", locale: "de-DE", viewportWidth: 1280, viewportHeight: 800 },
      { profileDir: "/d", fingerprint: storedFingerprint }
    );
    expect(o.proxy).toBe("http://u:p@h:1");
    expect(o.locale).toBe("de-DE");
    expect(o.window).toEqual([1280, 800]);
  });

  it("omits unset optionals", () => {
    const o = buildCamoufoxOptions(base, { profileDir: "/d", fingerprint: storedFingerprint });
    expect("proxy" in o).toBe(false);
    expect("locale" in o).toBe(false);
    expect("window" in o).toBe(false);
  });

  it("enables geoip by default (auto timezone/locale/geo from the egress IP)", () => {
    const o = buildCamoufoxOptions(base, { profileDir: "/d", fingerprint: storedFingerprint });
    expect(o.geoip).toBe(true);
    expect((o.config as Record<string, unknown>).timezone).toBeUndefined();
  });

  it("an explicit timezone overrides geoip: sets config.timezone and disables geoip", () => {
    const o = buildCamoufoxOptions(
      { ...base, timezone: "America/New_York" },
      { profileDir: "/d", fingerprint: storedFingerprint }
    );
    expect("geoip" in o).toBe(false);
    expect((o.config as Record<string, unknown>).timezone).toBe("America/New_York");
    // seeds are still pinned alongside the timezone
    expect((o.config as Record<string, unknown>)["audio:seed"]).toBe(111);
  });

  it("geoip: false disables geoip without forcing a timezone (the fallback path)", () => {
    const o = buildCamoufoxOptions(base, { profileDir: "/d", fingerprint: storedFingerprint, geoip: false });
    expect("geoip" in o).toBe(false);
    expect((o.config as Record<string, unknown>).timezone).toBeUndefined();
  });

  it("defaults the camoufox `os` launch option to windows when the profile has none", () => {
    const o = buildCamoufoxOptions(base, { profileDir: "/d", fingerprint: storedFingerprint });
    expect(o.os).toBe("windows");
  });

  it("passes the profile's os through to the camoufox `os` launch option", () => {
    const o = buildCamoufoxOptions({ ...base, os: "macos" }, { profileDir: "/d", fingerprint: storedFingerprint });
    expect(o.os).toBe("macos");
  });
});

describe("buildCamoufoxOptions with a resolved proxy egress (P0-WEBRTC)", () => {
  const egress: ProxyEgress = {
    ip: "203.0.113.9",
    timezone: "Europe/Bucharest",
    country: "RO",
    locale: "ro-RO",
    latitude: 44.447,
    longitude: 26.0185,
    rotating: false,
  };

  it("disables camoufox geoip and pins webrtc:ipv4 to the resolved egress IP instead", () => {
    const o = buildCamoufoxOptions(
      { ...base, proxy: "http://u:p@h:1" },
      { profileDir: "/d", fingerprint: storedFingerprint, proxyEgress: egress }
    );
    expect("geoip" in o).toBe(false);
    expect((o.config as Record<string, unknown>)["webrtc:ipv4"]).toBe("203.0.113.9");
    expect(o.firefox_user_prefs).toMatchObject({ "network.dns.disableIPv6": true });
  });

  it("merges the egress timezone/geolocation/locale into config", () => {
    const o = buildCamoufoxOptions(
      { ...base, proxy: "http://u:p@h:1" },
      { profileDir: "/d", fingerprint: storedFingerprint, proxyEgress: egress }
    );
    const config = o.config as Record<string, unknown>;
    expect(config.timezone).toBe("Europe/Bucharest");
    expect(config["geolocation:latitude"]).toBe(44.447);
    expect(config["geolocation:longitude"]).toBe(26.0185);
    expect(config["locale:region"]).toBe("RO");
    expect(config["locale:language"]).toBe("ro");
  });

  it("blocks webrtc instead of pinning a stale IP when the proxy is rotating", () => {
    const o = buildCamoufoxOptions(
      { ...base, proxy: "http://u:p@h:1" },
      { profileDir: "/d", fingerprint: storedFingerprint, proxyEgress: { ...egress, rotating: true } }
    );
    expect(o.block_webrtc).toBe(true);
  });

  it("falls back to geoip:true when egress resolution failed (proxyEgress: null)", () => {
    const o = buildCamoufoxOptions(
      { ...base, proxy: "http://u:p@h:1" },
      { profileDir: "/d", fingerprint: storedFingerprint, proxyEgress: null }
    );
    expect(o.geoip).toBe(true);
    expect("webrtc:ipv4" in (o.config as Record<string, unknown>)).toBe(false);
  });

  it("an explicit profile timezone still wins over a resolved proxy egress", () => {
    const o = buildCamoufoxOptions(
      { ...base, proxy: "http://u:p@h:1", timezone: "America/New_York" },
      { profileDir: "/d", fingerprint: storedFingerprint, proxyEgress: egress }
    );
    expect("geoip" in o).toBe(false);
    expect((o.config as Record<string, unknown>).timezone).toBe("America/New_York");
    expect("webrtc:ipv4" in (o.config as Record<string, unknown>)).toBe(false);
  });
});

describe("CamoufoxRuntime.generateFingerprint", () => {
  it("returns a wrapper of { fingerprint, seeds } with three seeds in camoufox's randint range", () => {
    const runtime = new CamoufoxRuntime();
    const stored = runtime.generateFingerprint(base) as {
      fingerprint: unknown;
      seeds: Record<string, number>;
    };
    expect(stored.fingerprint).toBeDefined();
    for (const key of ["audio:seed", "canvas:seed", "fonts:spacing_seed"]) {
      const v = stored.seeds[key];
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(4_294_967_295);
    }
  });

  it("generates different seeds on each call", () => {
    const runtime = new CamoufoxRuntime();
    const a = runtime.generateFingerprint(base) as { seeds: Record<string, number> };
    const b = runtime.generateFingerprint(base) as { seeds: Record<string, number> };
    expect(a.seeds).not.toEqual(b.seeds);
  });

  it("defaults to windows when the profile has no os set", () => {
    const runtime = new CamoufoxRuntime();
    const stored = runtime.generateFingerprint(base) as { fingerprint: { navigator: { userAgent: string } } };
    expect(stored.fingerprint.navigator.userAgent).toMatch(/Windows NT/);
  });

  it("samples a macOS fingerprint when the profile's os is macos", () => {
    const runtime = new CamoufoxRuntime();
    const stored = runtime.generateFingerprint({ ...base, os: "macos" }) as {
      fingerprint: { navigator: { userAgent: string; platform: string } };
    };
    expect(stored.fingerprint.navigator.userAgent).toMatch(/Macintosh/);
    expect(stored.fingerprint.navigator.platform).toBe("MacIntel");
  });

  it("samples a linux fingerprint when the profile's os is linux", () => {
    const runtime = new CamoufoxRuntime();
    const stored = runtime.generateFingerprint({ ...base, os: "linux" }) as {
      fingerprint: { navigator: { userAgent: string } };
    };
    // The pool includes distro-tagged UAs (e.g. "X11; Ubuntu; Linux x86_64"),
    // so allow an optional token between "X11;" and "Linux".
    expect(stored.fingerprint.navigator.userAgent).toMatch(/X11;.*Linux/);
  });

  it("falls back to windows for an unrecognized os value", () => {
    const runtime = new CamoufoxRuntime();
    const stored = runtime.generateFingerprint({ ...base, os: "amiga" }) as {
      fingerprint: { navigator: { userAgent: string } };
    };
    expect(stored.fingerprint.navigator.userAgent).toMatch(/Windows NT/);
  });
});

describe("isGeoipLookupError", () => {
  it("matches camoufox's public-IP lookup failure", () => {
    expect(isGeoipLookupError(new Error("Failed to get a public proxy IP address from any API endpoint."))).toBe(true);
    const e = new Error("boom");
    e.name = "InvalidIP";
    expect(isGeoipLookupError(e)).toBe(true);
  });
  it("does not match unrelated launch errors", () => {
    expect(isGeoipLookupError(new Error("browser exited with code 1"))).toBe(false);
    expect(isGeoipLookupError(undefined)).toBe(false);
  });
});

describe("stability across builds", () => {
  it("building options twice from the SAME stored blob yields identical options (seeds pinned)", () => {
    const o1 = buildCamoufoxOptions(base, { profileDir: "/d", fingerprint: storedFingerprint });
    const o2 = buildCamoufoxOptions(base, { profileDir: "/d", fingerprint: storedFingerprint });
    expect(o1).toEqual(o2);
    expect(o1.config).toEqual(o2.config);
  });
});
