"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BookOpen, Boxes, Braces, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { API_KEY_STORAGE_KEY } from "@/lib/useApi";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Profiles", href: "/profiles", icon: Boxes },
      { label: "Metrics", href: "/metrics", icon: BarChart3 },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "Docs", href: "/docs", icon: BookOpen },
      { label: "API", href: "/api-docs", icon: Braces },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function disconnect() {
    window.localStorage.removeItem(API_KEY_STORAGE_KEY);
    router.replace("/login");
  }

  return (
    <aside className="border-neutral bg-base-200 flex w-56 shrink-0 flex-col border-r">
      <div className="border-neutral flex items-center border-b px-5 py-5">
        <Logo size={26} />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {NAV.map((group) => (
          <div key={group.label} className="mb-6 last:mb-0">
            <p className="text-secondary/70 px-3 pb-2 font-mono text-[10px] tracking-[0.2em] uppercase">
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2.5 rounded-[4px] border-l-2 px-3 py-2 text-sm transition-colors ${
                        active
                          ? "bg-base-300 border-primary text-base-content"
                          : "text-secondary hover:text-base-content hover:bg-base-300/50 border-transparent"
                      }`}
                    >
                      <Icon size={16} strokeWidth={2} className="shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-neutral border-t px-5 py-4">
        <div className="text-secondary flex items-center gap-2 font-mono text-[11px]">
          <span className="bg-success inline-block h-1.5 w-1.5 rounded-full" aria-hidden />
          connected
        </div>
        <button
          type="button"
          onClick={disconnect}
          className="text-secondary hover:text-error mt-2 font-mono text-[11px] transition-colors"
        >
          disconnect
        </button>
      </div>
    </aside>
  );
}

export default function DashLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="bg-base-100 flex min-h-screen">
      <Sidebar />
      <main className="bg-base-100 relative flex min-w-0 flex-1 flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: "url(/background.png)" }}
        />
        <div className="from-base-100/70 via-base-100/85 to-base-100 pointer-events-none absolute inset-0 bg-gradient-to-b" />
        <div className="relative flex-1">{children}</div>
        <div className="relative">
          <Footer />
        </div>
      </main>
    </div>
  );
}
