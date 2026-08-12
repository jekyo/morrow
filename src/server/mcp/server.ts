import type { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import pkg from "../../../package.json";
import { config } from "@/server/config";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/errors";
import { getProfileManager } from "@/server/profiles";
import { runScrape } from "@/server/scrape";
import { profileJson } from "@/server/serialize";
import { makeTools, type ToolDeps, type ToolPage } from "@/server/mcp/tools";

/**
 * The tool map as the registration loop sees it — `makeTools` returns precise
 * per-tool arg types, which don't survive `Object.entries`. Registration is
 * uniform, so we widen once here instead of threading generics through.
 */
interface RegisterableTool {
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/** Tools returning binary image content instead of JSON text. */
const IMAGE_TOOLS = new Set(["screenshot"]);

function toolResult(name: string, result: unknown): CallToolResult {
  if (IMAGE_TOOLS.has(name)) {
    const { image } = result as { image: string };
    return { content: [{ type: "image", data: image, mimeType: "image/png" }] };
  }
  // Handlers that only act (start/stop/click/...) resolve undefined — JSON.stringify
  // would give `undefined`, and MCP text content must be a string.
  return { content: [{ type: "text", text: JSON.stringify(result ?? { ok: true }) }] };
}

/** An MCP server exposing every Morrow tool. Cheap to build — one per request in stateless mode. */
export function buildMcpServer(deps: ToolDeps): McpServer {
  const server = new McpServer(
    { name: "morrow", version: pkg.version },
    { capabilities: { tools: {} } }
  );

  const tools = makeTools(deps) as unknown as Record<string, RegisterableTool>;
  for (const [name, tool] of Object.entries(tools)) {
    server.registerTool(
      name,
      { description: tool.description, inputSchema: tool.inputSchema.shape },
      async (args: unknown) => toolResult(name, await tool.handler((args ?? {}) as Record<string, unknown>))
    );
  }

  return server;
}

/**
 * playwright-core 1.60 dropped the legacy `page.accessibility.snapshot()` API
 * in favor of `page.ariaSnapshot()` (a YAML aria tree) — confirmed at runtime
 * against a real Camoufox page, not just the type defs. `ToolPage` still
 * speaks the older `accessibility.snapshot()` shape because it's the
 * agent-friendly, easily-testable surface (see `tests/unit/mcp-tools.test.ts`'s
 * fake page), so shim it here at the real-Playwright boundary. Mutates the
 * live `Page` instance in place rather than spreading it into a new object:
 * Playwright's `Page` relies on private class fields that only resolve when
 * `this` is the original instance.
 */
function withAccessibilityShim(page: ToolPage): ToolPage {
  const p = page as ToolPage & {
    accessibility?: { snapshot(): Promise<unknown> };
    ariaSnapshot?: (options?: { mode?: "ai" | "default" }) => Promise<string>;
  };
  if (!p.accessibility && typeof p.ariaSnapshot === "function") {
    p.accessibility = {
      snapshot: async () => ({
        role: "WebArea",
        name: await page.title(),
        yaml: await p.ariaSnapshot!({ mode: "ai" }),
      }),
    };
  }
  return page;
}

/** Wires the tools to the real ProfileManager / db / scrape code the REST API uses. */
export function defaultToolDeps(): ToolDeps {
  const db = () => getDb(config().dataDir);

  const activePage = async (profile: string): Promise<ToolPage> => {
    const pm = getProfileManager();
    await pm.start(profile); // idempotent — page tools auto-start a stopped profile
    return withAccessibilityShim((await pm.activePage(profile)) as unknown as ToolPage);
  };

  return {
    listProfiles: async () => {
      const pm = getProfileManager();
      return db()
        .listProfiles()
        .map((p) => profileJson(p, pm.isRunning(p.name)));
    },

    createProfile: async (name, opts) => {
      const d = db();
      if (d.getProfileByName(name)) throw new ApiError("profile_exists", `Profile ${name} already exists`, 409);
      const p = d.createProfile({ name, proxy: opts?.proxy, locale: opts?.locale, timezone: opts?.timezone });
      d.recordEvent(p.id, "profile.created");
      return profileJson(p, false);
    },

    startProfile: async (name) => {
      await getProfileManager().start(name);
    },

    stopProfile: async (name) => {
      await getProfileManager().stop(name);
    },

    activePage,

    scrape: async (profile, opts, fmt) => {
      let target = opts;
      if (!target.url && target.html === undefined) {
        // "Scrape the current page": reload the page's own URL inside the same
        // (authenticated) context, or fall back to its DOM when there is no URL.
        const page = await activePage(profile);
        const current = page.url();
        target = current && current !== "about:blank" ? { url: current } : { html: await page.content() };
      }
      // Spread widens scrape's closed interface into the open-ended shape the
      // tool layer declares (it passes results straight through to JSON).
      return { ...(await runScrape(profile, target, { format: fmt.format ?? "markdown" })) };
    },
  };
}
