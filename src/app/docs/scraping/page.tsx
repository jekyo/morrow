import type { Metadata } from "next";
import Link from "next/link";
import { DocsHeader, DocsSection, P } from "@/components/docs/DocsHeader";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { DocsPager } from "@/components/docs/DocsPager";

export const metadata: Metadata = {
  title: "Scraping API — Morrow docs",
  description: "One-shot REST endpoints for markdown, screenshots, and rendered HTML — with optional profile auth.",
};

export default function ScrapingPage() {
  return (
    <>
      <DocsHeader
        kicker="Integrations"
        title="Scraping API"
        lead="Browserless-style HTTP endpoints for one-shot page work: cleaned markdown, screenshots, and raw HTML."
      />

      <DocsSection title="POST /scrape">
        <P>
          Get clean content from a page. Every request needs{" "}
          <code className="font-mono text-[13px]">Authorization: Bearer $MORROW_API_KEY</code> and a{" "}
          <code className="font-mono text-[13px]">url</code> or <code className="font-mono text-[13px]">html</code>{" "}
          target.
        </P>
        <CodeBlock label="POST /api/v1/scrape">{`curl -X POST http://localhost:3000/api/v1/scrape \\
  -H "Authorization: Bearer $MORROW_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com", "format": "markdown"}'`}</CodeBlock>
        <P>
          <code className="font-mono text-[13px]">format</code> is one of:
        </P>
        <ul className="text-base-content/80 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <code className="font-mono text-[13px]">markdown</code> (default) — the page rendered as Markdown.
          </li>
          <li>
            <code className="font-mono text-[13px]">text</code> — plain{" "}
            <code className="font-mono text-[13px]">innerText</code>.
          </li>
          <li>
            <code className="font-mono text-[13px]">article</code> — Readability-based extraction:
            title/byline/excerpt/content/text plus a markdown rendering.
          </li>
        </ul>
      </DocsSection>

      <DocsSection title="POST /screenshot">
        <CodeBlock label="POST /api/v1/screenshot">{`curl -X POST http://localhost:3000/api/v1/screenshot \\
  -H "Authorization: Bearer $MORROW_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com", "fullPage": true}' \\
  -o screenshot.png`}</CodeBlock>
        <P>
          Also takes <code className="font-mono text-[13px]">type</code> (<code className="font-mono text-[13px]">png</code>{" "}
          or <code className="font-mono text-[13px]">jpeg</code>), <code className="font-mono text-[13px]">quality</code>,
          and <code className="font-mono text-[13px]">selector</code> to screenshot a single element.
        </P>
      </DocsSection>

      <DocsSection title="POST /content">
        <CodeBlock label="POST /api/v1/content">{`curl -X POST http://localhost:3000/api/v1/content \\
  -H "Authorization: Bearer $MORROW_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com"}'`}</CodeBlock>
        <P>Returns the fully rendered HTML after the page loads.</P>
      </DocsSection>

      <DocsSection title="Page options">
        <P>All three endpoints accept the same set of page-behavior options:</P>
        <ul className="text-base-content/80 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <code className="font-mono text-[13px]">gotoOptions</code> — <code className="font-mono text-[13px]">{"{ waitUntil, timeout }"}</code>,{" "}
            <code className="font-mono text-[13px]">waitUntil</code> one of{" "}
            <code className="font-mono text-[13px]">load</code>, <code className="font-mono text-[13px]">domcontentloaded</code>,{" "}
            <code className="font-mono text-[13px]">networkidle</code>, <code className="font-mono text-[13px]">commit</code>.
          </li>
          <li>
            <code className="font-mono text-[13px]">waitForSelector</code> — <code className="font-mono text-[13px]">{"{ selector, timeout }"}</code>.
          </li>
          <li>
            <code className="font-mono text-[13px]">waitForTimeout</code> — fixed delay in ms (max 60000).
          </li>
          <li>
            <code className="font-mono text-[13px]">waitForFunction</code> — <code className="font-mono text-[13px]">{"{ fn, timeout }"}</code>, a
            JS expression to poll.
          </li>
          <li>
            <code className="font-mono text-[13px]">viewport</code> — <code className="font-mono text-[13px]">{"{ width, height }"}</code> for this
            request.
          </li>
          <li>
            <code className="font-mono text-[13px]">rejectResourceTypes</code> / <code className="font-mono text-[13px]">rejectRequestPattern</code> —
            block resource types (e.g. <code className="font-mono text-[13px]">image</code>) or URL patterns from loading.
          </li>
          <li>
            <code className="font-mono text-[13px]">setExtraHTTPHeaders</code> — extra request headers.
          </li>
          <li>
            <code className="font-mono text-[13px]">bestAttempt</code> — return whatever loaded even if a wait condition times out,
            instead of erroring.
          </li>
        </ul>
      </DocsSection>

      <DocsSection title="Scraping through a profile">
        <P>
          Add <code className="font-mono text-[13px]">&quot;profile&quot;: &quot;research-eu&quot;</code> to any of
          the three requests to run the scrape inside that profile&apos;s persistent, logged-in browser context
          instead of a throwaway one:
        </P>
        <CodeBlock label="POST /api/v1/scrape">{`curl -X POST http://localhost:3000/api/v1/scrape \\
  -H "Authorization: Bearer $MORROW_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com/account", "profile": "research-eu", "format": "markdown"}'`}</CodeBlock>
        <P>
          No cookie or session handoff required — if{" "}
          <Link href="/docs/profiles" className="text-primary underline underline-offset-2">
            research-eu
          </Link>{" "}
          is already logged into the site, the scrape sees exactly what a signed-in visit would see. The profile
          auto-starts if it&apos;s stopped.
        </P>
      </DocsSection>

      <DocsSection title="Full reference & codegen">
        <P>
          Every request/response shape, including error codes, is documented at{" "}
          <a href="/api-docs" className="text-primary underline underline-offset-2">
            /api-docs
          </a>{" "}
          — a themed Swagger UI backed by an OpenAPI 3 document at{" "}
          <code className="font-mono text-[13px]">/api/v1/openapi.json</code>. Point any OpenAPI client generator at
          it to produce a typed SDK in your language of choice.
        </P>
      </DocsSection>

      <DocsPager href="/docs/scraping" />
    </>
  );
}
