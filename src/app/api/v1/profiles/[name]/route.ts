import { NextResponse } from "next/server";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb, type Profile } from "@/server/db";
import { ApiError } from "@/server/errors";
import { getProfileManager } from "@/server/profiles";
import { profileJson } from "@/server/serialize";
import { updateProfileSchema, parseBody } from "@/server/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

function mustGet(name: string): Profile {
  const p = getDb(config().dataDir).getProfileByName(name);
  if (!p) throw new ApiError("profile_not_found", `No profile named ${JSON.stringify(name)}`, 404);
  return p;
}

export async function GET(req: Request, ctx: Ctx) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const { name } = await ctx.params;
    const p = mustGet(name);
    return NextResponse.json(profileJson(p, getProfileManager().isRunning(name)));
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const { name } = await ctx.params;
    const p = mustGet(name);
    const body = await parseBody(req, updateProfileSchema);
    const db = getDb(config().dataDir);
    db.updateProfile(p.id, {
      ...("proxy" in body ? { proxy: body.proxy ?? null } : {}),
      ...("locale" in body ? { locale: body.locale ?? null } : {}),
      ...("timezone" in body ? { timezone: body.timezone ?? null } : {}),
      ...(body.viewport ? { viewportWidth: body.viewport.width, viewportHeight: body.viewport.height } : {}),
    });
    return NextResponse.json(profileJson(db.getProfileByName(name)!, getProfileManager().isRunning(name)));
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const { name } = await ctx.params;
    const p = mustGet(name);
    if (getProfileManager().isRunning(name))
      throw new ApiError("profile_not_stopped", "Stop the profile before deleting it", 409);
    const cfg = config();
    getDb(cfg.dataDir).deleteProfile(p.id);
    rmSync(join(cfg.dataDir, "profiles", p.id), { recursive: true, force: true });
    return new NextResponse(null, { status: 204 });
  });
}
