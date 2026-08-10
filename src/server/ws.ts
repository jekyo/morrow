import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { extractToken, isAuthorized } from "@/server/auth";
import type { Config } from "@/server/config";

export type WsRoute = { kind: "playwright" | "viewer"; profileName: string };

export function matchWsRoute(pathname: string): WsRoute | undefined {
  const m = pathname.match(/^\/(playwright|viewer)\/([^/]+)$/);
  if (!m) return undefined;
  return { kind: m[1] as WsRoute["kind"], profileName: decodeURIComponent(m[2]) };
}

export type WsHandler = (ws: WebSocket, route: WsRoute, req: IncomingMessage) => void;

/**
 * Returns the node:http 'upgrade' listener. Plan 2 registers the playwright
 * passthrough handler; Plan 4 registers the viewer handler. Until then any
 * authorized upgrade is closed with 4404.
 */
export function createUpgradeHandler(cfg: Config, handlers: Partial<Record<WsRoute["kind"], WsHandler>> = {}) {
  const wss = new WebSocketServer({ noServer: true });

  return (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://internal");
    const route = matchWsRoute(url.pathname);
    if (!route) {
      socket.destroy();
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
  };
}
