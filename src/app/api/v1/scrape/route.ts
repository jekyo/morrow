import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { parseBody, scrapeSchema } from "@/server/validation";
import { runScrape } from "@/server/scrape";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const body = await parseBody(req, scrapeSchema);
    const result = await runScrape(body.profile, body, body);
    return NextResponse.json(result);
  });
}
