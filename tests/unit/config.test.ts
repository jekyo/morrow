import { describe, it, expect } from "vitest";
import { loadConfig } from "@/server/config";

describe("loadConfig", () => {
  it("throws without MORROW_API_KEY", () => {
    expect(() => loadConfig({})).toThrow(/MORROW_API_KEY/);
  });

  it("applies defaults", () => {
    const c = loadConfig({ MORROW_API_KEY: "k" });
    expect(c).toEqual({
      apiKey: "k",
      port: 3000,
      dataDir: "/data",
      maxProfiles: 5,
      launchTimeoutMs: 60_000,
    });
  });

  it("reads overrides", () => {
    const c = loadConfig({
      MORROW_API_KEY: "k",
      MORROW_PORT: "4000",
      MORROW_DATA_DIR: "/tmp/x",
      MORROW_MAX_PROFILES: "2",
      MORROW_LAUNCH_TIMEOUT: "30",
    });
    expect(c.port).toBe(4000);
    expect(c.dataDir).toBe("/tmp/x");
    expect(c.maxProfiles).toBe(2);
    expect(c.launchTimeoutMs).toBe(30_000);
  });
});
