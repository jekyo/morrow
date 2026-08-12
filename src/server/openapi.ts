import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import pkg from "../../package.json";
import { registerPaths } from "@/server/openapi-paths";

const DESCRIPTION = `Persistent, fingerprint-resistant browser profiles with a browserless-style HTTP API.

Every endpoint except \`/health\` and \`/openapi.json\` requires the API key, either as
\`Authorization: Bearer <key>\` or as a \`?token=<key>\` query parameter (for WebSocket clients).

The Playwright attach endpoint (\`ws://<host>/playwright?profile=<name>&token=<key>\`) is a WebSocket
passthrough and therefore not described here.`;

/** The OpenAPI 3 document for the v1 API. Built from the same zod schemas the routes validate with. */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "The Morrow API key (`MORROW_API_KEY`).",
  });

  registerPaths(registry);

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Morrow",
      version: pkg.version,
      description: DESCRIPTION,
    },
    servers: [{ url: "/api/v1" }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Profiles", description: "Create, inspect and manage persistent browser profiles." },
      { name: "Lifecycle", description: "Start, stop, clone and reset a profile's browser." },
      { name: "Scrape", description: "Browserless-style extraction: content, screenshot, scrape." },
      { name: "Ops", description: "Health, capacity and active sessions." },
    ],
  });
}
