import { z } from "zod";
import { extendZodWithOpenApi, type OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  createProfileSchema,
  updateProfileSchema,
  pageOptionsSchema,
  screenshotSchema,
  scrapeSchema,
  profileName,
} from "@/server/validation";

extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// Response shapes (mirrors of `serialize.ts` / the route handlers' JSON)
// ---------------------------------------------------------------------------

const Viewport = z.object({ width: z.number().int(), height: z.number().int() });

const Profile = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(["stopped", "starting", "running", "stopping", "error"]),
    proxy: z.string().nullable(),
    locale: z.string().nullable(),
    timezone: z.string().nullable(),
    viewport: Viewport.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Profile");

const Session = z
  .object({
    id: z.string(),
    profileId: z.string(),
    profileName: z.string(),
    kind: z.enum(["playwright", "viewer", "mcp", "scrape"]),
    connectedAt: z.string(),
    disconnectedAt: z.string().nullable(),
  })
  .openapi("Session");

const Event = z
  .object({
    id: z.number().int(),
    profileId: z.string().nullable(),
    type: z.string(),
    data: z.unknown().optional(),
    createdAt: z.string(),
  })
  .openapi("Event");

const Article = z.object({
  title: z.string().nullable(),
  byline: z.string().nullable(),
  excerpt: z.string().nullable(),
  content: z.string().nullable().describe("Readability-cleaned HTML"),
  text: z.string().nullable(),
  markdown: z.string(),
});

const ScrapeResult = z
  .object({
    url: z.string(),
    markdown: z.string().optional(),
    text: z.string().nullable().optional(),
    article: Article.optional(),
    elements: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi("ScrapeResult");

const ErrorBody = z
  .object({ error: z.object({ code: z.string(), message: z.string() }) })
  .openapi("Error");

// NOTE: zod 4 copies prototype methods onto instances at construction, so `.openapi()` only exists
// on schemas built *after* extendZodWithOpenApi ran. Schemas imported from `validation.ts` were built
// at its import time — pass them through untouched (the generator reads them fine) and use plain zod
// (`.describe()`) for annotations on them.
const NameParams = z.object({ name: profileName.describe("Profile name") });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const json = (schema: z.ZodType) => ({ "application/json": { schema } });
const ok = (description: string, schema: z.ZodType) => ({ description, content: json(schema) });
const fail = (description: string) => ({ description, content: json(ErrorBody) });
const body = (schema: z.ZodType) => ({ body: { required: true, content: json(schema) } });

const AUTH = { 401: fail("Missing or invalid API key") };
const NOT_FOUND = { 404: fail("No such profile") };
const BAD_REQUEST = { 400: fail("Invalid request body") };
const CONFLICT = { 409: fail("Profile is running, busy, or the name is taken") };

const binary = (mime: string) => ({ [mime]: { schema: z.string().openapi({ format: "binary" }) } });

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export function registerPaths(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: "get",
    path: "/health",
    tags: ["Ops"],
    summary: "Liveness probe",
    security: [],
    responses: { 200: ok("Service is up", z.object({ ok: z.boolean(), version: z.string() })) },
  });

  registry.registerPath({
    method: "get",
    path: "/openapi.json",
    tags: ["Ops"],
    summary: "This document",
    security: [],
    responses: { 200: ok("OpenAPI 3 document", z.object({}).passthrough()) },
  });

  registry.registerPath({
    method: "get",
    path: "/pressure",
    tags: ["Ops"],
    summary: "Capacity and load",
    responses: {
      200: ok(
        "Current pressure",
        z.object({
          runningProfiles: z.number().int(),
          maxProfiles: z.number().int(),
          memory: z.number().int().describe("Resident set size in bytes"),
          queued: z.number().int(),
        })
      ),
      ...AUTH,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/sessions",
    tags: ["Ops"],
    summary: "List active sessions",
    responses: { 200: ok("Active sessions", z.object({ sessions: z.array(Session) })), ...AUTH },
  });

  registry.registerPath({
    method: "get",
    path: "/profiles",
    tags: ["Profiles"],
    summary: "List profiles",
    responses: { 200: ok("All profiles", z.object({ profiles: z.array(Profile) })), ...AUTH },
  });

  registry.registerPath({
    method: "post",
    path: "/profiles",
    tags: ["Profiles"],
    summary: "Create a profile",
    request: body(createProfileSchema),
    responses: { 201: ok("Created", Profile), ...BAD_REQUEST, ...AUTH, ...CONFLICT },
  });

  registry.registerPath({
    method: "get",
    path: "/profiles/{name}",
    tags: ["Profiles"],
    summary: "Get a profile",
    request: { params: NameParams },
    responses: { 200: ok("The profile", Profile), ...AUTH, ...NOT_FOUND },
  });

  registry.registerPath({
    method: "patch",
    path: "/profiles/{name}",
    tags: ["Profiles"],
    summary: "Update a profile",
    request: { params: NameParams, ...body(updateProfileSchema) },
    responses: { 200: ok("The updated profile", Profile), ...BAD_REQUEST, ...AUTH, ...NOT_FOUND },
  });

  registry.registerPath({
    method: "delete",
    path: "/profiles/{name}",
    tags: ["Profiles"],
    summary: "Delete a profile and its browser data",
    request: { params: NameParams },
    responses: { 204: { description: "Deleted" }, ...AUTH, ...NOT_FOUND, ...CONFLICT },
  });

  registry.registerPath({
    method: "get",
    path: "/profiles/{name}/events",
    tags: ["Profiles"],
    summary: "Recent profile events",
    request: {
      params: NameParams,
      query: z.object({
        limit: z.coerce.number().int().min(1).max(1000).optional().openapi({ description: "Default 200" }),
      }),
    },
    responses: { 200: ok("Events, oldest first", z.object({ events: z.array(Event) })), ...AUTH, ...NOT_FOUND },
  });

  for (const [action, summary] of [
    ["start", "Start the profile's browser"],
    ["stop", "Stop the profile's browser"],
    ["reset", "Wipe the profile's browser data (cookies, storage, cache)"],
  ] as const) {
    registry.registerPath({
      method: "post",
      path: `/profiles/{name}/${action}`,
      tags: ["Lifecycle"],
      summary,
      request: { params: NameParams },
      responses: { 200: ok("The profile", Profile), ...AUTH, ...NOT_FOUND, ...CONFLICT },
    });
  }

  registry.registerPath({
    method: "post",
    path: "/profiles/{name}/clone",
    tags: ["Lifecycle"],
    summary: "Copy a stopped profile, browser data included",
    request: { params: NameParams, ...body(createProfileSchema.pick({ name: true })) },
    responses: { 201: ok("The clone", Profile), ...BAD_REQUEST, ...AUTH, ...NOT_FOUND, ...CONFLICT },
  });

  registry.registerPath({
    method: "post",
    path: "/content",
    tags: ["Scrape"],
    summary: "Fully rendered HTML of a page",
    request: body(pageOptionsSchema),
    responses: {
      200: { description: "Page HTML", content: { "text/html": { schema: z.string() } } },
      ...BAD_REQUEST,
      ...AUTH,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/screenshot",
    tags: ["Scrape"],
    summary: "Screenshot a page or a single element",
    request: body(screenshotSchema),
    responses: {
      200: { description: "Image bytes", content: { ...binary("image/png"), ...binary("image/jpeg") } },
      ...BAD_REQUEST,
      ...AUTH,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/scrape",
    tags: ["Scrape"],
    summary: "Extract markdown, plain text, a readability article and/or selector matches",
    request: body(scrapeSchema),
    responses: { 200: ok("Extraction result", ScrapeResult), ...BAD_REQUEST, ...AUTH },
  });
}
