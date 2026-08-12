import { describe, it, expect } from "vitest";
import { ControlLock } from "@/server/lock";

describe("ControlLock", () => {
  it("grants to the first requester and reports the holder", () => {
    const lock = new ControlLock();
    expect(lock.holder()).toBeNull();
    expect(lock.take("viewer-1")).toBe(true);
    expect(lock.holder()).toBe("viewer-1");
  });

  it("refuses a second holder but is idempotent for the same one", () => {
    const lock = new ControlLock();
    lock.take("viewer-1");
    expect(lock.take("viewer-2")).toBe(false);
    expect(lock.take("viewer-1")).toBe(true);
    expect(lock.holder()).toBe("viewer-1");
  });

  it("releases so another can take", () => {
    const lock = new ControlLock();
    lock.take("viewer-1");
    lock.release("viewer-2"); // not the holder — no-op
    expect(lock.holder()).toBe("viewer-1");
    lock.release("viewer-1");
    expect(lock.holder()).toBeNull();
    expect(lock.take("viewer-2")).toBe(true);
  });

  it("has() checks whether a given id holds control", () => {
    const lock = new ControlLock();
    lock.take("a");
    expect(lock.has("a")).toBe(true);
    expect(lock.has("b")).toBe(false);
  });
});
