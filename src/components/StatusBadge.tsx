import type { ApiProfile } from "@/lib/useApi";

/** Design system §19-20: glyph + label, color is secondary to typography. */
const STATUS: Record<ApiProfile["status"], { glyph: string; label: string; className: string }> = {
  running: { glyph: "●", label: "RUNNING", className: "text-success" },
  starting: { glyph: "◌", label: "STARTING", className: "text-accent" },
  stopping: { glyph: "◌", label: "STOPPING", className: "text-accent" },
  stopped: { glyph: "○", label: "STOPPED", className: "text-secondary" },
};

export function StatusBadge({ status }: { status: ApiProfile["status"] }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.08em] ${s.className}`}>
      <span aria-hidden>{s.glyph}</span>
      {s.label}
    </span>
  );
}
