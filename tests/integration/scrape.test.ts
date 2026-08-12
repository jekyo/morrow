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
    // readability 0.6.0 resolves title from the <title> tag ("T") rather than
    // the in-article h1 for this minimal fixture, so title alone doesn't carry
    // "Morrow Rocks" — but the extracted article markdown does. Assert on the
    // real fields the article carries instead of the title in isolation.
    expect(`${r.article?.title ?? ""}\n${r.article?.markdown ?? ""}`).toContain("Morrow Rocks");
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
