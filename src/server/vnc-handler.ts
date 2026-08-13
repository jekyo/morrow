import { connect, type Socket } from "node:net";
import type { WebSocket } from "ws";
import type { WsHandler } from "@/server/ws";
import { ApiError } from "@/server/errors";
import { getProfileManager } from "@/server/profiles";

/**
 * Bridges a noVNC websocket to a profile's x11vnc RFB server. noVNC speaks the
 * RFB protocol as a stream of binary websocket messages; x11vnc speaks raw RFB
 * over TCP on localhost. This handler is a dumb, symmetric byte pipe between the
 * two — all VNC semantics (framebuffer, input, encodings) live in x11vnc and the
 * @novnc/novnc client, which is exactly why this replaces the old bespoke
 * screencast+input viewer.
 */
export interface VncDeps {
  /** Resolve + lazily start the profile, returning its localhost RFB port. */
  resolve(name: string): Promise<{ vncPort: number }>;
}

const CLOSE_CODES: Record<string, number> = {
  profile_not_found: 4404,
  too_many_profiles: 4429,
  profile_busy: 4409,
  browser_launch_failed: 4500,
  viewer_unavailable: 4503,
};

function safeClose(ws: WebSocket, code: number, reason?: string): void {
  try { ws.close(code, reason); } catch { try { ws.terminate(); } catch { /* gone */ } }
}

export function vncHandler(deps: VncDeps): WsHandler {
  return (ws, route) => {
    void run(ws, route.profileName, deps).catch((err) => {
      console.error("vnc bridge failed", err);
      safeClose(ws, 1011, "internal_error");
    });
  };
}

async function run(ws: WebSocket, name: string, deps: VncDeps): Promise<void> {
  let vncPort: number;
  try {
    ({ vncPort } = await deps.resolve(name));
  } catch (err) {
    const code = (err as { code?: string }).code;
    safeClose(ws, (code && CLOSE_CODES[code]) || 1011, code ?? "vnc_failed");
    return;
  }

  // The client may have navigated away while the profile was launching.
  if (ws.readyState !== ws.OPEN) return;

  const tcp: Socket = connect(vncPort, "127.0.0.1");
  let closed = false;
  const teardown = (wsCode = 1000, reason = "closed") => {
    if (closed) return;
    closed = true;
    try { tcp.destroy(); } catch { /* gone */ }
    safeClose(ws, wsCode, reason);
  };

  tcp.on("connect", () => {
    // x11vnc → client: forward every TCP chunk as a binary ws frame.
    tcp.on("data", (chunk) => {
      if (ws.readyState === ws.OPEN) ws.send(chunk, { binary: true });
    });
  });
  tcp.on("error", (err) => teardown(1011, `vnc_upstream: ${err.message}`.slice(0, 120)));
  tcp.on("close", () => teardown(1000, "vnc_upstream_closed"));

  // client → x11vnc: forward every ws message as raw bytes.
  ws.on("message", (data) => {
    if (closed) return;
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    tcp.write(buf);
  });
  ws.on("close", () => teardown());
  ws.on("error", () => teardown(1011, "ws_error"));
}

/** Production wiring: start the profile and hand back its x11vnc port. */
export function defaultVncDeps(): VncDeps {
  return {
    async resolve(name) {
      const pm = getProfileManager();
      let rp;
      try {
        rp = await pm.start(name);
      } catch (err) {
        if (err instanceof ApiError) throw Object.assign(new Error(err.message), { code: err.code });
        throw err;
      }
      const vncPort = rp.browser.vncPort;
      if (!vncPort) {
        throw Object.assign(new Error("profile is running without a viewable display"), {
          code: "viewer_unavailable",
        });
      }
      return { vncPort };
    },
  };
}
