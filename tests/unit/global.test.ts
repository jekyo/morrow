import { describe, it, expect } from "vitest";
import { globalSingleton, globalSingletonAsync } from "@/server/global";

describe("globalSingleton", () => {
  it("creates once and reuses", () => {
    let calls = 0;
    const a = globalSingleton("test-key", () => ({ n: ++calls }));
    const b = globalSingleton("test-key", () => ({ n: ++calls }));
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });

  it("sees a replaced globalThis.__morrow store", () => {
    globalSingleton("reset-key", () => "first");
    (globalThis as Record<string, unknown>).__morrow = {};
    expect(globalSingleton("reset-key", () => "second")).toBe("second");
  });
});

describe("globalSingletonAsync", () => {
  it("shares one in-flight creation between concurrent callers", async () => {
    let calls = 0;
    const create = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return { n: calls };
    };
    const [a, b] = await Promise.all([
      globalSingletonAsync("async-key", create),
      globalSingletonAsync("async-key", create),
    ]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
    expect(await globalSingletonAsync("async-key", create)).toBe(a);
  });

  it("does not cache a failure — the next caller retries", async () => {
    let calls = 0;
    const create = async () => {
      calls++;
      if (calls === 1) throw new Error("launch failed");
      return "ok";
    };
    await expect(globalSingletonAsync("async-fail-key", create)).rejects.toThrow("launch failed");
    expect(await globalSingletonAsync("async-fail-key", create)).toBe("ok");
    expect(calls).toBe(2);
  });
});
