import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { version } from "../../package.json";

const LINKS: { label: string; href: string; external?: boolean }[] = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "GitHub", href: "https://github.com/jekyo/morrow", external: true },
  { label: "Docs", href: "/docs" },
  { label: "API", href: "/api-docs" },
];

/** Slim, quiet footer for the dashboard shell. Server component — no hooks. */
export function Footer() {
  return (
    <footer className="border-neutral bg-base-200 border-t">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4">
        <div className="text-secondary flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <LogoMark size={16} />
          <span className="text-base-content/80">morrow</span>
          <span className="text-secondary/50">·</span>
          <span>v{version}</span>
          <span className="text-secondary/50">·</span>
          <span className="text-secondary/70 normal-case">Browsers that remember.</span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {LINKS.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-secondary hover:text-base-content text-[11px] transition-colors"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="text-secondary hover:text-base-content text-[11px] transition-colors"
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </footer>
  );
}
