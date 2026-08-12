import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { parseBody, pageOptionsSchema } from "@/server/validation";
import { runContent } from "@/server/scrape";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const body = await parseBody(req, pageOptionsSchema);
    const html = await runContent(body.profile, body);
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  });
}
