import { NextResponse } from "next/server";
import { requireAuth, handle } from "@/server/api";
import { config } from "@/server/config";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * No code path records `scrape.*` events yet (the scrape endpoint doesn't
 * emit them) — total24h/failed24h are wired to real counts and will read 0
 * until that lands, rather than being faked.
 */
export async function GET(req: Request) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  return handle(() => {
    const db = getDb(config().dataDir);
    const since = new Date(Date.now() - DAY_MS).toISOString();
    return NextResponse.json({
      profiles: {
        total: db.listProfiles().length,
        running: db.countRunningProfiles(),
      },
      sessions: {
        active: db.listActiveSessions().length,
      },
      scrapes: {
        total24h: db.countEventsSince("scrape.", since),
        failed24h: db.countEventsSince("scrape.failed", since),
      },
      system: {
        memory: process.memoryUsage.rss(),
        uptime: process.uptime(),
      },
      activity: db.activitySeries(7),
    });
  });
}
