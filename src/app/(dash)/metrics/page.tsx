"use client";

import { formatDayDetail, formatDayLabel, formatDuration } from "@/lib/format";
import { useMetrics } from "@/lib/useApi";
import { AreaChart } from "@/components/charts/AreaChart";
import { BarChart } from "@/components/charts/BarChart";

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

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="border-neutral bg-base-200 rounded-lg border p-5 lg:col-span-3">
          <p className="text-secondary font-mono text-[11px] tracking-[0.1em] uppercase">Activity — last 7 days</p>
          {loading && !metrics ? (
            <ChartSkeleton />
          ) : (
            <div className="mt-4">
              <AreaChart
                ariaLabel="Total events per day, last 7 days"
                unit=" events"
                points={(metrics?.activity ?? []).map((b) => ({
                  label: formatDayLabel(b.date),
                  detail: formatDayDetail(b.date),
                  value: b.total,
                }))}
              />
            </div>
          )}
        </div>

        <div className="border-neutral bg-base-200 rounded-lg border p-5 lg:col-span-2">
          <p className="text-secondary font-mono text-[11px] tracking-[0.1em] uppercase">Sessions vs starts</p>
          {loading && !metrics ? (
            <ChartSkeleton />
          ) : (
            <div className="mt-4">
              <BarChart
                ariaLabel="Sessions connected and profiles started per day, last 7 days"
                series={[
                  { key: "a", label: "Sessions", color: "var(--color-primary)" },
                  { key: "b", label: "Starts", color: "var(--color-secondary)" },
                ]}
                groups={(metrics?.activity ?? []).map((b) => ({
                  label: formatDayLabel(b.date),
                  detail: formatDayDetail(b.date),
                  a: b.sessions,
                  b: b.starts,
                }))}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="mt-4 flex h-[160px] items-end gap-1">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="skeleton w-full rounded-sm" style={{ height: `${30 + ((i * 17) % 70)}%` }} />
      ))}
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
