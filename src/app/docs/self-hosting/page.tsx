import type { Metadata } from "next";
import { DocsHeader, DocsSection, P } from "@/components/docs/DocsHeader";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { Callout } from "@/components/docs/Callout";
import { DocsPager } from "@/components/docs/DocsPager";

export const metadata: Metadata = {
  title: "Self-hosting — Morrow docs",
  description: "Docker, the /data volume, MORROW_* environment variables, and security posture.",
};

const ENV_VARS: { name: string; body: string; def: string }[] = [
  { name: "MORROW_API_KEY", body: "The single bearer key gating every request. Required — the server refuses to start without it.", def: "(none — required)" },
  { name: "MORROW_PORT", body: "Port the HTTP/websocket server listens on.", def: "3000" },
  { name: "MORROW_DATA_DIR", body: "Where profile directories, the SQLite database, and other on-disk state live.", def: "/data" },
  { name: "MORROW_MAX_PROFILES", body: "How many profiles may be running (browser processes launched) at once.", def: "5" },
  { name: "MORROW_LAUNCH_TIMEOUT", body: "Seconds to wait for a profile's browser to finish launching before failing.", def: "60" },
  { name: "MORROW_DEV_ORIGINS", body: "Dev-only: extra hosts (comma-separated, no protocol/port) allowed to load /_next/* assets when running npm run dev from something other than localhost — a LAN IP, hostname, or tunnel. Not used in production.", def: "(unset)" },
];

export default function SelfHostingPage() {
  return (
    <>
      <DocsHeader
        kicker="Operations"
        title="Self-hosting"
        lead="Morrow has no hosted service — every instance runs on infrastructure the operator provisions and controls."
      />

      <DocsSection title="Docker">
        <CodeBlock label="shell">{`docker run -e MORROW_API_KEY=secret -v morrow-data:/data -p 3000:3000 ghcr.io/jekyo/morrow:latest`}</CodeBlock>
        <P>
          All profile directories, the SQLite database, and other durable state live under{" "}
          <code className="font-mono text-[13px]">/data</code> inside the container. Mount a named volume or bind
          mount there — without it, everything is lost when the container is removed.
        </P>
      </DocsSection>

      <DocsSection title="Environment variables">
        <div className="border-neutral overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-neutral bg-base-200 border-b">
                <th className="text-secondary px-4 py-2 text-left font-mono text-[10px] tracking-[0.15em] uppercase">Variable</th>
                <th className="text-secondary px-4 py-2 text-left font-mono text-[10px] tracking-[0.15em] uppercase">Default</th>
                <th className="text-secondary px-4 py-2 text-left font-mono text-[10px] tracking-[0.15em] uppercase">What it does</th>
              </tr>
            </thead>
            <tbody>
              {ENV_VARS.map((v, i) => (
                <tr key={v.name} className={i !== ENV_VARS.length - 1 ? "border-neutral border-b" : ""}>
                  <td className="text-base-content px-4 py-2 align-top font-mono text-[12px] whitespace-nowrap">{v.name}</td>
                  <td className="text-base-content/70 px-4 py-2 align-top font-mono text-[12px] whitespace-nowrap">{v.def}</td>
                  <td className="text-base-content/80 px-4 py-2 align-top text-sm leading-relaxed">{v.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocsSection>

      <DocsSection title="Deploying with jekyo">
        <P>
          Morrow&apos;s own repo is set up to deploy with{" "}
          <span className="text-base-content font-medium">jekyo</span>, a Docker-compose-to-k3s deployment tool —
          write a <code className="font-mono text-[13px]">jekyo.yaml</code> pointing at the published image, mount a
          persistent volume for <code className="font-mono text-[13px]">/data</code>, and set{" "}
          <code className="font-mono text-[13px]">MORROW_API_KEY</code> as a secret. Any container host that gives
          you a persistent volume and a TLS-terminating reverse proxy in front works the same way — jekyo is a
          convenience, not a requirement.
        </P>
      </DocsSection>

      <DocsSection title="Security posture">
        <ul className="text-base-content/80 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <span className="text-base-content font-medium">Single API key.</span> One{" "}
            <code className="font-mono text-[13px]">MORROW_API_KEY</code> gates the whole instance — every profile,
            session, and stored artifact. There is currently no per-user or per-profile access separation.
          </li>
          <li>
            <span className="text-base-content font-medium">Run behind TLS.</span> Terminate TLS in front of Morrow
            (nginx, Caddy, or similar) so the API key and profile data are never sent in the clear. Morrow is not
            hardened for direct exposure to the open internet.
          </li>
          <li>
            <span className="text-base-content font-medium">Encryption at rest is the operator&apos;s responsibility today.</span>{" "}
            Morrow does not encrypt the <code className="font-mono text-[13px]">/data</code> volume itself. If
            encryption at rest is required, provide it at the disk or volume level on the host.
          </li>
          <li>
            Avoid exposing the Playwright/viewer WebSocket endpoints publicly — the API key travels as a query
            parameter there and may be logged by upstream infrastructure.
          </li>
          <li>Keep the host, its dependencies, and the Morrow version itself up to date.</li>
        </ul>
      </DocsSection>

      <Callout title="Full security policy">
        Reporting a vulnerability, supported versions, and the complete operating checklist live in{" "}
        <a
          href="https://github.com/jekyo/morrow/blob/main/SECURITY.md"
          className="text-primary underline underline-offset-2"
        >
          SECURITY.md
        </a>
        .
      </Callout>

      <DocsPager href="/docs/self-hosting" />
    </>
  );
}
