import type { BrowserContext, Page } from "playwright-core";

export interface PageOptions {
  url?: string;
  html?: string;
  gotoOptions?: { waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit"; timeout?: number };
  waitForSelector?: { selector: string; timeout?: number };
  waitForTimeout?: number;
  waitForFunction?: { fn: string; timeout?: number };
  bestAttempt?: boolean;
  viewport?: { width: number; height: number };
  rejectResourceTypes?: string[];
  rejectRequestPattern?: string[];
  setExtraHTTPHeaders?: Record<string, string>;
}

export function resolveTarget(opts: PageOptions): { kind: "url" | "html"; value: string } {
  if (opts.url) return { kind: "url", value: opts.url };
  if (opts.html !== undefined) return { kind: "html", value: opts.html };
  throw new Error("one of url or html is required");
}

/** Minimal structural type so this is unit-testable without a real Page. */
type PageLike = Pick<
  Page,
  "setExtraHTTPHeaders" | "setViewportSize" | "route" | "goto" | "setContent" | "waitForSelector" | "waitForTimeout" | "waitForFunction"
>;

export async function applyPageOptions(page: PageLike, opts: PageOptions): Promise<void> {
  if (opts.setExtraHTTPHeaders) await page.setExtraHTTPHeaders(opts.setExtraHTTPHeaders);
  if (opts.viewport) await page.setViewportSize(opts.viewport);

  const reject = new Set(opts.rejectResourceTypes ?? []);
  const patterns = (opts.rejectRequestPattern ?? []).map((p) => new RegExp(p));
  if (reject.size || patterns.length) {
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (reject.has(req.resourceType()) || patterns.some((re) => re.test(req.url()))) return route.abort();
      return route.continue();
    });
  }

  const target = resolveTarget(opts);
  const bestAttempt = opts.bestAttempt ?? false;
  const guard = async (p: Promise<unknown>) => {
    try { await p; } catch (err) { if (!bestAttempt) throw err; }
  };

  if (target.kind === "url") await guard(page.goto(target.value, opts.gotoOptions ?? {}));
  else await page.setContent(target.value, opts.gotoOptions ?? {});

  if (opts.waitForSelector) await guard(page.waitForSelector(opts.waitForSelector.selector, { timeout: opts.waitForSelector.timeout }));
  if (opts.waitForTimeout) await page.waitForTimeout(opts.waitForTimeout);
  if (opts.waitForFunction) await guard(page.waitForFunction(opts.waitForFunction.fn, undefined, { timeout: opts.waitForFunction.timeout }));
}

export interface AcquiredContext {
  context: Pick<BrowserContext, "newPage">;
  release(): Promise<void>;
}
export interface ContextResolver {
  acquire(): Promise<AcquiredContext>;
}

export async function runPage<T>(
  resolver: ContextResolver,
  opts: PageOptions,
  extract: (page: Page) => Promise<T>
): Promise<T> {
  const { context, release } = await resolver.acquire();
  let page: Awaited<ReturnType<BrowserContext["newPage"]>> | undefined;
  try {
    page = await context.newPage();
    await applyPageOptions(page as unknown as PageLike, opts);
    return await extract(page as unknown as Page);
  } finally {
    // Cleanup must never mask the real outcome, and closing the page must never
    // skip the release (an un-released ephemeral context leaks a browser).
    if (page) await swallow(() => page!.close());
    await swallow(release);
  }
}

/** How long a cleanup call is given before it is abandoned. */
const CLEANUP_TIMEOUT_MS = 10_000;

/**
 * Run `fn` and continue regardless of how it ends, including not ending.
 *
 * A rejection was always handled here. A call that never settles was not, and
 * that is the one that mattered: `page.close()` against a renderer that has
 * crashed can stay pending indefinitely, and then everything after it never
 * runs — above all the release that frees the browser's context. A context
 * that is never released keeps its browser from being reaped, and that
 * process holds every megabyte it has grown until the container is killed.
 */
async function swallow(fn: () => Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("cleanup timed out")), CLEANUP_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // ignore
  } finally {
    if (timer) clearTimeout(timer);
  }
}
