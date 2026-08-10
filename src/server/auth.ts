import { timingSafeEqual } from "node:crypto";

export function isAuthorized(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Token from `Authorization: Bearer x` header or `?token=x` query. */
export function extractToken(
  headers: Record<string, string | string[] | undefined>,
  query: URLSearchParams | null
): string | undefined {
  const raw = headers.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (header) {
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1];
  }
  return query?.get("token") ?? undefined;
}
