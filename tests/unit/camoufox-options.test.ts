import { describe, it, expect } from "vitest";
import { buildCamoufoxOptions } from "@/server/browser/camoufox";
import { CamoufoxRuntime } from "@/server/browser/camoufox";
import type { Profile } from "@/server/db";

const base: Profile = {
  id: "prof_x",
  name: "x",
  status: "stopped",
  proxy: null,
  locale: null,
  timezone: null,
  viewportWidth: null,
  viewportHeight: null,
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
});

describe("stability across builds", () => {
  it("building options twice from the SAME stored blob yields identical options (seeds pinned)", () => {
    const o1 = buildCamoufoxOptions(base, { profileDir: "/d", fingerprint: storedFingerprint });
    const o2 = buildCamoufoxOptions(base, { profileDir: "/d", fingerprint: storedFingerprint });
    expect(o1).toEqual(o2);
    expect(o1.config).toEqual(o2.config);
  });
});
