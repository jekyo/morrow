import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { parseBody, screenshotSchema } from "@/server/validation";
import { runScreenshot } from "@/server/scrape";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const body = await parseBody(req, screenshotSchema);
    const buf = await runScreenshot(body.profile, body, body);
    const type = body.type === "jpeg" ? "image/jpeg" : "image/png";
    return new NextResponse(new Uint8Array(buf), { headers: { "content-type": type } });
  });
}
