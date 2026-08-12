export interface DocsNavItem {
  label: string;
  href: string;
}

export interface DocsNavGroup {
  label: string;
  items: DocsNavItem[];
}

/** Shared by DocsNav (active-item highlight) and per-page prev/next pagers. */
export const DOCS_NAV: DocsNavGroup[] = [
  {
    label: "Guide",
    items: [
      { label: "Overview", href: "/docs" },
      { label: "Quickstart", href: "/docs/quickstart" },
      { label: "Profiles", href: "/docs/profiles" },
      { label: "Stealth & fingerprinting", href: "/docs/stealth" },
      { label: "Live viewer", href: "/docs/viewer" },
    ],
  },
  {
    label: "Integrations",
    items: [
      { label: "Playwright", href: "/docs/playwright" },
      { label: "Scraping API", href: "/docs/scraping" },
      { label: "MCP", href: "/docs/mcp" },
    ],
  },
  {
    label: "Operations",
    items: [{ label: "Self-hosting", href: "/docs/self-hosting" }],
  },
];

export const DOCS_FLAT: DocsNavItem[] = DOCS_NAV.flatMap((g) => g.items);

export function docsPager(href: string): { prev?: DocsNavItem; next?: DocsNavItem } {
  const i = DOCS_FLAT.findIndex((item) => item.href === href);
  if (i === -1) return {};
  return { prev: DOCS_FLAT[i - 1], next: DOCS_FLAT[i + 1] };
}
