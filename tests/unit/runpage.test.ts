import { describe, it, expect } from "vitest";
import { runPage, type ContextResolver } from "@/server/browser/pagerunner";

function fakeResolver() {
  let closed = 0, pagesOpened = 0, pagesClosed = 0;
  const resolver: ContextResolver = {
    async acquire() {
      return {
        context: {
          async newPage() {
            pagesOpened++;
            return {
              setExtraHTTPHeaders: async () => {}, setViewportSize: async () => {}, route: async () => {},
              goto: async () => null, setContent: async () => {}, waitForSelector: async () => {},
              waitForTimeout: async () => {}, waitForFunction: async () => {},
              close: async () => { pagesClosed++; },
            } as never;
          },
        } as never,
        release: async () => { closed++; },
      };
    },
  };
  return { resolver, stats: () => ({ closed, pagesOpened, pagesClosed }) };
}

describe("runPage", () => {
  it("opens a page, runs the extractor, closes the page and releases the context", async () => {
    const { resolver, stats } = fakeResolver();
    const result = await runPage(resolver, { url: "https://x.com" }, async () => "extracted");
    expect(result).toBe("extracted");
    expect(stats()).toEqual({ closed: 1, pagesOpened: 1, pagesClosed: 1 });
  });

  it("still closes the page and releases when the extractor throws", async () => {
    const { resolver, stats } = fakeResolver();
    await expect(runPage(resolver, { url: "https://x.com" }, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(stats()).toEqual({ closed: 1, pagesOpened: 1, pagesClosed: 1 });
  });

  it("still releases the context when closing the page throws", async () => {
    let released = 0;
    const resolver: ContextResolver = {
      async acquire() {
        return {
          context: {
            async newPage() {
              return {
                setExtraHTTPHeaders: async () => {}, setViewportSize: async () => {}, route: async () => {},
                goto: async () => null, setContent: async () => {}, waitForSelector: async () => {},
                waitForTimeout: async () => {}, waitForFunction: async () => {},
                close: () => { throw new Error("page already gone"); },
              } as never;
            },
          } as never,
          release: async () => { released++; },
        };
      },
    };
    expect(await runPage(resolver, { url: "https://x.com" }, async () => "extracted")).toBe("extracted");
    expect(released).toBe(1);
  });
});
