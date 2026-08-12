import { globalSingleton } from "@/server/global";

export interface Config {
  apiKey: string;
  port: number;
  dataDir: string;
  maxProfiles: number;
  launchTimeoutMs: number;
}

type Env = Record<string, string | undefined>;

function intFromEnv(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got ${JSON.stringify(raw)}`);
  return n;
}

export function loadConfig(env: Env = process.env): Config {
  const apiKey = env.MORROW_API_KEY;
  if (!apiKey) throw new Error("MORROW_API_KEY is required");
  return {
    apiKey,
    port: intFromEnv(env, "MORROW_PORT", 3000),
    dataDir: env.MORROW_DATA_DIR ?? "/data",
    maxProfiles: intFromEnv(env, "MORROW_MAX_PROFILES", 5),
    launchTimeoutMs: intFromEnv(env, "MORROW_LAUNCH_TIMEOUT", 60) * 1000,
  };
}

/** Process-wide config (Next route handlers and server modules share it). */
export function config(): Config {
  return globalSingleton("config", () => loadConfig());
}
