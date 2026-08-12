import type { Metadata } from "next";
import Link from "next/link";
import { DocsHeader, DocsSection, P } from "@/components/docs/DocsHeader";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { Callout } from "@/components/docs/Callout";
import { DocsPager } from "@/components/docs/DocsPager";

export const metadata: Metadata = {
  title: "Profiles — Morrow docs",
  description: "The persistence model, lifecycle, configuration, and event timeline for Morrow profiles.",
};

export default function ProfilesPage() {
  return (
    <>
      <DocsHeader
        kicker="Guide"
        title="Profiles"
        lead="A profile is Morrow's unit of identity: a real, persistent Camoufox browser on disk, not a database record."
      />

      <DocsSection title="The persistence model">
        <P>
          Each profile is a real Firefox (Camoufox) profile directory on disk, stored under{" "}
          <code className="font-mono text-[13px]">{"<MORROW_DATA_DIR>/profiles/<id>"}</code> — cookies, localStorage,
          IndexedDB, and any signed-in session state for sites the profile has visited. Profile metadata (name,
          status, proxy, locale, timezone, viewport, timestamps) lives separately in a local SQLite database.
        </P>
        <P>
          Because the browser directory itself is what persists, stopping a profile flushes cookies and storage to
          disk, and starting it again resumes exactly where it left off — same fingerprint, same logins, same open
          state. This is what makes Morrow different from a throwaway headless browser: a profile behaves like a
          returning human on a real machine, not a fresh instance every run.
        </P>
      </DocsSection>

      <DocsSection title="Naming">
        <P>
          Profile names are lowercase letters, digits, and dashes, and must start with a letter or digit (
          <code className="font-mono text-[13px]">^[a-z0-9][a-z0-9-]{"{0,62}"}$</code>). Names are how you address a
          profile everywhere — REST paths, the Playwright websocket URL, and MCP tool arguments all take the name,
          not the internal id.
        </P>
      </DocsSection>

      <DocsSection title="Lifecycle">
        <P>All lifecycle endpoints need <code className="font-mono text-[13px]">Authorization: Bearer $MORROW_API_KEY</code>.</P>

        <p className="text-base-content font-mono text-[13px] font-medium">Create</p>
        <CodeBlock label="POST /api/v1/profiles">{`curl -X POST http://localhost:3000/api/v1/profiles \\
  -H "Authorization: Bearer $MORROW_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "research-eu", "locale": "de-DE"}'`}</CodeBlock>

        <p className="text-base-content mt-6 font-mono text-[13px] font-medium">Start</p>
        <CodeBlock label="POST /api/v1/profiles/:name/start">{`curl -X POST http://localhost:3000/api/v1/profiles/research-eu/start \\
  -H "Authorization: Bearer $MORROW_API_KEY"`}</CodeBlock>
        <P>
          Launches the browser. A profile that&apos;s already running when a request needs it (Playwright connect,
          scrape with a <code className="font-mono text-[13px]">profile</code> field, an MCP tool call) auto-starts —
          you rarely need to call this directly except from the dashboard.
        </P>

        <p className="text-base-content mt-6 font-mono text-[13px] font-medium">Stop</p>
        <CodeBlock label="POST /api/v1/profiles/:name/stop">{`curl -X POST http://localhost:3000/api/v1/profiles/research-eu/stop \\
  -H "Authorization: Bearer $MORROW_API_KEY"`}</CodeBlock>
        <P>Flushes browser state to disk and closes the browser process.</P>

        <p className="text-base-content mt-6 font-mono text-[13px] font-medium">Clone</p>
        <CodeBlock label="POST /api/v1/profiles/:name/clone">{`curl -X POST http://localhost:3000/api/v1/profiles/research-eu/clone \\
  -H "Authorization: Bearer $MORROW_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "research-eu-2"}'`}</CodeBlock>
        <P>
          Copies the source profile&apos;s on-disk directory (cookies, storage, logins) and its proxy/locale/timezone/
          viewport into a new profile. The source must be stopped first.
        </P>

        <p className="text-base-content mt-6 font-mono text-[13px] font-medium">Reset</p>
        <CodeBlock label="POST /api/v1/profiles/:name/reset">{`curl -X POST http://localhost:3000/api/v1/profiles/research-eu/reset \\
  -H "Authorization: Bearer $MORROW_API_KEY"`}</CodeBlock>
        <P>
          Deletes the profile&apos;s on-disk browser directory — cookies, storage, logins, and the pinned fingerprint
          — while keeping the profile record and its settings. The profile must be stopped first; the next start
          begins from a clean browser again.
        </P>

        <p className="text-base-content mt-6 font-mono text-[13px] font-medium">Delete</p>
        <CodeBlock label="DELETE /api/v1/profiles/:name">{`curl -X DELETE http://localhost:3000/api/v1/profiles/research-eu \\
  -H "Authorization: Bearer $MORROW_API_KEY"`}</CodeBlock>
        <P>Removes the profile record and its on-disk directory entirely. Irreversible; the profile must be stopped first.</P>
      </DocsSection>

      <DocsSection title="Configuration">
        <P>
          Set at create time, or updated later with <code className="font-mono text-[13px]">PATCH /api/v1/profiles/:name</code>{" "}
          (pass <code className="font-mono text-[13px]">null</code> to clear a field):
        </P>
        <ul className="text-base-content/80 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <code className="font-mono text-[13px]">proxy</code> — a proxy URL this profile&apos;s browser routes
            through, so the network origin matches the persisted identity.
          </li>
          <li>
            <code className="font-mono text-[13px]">locale</code> — e.g. <code className="font-mono text-[13px]">de-DE</code>,
            baked into the spoofed fingerprint.
          </li>
          <li>
            <code className="font-mono text-[13px]">timezone</code> — e.g. <code className="font-mono text-[13px]">Europe/Berlin</code>.
          </li>
          <li>
            <code className="font-mono text-[13px]">viewport</code> — <code className="font-mono text-[13px]">{"{ width, height }"}</code>.
          </li>
        </ul>
        <P>
          Full request/response shapes are in the OpenAPI reference at{" "}
          <a href="/api-docs" className="text-primary underline underline-offset-2">
            /api-docs
          </a>
          .
        </P>
      </DocsSection>

      <DocsSection title="Events timeline">
        <P>
          Every profile records events — created, started, stopped, reset, and more — retrievable via{" "}
          <code className="font-mono text-[13px]">GET /api/v1/profiles/:name/events</code> (optionally{" "}
          <code className="font-mono text-[13px]">?limit=</code>, default 200, max 1000). The dashboard&apos;s profile
          page renders this as a timeline alongside the live viewer, active sessions, and connect snippets.
        </P>
      </DocsSection>

      <Callout title="Concurrency limit">
        <code className="font-mono text-[13px]">MORROW_MAX_PROFILES</code> caps how many profiles can be{" "}
        <em>running</em> at once (default 5) — not how many profiles can exist. Starting a profile past the limit
        returns <code className="font-mono text-[13px]">429 too_many_profiles</code>. See{" "}
        <Link href="/docs/self-hosting">Self-hosting</Link>.
      </Callout>

      <DocsPager href="/docs/profiles" />
    </>
  );
}
