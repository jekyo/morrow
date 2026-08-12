import type { IncomingMessage } from "node:http";
import { WebSocket as WsClient } from "ws";
import type { WebSocket } from "ws";
import type { WsHandler } from "@/server/ws";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";
import { getProfileManager } from "@/server/profiles";

export interface AttachDeps {
  /** Resolve profile, lazily starting it. Throws ApiError-like ({code}) on failure. */
  ensureStarted(name: string): Promise<{ wsEndpoint: string; profileId: string }>;
  /** Session opened — returns session id. */
  onConnect(profileId: string): string;
  onDisconnect(profileId: string, sessionId: string): void;
}

const CLOSE_CODES: Record<string, number> = {
  profile_not_found: 4404,
  too_many_profiles: 4429,
  profile_busy: 4409,
  browser_launch_failed: 4500,
};

function safeClose(ws: WebSocket, code: number, reason?: string): void {
  try {
    ws.close(code, reason);
  } catch {
    try { ws.terminate(); } catch { /* already gone */ }
  }
}

/** ws close codes an endpoint may legally send: 1000-1011 (minus reserved) or 3000-4999. */
function sanitizeCode(code: number): number {
  if (code === 1000 || (code >= 3000 && code <= 4999)) return code;
  if (code >= 1001 && code <= 1011 && code !== 1004 && code !== 1005 && code !== 1006) return code;
  return 1000;
}

export function playwrightAttachHandler(deps: AttachDeps): WsHandler {
  return (ws, route, req) => {
    void attach(ws, route.profileName, req, deps).catch((err) => {
      console.error("playwright attach failed", err);
      safeClose(ws, 1011, "internal_error");
    });
  };
}

async function attach(ws: WebSocket, profileName: string, req: IncomingMessage, deps: AttachDeps): Promise<void> {
  // Buffer client frames until the upstream pipe is open (lazy start can take seconds).
  const pending: Array<{ data: Buffer; isBinary: boolean }> = [];
  let upstream: WsClient | undefined;
  ws.on("message", (data, isBinary) => {
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as Buffer);
    if (upstream && upstream.readyState === WsClient.OPEN) upstream.send(buf, { binary: isBinary });
    else pending.push({ data: buf, isBinary });
  });

  let target: { wsEndpoint: string; profileId: string };
  try {
    target = await deps.ensureStarted(profileName);
  } catch (err) {
    const code = (err as { code?: string }).code;
    safeClose(ws, (code && CLOSE_CODES[code]) || 1011, code ?? "attach_failed");
    return;
  }
  if (ws.readyState !== ws.OPEN) return; // client gave up while we were starting

  // Forward playwright's own negotiation headers so its version check works.
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (k.startsWith("x-playwright") || k === "user-agent") headers[k] = Array.isArray(v) ? v[0]! : String(v);
  }
  upstream = new WsClient(target.wsEndpoint, { headers, maxPayload: 256 * 1024 * 1024 });
  const up = upstream;

  let sessionId: string | undefined;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (sessionId) deps.onDisconnect(target.profileId, sessionId);
  };

  up.on("open", () => {
    sessionId = deps.onConnect(target.profileId);
    for (const m of pending.splice(0)) up.send(m.data, { binary: m.isBinary });
  });
  up.on("message", (data, isBinary) => {
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as Buffer);
    if (ws.readyState === ws.OPEN) ws.send(buf, { binary: isBinary });
  });
  up.on("close", (code, reason) => {
    finish();
    safeClose(ws, sanitizeCode(code), reason.toString().slice(0, 120));
  });
  up.on("error", () => {
    finish();
    safeClose(ws, 1011, "upstream_error");
  });

  ws.on("close", () => {
    finish();
    try { up.close(); } catch { /* already closed */ }
  });
  ws.on("error", () => {
    finish();
    try { up.close(); } catch { /* already closed */ }
  });
}

/** Production wiring: ProfileManager + sessions + events. */
export function defaultAttachDeps(): AttachDeps {
  return {
    async ensureStarted(name) {
      try {
        const rp = await getProfileManager().start(name);
        return { wsEndpoint: rp.browser.wsEndpoint, profileId: rp.profile.id };
      } catch (err) {
        if (err instanceof ApiError) throw Object.assign(new Error(err.message), { code: err.code });
        throw err;
      }
    },
    onConnect(profileId) {
      const db = getDb(config().dataDir);
      const s = db.createSession(profileId, "playwright");
      db.recordEvent(profileId, "session.connected", { sessionId: s.id, kind: "playwright" });
      return s.id;
    },
    onDisconnect(profileId, sessionId) {
      const db = getDb(config().dataDir);
      db.closeSession(sessionId);
      db.recordEvent(profileId, "session.disconnected", { sessionId, kind: "playwright" });
    },
  };
}
