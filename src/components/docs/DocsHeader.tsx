import type { ReactNode } from "react";

/** Kicker + title + optional lead paragraph, consistent across every docs page. */
export function DocsHeader({ kicker, title, lead }: { kicker: string; title: string; lead?: ReactNode }) {
  return (
    <header className="mb-10">
      <p className="text-secondary font-mono text-[11px] tracking-[0.2em] uppercase">{kicker}</p>
      <h1 className="text-base-content mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
      {lead && <p className="text-base-content/70 mt-4 text-base leading-relaxed">{lead}</p>}
    </header>
  );
}

export function DocsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 space-y-3 first:mt-0">
      <h2 className="text-base-content text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-base-content/80 text-sm leading-relaxed">{children}</p>;
}
