import { describe, it, expect } from "vitest";
import { geoConfigToEgress, resolveProxyEgress, type GeoConfig } from "@/server/browser/geo";

describe("geoConfigToEgress (pure mapping, no network)", () => {
  it("maps a camoufox-js Geolocation#asConfig() shape into a ProxyEgress", () => {
    // Real shape observed from camoufox-js/dist/locale.js getGeolocation(ip).asConfig():
    // { "geolocation:longitude", "geolocation:latitude", timezone, "locale:region", "locale:language", "locale:script"? }
    const cfg: GeoConfig = {
      "geolocation:longitude": 26.0185,
      "geolocation:latitude": 44.447,
      timezone: "Europe/Bucharest",
      "locale:region": "RO",
      "locale:language": "ro",
      "locale:script": "Latn",
    };
    const egress = geoConfigToEgress("82.76.168.35", false, cfg);
    expect(egress).toEqual({
      ip: "82.76.168.35",
      rotating: false,
      timezone: "Europe/Bucharest",
      country: "RO",
      locale: "ro-RO",
      latitude: 44.447,
      longitude: 26.0185,
    });
  });

  it("returns just { ip, rotating } when geo lookup failed for the IP", () => {
    expect(geoConfigToEgress("1.2.3.4", true, null)).toEqual({ ip: "1.2.3.4", rotating: true });
  });

  it("omits locale when region or language is missing", () => {
    const cfg: GeoConfig = { timezone: "UTC", "locale:region": "RO" };
    const egress = geoConfigToEgress("1.2.3.4", false, cfg);
    expect(egress.locale).toBeUndefined();
    expect(egress.country).toBe("RO");
    expect(egress.timezone).toBe("UTC");
  });
});

describe("resolveProxyEgress (network)", () => {
  it("returns null cleanly for an unreachable proxy, without throwing", async () => {
    const result = await resolveProxyEgress("http://user:pass@127.0.0.1:1");
    expect(result).toBeNull();
  }, 20_000);
});
