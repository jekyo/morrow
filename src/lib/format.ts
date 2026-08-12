/**
 * The API returns SQLite `datetime('now')` timestamps: "YYYY-MM-DD HH:MM:SS"
 * in UTC, but with no "Z"/offset suffix. `new Date(...)` on a string like
 * that is parsed as *local* time per the Date-Time String Format's
 * non-standard fallback, silently shifting every timestamp by the viewer's
 * UTC offset. Normalize to an unambiguous ISO string before parsing.
 */
function parseUtc(sqliteOrIso: string): Date {
  const s = /[Tt]|Z$/.test(sqliteOrIso) ? sqliteOrIso : `${sqliteOrIso.replace(" ", "T")}Z`;
  return new Date(s);
}

/** "2m ago" / "3h ago" / "5d ago" style relative time for dense tables and logs. */
export function formatRelativeTime(iso: string): string {
  const then = parseUtc(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const deltaSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (deltaSec < 5) return "just now";
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const min = Math.floor(deltaSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.floor(mon / 12)}y ago`;
}

/** Seconds → "3h 12m" / "45s" style compact duration, for uptime cards. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** HH:MM:SS in the local timezone, for terminal-styled logs (design system §24). */
export function formatClockTime(iso: string): string {
  const d = parseUtc(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toLocaleTimeString("en-GB", { hour12: false });
}
