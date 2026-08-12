import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";
import { getProfileManager } from "@/server/profiles";
import { profileJson } from "@/server/serialize";
import { createProfileSchema, parseBody } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(() => {
    const db = getDb(config().dataDir);
    const pm = getProfileManager();
    return NextResponse.json({ profiles: db.listProfiles().map((p) => profileJson(p, pm.isRunning(p.name))) });
  });
}

export async function POST(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(async () => {
    const body = await parseBody(req, createProfileSchema);
    const db = getDb(config().dataDir);
    if (db.getProfileByName(body.name)) throw new ApiError("profile_exists", `Profile ${body.name} already exists`, 409);
    const p = db.createProfile({
      name: body.name,
      proxy: body.proxy,
      locale: body.locale,
      timezone: body.timezone,
      viewportWidth: body.viewport?.width,
      viewportHeight: body.viewport?.height,
    });
    db.recordEvent(p.id, "profile.created");
    return NextResponse.json(profileJson(p, false), { status: 201 });
  });
}
