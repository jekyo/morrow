import { describe, it, expect, vi, afterEach } from "vitest";
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
  // The hang, which is the one that cost us the browser. A throwing close was
  // always handled; a close that never settles was not, and everything after
  // it — above all the release that frees the browser's context — then never
  // ran. A context that is never released keeps its browser from being
  // reaped, and that process holds every megabyte it grew until the container
  // is killed.
  it("still releases the context when closing the page hangs forever", async () => {
    vi.useFakeTimers();
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
                close: () => new Promise<void>(() => {}),
              } as never;
            },
          } as never,
          release: async () => { released++; },
        };
      },
    };

    const running = runPage(resolver, { url: "https://x.com" }, async () => "extracted");
    await vi.advanceTimersByTimeAsync(9_000);
    expect(released).toBe(0); // the close is still being given its chance

    await vi.advanceTimersByTimeAsync(2_000);
    expect(await running).toBe("extracted");
    expect(released).toBe(1);
  });

  // Both halves can hang: a release that never settles must not leave the
  // request itself pending, or the caller's own slot is held for good.
  it("returns even when the release hangs forever", async () => {
    vi.useFakeTimers();
    const resolver: ContextResolver = {
      async acquire() {
        return {
          context: {
            async newPage() {
              return {
                setExtraHTTPHeaders: async () => {}, setViewportSize: async () => {}, route: async () => {},
                goto: async () => null, setContent: async () => {}, waitForSelector: async () => {},
                waitForTimeout: async () => {}, waitForFunction: async () => {},
                close: async () => {},
              } as never;
            },
          } as never,
          release: () => new Promise<void>(() => {}),
        };
      },
    };

    const running = runPage(resolver, { url: "https://x.com" }, async () => "extracted");
    await vi.advanceTimersByTimeAsync(11_000);
    expect(await running).toBe("extracted");
  });
});

afterEach(() => {
  vi.useRealTimers();
});
