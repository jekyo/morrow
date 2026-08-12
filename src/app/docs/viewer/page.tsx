import type { Metadata } from "next";
import Link from "next/link";
import { DocsHeader, DocsSection, P } from "@/components/docs/DocsHeader";
import { Callout } from "@/components/docs/Callout";
import { DocsPager } from "@/components/docs/DocsPager";

export const metadata: Metadata = {
  title: "Live viewer — Morrow docs",
  description: "Open a remote browser, take control, and drive it by hand from the dashboard.",
};

export default function ViewerPage() {
  return (
    <>
      <DocsHeader
        kicker="Guide"
        title="Live viewer"
        lead="A remote browser you can watch and drive, embedded on every profile's detail page in the dashboard."
      />

      <DocsSection title="What it is">
        <P>
          Start a profile and open it in the dashboard — the profile page embeds a live view of the real browser,
          streamed as ~10fps JPEG frames over a websocket at{" "}
          <code className="font-mono text-[13px]">/viewer/&lt;profile&gt;</code>. This is the actual Camoufox
          browser rendering the actual page, not a screenshot or a proxy render.
        </P>
      </DocsSection>

      <DocsSection title="Take Control">
        <P>
          Press <span className="text-base-content font-medium">Take Control</span> and mouse, scroll, and keyboard
          go straight to the remote browser — log into a site by hand the way you would on your own machine, then
          press <span className="text-base-content font-medium">Release</span> to hand it back to automation.
          Whatever you do while in control is written to the profile like any other session, so a manual login
          persists for later API, Playwright, and MCP use.
        </P>
      </DocsSection>

      <DocsSection title="The URL bar">
        <P>
          An editable URL bar sits above the viewport. Type a URL and submit to navigate the remote page directly —
          useful for jumping straight to a login page or a specific route without reaching for the API.
        </P>
      </DocsSection>

      <DocsSection title="Fullscreen">
        <P>The viewer can expand to fill the screen for a closer look at a dense page or a fiddly login flow.</P>
      </DocsSection>

      <DocsSection title="The single-controller lock">
        <P>
          Only one controller drives a profile at a time. The viewer always shows which:
        </P>
        <ul className="text-base-content/80 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <span className="text-primary font-mono text-[11px] tracking-[0.1em] uppercase">● Automated</span> — no
            human has taken control; the profile is free for the REST API, Playwright, or an MCP agent to drive.
          </li>
          <li>
            <span className="text-base-content font-mono text-[11px] tracking-[0.1em] uppercase">● Human control</span> —
            a human has pressed Take Control; input goes to them.
          </li>
        </ul>
        <P>
          This lock is what keeps a human takeover and an in-flight automated session from fighting over the same
          mouse. Release control (or close the viewer) to hand the profile back.
        </P>
      </DocsSection>

      <Callout title="Same profile, same identity" tone="neutral">
        The viewer, the{" "}
        <Link href="/docs/scraping" className="text-primary underline underline-offset-2">
          REST API
        </Link>
        , <Link href="/docs/playwright" className="text-primary underline underline-offset-2">
          Playwright
        </Link>
        , and{" "}
        <Link href="/docs/mcp" className="text-primary underline underline-offset-2">
          MCP
        </Link>{" "}
        all act on the same persistent browser — a human logging in through the viewer is exactly as durable as an
        MCP agent doing it, because both write to the same on-disk profile.
      </Callout>

      <DocsPager href="/docs/viewer" />
    </>
  );
}
