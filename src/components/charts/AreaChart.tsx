"use client";

import { useId, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";

export interface AreaChartPoint {
  /** Short axis label, e.g. "MON" or "08/09". */
  label: string;
  /** Full description shown in the tooltip, e.g. "Sunday, Aug 9". Falls back to `label`. */
  detail?: string;
  value: number;
}

interface AreaChartProps {
  points: AreaChartPoint[];
  /** CSS color (hex or var()) for the line/fill. Defaults to ember. */
  color?: string;
  height?: number;
  /** Unit suffix appended to values in the tooltip, e.g. "events". */
  unit?: string;
  /** Accessible name for the chart's role="img" fallback and the sr-only table caption. */
  ariaLabel: string;
}

const WIDTH = 600;
const PAD = { top: 10, right: 8, bottom: 20, left: 8 };

/**
 * Single-series area/line chart, hand-rolled inline SVG (design-system §17:
 * borders over shadows, no generic-SaaS chart library). Ember stroke over a
 * faint gradient wash, hairline baseline, mono axis labels, crosshair +
 * tooltip on hover, and an sr-only table so the data is never color-only.
 */
export function AreaChart({ points, color = "var(--color-primary)", height = 160, unit = "", ariaLabel }: AreaChartProps) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const n = points.length;
  const max = useMemo(() => Math.max(1, ...points.map((p) => p.value)), [points]);

  const x = (i: number) => (n <= 1 ? PAD.left + innerW / 2 : PAD.left + (innerW * i) / (n - 1));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const baseline = PAD.top + innerH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(p.value).toFixed(2)}`).join(" ");
  const areaPath = n > 0 ? `${linePath} L ${x(n - 1).toFixed(2)} ${baseline} L ${x(0).toFixed(2)} ${baseline} Z` : "";

  // Thin out x-axis labels so they never collide: show every Nth label, always the last.
  const labelStride = Math.max(1, Math.ceil(n / 7));

  function handlePointer(e: ReactPointerEvent<SVGRectElement>) {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    const idx = Math.round(ratio * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, idx)));
  }

  const active = hover !== null ? points[hover] : null;
  const activeLeftPct = hover !== null ? (x(hover) / WIDTH) * 100 : 0;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* baseline — hairline, recessive */}
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={baseline} y2={baseline} stroke="var(--color-neutral)" strokeWidth="1" />

        {n > 0 && <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />}
        {n > 1 && <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {n === 1 && <circle cx={x(0)} cy={y(points[0].value)} r="4" fill={color} stroke="var(--color-base-200)" strokeWidth="2" />}

        {active && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={PAD.top} y2={baseline} stroke="var(--color-neutral)" strokeWidth="1" />
            <circle cx={x(hover!)} cy={y(active.value)} r="4" fill={color} stroke="var(--color-base-200)" strokeWidth="2" />
          </>
        )}

        {points.map(
          (p, i) =>
            (i % labelStride === 0 || i === n - 1) && (
              <text
                key={`${p.label}-${i}`}
                x={x(i)}
                y={height - 4}
                textAnchor="middle"
                className="fill-secondary font-mono"
                style={{ fontSize: 9 }}
              >
                {p.label}
              </text>
            )
        )}

        {n > 0 && (
          <rect
            x={PAD.left}
            y={0}
            width={innerW}
            height={height}
            fill="transparent"
            onPointerMove={handlePointer}
            onPointerLeave={() => setHover(null)}
          />
        )}
      </svg>

      {active && (
        <div
          className="border-neutral bg-base-300 text-base-content pointer-events-none absolute top-0 z-10 -translate-y-1 rounded-md border px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
          style={{
            left: `${activeLeftPct}%`,
            transform: `translate(${activeLeftPct > 80 ? "-100%" : activeLeftPct < 20 ? "0%" : "-50%"}, -100%)`,
          }}
        >
          <p className="text-secondary font-mono text-[10px] tracking-[0.08em] uppercase">{active.detail ?? active.label}</p>
          <p className="mt-0.5 font-mono text-[13px] font-medium">
            {active.value}
            {unit && <span className="text-secondary ml-1">{unit}</span>}
          </p>
        </div>
      )}

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={`${p.label}-${i}`}>
              <td>{p.detail ?? p.label}</td>
              <td>
                {p.value}
                {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
