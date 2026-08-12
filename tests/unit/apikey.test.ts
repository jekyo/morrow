import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveApiKey } from "@/server/apikey";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "morrow-key-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("resolveApiKey", () => {
  it("uses MORROW_API_KEY from env and does not write a file", () => {
    const r = resolveApiKey(dir, { MORROW_API_KEY: "explicit" });
    expect(r).toEqual({ key: "explicit", generated: false });
    expect(existsSync(join(dir, ".api-key"))).toBe(false);
  });

  it("generates and persists a key when none is set", () => {
    const r = resolveApiKey(dir, {});
    expect(r.generated).toBe(true);
    expect(r.key).toMatch(/^mrw_/);
    expect(r.key.length).toBeGreaterThan(20);
    const file = join(dir, ".api-key");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8").trim()).toBe(r.key);
    // stored 0600 (owner read/write only)
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("reuses the persisted key on subsequent starts (stable across restarts)", () => {
    const first = resolveApiKey(dir, {});
    const second = resolveApiKey(dir, {});
    expect(second.key).toBe(first.key);
    expect(second.generated).toBe(false); // already existed → not freshly generated
  });

  it("prefers an explicit env key even if a file exists", () => {
    resolveApiKey(dir, {}); // creates the file
    const r = resolveApiKey(dir, { MORROW_API_KEY: "wins" });
    expect(r.key).toBe("wins");
    expect(r.generated).toBe(false);
  });
});
