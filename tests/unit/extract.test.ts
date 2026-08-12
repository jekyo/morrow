import { describe, it, expect } from "vitest";
import { htmlToArticle, htmlToMarkdown } from "@/server/browser/extract";

const ARTICLE = `<!doctype html><html><head><title>Hello World</title></head><body>
<article><h1>Hello World</h1><p>Hello World: First paragraph with <a href="https://x.com">a link</a>.</p>
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
    expect(a.markdown).toContain("[a link](https://x.com/)");
  });

  it("degrades gracefully on non-article html", () => {
    const a = htmlToArticle("<html><body><div>bits</div></body></html>", "https://x.com");
    expect(typeof a.markdown).toBe("string"); // never throws
  });
});
