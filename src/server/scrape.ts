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
