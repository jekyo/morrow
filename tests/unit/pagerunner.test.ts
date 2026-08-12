import { describe, it, expect } from "vitest";
import { applyPageOptions, resolveTarget, type PageOptions } from "@/server/browser/pagerunner";

function fakePage() {
  const calls: string[] = [];
  return {
    calls,
    setExtraHTTPHeaders: async (h: Record<string, string>) => { calls.push(`headers:${JSON.stringify(h)}`); },
    setViewportSize: async (v: { width: number; height: number }) => { calls.push(`viewport:${v.width}x${v.height}`); },
    route: async () => { calls.push("route"); },
    goto: async (url: string, opts: unknown) => { calls.push(`goto:${url}:${JSON.stringify(opts)}`); return null; },
    setContent: async (html: string) => { calls.push(`setContent:${html.length}`); },
    waitForSelector: async (sel: string, opts: unknown) => { calls.push(`waitSel:${sel}:${JSON.stringify(opts)}`); },
    waitForTimeout: async (ms: number) => { calls.push(`waitMs:${ms}`); },
    waitForFunction: async (fn: string, arg: unknown, opts: unknown) => { calls.push(`waitFn:${JSON.stringify(opts)}`); },
  };
}

describe("resolveTarget", () => {
  it("uses url when given", () =>
    expect(resolveTarget({ url: "https://x.com" })).toEqual({ kind: "url", value: "https://x.com" }));
  it("uses html when given", () =>
    expect(resolveTarget({ html: "<h1>hi</h1>" })).toEqual({ kind: "html", value: "<h1>hi</h1>" }));
  it("throws when neither present", () =>
    expect(() => resolveTarget({} as PageOptions)).toThrow(/url or html/));
});

describe("applyPageOptions", () => {
  it("navigates to a url with gotoOptions and applies waits in order", async () => {
    const page = fakePage();
    await applyPageOptions(page as never, {
      url: "https://x.com",
      gotoOptions: { waitUntil: "networkidle", timeout: 5000 },
      waitForSelector: { selector: "#app", timeout: 1000 },
      waitForTimeout: 250,
    });
    expect(page.calls).toEqual([
      `goto:https://x.com:{"waitUntil":"networkidle","timeout":5000}`,
      `waitSel:#app:{"timeout":1000}`,
      "waitMs:250",
    ]);
  });

  it("renders raw html instead of navigating", async () => {
    const page = fakePage();
    await applyPageOptions(page as never, { html: "<h1>hi</h1>" });
    expect(page.calls.some((c) => c.startsWith("setContent:"))).toBe(true);
    expect(page.calls.some((c) => c.startsWith("goto:"))).toBe(false);
  });

  it("sets extra headers and viewport before navigation", async () => {
    const page = fakePage();
    await applyPageOptions(page as never, {
      url: "https://x.com",
      setExtraHTTPHeaders: { "x-test": "1" },
      viewport: { width: 800, height: 600 },
    });
    const gotoIdx = page.calls.findIndex((c) => c.startsWith("goto:"));
    expect(page.calls.indexOf(`headers:{"x-test":"1"}`)).toBeLessThan(gotoIdx);
    expect(page.calls.indexOf("viewport:800x600")).toBeLessThan(gotoIdx);
  });
});
