import { describe, it, expect } from "vitest";
import { matchWsRoute } from "@/server/ws";

describe("matchWsRoute", () => {
  it("matches playwright route", () =>
    expect(matchWsRoute("/playwright/x-marketing")).toEqual({
      kind: "playwright",
      profileName: "x-marketing",
    }));
  it("matches viewer route", () =>
    expect(matchWsRoute("/viewer/my-profile")).toEqual({ kind: "viewer", profileName: "my-profile" }));
  it("decodes URL-encoded names", () =>
    expect(matchWsRoute("/viewer/x%20marketing")).toEqual({ kind: "viewer", profileName: "x marketing" }));
  it("rejects other paths", () => {
    expect(matchWsRoute("/other/x")).toBeUndefined();
    expect(matchWsRoute("/playwright/")).toBeUndefined();
    expect(matchWsRoute("/playwright/a/b")).toBeUndefined();
  });
  it("returns undefined on malformed percent-encoding", () => {
    expect(matchWsRoute("/viewer/%zz")).toBeUndefined();
  });
});
