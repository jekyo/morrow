import { describe, it, expect } from "vitest";
import { isAuthorized, extractToken } from "@/server/auth";

describe("isAuthorized", () => {
  it("accepts the exact key", () => expect(isAuthorized("secret", "secret")).toBe(true));
  it("rejects wrong key", () => expect(isAuthorized("nope", "secret")).toBe(false));
  it("rejects undefined", () => expect(isAuthorized(undefined, "secret")).toBe(false));
  it("rejects different length", () => expect(isAuthorized("secre", "secret")).toBe(false));
});

describe("extractToken", () => {
  it("reads Bearer header", () =>
    expect(extractToken({ authorization: "Bearer abc" }, null)).toBe("abc"));
  it("reads token query param", () =>
    expect(extractToken({}, new URLSearchParams("token=xyz"))).toBe("xyz"));
  it("prefers header over query", () =>
    expect(extractToken({ authorization: "Bearer a" }, new URLSearchParams("token=b"))).toBe("a"));
  it("returns undefined when absent", () => expect(extractToken({}, null)).toBeUndefined());
  it("accepts lowercase bearer scheme", () =>
    expect(extractToken({ authorization: "bearer abc" }, null)).toBe("abc"));
  it("tolerates extra whitespace after scheme", () =>
    expect(extractToken({ authorization: "Bearer  abc" }, null)).toBe("abc"));
});
