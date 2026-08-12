"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiEvent } from "@/lib/useApi";
import { formatClockTime } from "@/lib/format";

function detailOf(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "object" && "message" in (data as Record<string, unknown>)) {
    const msg = (data as Record<string, unknown>).message;
    if (typeof msg === "string") return msg;
  }
  try {
    const s = JSON.stringify(data);
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  } catch {
    return "";
  }
}

/** Terminal-styled event log (design system §24): newest last, auto-scroll toggle. */
export function Timeline({ events, loading }: { events: ApiEvent[]; loading?: boolean }) {
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [events, autoScroll]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-secondary font-mono text-[11px] tracking-[0.15em] uppercase">Timeline</span>
        <label className="text-secondary flex items-center gap-1.5 font-mono text-[11px]">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="checkbox checkbox-xs"
          />
          auto-scroll
        </label>
      </div>
      <div className="bg-base-100 border-neutral h-56 overflow-y-auto rounded-md border p-3 font-mono text-[12px] leading-[1.6]">
        {loading && events.length === 0 ? (
          <p className="text-secondary/60">loading…</p>
        ) : events.length === 0 ? (
          <p className="text-secondary/60">No events yet.</p>
        ) : (
          <>
            {events.map((e) => (
              <div key={e.id} className="flex gap-3">
                <span className="text-secondary/70 shrink-0">{formatClockTime(e.createdAt)}</span>
                <span className="text-base-content shrink-0">{e.type}</span>
                <span className="text-secondary truncate">{detailOf(e.data)}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
}
