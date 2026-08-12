import { describe, it, expect } from "vitest";
import { buildCamoufoxOptions } from "@/server/browser/camoufox";
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

describe("buildCamoufoxOptions", () => {
  it("always sets shared persistent server dir, headless and fingerprint", () => {
    const o = buildCamoufoxOptions(base, { profileDir: "/data/profiles/prof_x", fingerprint: { f: 1 } });
    expect(o._userDataDir).toBe("/data/profiles/prof_x");
    expect(o._sharedBrowser).toBe(true);
    expect("user_data_dir" in o).toBe(false);
    expect(o.headless).toBe(true);
    expect(o.fingerprint).toEqual({ f: 1 });
  });

  it("maps proxy, locale and window from profile config", () => {
    const o = buildCamoufoxOptions(
      { ...base, proxy: "http://u:p@h:1", locale: "de-DE", viewportWidth: 1280, viewportHeight: 800 },
      { profileDir: "/d", fingerprint: {} }
    );
    expect(o.proxy).toBe("http://u:p@h:1");
    expect(o.locale).toBe("de-DE");
    expect(o.window).toEqual([1280, 800]);
  });

  it("omits unset optionals", () => {
    const o = buildCamoufoxOptions(base, { profileDir: "/d", fingerprint: {} });
    expect("proxy" in o).toBe(false);
    expect("locale" in o).toBe(false);
    expect("window" in o).toBe(false);
  });
});
