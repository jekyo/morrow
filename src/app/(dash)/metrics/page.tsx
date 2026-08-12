"use client";

import { formatDuration } from "@/lib/format";
import { useMetrics } from "@/lib/useApi";

export default function MetricsPage() {
  const { metrics, loading, error } = useMetrics();

  const cards = metrics
    ? [
        { label: "Total profiles", value: metrics.profiles.total },
        { label: "Running now", value: metrics.profiles.running },
        { label: "Active sessions", value: metrics.sessions.active },
        { label: "Scrapes (24h)", value: metrics.scrapes.total24h },
        { label: "Scrape failures (24h)", value: metrics.scrapes.failed24h, warn: metrics.scrapes.failed24h > 0 },
        { label: "Memory", value: Math.round(metrics.system.memory / (1024 * 1024)), unit: "MB" },
        { label: "Uptime", value: formatDuration(metrics.system.uptime), raw: true },
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <h1 className="text-base-content text-2xl font-semibold">Metrics</h1>
      <p className="text-secondary mt-1 font-mono text-[12px]">polled every 15s</p>

      {error && (
        <p className="text-error mt-4 text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        {loading && !metrics
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : cards.map((c) => (
              <div key={c.label} className="border-neutral bg-base-200 rounded-lg border p-5">
                <p
                  className={`font-sans text-[32px] leading-none font-semibold ${"warn" in c && c.warn ? "text-error" : "text-base-content"}`}
                >
                  {"raw" in c && c.raw ? c.value : c.value}
                  {"unit" in c && c.unit && <span className="text-secondary ml-1 text-base font-normal">{c.unit}</span>}
                </p>
                <p className="text-secondary mt-2 font-mono text-[11px] tracking-[0.1em] uppercase">{c.label}</p>
              </div>
            ))}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="border-neutral bg-base-200 rounded-lg border p-5">
      <div className="skeleton h-8 w-16" />
      <div className="skeleton mt-3 h-3 w-24" />
    </div>
  );
}
