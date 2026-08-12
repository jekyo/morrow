import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { DocsNav } from "@/components/docs/DocsNav";

/**
 * Docs shell — deliberately outside the (dash) route group so it renders without
 * the app sidebar/auth gate, same as /privacy and /terms. Server component; the
 * only client piece is DocsNav (needs usePathname for the active-item highlight).
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-base-100 flex min-h-screen flex-col">
      <header className="border-neutral bg-base-200 border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" aria-label="Morrow home">
            <Logo size={26} />
          </Link>
          <Link href="/profiles" className="text-secondary hover:text-base-content font-mono text-[11px] transition-colors">
            ← Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-10 md:flex-row">
        <DocsNav />
        <main className="min-w-0 flex-1 pb-16">
          <div className="w-full" style={{ maxWidth: "68ch" }}>
            {children}
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}
