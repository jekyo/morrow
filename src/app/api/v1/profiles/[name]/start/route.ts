import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { getProfileManager } from "@/server/profiles";
import { profileJson } from "@/server/serialize";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ name: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const { name } = await ctx.params;
    await getProfileManager().start(name);
    return NextResponse.json(profileJson(getDb(config().dataDir).getProfileByName(name)!, true));
  });
}
