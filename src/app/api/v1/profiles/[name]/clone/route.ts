import { NextResponse } from "next/server";
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";
import { getProfileManager } from "@/server/profiles";
import { profileJson } from "@/server/serialize";
import { parseBody, createProfileSchema } from "@/server/validation";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ name: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const { name } = await ctx.params;
    const cfg = config();
    const db = getDb(cfg.dataDir);
    const src = db.getProfileByName(name);
    if (!src) throw new ApiError("profile_not_found", `No profile named ${JSON.stringify(name)}`, 404);
    if (getProfileManager().isRunning(name))
      throw new ApiError("profile_not_stopped", "Stop the profile before cloning it", 409);
    const body = await parseBody(req, createProfileSchema.pick({ name: true }));
    if (db.getProfileByName(body.name)) throw new ApiError("profile_exists", `Profile ${body.name} already exists`, 409);

    const clone = db.createProfile({
      name: body.name,
      proxy: src.proxy ?? undefined,
      locale: src.locale ?? undefined,
      timezone: src.timezone ?? undefined,
      viewportWidth: src.viewportWidth ?? undefined,
      viewportHeight: src.viewportHeight ?? undefined,
    });
    const srcDir = join(cfg.dataDir, "profiles", src.id);
    if (existsSync(srcDir)) cpSync(srcDir, join(cfg.dataDir, "profiles", clone.id), { recursive: true });
    db.recordEvent(clone.id, "profile.created", { clonedFrom: src.name });
    return NextResponse.json(profileJson(clone, false), { status: 201 });
  });
}
