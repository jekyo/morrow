import { randomBytes } from "node:crypto";
import type { WebSocket } from "ws";
import type { WsHandler } from "@/server/ws";
import type { Frame, InputMessage, ViewerPage } from "@/server/viewer";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";
import { getProfileManager } from "@/server/profiles";
import { getOrCreateHub } from "@/server/viewer";

/** One viewer socket's view of a running profile — the seam the tests fake. */
export interface ViewerAttachment {
  profileId: string;
  lockHolder(): string | null;
  takeControl(viewerId: string): boolean;
  releaseControl(viewerId: string): void;
  input(viewerId: string, msg: InputMessage): void;
  navigate(viewerId: string, url: string): Promise<void>;
  subscribe(fn: (f: Frame) => void): () => void;
  onDisconnect(viewerId: string): void;
}

export interface ViewerDeps {
  /** Resolve + lazily start the profile. Throws ApiError-like ({code}) on failure. */
  attach(name: string): Promise<ViewerAttachment>;
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

export function viewerHandler(deps: ViewerDeps): WsHandler {
  return (ws, route) => {
    const viewerId = `viewer_${randomBytes(6).toString("hex")}`;
    void run(ws, route.profileName, viewerId, deps).catch((err) => {
      console.error("viewer failed", err);
      safeClose(ws, 1011, "internal_error");
    });
  };
}

async function run(ws: WebSocket, name: string, viewerId: string, deps: ViewerDeps): Promise<void> {
  let att: ViewerAttachment;
  try {
    att = await deps.attach(name);
  } catch (err) {
    const code = (err as { code?: string }).code;
    safeClose(ws, (code && CLOSE_CODES[code]) || 1011, code ?? "viewer_failed");
    return;
  }
  // The client may have given up while the profile was launching.
  if (ws.readyState !== ws.OPEN) {
    att.onDisconnect(viewerId);
    return;
  }

  const send = (payload: string | Buffer, binary = false) => {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.send(payload, { binary });
    } catch {
      // socket died between the check and the write — close handler cleans up
    }
  };
  const sendStatus = () => send(JSON.stringify({ type: "lock", holder: att.lockHolder(), you: viewerId }));

  // Each frame is a json header followed by the jpeg bytes, so the client can
  // pair metadata with the binary message that follows it.
  const unsub = att.subscribe((f) => {
    send(JSON.stringify({ type: "frameMeta", url: f.url, seq: f.seq }));
    send(f.data, true);
  });
  sendStatus();

  ws.on("message", (raw) => {
    let msg: { type?: string; input?: InputMessage; url?: string };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return; // not our protocol — ignore
    }
    if (msg.type === "takeControl") {
      att.takeControl(viewerId);
      sendStatus();
    } else if (msg.type === "releaseControl") {
      att.releaseControl(viewerId);
      sendStatus();
    } else if (msg.type === "input" && msg.input) {
      att.input(viewerId, msg.input);
    } else if (msg.type === "navigate" && typeof msg.url === "string") {
      void att.navigate(viewerId, msg.url).catch((err) => console.error("viewer navigate failed", err));
    }
  });

  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    unsub();
    att.releaseControl(viewerId);
    att.onDisconnect(viewerId);
  };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
}

/** Production wiring: ProfileManager + hub registry + sessions/events. */
export function defaultViewerDeps(): ViewerDeps {
  return {
    async attach(name) {
      const pm = getProfileManager();
      let rp;
      try {
        rp = await pm.start(name);
      } catch (err) {
        if (err instanceof ApiError) throw Object.assign(new Error(err.message), { code: err.code });
        throw err;
      }
      const profileId = rp.profile.id;
      const page = await pm.activePage(name);
      const hub = getOrCreateHub(profileId, page as unknown as ViewerPage);
      hub.start();
      const db = getDb(config().dataDir);
      let sessionId: string | undefined;
      return {
        profileId,
        lockHolder: () => hub.lock.holder(),
        takeControl: (id) => hub.lock.take(id),
        releaseControl: (id) => hub.lock.release(id),
        input: (id, msg) => hub.input(id, msg),
        navigate: (id, url) => hub.navigate(id, url),
        subscribe: (fn) => {
          const un = hub.subscribe(fn);
          const s = db.createSession(profileId, "viewer");
          sessionId = s.id;
          db.recordEvent(profileId, "session.connected", { sessionId: s.id, kind: "viewer" });
          return un;
        },
        onDisconnect: () => {
          if (!sessionId) return;
          db.closeSession(sessionId);
          db.recordEvent(profileId, "session.disconnected", { sessionId, kind: "viewer" });
          sessionId = undefined;
        },
      };
    },
  };
}
