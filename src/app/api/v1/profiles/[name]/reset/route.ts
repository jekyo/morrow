import { NextResponse } from "next/server";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";
import { getProfileManager } from "@/server/profiles";
import { profileJson } from "@/server/serialize";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ name: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const { name } = await ctx.params;
    const cfg = config();
    const db = getDb(cfg.dataDir);
    const p = db.getProfileByName(name);
    if (!p) throw new ApiError("profile_not_found", `No profile named ${JSON.stringify(name)}`, 404);
    if (getProfileManager().isRunning(name))
      throw new ApiError("profile_not_stopped", "Stop the profile before resetting it", 409);
    rmSync(join(cfg.dataDir, "profiles", p.id), { recursive: true, force: true });
    db.recordEvent(p.id, "profile.reset");
    return NextResponse.json(profileJson(db.getProfileByName(name)!, false));
  });
}
