import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import next from "next";
import { config } from "@/server/config";
import { resolveApiKey } from "@/server/apikey";
import { getDb } from "@/server/db";
import { createUpgradeHandler } from "@/server/ws";
import { playwrightAttachHandler, defaultAttachDeps } from "@/server/attach";
import { viewerHandler, defaultViewerDeps } from "@/server/viewer-handler";
import { vncHandler, defaultVncDeps } from "@/server/vnc-handler";
import { mcpHandler } from "@/server/mcp/handler";

const dev = process.env.NODE_ENV !== "production";

function printKeyBanner(key: string): void {
  const line = "─".repeat(52);
  console.log(
    `\n┌${line}┐\n` +
      `│  Morrow generated an API key (no MORROW_API_KEY set).\n` +
      `│\n` +
      `│    ${key}\n` +
      `│\n` +
      `│  Use it to log into the dashboard. It is saved to\n` +
      `│  <data>/.api-key and reused on restart. Set MORROW_API_KEY\n` +
      `│  to use your own instead.\n` +
      `└${line}┘\n`
  );
}

async function main() {
  // Resolve the API key before config(): if MORROW_API_KEY isn't set we
  // generate one, persist it under the data dir, and expose it via env so the
  // rest of the app (config()/requireAuth) reads it transparently.
  const dataDir = process.env.MORROW_DATA_DIR ?? "/data";
  mkdirSync(dataDir, { recursive: true });
  const { key, generated } = resolveApiKey(dataDir);
  process.env.MORROW_API_KEY = key;
  if (generated) printKeyBanner(key);

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
        vnc: vncHandler(defaultVncDeps()),
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
