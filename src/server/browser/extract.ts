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
