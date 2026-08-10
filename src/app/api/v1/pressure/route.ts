import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(() => {
    const cfg = config();
    const db = getDb(cfg.dataDir);
    return NextResponse.json({
      runningProfiles: db.countRunningProfiles(),
      maxProfiles: cfg.maxProfiles,
      memory: process.memoryUsage.rss(),
      queued: 0,
    });
  });
}
