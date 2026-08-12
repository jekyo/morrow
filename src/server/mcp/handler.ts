import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { extractToken, isAuthorized } from "@/server/auth";
import { loadConfig } from "@/server/config";
import { buildMcpServer, defaultToolDeps } from "@/server/mcp/server";

const MAX_BODY_BYTES = 4 * 1024 * 1024;

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

/** Same rule as the REST `requireAuth`, against a raw Node request. */
function authorized(req: IncomingMessage): boolean {
  const { apiKey } = loadConfig();
  const url = new URL(req.url ?? "/", "http://localhost");
  return isAuthorized(extractToken(req.headers, url.searchParams), apiKey);
}

/** The custom server hasn't parsed the body, so read it here and hand it to the transport. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new Error("body too large");
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.length ? JSON.parse(raw) : undefined;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!authorized(req)) {
    json(res, 401, { error: { code: "unauthorized", message: "Invalid API key" } });
    return;
  }

  if (req.method !== "POST") {
    // Stateless mode: no session to resume and no server-initiated SSE stream.
    json(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }, { allow: "POST" });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    json(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
    return;
  }

  // Stateless: a fresh server+transport per request, torn down with the response.
  // Morrow's persistence story is the *browser* profile, not an MCP session.
  const server = buildMcpServer(defaultToolDeps());
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

/** Node request handler for `/mcp` — MCP over streamable HTTP, API-key gated. */
export function mcpHandler(req: IncomingMessage, res: ServerResponse): void {
  void handle(req, res).catch((err) => {
    console.error("mcp handler error", err);
    if (!res.headersSent) {
      json(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    } else {
      res.end();
    }
  });
}
