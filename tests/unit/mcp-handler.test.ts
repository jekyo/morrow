import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mcpHandler } from "@/server/mcp/handler";

const KEY = "test-key";

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.MORROW_API_KEY = KEY;
  server = createServer((req, res) => mcpHandler(req, res));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

async function rpc(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(base, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  },
};

describe("mcp handler", () => {
  it("rejects requests without an api key", async () => {
    const res = await rpc(INITIALIZE);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("rejects a wrong api key", async () => {
    const res = await rpc(INITIALIZE, { authorization: "Bearer nope" });
    expect(res.status).toBe(401);
  });

  it("accepts the key as a ?token= query param", async () => {
    const res = await fetch(`${base}?token=${KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify(INITIALIZE),
    });
    expect(res.status).toBe(200);
  });

  it("answers GET with 405 (stateless — no server-initiated stream)", async () => {
    const res = await fetch(base, { headers: { authorization: `Bearer ${KEY}` } });
    expect(res.status).toBe(405);
  });

  it("lists the 13 tools over a real MCP client session", async () => {
    const client = new Client({ name: "test", version: "0" });
    const transport = new StreamableHTTPClientTransport(new URL(base), {
      requestInit: { headers: { authorization: `Bearer ${KEY}` } },
    });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(
        [
          "click",
          "create_profile",
          "list_profiles",
          "navigate",
          "press_key",
          "scrape",
          "screenshot",
          "scroll",
          "snapshot",
          "start_profile",
          "stop_profile",
          "type",
          "wait_for",
        ].sort()
      );
      const navigate = tools.find((t) => t.name === "navigate")!;
      expect(navigate.inputSchema).toMatchObject({
        type: "object",
        properties: { profile: { type: "string" }, url: { type: "string" } },
      });
    } finally {
      await client.close();
    }
  });
});
