import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Terms of Service — Morrow",
  description: "Template terms of service for a self-hosted Morrow instance.",
};

export default function TermsPage() {
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
        <h1 className="text-base-content mt-2 text-3xl font-semibold tracking-tight">Terms of Service</h1>

        <div className="border-accent/40 bg-accent/10 mt-6 rounded-lg border p-4">
          <p className="text-accent font-mono text-[11px] tracking-[0.15em] uppercase">Self-hosted template — not legal advice</p>
          <p className="text-base-content/80 mt-2 text-sm leading-relaxed">
            Morrow is self-hosted, open-source software. This page is a template starting point for the{" "}
            <strong className="text-base-content font-medium">operator</strong> of a Morrow instance — the person or
            organization running the server, not Morrow&apos;s authors. Review and adapt it, ideally with legal
            counsel, before relying on it. It is not legal advice.
          </p>
        </div>

        <section className="mt-10 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">1. Acceptance</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            By using this Morrow instance, operated by <span className="text-accent font-mono text-[13px]">[Operator]</span>,
            you agree to these terms. If you do not agree, do not use this instance.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">2. What Morrow is</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            Morrow is infrastructure for running and controlling persistent browser profiles — automating them via
            an HTTP API, Playwright, or MCP, and viewing or taking control of them live. The underlying software is
            open source; this instance is a particular deployment of it run by the operator named above.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">3. Provided as-is</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            The Morrow software is provided &quot;as is&quot;, without warranty of any kind, express or implied,
            including but not limited to warranties of merchantability, fitness for a particular purpose, and
            non-infringement. This instance and its operator make no guarantee that the service will be
            uninterrupted, error-free, or that stored data will never be lost or corrupted.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">4. Acceptable use</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            You are responsible for how you use this instance, including any browser profiles, automation, or
            scraping performed through it. In particular, you agree to:
          </p>
          <ul className="text-base-content/80 list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>respect the terms of service, robots.txt, and rate limits of any third-party site your profiles interact with;</li>
            <li>comply with applicable law, including data protection, computer-fraud, and anti-circumvention law in your jurisdiction and the target site&apos;s;</li>
            <li>not use this instance to access accounts, data, or systems you are not authorized to access;</li>
            <li>keep the API key confidential and accept responsibility for actions taken with it.</li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">5. Operator responsibility</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            The operator of this instance is solely responsible for how it is configured, who is given access to
            it, and what its browser profiles are used for — including compliance with any laws or third-party
            terms implicated by automating or scraping websites. Morrow&apos;s authors are not a party to, and have
            no visibility into, how any given instance is operated or used.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">6. No uptime or data guarantee</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            This instance is not guaranteed to be continuously available. Browser profiles, session logs, and other
            stored data may be lost due to host failure, misconfiguration, or operator action (including deletion).
            Do not rely on this instance as the sole copy of anything you cannot afford to lose.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">7. Indemnity</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            You agree to indemnify and hold harmless <span className="text-accent font-mono text-[13px]">[Operator]</span>{" "}
            from any claims, damages, or expenses arising from your use of this instance, including from automation
            or scraping performed through it that violates a third party&apos;s rights or terms.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">8. Limitation of liability</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            To the maximum extent permitted by law, <span className="text-accent font-mono text-[13px]">[Operator]</span>{" "}
            and Morrow&apos;s authors shall not be liable for any indirect, incidental, special, consequential, or
            punitive damages, or any loss of data, profits, or business, arising from or related to use of this
            instance or the Morrow software, even if advised of the possibility of such damages.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">9. Changes</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            The operator may modify these terms or the instance itself at any time. Continued use after a change
            constitutes acceptance of the updated terms.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">10. Governing law</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            These terms are governed by the laws of <span className="text-accent font-mono text-[13px]">[jurisdiction]</span>,
            without regard to conflict-of-law principles.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-base-content text-lg font-semibold">11. Contact</h2>
          <p className="text-base-content/80 text-sm leading-relaxed">
            Questions about these terms can be directed to <span className="text-accent font-mono text-[13px]">[contact email]</span>.
          </p>
        </section>

        <hr className="border-neutral mt-12" />
        <p className="text-secondary/70 mt-6 font-mono text-[11px]">
          Morrow · self-hosted · <Link href="/privacy" className="hover:text-base-content transition-colors">Privacy</Link>
        </p>
      </div>
    </main>
  );
}
