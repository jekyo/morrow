import type { Metadata } from "next";
import Link from "next/link";
import { DocsHeader, DocsSection, P } from "@/components/docs/DocsHeader";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { Callout } from "@/components/docs/Callout";
import { DocsPager } from "@/components/docs/DocsPager";

export const metadata: Metadata = {
  title: "MCP — Morrow docs",
  description: "Point an MCP client at Morrow for 13 tools operating on a persistent, optionally logged-in profile.",
};

const TOOLS: { name: string; body: string }[] = [
  { name: "list_profiles", body: "List all profiles and their status." },
  { name: "create_profile", body: "Create a new profile (name, optional proxy/locale/timezone)." },
  { name: "start_profile", body: "Start a profile's browser." },
  { name: "stop_profile", body: "Stop a profile's browser (flushes state to disk)." },
  { name: "navigate", body: "Navigate the profile's active page to a URL." },
  {
    name: "snapshot",
    body: "Compact accessibility (aria) tree of the current page as YAML with [ref=eN] handles — the agent-friendly view.",
  },
  { name: "click", body: "Click an element matching a selector." },
  { name: "type", body: "Fill an input (optionally submit with Enter)." },
  { name: "press_key", body: "Press a keyboard key." },
  { name: "scroll", body: "Scroll the page by dx/dy pixels." },
  { name: "wait_for", body: "Wait for a selector to appear." },
  { name: "screenshot", body: "Screenshot the current page as a PNG image." },
  { name: "scrape", body: "Scrape the current page (or a given url) into markdown/text/article." },
];

export default function McpPage() {
  return (
    <>
      <DocsHeader
        kicker="Integrations"
        title="MCP"
        lead="Point any MCP client at Morrow and an agent gets the same persistent, optionally logged-in browser a human uses."
      />

      <DocsSection title="Connect">
        <P>
          Morrow serves an MCP server over streamable HTTP at <code className="font-mono text-[13px]">/mcp</code>,
          gated by the same <code className="font-mono text-[13px]">MORROW_API_KEY</code> (bearer header or{" "}
          <code className="font-mono text-[13px]">?token=</code>):
        </P>
        <CodeBlock label="mcp config">{`{
  "mcpServers": {
    "morrow": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MORROW_API_KEY"
      }
    }
  }
}`}</CodeBlock>
        <P>
          That&apos;s a Claude Desktop-style <code className="font-mono text-[13px]">mcpServers</code> config with{" "}
          <code className="font-mono text-[13px]">type: &quot;http&quot;</code> — check your client&apos;s docs for
          the exact key names it expects for a remote streamable-HTTP server vs. a local stdio one; the URL and
          bearer header above are the two things every client needs.
        </P>
      </DocsSection>

      <DocsSection title="13 tools">
        <div className="border-neutral overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-neutral bg-base-200 border-b">
                <th className="text-secondary px-4 py-2 text-left font-mono text-[10px] tracking-[0.15em] uppercase">Tool</th>
                <th className="text-secondary px-4 py-2 text-left font-mono text-[10px] tracking-[0.15em] uppercase">What it does</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map((t, i) => (
                <tr key={t.name} className={i !== TOOLS.length - 1 ? "border-neutral border-b" : ""}>
                  <td className="text-base-content px-4 py-2 align-top font-mono text-[12px] whitespace-nowrap">{t.name}</td>
                  <td className="text-base-content/80 px-4 py-2 align-top text-sm leading-relaxed">{t.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocsSection>

      <DocsSection title="Tools act on a persistent, optionally logged-in profile">
        <P>
          The transport is stateless — no session ID, no server-initiated stream — one request in, one response
          out. That&apos;s deliberate: Morrow&apos;s persistence story is the browser, not the MCP session. Every
          tool call that touches a page auto-starts the target profile if it&apos;s stopped, then acts on that
          profile&apos;s already-running browser, so state (cookies, logins, local storage, open tabs) survives
          across separate tool calls, separate MCP sessions, and even server restarts. The same profile an agent
          navigated and logged into an hour ago is still logged in now.
        </P>
        <P>
          This is the differentiator over a stock browser-automation MCP server: those spin up a throwaway browser
          per session (or per call) with a blank profile. Morrow&apos;s tools act inside a persistent, optionally
          human-authenticated identity — an agent can pick up exactly where a human (or an earlier agent run) left
          off, with no cookie or session handoff required.
        </P>
        <P>
          All page-control tools take a <code className="font-mono text-[13px]">profile</code> argument. A typical
          flow: <code className="font-mono text-[13px]">create_profile</code>, <code className="font-mono text-[13px]">navigate</code>{" "}
          to a login page, authenticate — either through the dashboard&apos;s{" "}
          <Link href="/docs/viewer" className="text-primary underline underline-offset-2">
            human takeover
          </Link>{" "}
          or by driving <code className="font-mono text-[13px]">click</code>/<code className="font-mono text-[13px]">type</code>{" "}
          itself — then keep calling <code className="font-mono text-[13px]">navigate</code>/
          <code className="font-mono text-[13px]">scrape</code>/<code className="font-mono text-[13px]">screenshot</code>{" "}
          against that same logged-in identity indefinitely.
        </P>
      </DocsSection>

      <Callout title="All 13 tools are thin wrappers" tone="neutral">
        Every MCP tool calls the same <code className="font-mono text-[13px]">ProfileManager</code> and scrape code
        the REST API and dashboard use — there is no separate MCP-only code path, and nothing an agent does is
        possible that a human or the REST API couldn&apos;t also do.
      </Callout>

      <DocsPager href="/docs/mcp" />
    </>
  );
}
