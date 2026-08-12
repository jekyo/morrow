import { describe, it, expect } from "vitest";
import { globalSingleton } from "@/server/global";

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
