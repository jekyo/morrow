"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS_NAV } from "./nav-items";

function isActive(pathname: string, href: string): boolean {
  if (href === "/docs") return pathname === "/docs";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Left sidebar nav for /docs. Client component because it needs usePathname() to
 * highlight the active section — mirrors the (dash) sidebar's active-item style
 * (bg-base-300 + 2px ember left border).
 */
export function DocsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Docs sections" className="w-full shrink-0 md:w-52">
      {DOCS_NAV.map((group) => (
        <div key={group.label} className="mb-6 last:mb-0">
          <p className="text-secondary/70 px-3 pb-2 font-mono text-[10px] tracking-[0.2em] uppercase">{group.label}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-[4px] border-l-2 px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-base-300 border-primary text-base-content"
                        : "text-secondary hover:text-base-content hover:bg-base-300/50 border-transparent"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
