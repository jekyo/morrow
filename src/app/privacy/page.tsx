import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Privacy Policy — Morrow",
  description: "Template privacy policy for a self-hosted Morrow instance.",
};

export default function PrivacyPage() {
  return (
    <main className="bg-base-100 min-h-screen px-6 py-16">
      <div className="mx-auto w-full" style={{ maxWidth: "68ch" }}>
        <div className="mb-10 flex items-center justify-between">
          <Link href="/" aria-label="Morrow home">
            <Logo size={28} />
          </Link>
          <Link href="/profiles" className="text-secondary hover:text-base-content font-mono text-[11px] transition-colors">
            ← Back to dashboard
          </Link>
        </div>

        <p className="text-secondary font-mono text-[11px] tracking-[0.2em] uppercase">Legal · Template</p>
        <h1 className="text-base-content mt-2 text-3xl font-semibold tracking-tight">Privacy Policy</h1>

        <div className="border-accent/40 bg-accent/10 mt-6 rounded-lg border p-4">
          <p className="text-accent font-mono text-[11px] tracking-[0.15em] uppercase">Self-hosted template — not legal advice</p>
          <p className="text-base-content/80 mt-2 text-sm leading-relaxed">
            Morrow is self-hosted, open-source software. This page is a template starting point for the{" "}
            <strong className="text-base-content font-medium">operator</strong> of a Morrow instance — the person or
            organization running the server, not Morrow&apos;s authors. Review and adapt it, ideally with legal
            counsel, before relying on it. It is not legal advice, and no company called &quot;Morrow&quot; operates
            any instance of this software on your behalf.
          </p>
        </div>

        <section className="mt-10 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">1. Who this applies to</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            This policy describes what data a Morrow instance stores and processes on behalf of{" "}
            <span className="text-accent font-mono text-[13px]">[Operator]</span>, the organization or individual
            that deployed and controls this instance. Morrow does not have its own hosted service — every instance
            runs on infrastructure the operator provisions and controls.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">2. What Morrow stores</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">A running Morrow instance persists, on the operator&apos;s own disk:</p>
          <ul className="text-base-content/80 list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>
              <span className="text-base-content font-medium">Browser profiles</span> — each profile is a real
              browser context stored on disk (by default under <code className="font-mono text-[13px]">/data/profiles/&lt;id&gt;</code>),
              including cookies, localStorage, IndexedDB, and any signed-in session state for sites visited in that
              profile.
            </li>
            <li>
              <span className="text-base-content font-medium">Profile metadata</span> — a local SQLite database
              recording profile names, status, proxy and locale settings, and timestamps.
            </li>
            <li>
              <span className="text-base-content font-medium">Session and event logs</span> — records of when
              profiles were started, stopped, and connected to (Playwright, viewer, MCP, or scrape sessions), used
              for operability and debugging.
            </li>
            <li>
              <span className="text-base-content font-medium">Artifacts</span> — content produced on request, such
              as screenshots or extracted page content, returned to the caller and not persisted beyond the request
              unless the operator has built additional storage around the API.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">3. Sensitivity of browser profile data</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            Because a Morrow profile is a persistent browser, it can accumulate authenticated sessions, cookies, and
            credentials for third-party sites the profile has logged into. This data is materially more sensitive
            than typical application data — anyone with access to a profile&apos;s storage or to the Morrow API can
            potentially act as that profile on the sites it is signed into. Treat profile data with the same care as
            passwords and session tokens.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">4. Access control</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            This instance is protected by a single API key (<code className="font-mono text-[13px]">MORROW_API_KEY</code>).
            Anyone holding that key has full access to every profile, session, and stored artifact on the instance —
            there is currently no per-user or per-profile access separation. The operator is responsible for
            generating a strong key, restricting who holds it, and rotating it if it is ever exposed.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">5. Where data lives</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            All data described above is stored on the operator&apos;s own infrastructure — the server or storage
            volume the operator chose to run Morrow on. Morrow&apos;s authors do not host, receive, or have access to
            this data. There is no separate &quot;Morrow cloud&quot; that this instance reports to.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">6. No telemetry or analytics</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            The Morrow application does not send usage data, analytics, crash reports, or telemetry of any kind to
            Morrow&apos;s authors or any third-party analytics vendor. Nothing about how this instance is used —
            which profiles exist, what they browse, or how the API is called — leaves the operator&apos;s
            infrastructure because of Morrow itself.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">7. Third-party sites</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            Browser profiles are used to visit third-party websites. Those sites set their own cookies, may run
            their own analytics or fingerprinting, and are governed by their own privacy policies and terms of
            service — not this one. The operator is responsible for using Morrow in a way that complies with the
            terms of any site its profiles interact with.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">8. Security posture</h2>
          <ul className="text-base-content/80 list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>Access is gated by the API key described in Section 4; there is currently no additional user-level authentication.</li>
            <li>Operators should run Morrow behind TLS (a reverse proxy such as nginx or Caddy is typical) so the API key and profile data are not sent in the clear.</li>
            <li>
              Data on disk is <span className="text-base-content font-medium">not currently encrypted at rest</span> by
              Morrow itself. If encryption at rest is required, the operator must provide it — for example via
              full-disk or volume-level encryption on the host.
            </li>
            <li>Keep the host, its dependencies, and the Morrow version itself up to date.</li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">9. Data retention and deletion</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            Profile data is retained until the operator deletes it. Deleting a profile removes its on-disk directory
            and its rows (events, sessions, profile record) from the database; this action is irreversible. The
            operator&apos;s default retention period for profiles, logs, and events is{" "}
            <span className="text-accent font-mono text-[13px]">[retention period]</span> — adjust or remove this
            line to match actual practice.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">10. Changes to this policy</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            The operator may update this policy as the instance or its usage changes. Material changes should be
            communicated to anyone who relies on this instance.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">11. Contact</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            Questions about this policy or requests regarding data held by this instance can be directed to{" "}
            <span className="text-accent font-mono text-[13px]">[contact email]</span>, operated by{" "}
            <span className="text-accent font-mono text-[13px]">[Operator]</span>, governed by the laws of{" "}
            <span className="text-accent font-mono text-[13px]">[jurisdiction]</span>.
          </p>
        </section>

        <hr className="border-neutral mt-12" />
        <p className="text-secondary/70 mt-6 font-mono text-[11px]">
          Morrow · self-hosted · <Link href="/terms" className="hover:text-base-content transition-colors">Terms</Link>
        </p>
      </div>
    </main>
  );
}
