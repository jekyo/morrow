import { NextResponse } from "next/server";
import { extractToken, isAuthorized } from "@/server/auth";
import { loadConfig } from "@/server/config";
import { toErrorBody, ApiError } from "@/server/errors";

/** Guard for authenticated route handlers. Returns a 401 response, or undefined if OK. */
export function requireAuth(req: Request): NextResponse | undefined {
  const { apiKey } = loadConfig();
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));
  if (isAuthorized(extractToken(headers, url.searchParams), apiKey)) return undefined;
  return NextResponse.json(
    { error: { code: "unauthorized", message: "Invalid API key" } },
    { status: 401 }
  );
}

/** Wraps a handler body, mapping thrown ApiError/Error to the envelope. */
export async function handle(fn: () => Promise<NextResponse> | NextResponse): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("unhandled api error", err);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}
