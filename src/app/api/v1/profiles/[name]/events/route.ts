import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ name: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const { name } = await ctx.params;
    const db = getDb(config().dataDir);
    const p = db.getProfileByName(name);
    if (!p) throw new ApiError("profile_not_found", `No profile named ${JSON.stringify(name)}`, 404);
    const limitRaw = new URL(req.url).searchParams.get("limit");
    const limit = Math.max(1, Math.min(limitRaw ? parseInt(limitRaw, 10) || 200 : 200, 1000));
    return NextResponse.json({ events: db.listEvents(p.id, limit) });
  });
}
