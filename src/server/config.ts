export interface Config {
  apiKey: string;
  port: number;
  dataDir: string;
  maxProfiles: number;
  launchTimeoutMs: number;
}

type Env = Record<string, string | undefined>;

export function loadConfig(env: Env = process.env): Config {
  const apiKey = env.MORROW_API_KEY;
  if (!apiKey) throw new Error("MORROW_API_KEY is required");
  return {
    apiKey,
    port: parseInt(env.MORROW_PORT ?? "3000", 10),
    dataDir: env.MORROW_DATA_DIR ?? "/data",
    maxProfiles: parseInt(env.MORROW_MAX_PROFILES ?? "5", 10),
    launchTimeoutMs: parseInt(env.MORROW_LAUNCH_TIMEOUT ?? "60", 10) * 1000,
  };
}

let cached: Config | undefined;
/** Process-wide config (Next route handlers and server modules share it). */
export function config(): Config {
  cached ??= loadConfig();
  return cached;
}
