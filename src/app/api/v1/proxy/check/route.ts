import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { resolveProxyEgress } from "@/server/browser/geo";
import { ApiError } from "@/server/errors";
import { proxyCheckSchema, parseBody } from "@/server/validation";

export const dynamic = "force-dynamic";

/**
 * Preflight check for a proxy string before it's saved onto a profile: resolves
 * the proxy's real egress IP (through the proxy, via undici — see geo.ts /
 * docs/notes/fingerprint-audit.md P0-WEBRTC) and the timezone/geo/locale Morrow
 * would seed the browser with, so a caller can verify a proxy actually works
 * (and see what identity it produces) before committing to it.
 */
export async function POST(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const body = await parseBody(req, proxyCheckSchema);
    const egress = await resolveProxyEgress(body.proxy);
    if (!egress) throw new ApiError("proxy_unreachable", "Could not reach the proxy", 400);
    return NextResponse.json({
      ip: egress.ip,
      country: egress.country ?? null,
      city: egress.city ?? null,
      timezone: egress.timezone ?? null,
      locale: egress.locale ?? null,
      rotating: egress.rotating,
    });
  });
}
