# Morrow Plan 4: Scrape Family & OpenAPI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browserless-style HTTP APIs — `POST /screenshot`, `/content`, `/scrape` — each optionally running inside a persistent profile (authenticated scraping, zero cookie management), plus an OpenAPI document served at `/api/v1/openapi.json` and a themed Swagger UI at `/api-docs` for client codegen.

**Architecture:** A shared page-runner takes a `PageJob` (profile? + target + page options), opens a page in the right context (the profile's persistent context, or an ephemeral utility context), applies waits, runs an extractor, cleans up. Endpoints are thin: parse+validate → run → format. OpenAPI is generated from the same zod schemas the routes use (`zod-to-openapi`), so the doc can't drift from the code.

**Spec:** v1 design §4 (scrape family, page options), §14–16 (readability), §7 (Swagger for codegen). Plan 4 of ~6.

**Deferred (deliberate):** PDF, HAR, `elements` structured extraction beyond a simple selector→text map. `/function`, `/download` stay out (code-exec surface). Ephemeral (no-profile) scrapes use a shared utility browser server started lazily and reused.

---

### Task 1: Utility browser + page runner

**Files:**
- Create: `src/server/browser/pagerunner.ts`
- Test: `tests/unit/pagerunner.test.ts`

The runner resolves a context, applies page options, and hands the page to an extractor. Unit-test the pure parts (option application, context resolution) against a fake page/context; real-browser coverage is the integration task.

- [ ] **Step 1: Failing test** `tests/unit/pagerunner.test.ts` — fake context/page capturing calls:

```ts
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
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement `src/server/browser/pagerunner.ts`:**

```ts
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
```

(The `route`/`goto`/`setContent`/`waitFor*` signatures accept the extra option objects at runtime; the fake in the test mirrors them. If TS complains about `route`'s callback type against `PageLike`, widen the `PageLike` `route` member to `(glob: string, handler: (route: never) => Promise<unknown>) => Promise<void>` and cast inside — keep behavior.)

- [ ] **Step 4: PASS + gates. Commit** — `feat: page runner with browserless-style page options`

---

### Task 2: Utility browser + context resolution

**Files:**
- Create: `src/server/browser/utility.ts`
- Modify: `src/server/browser/pagerunner.ts` (add `runPage`)
- Test: `tests/unit/runpage.test.ts`

- [ ] **Step 1: Failing test** — `runPage` with a fake resolver, asserting context reuse and page cleanup:

```ts
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
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Add to `pagerunner.ts`:**

```ts
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
    if (page) await page.close().catch(() => {});
    await release().catch(() => {});
  }
}
```

- [ ] **Step 4: Implement `src/server/browser/utility.ts`** — resolvers for profile vs ephemeral:

```ts
import { firefox } from "playwright-core";
import { launchServer } from "camoufox-js";
import type { AcquiredContext, ContextResolver } from "@/server/browser/pagerunner";
import { getProfileManager } from "@/server/profiles";
import { globalSingleton } from "@/server/global";

/** Runs inside a profile's persistent context — authenticated scraping. Never closes it. */
export function profileResolver(name: string): ContextResolver {
  return {
    async acquire(): Promise<AcquiredContext> {
      const rp = await getProfileManager().start(name);
      return { context: rp.browser.context, release: async () => {} };
    },
  };
}

/** Ephemeral: a throwaway context on a shared lazily-started utility browser server. */
export function ephemeralResolver(): ContextResolver {
  return {
    async acquire(): Promise<AcquiredContext> {
      const server = await utilityServer();
      const browser = await firefox.connect(server.wsEndpoint);
      const context = await browser.newContext();
      return {
        context,
        release: async () => {
          await context.close().catch(() => {});
          await browser.close().catch(() => {});
        },
      };
    },
  };
}

interface UtilityServer { wsEndpoint: string; }

async function utilityServer(): Promise<UtilityServer> {
  return globalSingleton<Promise<UtilityServer>>("utilityServer", async () => {
    const server = await launchServer({ headless: true } as Parameters<typeof launchServer>[0]);
    return { wsEndpoint: server.wsEndpoint() };
  }) as unknown as UtilityServer extends Promise<infer _> ? never : Promise<UtilityServer> extends never ? never : Promise<UtilityServer> ;
}
```

Note the globalSingleton-of-a-Promise pattern is awkward; implement it cleanly: store the promise so concurrent callers share one launch. Simplify to:

```ts
async function utilityServer(): Promise<UtilityServer> {
  const p = globalSingleton("utilityServerPromise", async (): Promise<UtilityServer> => {
    const server = await launchServer({ headless: true } as Parameters<typeof launchServer>[0]);
    return { wsEndpoint: server.wsEndpoint() };
  });
  return p;
}
```

- [ ] **Step 5: PASS + gates. Commit** — `feat: profile and ephemeral context resolvers`

---

### Task 3: Extractors + scrape endpoints

**Files:**
- Create: `src/server/browser/extract.ts`, `src/server/scrape.ts`, `src/app/api/v1/screenshot/route.ts`, `.../content/route.ts`, `.../scrape/route.ts`
- Modify: `src/server/validation.ts` (page-options + endpoint schemas), `package.json` (`@mozilla/readability`, `turndown`, `linkedom` or `jsdom`)
- Test: `tests/unit/extract.test.ts`, `tests/unit/scrape-api.test.ts`

- [ ] **Step 1: `npm install @mozilla/readability turndown jsdom` + `npm install -D @types/turndown @types/jsdom`**

- [ ] **Step 2: Failing test** `tests/unit/extract.test.ts` for the pure markdown/readability pipeline (operates on an HTML string, no browser):

```ts
import { describe, it, expect } from "vitest";
import { htmlToArticle, htmlToMarkdown } from "@/server/browser/extract";

const ARTICLE = `<!doctype html><html><head><title>Hello</title></head><body>
<article><h1>Hello World</h1><p>First paragraph with <a href="https://x.com">a link</a>.</p>
<p>Second paragraph.</p></article></body></html>`;

describe("htmlToMarkdown", () => {
  it("converts headings, paragraphs and links", () => {
    const md = htmlToMarkdown("<h1>Title</h1><p>Body <a href=\"https://x.com\">link</a>.</p>");
    expect(md).toContain("# Title");
    expect(md).toContain("[link](https://x.com)");
  });
});

describe("htmlToArticle", () => {
  it("extracts title, text and markdown from an article", () => {
    const a = htmlToArticle(ARTICLE, "https://example.com/post");
    expect(a.title).toBe("Hello World");
    expect(a.text).toContain("First paragraph");
    expect(a.markdown).toContain("Hello World");
    expect(a.markdown).toContain("[a link](https://x.com)");
  });

  it("degrades gracefully on non-article html", () => {
    const a = htmlToArticle("<html><body><div>bits</div></body></html>", "https://x.com");
    expect(typeof a.markdown).toBe("string"); // never throws
  });
});
```

- [ ] **Step 3: FAIL.**
- [ ] **Step 4: Implement `src/server/browser/extract.ts`:**

```ts
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim();
}

export interface Article {
  title: string | null;
  byline: string | null;
  excerpt: string | null;
  content: string | null; // cleaned HTML
  text: string | null;
  markdown: string;
}

export function htmlToArticle(html: string, url: string): Article {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const parsed = reader.parse();
  const contentHtml = parsed?.content ?? html;
  return {
    title: parsed?.title ?? null,
    byline: parsed?.byline ?? null,
    excerpt: parsed?.excerpt ?? null,
    content: parsed?.content ?? null,
    text: parsed?.textContent?.trim() ?? null,
    markdown: htmlToMarkdown(contentHtml),
  };
}
```

- [ ] **Step 5: Implement `src/server/scrape.ts`** — glue from validated request → resolver → extractor:

```ts
import type { Page } from "playwright-core";
import { runPage, type PageOptions } from "@/server/browser/pagerunner";
import { profileResolver, ephemeralResolver } from "@/server/browser/utility";
import { htmlToArticle, htmlToMarkdown } from "@/server/browser/extract";

function resolverFor(profile?: string) {
  return profile ? profileResolver(profile) : ephemeralResolver();
}

export async function runContent(profile: string | undefined, opts: PageOptions): Promise<string> {
  return runPage(resolverFor(profile), opts, (page: Page) => page.content());
}

export async function runScreenshot(
  profile: string | undefined,
  opts: PageOptions,
  shot: { fullPage?: boolean; type?: "png" | "jpeg"; quality?: number; selector?: string }
): Promise<Buffer> {
  return runPage(resolverFor(profile), opts, async (page: Page) => {
    if (shot.selector) {
      const el = await page.waitForSelector(shot.selector);
      return (await el!.screenshot({ type: shot.type ?? "png", quality: shot.quality })) as Buffer;
    }
    return (await page.screenshot({
      fullPage: shot.fullPage ?? false,
      type: shot.type ?? "png",
      quality: shot.type === "jpeg" ? shot.quality : undefined,
    })) as Buffer;
  });
}

export interface ScrapeResult {
  url: string;
  title?: string | null;
  markdown?: string;
  text?: string | null;
  article?: ReturnType<typeof htmlToArticle>;
  elements?: Record<string, string[]>;
}

export async function runScrape(
  profile: string | undefined,
  opts: PageOptions,
  fmt: { format: "markdown" | "text" | "article"; elements?: { selector: string }[] }
): Promise<ScrapeResult> {
  return runPage(resolverFor(profile), opts, async (page: Page) => {
    const url = page.url();
    const html = await page.content();
    const out: ScrapeResult = { url };
    if (fmt.format === "article") out.article = htmlToArticle(html, url || "https://morrow.local");
    else if (fmt.format === "text") out.text = (await page.evaluate(() => document.body?.innerText ?? "")) as string;
    else out.markdown = htmlToMarkdown(html);
    if (fmt.elements?.length) {
      const map: Record<string, string[]> = {};
      for (const { selector } of fmt.elements) {
        map[selector] = (await page.evaluate(
          (sel) => Array.from(document.querySelectorAll(sel)).map((e) => (e as HTMLElement).innerText ?? e.textContent ?? ""),
          selector
        )) as string[];
      }
      out.elements = map;
    }
    return out;
  });
}
```

- [ ] **Step 6: Add schemas to `src/server/validation.ts`:**

```ts
export const pageOptionsSchema = z.object({
  url: z.string().url().optional(),
  html: z.string().optional(),
  profile: profileName.optional(),
  gotoOptions: z.object({
    waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional(),
    timeout: z.number().int().positive().max(120000).optional(),
  }).optional(),
  waitForSelector: z.object({ selector: z.string().min(1), timeout: z.number().int().positive().max(120000).optional() }).optional(),
  waitForTimeout: z.number().int().nonnegative().max(60000).optional(),
  waitForFunction: z.object({ fn: z.string().min(1), timeout: z.number().int().positive().max(120000).optional() }).optional(),
  bestAttempt: z.boolean().optional(),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
  rejectResourceTypes: z.array(z.string()).optional(),
  rejectRequestPattern: z.array(z.string()).optional(),
  setExtraHTTPHeaders: z.record(z.string(), z.string()).optional(),
}).refine((v) => v.url || v.html !== undefined, { message: "one of url or html is required" });

export const screenshotSchema = pageOptionsSchema.and(z.object({
  fullPage: z.boolean().optional(),
  type: z.enum(["png", "jpeg"]).optional(),
  quality: z.number().int().min(0).max(100).optional(),
  selector: z.string().min(1).optional(),
}));

export const scrapeSchema = pageOptionsSchema.and(z.object({
  format: z.enum(["markdown", "text", "article"]).default("markdown"),
  elements: z.array(z.object({ selector: z.string().min(1) })).optional(),
}));
```

(If `.and()` composition fights the `.refine` on `pageOptionsSchema`, switch to a base `z.object` without refine, compose with `.merge()`, and apply a single `.superRefine` at the end. Keep the same field set + the url/html requirement. Report the shape you used.)

- [ ] **Step 7: Implement the three routes.** `src/app/api/v1/content/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { parseBody, pageOptionsSchema } from "@/server/validation";
import { runContent } from "@/server/scrape";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const body = await parseBody(req, pageOptionsSchema);
    const html = await runContent(body.profile, body);
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  });
}
```

`src/app/api/v1/screenshot/route.ts` — returns image bytes:

```ts
import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { parseBody, screenshotSchema } from "@/server/validation";
import { runScreenshot } from "@/server/scrape";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const body = await parseBody(req, screenshotSchema);
    const buf = await runScreenshot(body.profile, body, body);
    const type = body.type === "jpeg" ? "image/jpeg" : "image/png";
    return new NextResponse(new Uint8Array(buf), { headers: { "content-type": type } });
  });
}
```

`src/app/api/v1/scrape/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { parseBody, scrapeSchema } from "@/server/validation";
import { runScrape } from "@/server/scrape";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const body = await parseBody(req, scrapeSchema);
    const result = await runScrape(body.profile, body, body);
    return NextResponse.json(result);
  });
}
```

- [ ] **Step 8: Failing+passing `tests/unit/scrape-api.test.ts`** — inject a fake resolver via the singleton store so no real browser launches. Since routes call `runContent`/etc which build resolvers internally, the cleanest seam is to test `runScrape`/`runContent`/`runScreenshot` with a fake resolver by pre-seeding `globalThis.__morrow.utilityServerPromise` — BUT that still needs a real ws. Instead: unit-test validation + formatting via the route with `html` targets is impossible without a browser. So scope these unit tests to **validation and auth only** (mock nothing browser-related): assert 400 on missing url/html, 400 on bad format enum, 401 without token, 400 when both absent. Full behavior is the integration task.

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.stubEnv("MORROW_API_KEY", "secret"));
afterEach(() => vi.unstubAllEnvs());
const auth = { authorization: "Bearer secret", "content-type": "application/json" };

async function post(path: string, body: unknown, headers = auth) {
  const mod = await import(`@/app/api/v1/${path}/route`);
  return mod.POST(new Request(`http://x/api/v1/${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
}

describe("scrape family validation", () => {
  it("401 without token", async () => {
    expect((await post("scrape", { url: "https://x.com" }, { "content-type": "application/json" })).status).toBe(401);
  });
  it("400 when neither url nor html", async () => {
    const res = await post("content", {});
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_request");
  });
  it("400 on bad screenshot type", async () => {
    expect((await post("screenshot", { url: "https://x.com", type: "gif" })).status).toBe(400);
  });
  it("400 on bad scrape format", async () => {
    expect((await post("scrape", { url: "https://x.com", format: "yaml" })).status).toBe(400);
  });
});
```

- [ ] **Step 9: PASS + gates. Commit** — `feat: screenshot, content and scrape endpoints`

---

### Task 4: OpenAPI document + Swagger UI

**Files:**
- Create: `src/server/openapi.ts`, `src/app/api/v1/openapi.json/route.ts`, `src/app/api-docs/page.tsx`
- Modify: `package.json` (`@asteasolutions/zod-to-openapi`)
- Test: `tests/unit/openapi.test.ts`

- [ ] **Step 1: `npm install @asteasolutions/zod-to-openapi`**

- [ ] **Step 2: Failing test** `tests/unit/openapi.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildOpenApiDocument } from "@/server/openapi";

describe("buildOpenApiDocument", () => {
  it("is a valid-shaped openapi 3 doc covering the core endpoints", () => {
    const doc = buildOpenApiDocument();
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe("Morrow");
    expect(doc.info.version).toBeTruthy();
    const paths = Object.keys(doc.paths ?? {});
    for (const p of ["/profiles", "/profiles/{name}", "/profiles/{name}/start", "/scrape", "/screenshot", "/content", "/sessions"]) {
      expect(paths).toContain(p);
    }
    // bearer security registered
    expect(doc.components?.securitySchemes?.bearerAuth).toBeTruthy();
  });
});
```

- [ ] **Step 3: FAIL.**
- [ ] **Step 4: Implement `src/server/openapi.ts`** — register schemas + paths with the OpenAPI registry, produce the document. Import the zod schemas from `validation.ts` (extend them with `.openapi()` metadata via `extendZodWithOpenApi`). Version comes from `package.json`. Include: profiles CRUD + lifecycle, sessions, scrape family, health, pressure. Base path `/api/v1`, bearer security scheme. Keep it a single focused builder function returning the doc object. (This is the largest single file — if it grows past ~250 lines, split path definitions into `src/server/openapi-paths.ts` and keep the builder in `openapi.ts`.)

- [ ] **Step 5: Implement `src/app/api/v1/openapi.json/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/server/openapi";

export const dynamic = "force-dynamic";
// Public: codegen tools and Swagger UI fetch this without a key.
export async function GET() {
  return NextResponse.json(buildOpenApiDocument());
}
```

- [ ] **Step 6: Implement `src/app/api-docs/page.tsx`** — Swagger UI themed to Morrow. Use `swagger-ui-react` if it plays with Next 16 RSC (mark `"use client"`); if it fights the build, fall back to a static HTML page embedding Swagger UI from a bundled asset, or Scalar (`@scalar/nextjs-api-reference`). Whatever renders, it must load `/api/v1/openapi.json` and be styled dark/ember (a `<style>` block overriding Swagger UI's CSS variables is fine). `npm install swagger-ui-react` (+ `@types` if needed) OR the chosen alternative — report which.

- [ ] **Step 7: PASS + gates (build MUST pass — the api-docs page is the risk). Manual:** boot dev, `curl localhost:PORT/api/v1/openapi.json | head` shows a valid doc; open `/api-docs` renders (report by curling the HTML for a Swagger/Scalar marker). Commit — `feat: openapi document and swagger ui`

---

### Task 5: Integration + release v0.4.0

**Files:**
- Create: `tests/integration/scrape.test.ts`
- Modify: README, package.json, jekyo.yaml, `.github/workflows/ci.yml` (deps for jsdom fine; no new system libs)

- [ ] **Step 1: `tests/integration/scrape.test.ts`** (real browser, `runIf(MORROW_IT)`): ephemeral scrape of a `data:`/`html` target → markdown contains expected text; screenshot returns PNG magic bytes; content returns `<html`. Plus one profile-scoped scrape proving it uses the persistent context (create profile, set a cookie via the runtime, scrape an `html` page that reads nothing sensitive — just assert it runs in-profile without error). Use `html` targets to avoid network flakiness.

```ts
import { describe, it, expect } from "vitest";
import { runScrape, runScreenshot, runContent } from "@/server/scrape";

const enabled = process.env.MORROW_IT === "1";
const PAGE = "<!doctype html><html><head><title>T</title></head><body><article><h1>Morrow Rocks</h1><p>Body text here.</p></article></body></html>";

describe.runIf(enabled)("scrape family (real camoufox, ephemeral)", () => {
  it("scrape → markdown", async () => {
    const r = await runScrape(undefined, { html: PAGE }, { format: "markdown" });
    expect(r.markdown).toContain("Morrow Rocks");
  }, 120000);
  it("scrape → article", async () => {
    const r = await runScrape(undefined, { html: PAGE }, { format: "article" });
    expect(r.article?.title).toContain("Morrow Rocks");
  }, 120000);
  it("screenshot → png bytes", async () => {
    const buf = await runScreenshot(undefined, { html: PAGE }, { type: "png" });
    expect(buf.subarray(0, 4).toString("hex")).toBe("89504e47");
  }, 120000);
  it("content → html", async () => {
    const html = await runContent(undefined, { html: PAGE });
    expect(html.toLowerCase()).toContain("<html");
  }, 120000);
});
```

- [ ] **Step 2:** README "Scraping" section (curl examples for scrape/screenshot/content, note `profile` param for authenticated scraping); mention `/api-docs` + OpenAPI codegen.
- [ ] **Step 3:** Bump package.json → `0.4.0`, jekyo.yaml image → `0.4.0`.
- [ ] **Step 4:** Full gates + `npm run test:integration` (persistence + attach + scrape = 8 passed). Commit — `chore: release v0.4.0`. Merge/tag/push/verify.

---

## Acceptance for Plan 4

- `/screenshot`, `/content`, `/scrape` work with `url` or `html`, with or without a `profile`; page options (waits, viewport, resource blocking, headers) applied; markdown/article/text formats.
- Authenticated scraping: `profile` uses the persistent context; ephemeral uses a shared utility browser.
- `/api/v1/openapi.json` is a valid OpenAPI 3 doc covering all endpoints; `/api-docs` renders it, themed.
- Integration: real-browser scrape/screenshot/content pass.
- `ghcr.io/jekyo/morrow:0.4.0` published.
