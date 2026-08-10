import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import next from "next";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { createUpgradeHandler } from "@/server/ws";

const dev = process.env.NODE_ENV !== "production";

async function main() {
  const cfg = config();
  mkdirSync(cfg.dataDir, { recursive: true });

  const db = getDb(cfg.dataDir);
  db.resetRunningProfiles(); // boot reconciliation (spec §3 lifecycle)

  const app = next({ dev });
  const handleRequest = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => handleRequest(req, res));
  server.on("upgrade", createUpgradeHandler(cfg));

  server.listen(cfg.port, () => {
    console.log(`morrow listening on :${cfg.port} (data: ${cfg.dataDir})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
