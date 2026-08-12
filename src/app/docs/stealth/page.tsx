import type { Metadata } from "next";
import Link from "next/link";
import { DocsHeader, DocsSection, P } from "@/components/docs/DocsHeader";
import { Callout } from "@/components/docs/Callout";
import { DocsPager } from "@/components/docs/DocsPager";

export const metadata: Metadata = {
  title: "Stealth & fingerprinting — Morrow docs",
  description: "How Morrow's coherent, persistent fingerprint reduces CAPTCHAs and bot walls — honestly scoped.",
};

export default function StealthPage() {
  return (
    <>
      <DocsHeader
        kicker="Guide"
        title="Stealth & fingerprinting"
        lead="Most automation stacks are trivially detectable. Morrow leans on a coherent, persistent fingerprint instead of tricks."
      />

      <DocsSection title="Why stock automation gets caught">
        <P>
          Stock headless Chromium leaks <code className="font-mono text-[13px]">navigator.webdriver</code>, a
          mismatched or missing fingerprint, and a brand-new cookie jar on every run. Detection vendors flag that in
          milliseconds — the result is CAPTCHAs, blocks, and dead sessions.
        </P>
      </DocsSection>

      <DocsSection title="A coherent, spoofed fingerprint">
        <P>
          Morrow is built on{" "}
          <a href="https://camoufox.com" className="text-primary underline underline-offset-2">
            Camoufox
          </a>
          , an anti-detection Firefox fork. Each profile is assigned a realistic fingerprint — user agent, platform,
          screen and viewport, hardware concurrency, canvas/WebGL, audio, font metrics, timezone, and locale — that
          is internally consistent, with no contradictions between layers. Camoufox applies these at the C++/engine
          level rather than via detectable JS patches, so{" "}
          <code className="font-mono text-[13px]">navigator.webdriver</code> and the usual automation giveaways are
          absent.
        </P>
      </DocsSection>

      <DocsSection title="That fingerprint is persistent">
        <P>
          Morrow generates the fingerprint once per profile and pins every value — including the canvas, audio, and
          font seeds that would otherwise re-randomize on each launch — so the identity is byte-identical across
          restarts. A returning profile looks like the same real machine coming back, not a new bot every time.
          Combined with persisted cookies and logins (see{" "}
          <Link href="/docs/profiles" className="text-primary underline underline-offset-2">
            Profiles
          </Link>
          ), that is what a genuine returning user looks like.
        </P>
      </DocsSection>

      <DocsSection title="The practical effect">
        <P>
          Profiles pass far more bot-detection checks and hit far fewer CAPTCHAs than stock headless browsers,
          especially on sites you&apos;ve already logged into with that profile. Add a residential proxy per profile
          (<code className="font-mono text-[13px]">&quot;proxy&quot;</code> on create — see{" "}
          <Link href="/docs/profiles" className="text-primary underline underline-offset-2">
            Profiles
          </Link>
          ) and the network origin lines up with the identity too.
        </P>
      </DocsSection>

      <Callout title="Honest scope">
        Morrow does not <em>solve</em> CAPTCHAs, and no anti-detection tool is a guarantee against a determined,
        well-resourced detector. What it does is remove the cheap, obvious tells and present a stable, human-shaped
        identity — enough to get through the overwhelming majority of routine fingerprint- and reputation-based
        walls. Use it responsibly and within the terms of the sites you automate.
      </Callout>

      <DocsPager href="/docs/stealth" />
    </>
  );
}
