"use client";

import { useMemo, useState } from "react";

export interface BarChartGroup {
  /** Short axis label, e.g. "MON". */
  label: string;
  /** Full description shown in the tooltip. Falls back to `label`. */
  detail?: string;
  a: number;
  b: number;
}

export interface BarChartSeries {
  key: "a" | "b";
  label: string;
  color: string;
}

interface BarChartProps {
  groups: BarChartGroup[];
  series: [BarChartSeries, BarChartSeries];
  height?: number;
  ariaLabel: string;
}

const WIDTH = 600;
const PAD = { top: 10, right: 8, bottom: 20, left: 8 };
const BAR_GAP = 2; // surface gap between the two bars in a group
const GROUP_GAP_RATIO = 0.4; // fraction of a group's slot left as air between groups

/**
 * Two-series grouped bar chart, hand-rolled inline SVG. Ember = primary
 * series, warm neutral = secondary — the "emphasis" pairing from the
 * dataviz color formula (accent hue + de-emphasis gray) rather than a
 * second saturated categorical hue, so identity never depends on
 * distinguishing two hues under color-vision deficiency.
 */
export function BarChart({ groups, series, height = 140, ariaLabel }: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const n = groups.length;
  const max = useMemo(() => Math.max(1, ...groups.flatMap((g) => [g.a, g.b])), [groups]);
  const baseline = PAD.top + innerH;

  const slot = n > 0 ? innerW / n : 0;
  const groupWidth = slot * (1 - GROUP_GAP_RATIO);
  const barWidth = Math.max(2, (groupWidth - BAR_GAP) / 2);

  const barHeight = (v: number) => (v / max) * innerH;

  const [sA, sB] = series;

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-4">
        {series.map((s) => (
          <span key={s.key} className="text-secondary flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] uppercase">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ backgroundColor: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} role="img" aria-label={ariaLabel}>
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={baseline} y2={baseline} stroke="var(--color-neutral)" strokeWidth="1" />

        {groups.map((g, i) => {
          const groupX = PAD.left + slot * i + (slot - groupWidth) / 2;
          const hA = barHeight(g.a);
          const hB = barHeight(g.b);
          const isHover = hover === i;
          return (
            <g key={`${g.label}-${i}`} opacity={hover === null || isHover ? 1 : 0.45}>
              <rect
                x={groupX}
                y={baseline - hA}
                width={barWidth}
                height={Math.max(hA, hA > 0 ? 1 : 0)}
                rx={2}
                fill={sA.color}
              />
              <rect
                x={groupX + barWidth + BAR_GAP}
                y={baseline - hB}
                width={barWidth}
                height={Math.max(hB, hB > 0 ? 1 : 0)}
                rx={2}
                fill={sB.color}
              />
            </g>
          );
        })}

        {groups.map((g, i) => (
          <rect
            key={`hit-${g.label}-${i}`}
            x={PAD.left + slot * i}
            y={0}
            width={slot}
            height={height}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          />
        ))}

        {groups.map(
          (g, i) =>
            (n <= 7 || i % Math.max(1, Math.ceil(n / 7)) === 0) && (
              <text
                key={`label-${g.label}-${i}`}
                x={PAD.left + slot * i + slot / 2}
                y={height - 4}
                textAnchor="middle"
                className="fill-secondary font-mono"
                style={{ fontSize: 9 }}
              >
                {g.label}
              </text>
            )
        )}
      </svg>

      {hover !== null && groups[hover] && (
        <div
          className="border-neutral bg-base-300 text-base-content pointer-events-none absolute top-0 z-10 -translate-y-1 rounded-md border px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
          style={{
            left: `${((PAD.left + slot * hover + slot / 2) / WIDTH) * 100}%`,
            transform: `translate(${hover / n > 0.8 ? "-100%" : hover / n < 0.2 ? "0%" : "-50%"}, -100%)`,
          }}
        >
          <p className="text-secondary font-mono text-[10px] tracking-[0.08em] uppercase">{groups[hover].detail ?? groups[hover].label}</p>
          <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[12px]">
            <span className="inline-block h-1.5 w-1.5 rounded-[1px]" style={{ backgroundColor: sA.color }} aria-hidden />
            {sA.label} {groups[hover].a}
          </p>
          <p className="flex items-center gap-1.5 font-mono text-[12px]">
            <span className="inline-block h-1.5 w-1.5 rounded-[1px]" style={{ backgroundColor: sB.color }} aria-hidden />
            {sB.label} {groups[hover].b}
          </p>
        </div>
      )}

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>{sA.label}</th>
            <th>{sB.label}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={`${g.label}-${i}`}>
              <td>{g.detail ?? g.label}</td>
              <td>{g.a}</td>
              <td>{g.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
