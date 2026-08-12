import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { extractToken, isAuthorized } from "@/server/auth";
import type { Config } from "@/server/config";

export type WsRoute = { kind: "playwright" | "viewer"; profileName: string };

export function matchWsRoute(pathname: string): WsRoute | undefined {
  const m = pathname.match(/^\/(playwright|viewer)\/([^/]+)$/);
  if (!m) return undefined;
  try {
    return { kind: m[1] as WsRoute["kind"], profileName: decodeURIComponent(m[2]) };
  } catch {
    return undefined;
  }
}

export type WsHandler = (ws: WebSocket, route: WsRoute, req: IncomingMessage) => void;

/** A path that looks like an attempted (but malformed) Morrow ws route. */
function isMalformedMorrowPath(pathname: string): boolean {
  return /^\/(playwright|viewer)(\/|$)/.test(pathname);
}

/**
 * Returns the node:http 'upgrade' listener. Plan 2 registers the playwright
 * passthrough handler; Plan 4 registers the viewer handler.
 *
 * A single 'upgrade' listener is registered on the shared http.Server (see
 * src/server/index.ts), so anything that isn't a Morrow route — notably
 * Next's own dev-mode HMR websocket at /_next/webpack-hmr — has nowhere else
 * to go. Destroying those sockets kills `npm run dev`'s hot reload. Instead:
 * a path that merely doesn't match a Morrow route is handed to `onUnmatched`
 * (wired to Next's own upgrade handler in production/dev) or, if none is
 * given, left alone entirely. Only a path that looks like an attempted-but-
 * malformed Morrow route (starts with /playwright or /viewer) is rejected.
 */
export function createUpgradeHandler(
  cfg: Config,
  handlers: Partial<Record<WsRoute["kind"], WsHandler>> = {},
  onUnmatched?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void
) {
  const wss = new WebSocketServer({ noServer: true });

  return (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      const url = new URL(req.url ?? "/", "http://internal");
      const route = matchWsRoute(url.pathname);
      if (!route) {
        if (isMalformedMorrowPath(url.pathname)) {
          socket.destroy();
        } else {
          onUnmatched?.(req, socket, head);
        }
        return;
      }
      const token = extractToken(req.headers, url.searchParams);
      if (!isAuthorized(token, cfg.apiKey)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        const handler = handlers[route.kind];
        if (handler) handler(ws, route, req);
        else ws.close(4404, "not_implemented");
      });
    } catch (err) {
      console.error("ws upgrade failed", err);
      socket.destroy();
    }
  };
}
