import { z } from "zod";

/** Minimal structural page interface — matches Playwright's Page for the operations tools need. */
export interface ToolPage {
  goto(url: string, options?: { waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit" }): Promise<unknown>;
  title(): Promise<string>;
  url(): string;
  click(selector: string): Promise<void>;
  fill(selector: string, text: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  keyboard: { press(key: string): Promise<void> };
  mouse: { wheel(dx: number, dy: number): Promise<void> };
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  screenshot(options?: { fullPage?: boolean }): Promise<Buffer>;
  /**
   * playwright-core 1.60 replaced the legacy `page.accessibility.snapshot()`
   * with `ariaSnapshot()`, which returns a YAML aria tree. In `"ai"` mode it
   * also emits `[ref=eN]` element handles, which is what makes the tree
   * actionable for an agent.
   */
  ariaSnapshot(options?: { mode?: "ai" | "default" }): Promise<string>;
  content(): Promise<string>;
  evaluate(...args: unknown[]): Promise<unknown>;
}

export interface ProfileSummary {
  name: string;
  status: string;
  [key: string]: unknown;
}

export interface ScrapeResult {
  url: string;
  title?: string | null;
  markdown?: string;
  text?: string | null;
  [key: string]: unknown;
}

/** Injected dependencies — the boundary between pure tool logic and the real ProfileManager/db/scrape code. */
export interface ToolDeps {
  listProfiles(): Promise<ProfileSummary[]>;
  createProfile(name: string, opts?: { proxy?: string; locale?: string; timezone?: string }): Promise<ProfileSummary>;
  startProfile(name: string): Promise<void>;
  stopProfile(name: string): Promise<void>;
  activePage(profile: string): Promise<ToolPage>;
  scrape(
    profile: string,
    opts: { url?: string; html?: string },
    fmt: { format?: "markdown" | "text" | "article" }
  ): Promise<ScrapeResult>;
}

export interface Tool<TArgs = unknown, TResult = unknown> {
  description: string;
  inputSchema: z.ZodType<TArgs>;
  handler: (args: TArgs) => Promise<TResult>;
}

export type ToolMap = Record<string, Tool>;

export function makeTools(deps: ToolDeps) {
  const listProfilesSchema = z.object({});

  const createProfileSchema = z.object({
    name: z.string(),
    proxy: z.string().optional(),
    locale: z.string().optional(),
    timezone: z.string().optional(),
  });

  const startProfileSchema = z.object({ name: z.string() });
  const stopProfileSchema = z.object({ name: z.string() });

  const navigateSchema = z.object({
    profile: z.string(),
    url: z.string(),
    waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional(),
  });

  const snapshotSchema = z.object({ profile: z.string() });

  const clickSchema = z.object({ profile: z.string(), selector: z.string() });

  const typeSchema = z.object({
    profile: z.string(),
    selector: z.string(),
    text: z.string(),
    submit: z.boolean().optional(),
  });

  const pressKeySchema = z.object({ profile: z.string(), key: z.string() });

  const scrollSchema = z.object({
    profile: z.string(),
    dx: z.number().optional(),
    dy: z.number().optional(),
  });

  const waitForSchema = z.object({
    profile: z.string(),
    selector: z.string(),
    timeout: z.number().optional(),
  });

  const screenshotSchema = z.object({
    profile: z.string(),
    fullPage: z.boolean().optional(),
  });

  const scrapeSchema = z.object({
    profile: z.string(),
    url: z.string().optional(),
    format: z.enum(["markdown", "text", "article"]).optional(),
  });

  return {
    list_profiles: {
      description: "List all profiles and their status.",
      inputSchema: listProfilesSchema,
      handler: async (_args: z.infer<typeof listProfilesSchema>) => deps.listProfiles(),
    },

    create_profile: {
      description: "Create a new profile.",
      inputSchema: createProfileSchema,
      handler: async (args: z.infer<typeof createProfileSchema>) =>
        deps.createProfile(args.name, { proxy: args.proxy, locale: args.locale, timezone: args.timezone }),
    },

    start_profile: {
      description: "Start a profile's browser.",
      inputSchema: startProfileSchema,
      handler: async (args: z.infer<typeof startProfileSchema>) => deps.startProfile(args.name),
    },

    stop_profile: {
      description: "Stop a profile's browser.",
      inputSchema: stopProfileSchema,
      handler: async (args: z.infer<typeof stopProfileSchema>) => deps.stopProfile(args.name),
    },

    navigate: {
      description: "Navigate the profile's active page to a URL.",
      inputSchema: navigateSchema,
      handler: async (args: z.infer<typeof navigateSchema>) => {
        const page = await deps.activePage(args.profile);
        await page.goto(args.url, args.waitUntil ? { waitUntil: args.waitUntil } : undefined);
        return { title: await page.title(), url: page.url() };
      },
    },

    snapshot: {
      description:
        "Get a compact accessibility (aria) tree of the current page as YAML, with [ref=eN] element handles — the agent-friendly view. Returns { url, title, snapshot }.",
      inputSchema: snapshotSchema,
      handler: async (args: z.infer<typeof snapshotSchema>) => {
        const page = await deps.activePage(args.profile);
        return {
          url: page.url(),
          title: await page.title(),
          snapshot: await page.ariaSnapshot({ mode: "ai" }),
        };
      },
    },

    click: {
      description: "Click an element matching a selector.",
      inputSchema: clickSchema,
      handler: async (args: z.infer<typeof clickSchema>) => {
        const page = await deps.activePage(args.profile);
        await page.click(args.selector);
        return { ok: true };
      },
    },

    type: {
      description: "Fill an input's content (replacing it), optionally submitting with Enter.",
      inputSchema: typeSchema,
      handler: async (args: z.infer<typeof typeSchema>) => {
        const page = await deps.activePage(args.profile);
        await page.fill(args.selector, args.text);
        if (args.submit) await page.keyboard.press("Enter");
        return { ok: true };
      },
    },

    press_key: {
      description: "Press a keyboard key.",
      inputSchema: pressKeySchema,
      handler: async (args: z.infer<typeof pressKeySchema>) => {
        const page = await deps.activePage(args.profile);
        await page.keyboard.press(args.key);
        return { ok: true };
      },
    },

    scroll: {
      description: "Scroll the page by dx/dy pixels.",
      inputSchema: scrollSchema,
      handler: async (args: z.infer<typeof scrollSchema>) => {
        const page = await deps.activePage(args.profile);
        await page.mouse.wheel(args.dx ?? 0, args.dy ?? 0);
        return { ok: true };
      },
    },

    wait_for: {
      description: "Wait for an element matching a selector to appear.",
      inputSchema: waitForSchema,
      handler: async (args: z.infer<typeof waitForSchema>) => {
        const page = await deps.activePage(args.profile);
        await page.waitForSelector(args.selector, args.timeout !== undefined ? { timeout: args.timeout } : undefined);
        return { ok: true };
      },
    },

    screenshot: {
      description: "Take a screenshot of the current page, returned as base64 PNG.",
      inputSchema: screenshotSchema,
      handler: async (args: z.infer<typeof screenshotSchema>) => {
        const page = await deps.activePage(args.profile);
        const buf = await page.screenshot({ fullPage: args.fullPage ?? false });
        return { image: buf.toString("base64") };
      },
    },

    scrape: {
      description: "Scrape the current page (or a given url) into markdown/text/article.",
      inputSchema: scrapeSchema,
      handler: async (args: z.infer<typeof scrapeSchema>) => deps.scrape(args.profile, { url: args.url }, { format: args.format }),
    },
  };
}
