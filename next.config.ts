import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "ws", "camoufox-js"],
};

export default nextConfig;
