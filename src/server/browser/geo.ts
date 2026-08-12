import { ProxyAgent, fetch as undiciFetch } from "undici";
import { getGeolocation } from "camoufox-js/dist/locale.js";

/**
 * Camoufox's own geoip (`geoip:true` in launchOptions, camoufox-js/dist/utils.js)
 * resolves the egress IP via `publicIP(proxy)`, which fetches through `impit`
 * (a Rust/Tokio HTTP client). Per docs/notes/fingerprint-audit.md P0-WEBRTC,
 * impit does not reliably egress through an HTTP proxy — it can return the
 * *host's* IP instead of the proxy's, silently desyncing `webrtc:ipv4`,
 * timezone and geolocation from the proxy's real exit. Node's undici
 * `ProxyAgent` routes correctly, so Morrow resolves the egress IP itself and
 * passes the result explicitly instead of trusting `geoip:true` when a proxy
 * is set (see camoufox.ts buildCamoufoxOptions).
 */
export interface ProxyEgress {
  ip: string;
  timezone?: string;
  country?: string;
  city?: string;
  locale?: string;
  latitude?: number;
  longitude?: number;
  /** True when two egress-IP probes returned different IPs (the proxy rotates exits). */
  rotating: boolean;
}

/**
 * The shape of camoufox-js's `Geolocation#asConfig()` (camoufox-js/dist/locale.js),
 * observed directly rather than assumed:
 *
 *   {
 *     "geolocation:longitude": number,
 *     "geolocation:latitude": number,
 *     timezone: string,
 *     "locale:region": string,      // ISO country code, e.g. "RO"
 *     "locale:language": string,    // e.g. "ro"
 *     "locale:script"?: string,     // e.g. "Latn", only when applicable
 *   }
 *
 * Notably there is NO city field anywhere in this shape — camoufox-js's Geolocation
 * class only carries country-level `locale:region` plus lat/lon/timezone, even though
 * the underlying GeoLite2-City.mmdb has city-level data. `ProxyEgress.city` is therefore
 * never populated by geoConfigToEgress(); it stays optional/undefined. Getting a real
 * city would require reading the mmdb directly (bypassing getGeolocation), which is out
 * of scope here — camoufox itself doesn't use city either.
 */
export interface GeoConfig {
  timezone?: string;
  "geolocation:latitude"?: number;
  "geolocation:longitude"?: number;
  "locale:region"?: string;
  "locale:language"?: string;
  "locale:script"?: string;
}

/** Pure mapping from a camoufox-js geo config (or null, if lookup failed) to a ProxyEgress. No I/O. */
export function geoConfigToEgress(ip: string, rotating: boolean, cfg: GeoConfig | null): ProxyEgress {
  if (!cfg) return { ip, rotating };
  const locale = cfg["locale:language"] && cfg["locale:region"] ? `${cfg["locale:language"]}-${cfg["locale:region"]}` : undefined;
  const egress: ProxyEgress = { ip, rotating };
  if (cfg.timezone !== undefined) egress.timezone = cfg.timezone;
  if (cfg["locale:region"] !== undefined) egress.country = cfg["locale:region"];
  if (locale !== undefined) egress.locale = locale;
  if (cfg["geolocation:latitude"] !== undefined) egress.latitude = cfg["geolocation:latitude"];
  if (cfg["geolocation:longitude"] !== undefined) egress.longitude = cfg["geolocation:longitude"];
  return egress;
}

const IPV4_RE = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;

/** One `GET https://api.ipify.org` through `agent`, returning the trimmed IP text or null. */
async function fetchEgressIp(agent: ProxyAgent): Promise<string | null> {
  try {
    const res = await undiciFetch("https://api.ipify.org", {
      dispatcher: agent,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const ip = (await res.text()).trim();
    return IPV4_RE.test(ip) ? ip : null;
  } catch {
    return null;
  }
}

/**
 * Resolves a proxy's real egress IP (routed THROUGH the proxy, via undici's
 * ProxyAgent — not camoufox's impit-based lookup, see module docstring above),
 * probing twice to detect a rotating exit, then derives timezone/geo/locale
 * from that IP using camoufox's bundled GeoLite2 database.
 *
 * Returns null if the proxy is unreachable (never throws) — callers decide
 * how to handle "can't verify this proxy" (see CamoufoxRuntime.start's
 * geoip:true fallback, and the /proxy/check preflight endpoint).
 */
export async function resolveProxyEgress(proxy: string): Promise<ProxyEgress | null> {
  const agent = new ProxyAgent(proxy);
  try {
    const first = await fetchEgressIp(agent);
    if (!first) return null;
    const second = await fetchEgressIp(agent);
    const rotating = second !== null && second !== first;

    let cfg: GeoConfig | null = null;
    try {
      const geolocation = await getGeolocation(first);
      cfg = geolocation.asConfig();
    } catch {
      // Unknown/private IP in the GeoLite2 database — still return the egress IP itself.
      cfg = null;
    }
    return geoConfigToEgress(first, rotating, cfg);
  } finally {
    await agent.close().catch(() => {});
  }
}
