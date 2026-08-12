import type { NextConfig } from "next";

/**
 * In dev, Next.js blocks cross-origin requests to /_next/* dev resources
 * (HMR client, static chunks) from any host other than localhost — a safety
 * default. When Morrow's dev server is reached over a LAN IP, a hostname, or a
 * tunnelled domain, the page shell loads but every chunk 403s and the app looks
 * broken ("CORS"). Allow extra dev origins via MORROW_DEV_ORIGINS (comma-
 * separated hosts, e.g. "morrow.local,192.168.1.50,*.trycloudflare.com").
 * Production is unaffected — this guard only exists in `next dev`.
 */
const devOrigins = (process.env.MORROW_DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "ws", "camoufox-js"],
  ...(devOrigins.length ? { allowedDevOrigins: devOrigins } : {}),
};

export default nextConfig;
