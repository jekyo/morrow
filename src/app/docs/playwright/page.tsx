import type { Metadata } from "next";
import Link from "next/link";
import { DocsHeader, DocsSection, P } from "@/components/docs/DocsHeader";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { Callout } from "@/components/docs/Callout";
import { DocsPager } from "@/components/docs/DocsPager";

export const metadata: Metadata = {
  title: "Playwright — Morrow docs",
  description: "Attach a stock Playwright client to a profile's persistent browser over a websocket.",
};

export default function PlaywrightPage() {
  return (
    <>
      <DocsHeader
        kicker="Integrations"
        title="Playwright"
        lead="No Morrow-specific SDK — any stock Playwright client attaches straight to a profile's persistent browser."
      />

      <DocsSection title="Connect">
        <CodeBlock label="TypeScript">{`import { firefox } from "playwright";

const browser = await firefox.connect(
  "ws://localhost:3000/playwright/research-eu?token=" + process.env.MORROW_API_KEY
);
const context = browser.contexts()[0]; // the profile's persistent context
const page = await context.newPage();
await page.goto("https://example.com");`}</CodeBlock>
        <P>
          The token is your <code className="font-mono text-[13px]">MORROW_API_KEY</code>, passed as a query
          parameter because the WebSocket handshake has no header for it.
        </P>
      </DocsSection>

      <DocsSection title="contexts()[0] is the persistent context">
        <P>
          Unlike a fresh Playwright launch, <code className="font-mono text-[13px]">browser.contexts()[0]</code> is
          not empty — it&apos;s the profile&apos;s real persistent context, with whatever cookies, storage, and
          logins already exist on disk. Open pages, navigate, and interact with it exactly like any other Playwright
          context; everything you do lands in the profile and is still there tomorrow.
        </P>
      </DocsSection>

      <DocsSection title="Lazy start">
        <P>
          You don&apos;t need to call{" "}
          <code className="font-mono text-[13px]">POST /api/v1/profiles/:name/start</code> first —{" "}
          <code className="font-mono text-[13px]">firefox.connect(...)</code> auto-starts the target profile if
          it&apos;s stopped, then attaches to its running browser.
        </P>
      </DocsSection>

      <Callout title="Version pinning">
        The client Playwright package must match the server&apos;s major.minor — currently{" "}
        <code className="font-mono text-[13px]">1.60.x</code>. A version mismatch between client and server
        Playwright is a common source of connection errors with remote browser protocols; pin your dependency
        accordingly.
      </Callout>

      <DocsSection title="Works alongside the other surfaces">
        <P>
          A page you open over Playwright is the same page the{" "}
          <Link href="/docs/viewer" className="text-primary underline underline-offset-2">
            live viewer
          </Link>{" "}
          shows, and the same context an{" "}
          <Link href="/docs/mcp" className="text-primary underline underline-offset-2">
            MCP
          </Link>{" "}
          tool call or a{" "}
          <Link href="/docs/scraping" className="text-primary underline underline-offset-2">
            scrape request
          </Link>{" "}
          with <code className="font-mono text-[13px]">profile</code> set will act on.
        </P>
      </DocsSection>

      <DocsPager href="/docs/playwright" />
    </>
  );
}
