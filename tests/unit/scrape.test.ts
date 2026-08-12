import { describe, it, expect } from "vitest";
import { screenshotOptions } from "@/server/scrape";
import { pageOptionsSchema } from "@/server/validation";

describe("screenshotOptions", () => {
  it("defaults to png", () => {
    expect(screenshotOptions({})).toStrictEqual({ type: "png" });
  });

  it("drops quality for png — playwright rejects quality on png screenshots", () => {
    expect(screenshotOptions({ quality: 80 })).toStrictEqual({ type: "png" });
    expect(screenshotOptions({ type: "png", quality: 80 })).toStrictEqual({ type: "png" });
  });

  it("keeps quality for jpeg", () => {
    expect(screenshotOptions({ type: "jpeg", quality: 80 })).toStrictEqual({ type: "jpeg", quality: 80 });
  });
});

describe("pageOptionsSchema rejectRequestPattern", () => {
  it("accepts a valid regular expression", () => {
    expect(pageOptionsSchema.safeParse({ url: "https://x.com", rejectRequestPattern: ["\\.png$"] }).success).toBe(true);
  });

  it("rejects an unparseable regular expression instead of blowing up at runtime", () => {
    const res = pageOptionsSchema.safeParse({ url: "https://x.com", rejectRequestPattern: ["("] });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0].message).toMatch(/regular expression/);
  });
});
