import type { Metadata } from "next";
import Link from "next/link";
import { DocsHeader, DocsSection, P } from "@/components/docs/DocsHeader";
import { Callout } from "@/components/docs/Callout";
import { DocsPager } from "@/components/docs/DocsPager";

export const metadata: Metadata = {
  title: "Docs — Morrow",
  description: "Documentation for Morrow: persistent, fingerprint-resistant browser infrastructure.",
};

const SURFACES = [
  {
    name: "Dashboard",
    body: "A human, through the live viewer and Take Control — mouse, scroll and keyboard go straight to the remote browser.",
    href: "/docs/viewer",
  },
  {
    name: "REST",
    body: "One-shot scrape, screenshot and content endpoints, with or without an authenticated profile behind them.",
    href: "/docs/scraping",
  },
  {
    name: "Playwright",
    body: "Any stock Playwright client attaches straight to the persistent browser over a websocket.",
    href: "/docs/playwright",
  },
  {
    name: "MCP",
    body: "An AI agent, through 13 MCP tools operating on the same persistent, optionally logged-in profile.",
    href: "/docs/mcp",
  },
];

export default function DocsIndexPage() {
  return (
    <>
      <DocsHeader
        kicker="Documentation"
        title="Morrow docs"
        lead={
          <>
            Morrow is persistent, fingerprint-resistant browser infrastructure. Create a profile once, log in once,
            and come back tomorrow — the browser is still there, still authenticated, and still hard to
            fingerprint. Every profile is a real, persistent{" "}
            <a href="https://camoufox.com" className="text-primary underline underline-offset-2">
              Camoufox
            </a>{" "}
            browser with a stable, spoofed fingerprint that stays consistent across restarts.
          </>
        }
      />

      <DocsSection title="Four surfaces, one browser">
        <P>
          A profile can be driven from four directions at once, all sharing the same identity, cookies, and login
          state:
        </P>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SURFACES.map((s) => (
            <Link
              key={s.name}
              href={s.href}
              className="border-neutral bg-base-200 hover:border-primary/50 hover:bg-base-300/50 rounded-lg border p-4 transition-colors"
            >
              <p className="text-base-content font-mono text-[11px] tracking-[0.15em] uppercase">{s.name}</p>
              <p className="text-base-content/70 mt-2 text-sm leading-relaxed">{s.body}</p>
            </Link>
          ))}
        </div>
      </DocsSection>

      <DocsSection title="Start here">
        <P>
          New to Morrow? The{" "}
          <Link href="/docs/quickstart" className="text-primary underline underline-offset-2">
            Quickstart
          </Link>{" "}
          walks through running it, creating a profile, starting it, and opening the live viewer — the fastest path
          to a working instance.
        </P>
        <P>
          Already running an instance and want the full request/response reference?{" "}
          <a href="/api-docs" className="text-primary underline underline-offset-2">
            /api-docs
          </a>{" "}
          is a themed Swagger UI backed by an OpenAPI 3 document at{" "}
          <code className="font-mono text-[13px]">/api/v1/openapi.json</code> — point any OpenAPI client generator
          at it to produce a typed SDK.
        </P>
      </DocsSection>

      <DocsSection title="What's in these docs">
        <ul className="text-base-content/80 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <Link href="/docs/profiles" className="text-primary underline underline-offset-2">
              Profiles
            </Link>{" "}
            — the persistence model, lifecycle, and configuration.
          </li>
          <li>
            <Link href="/docs/stealth" className="text-primary underline underline-offset-2">
              Stealth &amp; fingerprinting
            </Link>{" "}
            — how Morrow avoids CAPTCHAs and bot walls, honestly scoped.
          </li>
          <li>
            <Link href="/docs/viewer" className="text-primary underline underline-offset-2">
              Live viewer
            </Link>{" "}
            — the remote browser, Take Control, and the single-controller lock.
          </li>
          <li>
            <Link href="/docs/playwright" className="text-primary underline underline-offset-2">
              Playwright
            </Link>
            ,{" "}
            <Link href="/docs/scraping" className="text-primary underline underline-offset-2">
              Scraping API
            </Link>
            , and{" "}
            <Link href="/docs/mcp" className="text-primary underline underline-offset-2">
              MCP
            </Link>{" "}
            — the three programmatic surfaces.
          </li>
          <li>
            <Link href="/docs/self-hosting" className="text-primary underline underline-offset-2">
              Self-hosting
            </Link>{" "}
            — Docker, environment variables, and security posture.
          </li>
        </ul>
      </DocsSection>

      <Callout title="Morrow is self-hosted">
        There is no hosted Morrow service. Every instance runs on infrastructure the operator provisions and
        controls — see{" "}
        <Link href="/docs/self-hosting">Self-hosting</Link> for how to run one.
      </Callout>

      <DocsPager href="/docs" />
    </>
  );
}
