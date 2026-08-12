import Link from "next/link";
import { docsPager } from "./nav-items";

/** Prev/next footer nav between docs pages, in sidebar order. */
export function DocsPager({ href }: { href: string }) {
  const { prev, next } = docsPager(href);
  if (!prev && !next) return null;

  return (
    <nav aria-label="Docs pagination" className="border-neutral mt-14 flex items-center justify-between border-t pt-6">
      {prev ? (
        <Link href={prev.href} className="group flex flex-col items-start">
          <span className="text-secondary/70 font-mono text-[10px] tracking-[0.15em] uppercase">Previous</span>
          <span className="text-base-content/80 group-hover:text-primary text-sm transition-colors">← {prev.label}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={next.href} className="group flex flex-col items-end text-right">
          <span className="text-secondary/70 font-mono text-[10px] tracking-[0.15em] uppercase">Next</span>
          <span className="text-base-content/80 group-hover:text-primary text-sm transition-colors">{next.label} →</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
