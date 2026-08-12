import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Env = Record<string, string | undefined>;

export interface ResolvedApiKey {
  key: string;
  /** True only when a key was freshly generated on this call (worth logging). */
  generated: boolean;
}

/**
 * Determine the API key at boot:
 *  - MORROW_API_KEY set  → use it (nothing persisted).
 *  - otherwise           → reuse <dataDir>/.api-key if present, else generate a
 *                          new one, persist it (0600), and flag it as generated
 *                          so the caller can print it to the console.
 *
 * This makes first-run self-hosting zero-config while keeping the key stable
 * across restarts.
 */
export function resolveApiKey(dataDir: string, env: Env = process.env): ResolvedApiKey {
  const fromEnv = env.MORROW_API_KEY;
  if (fromEnv) return { key: fromEnv, generated: false };

  const file = join(dataDir, ".api-key");
  if (existsSync(file)) {
    const key = readFileSync(file, "utf8").trim();
    if (key) return { key, generated: false };
  }

  const key = `mrw_${randomBytes(24).toString("base64url")}`;
  writeFileSync(file, `${key}\n`, { mode: 0o600 });
  return { key, generated: true };
}
