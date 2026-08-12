import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const enabled = process.env.MORROW_IT === "1";
const KEY = "it-mcp-key";
const PROFILE = "it-mcp";

describe.runIf(enabled)("mcp integration (real camoufox, real MCP client)", () => {
  let dir: string;
  let server: Server;
  let base: string;
  let client: Client;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "morrow-mcp-it-"));
    // Config and the ProfileManager are process-wide singletons cached on
    // globalThis (see src/server/global.ts) so they survive Next's separate
    // module instances. Set the env and clear the cache *before* anything
    // touches config()/getProfileManager(), so this test's singletons are
    // built against the tmp data dir instead of whatever an earlier test left.
    process.env.MORROW_API_KEY = KEY;
    process.env.MORROW_DATA_DIR = dir;
    (globalThis as Record<string, unknown>).__morrow = {};

    // Importing after the env is set (dynamic import) guarantees the module's
    // own top-level singleton reads see the tmp dir too.
    const { mcpHandler } = await import("@/server/mcp/handler");
    server = createServer((req, res) => mcpHandler(req, res));
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;

    client = new Client({ name: "it-client", version: "0" });
    const transport = new StreamableHTTPClientTransport(new URL(base), {
      requestInit: { headers: { authorization: `Bearer ${KEY}` } },
    });
    await client.connect(transport);
  });

  afterAll(async () => {
    try {
      await client?.callTool({ name: "stop_profile", arguments: { name: PROFILE } });
    } catch {
      // best effort — the profile may already be stopped/never started
    }
    await client?.close();
    await new Promise((r) => server?.close(r));
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  /**
   * `Client#callTool`'s declared return type is a static union that also
   * covers the legacy `{ toolResult }` compatibility shape regardless of
   * which `resultSchema` is passed at the call site (the parameter isn't
   * generic — it only affects runtime validation), which trips strict typing
   * on every `.content` access. Passing `CallToolResultSchema` guarantees the
   * runtime shape is the modern `content`-bearing one, so the cast is safe.
   */
  function call(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    return client.callTool({ name, arguments: args }, CallToolResultSchema) as Promise<CallToolResult>;
  }

  /** Tool results come back as `{ content: [{ type: "text", text: "<json>" }] }` — unwrap to the JSON value. */
  function json(result: CallToolResult): unknown {
    const first = result.content[0];
    if (!first || first.type !== "text") throw new Error(`expected text content, got ${JSON.stringify(result.content)}`);
    return JSON.parse(first.text);
  }

  it("create_profile, navigate, snapshot, screenshot, scrape all work through the real MCP client, and the profile stays running across calls", async () => {
    const created = await call("create_profile", { name: PROFILE });
    expect(json(created)).toMatchObject({ name: PROFILE });

    // navigate auto-starts the profile's browser (page-control tools call
    // activePage, which starts if stopped) and drives a *real* network fetch.
    const nav = await call("navigate", { profile: PROFILE, url: "https://example.com" });
    const navResult = json(nav) as { title?: string; url?: string };
    expect(navResult.url).toContain("example.com");
    expect(navResult.title).toBeTruthy();

    // Session persistence: the profile must still be running (same browser,
    // same page) between separate tool calls / separate JSON-RPC requests —
    // that's the whole point of MCP tools acting on Morrow's persistent
    // profiles rather than spinning up a fresh browser per call.
    const listedRunning = await call("list_profiles", {});
    const profiles = json(listedRunning) as Array<{ name: string; status: string }>;
    const mine = profiles.find((p) => p.name === PROFILE);
    expect(mine?.status).toBe("running");

    const snap = await call("snapshot", { profile: PROFILE });
    const snapResult = json(snap) as { url?: string; title?: string; snapshot?: string };
    // Assert on the *real* aria tree example.com produces, not on a constant we
    // control — the snapshot must actually reflect the live page.
    expect(snapResult.title).toContain("Example Domain");
    expect(snapResult.snapshot).toContain('heading "Example Domain"');
    expect(snapResult.snapshot).toContain("[ref=");

    const shot = await call("screenshot", { profile: PROFILE });
    expect(shot.content[0]).toMatchObject({ type: "image", mimeType: "image/png" });
    const imageContent = shot.content[0] as { type: "image"; data: string };
    expect(Buffer.from(imageContent.data, "base64").subarray(0, 4).toString("hex")).toBe("89504e47");

    const scraped = await call("scrape", { profile: PROFILE, format: "markdown" });
    const scrapeResult = json(scraped) as { markdown?: string };
    expect(scrapeResult.markdown).toBeTruthy();

    // Still running before we stop it — persistence held across the whole flow.
    const stillRunning = json(await call("list_profiles", {})) as Array<{
      name: string;
      status: string;
    }>;
    expect(stillRunning.find((p) => p.name === PROFILE)?.status).toBe("running");

    const stopped = await call("stop_profile", { name: PROFILE });
    expect(stopped.isError).not.toBe(true);

    const afterStop = json(await call("list_profiles", {})) as Array<{
      name: string;
      status: string;
    }>;
    expect(afterStop.find((p) => p.name === PROFILE)?.status).not.toBe("running");
  }, 300_000);
});
