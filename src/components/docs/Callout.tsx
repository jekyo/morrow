import type { ReactNode } from "react";

const TONES = {
  accent: { border: "border-accent/40", bg: "bg-accent/10", label: "text-accent" },
  neutral: { border: "border-neutral", bg: "bg-base-200", label: "text-secondary" },
} as const;

/** Small labeled note box — used for scope/honesty caveats and security notes. */
export function Callout({
  title,
  tone = "accent",
  children,
}: {
  title: string;
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div className={`my-6 rounded-lg border p-4 ${t.border} ${t.bg}`}>
      <p className={`font-mono text-[11px] tracking-[0.15em] uppercase ${t.label}`}>{title}</p>
      <div className="text-base-content/80 mt-2 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </div>
    </div>
  );
}
