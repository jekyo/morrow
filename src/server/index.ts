import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import next from "next";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { createUpgradeHandler } from "@/server/ws";
import { playwrightAttachHandler, defaultAttachDeps } from "@/server/attach";
import { viewerHandler, defaultViewerDeps } from "@/server/viewer-handler";
import { mcpHandler } from "@/server/mcp/handler";

const dev = process.env.NODE_ENV !== "production";

async function main() {
  const cfg = config();
  mkdirSync(cfg.dataDir, { recursive: true });

  const db = getDb(cfg.dataDir);
  db.resetRunningProfiles(); // boot reconciliation (spec §3 lifecycle)
  db.closeAllSessions();

  const app = next({ dev, port: cfg.port });
  const handleRequest = app.getRequestHandler();
  await app.prepare();
  // Next's own upgrade handling (dev-mode HMR websocket, etc). Any ws upgrade
  // that isn't a Morrow route falls through to this instead of being killed —
  // see the comment on createUpgradeHandler.
  const nextUpgradeHandler = app.getUpgradeHandler();

  const server = createServer((req, res) => {
    // MCP owns /mcp end to end (raw Node req/res + streamable HTTP), so it has
    // to win before Next sees the request.
    if (req.url && (req.url === "/mcp" || req.url.startsWith("/mcp?") || req.url.startsWith("/mcp/")))
      return void mcpHandler(req, res);
    return void handleRequest(req, res);
  });
  server.on(
    "upgrade",
    createUpgradeHandler(
      cfg,
      {
        playwright: playwrightAttachHandler(defaultAttachDeps()),
        viewer: viewerHandler(defaultViewerDeps()),
      },
      (req, socket, head) => {
        void nextUpgradeHandler(req, socket, head);
      }
    )
  );

  server.listen(cfg.port, () => {
    console.log(`morrow listening on :${cfg.port} (data: ${cfg.dataDir})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
