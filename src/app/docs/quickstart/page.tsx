import type { Metadata } from "next";
import Link from "next/link";
import { DocsHeader, DocsSection, P } from "@/components/docs/DocsHeader";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { DocsPager } from "@/components/docs/DocsPager";

export const metadata: Metadata = {
  title: "Quickstart — Morrow docs",
  description: "Install and run Morrow, create a profile, and open the live viewer.",
};

export default function QuickstartPage() {
  return (
    <>
      <DocsHeader
        kicker="Guide"
        title="Quickstart"
        lead="The fastest path from nothing to a running, logged-in profile you can watch in your browser."
      />

      <DocsSection title="1. Run Morrow">
        <P>Two ways to run it — pick one.</P>
        <P>With Node, for local development (hot reload via tsx):</P>
        <CodeBlock label="shell">{`cp .env.example .env   # set MORROW_API_KEY
npm install
npm run dev             # http://localhost:3000`}</CodeBlock>
        <P>
          Or with Docker, using the published{" "}
          <a href="https://github.com/jekyo/morrow/pkgs/container/morrow" className="text-primary underline underline-offset-2">
            ghcr.io/jekyo/morrow
          </a>{" "}
          image:
        </P>
        <CodeBlock label="shell">{`docker run -e MORROW_API_KEY=secret -v morrow-data:/data -p 3000:3000 ghcr.io/jekyo/morrow:latest`}</CodeBlock>
        <P>
          The Docker image persists everything under <code className="font-mono text-[13px]">/data</code> — mount a
          volume there (as above) or profiles disappear when the container is removed. See{" "}
          <Link href="/docs/self-hosting" className="text-primary underline underline-offset-2">
            Self-hosting
          </Link>{" "}
          for the full environment variable reference.
        </P>
      </DocsSection>

      <DocsSection title="2. Set MORROW_API_KEY">
        <P>
          Every Morrow instance is gated by a single API key. It&apos;s required at boot —{" "}
          <code className="font-mono text-[13px]">MORROW_API_KEY is required</code> is thrown and the server refuses
          to start without it. Set it in <code className="font-mono text-[13px]">.env</code> (dev) or as an
          environment variable (Docker). Every request needs it as{" "}
          <code className="font-mono text-[13px]">Authorization: Bearer $MORROW_API_KEY</code>.
        </P>
      </DocsSection>

      <DocsSection title="3. Create a profile">
        <P>From the API:</P>
        <CodeBlock label="shell">{`curl -X POST http://localhost:3000/api/v1/profiles \\
  -H "Authorization: Bearer $MORROW_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "research-eu", "locale": "de-DE"}'`}</CodeBlock>
        <P>
          Or from the dashboard: open <code className="font-mono text-[13px]">http://localhost:3000/</code>, enter
          your <code className="font-mono text-[13px]">MORROW_API_KEY</code> once (it&apos;s kept in the
          browser&apos;s localStorage and sent with every request), then create a profile from the Profiles page.
        </P>
      </DocsSection>

      <DocsSection title="4. Start it">
        <CodeBlock label="shell">{`curl -X POST http://localhost:3000/api/v1/profiles/research-eu/start \\
  -H "Authorization: Bearer $MORROW_API_KEY"`}</CodeBlock>
        <P>This launches the Camoufox browser and, on first start, pins its spoofed fingerprint for every future start.</P>
      </DocsSection>

      <DocsSection title="5. Open the viewer">
        <P>
          Open the profile in the dashboard and you&apos;ll see the live remote browser streaming as ~10fps JPEG
          frames. Press <span className="text-base-content font-medium">Take Control</span> to drive it by hand — log
          into a site, and that session is written to the profile like any other, so it&apos;s still there next time
          you start it. See{" "}
          <Link href="/docs/viewer" className="text-primary underline underline-offset-2">
            Live viewer
          </Link>{" "}
          for the full walkthrough.
        </P>
      </DocsSection>

      <DocsSection title="Where to next">
        <ul className="text-base-content/80 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <Link href="/docs/profiles" className="text-primary underline underline-offset-2">
              Profiles
            </Link>{" "}
            — persistence, lifecycle, and config in depth.
          </li>
          <li>
            <Link href="/docs/playwright" className="text-primary underline underline-offset-2">
              Playwright
            </Link>{" "}
            — attach a stock client to the same browser.
          </li>
          <li>
            <Link href="/docs/scraping" className="text-primary underline underline-offset-2">
              Scraping API
            </Link>{" "}
            — one-shot markdown/screenshot/content extraction.
          </li>
          <li>
            <Link href="/docs/mcp" className="text-primary underline underline-offset-2">
              MCP
            </Link>{" "}
            — point an AI agent at the same profile.
          </li>
        </ul>
      </DocsSection>

      <DocsPager href="/docs/quickstart" />
    </>
  );
}
