import { describe, it, expect } from "vitest";
import { buildOpenApiDocument } from "@/server/openapi";

describe("buildOpenApiDocument", () => {
  it("is a valid-shaped openapi 3 doc covering the core endpoints", () => {
    const doc = buildOpenApiDocument();
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe("Morrow");
    expect(doc.info.version).toBeTruthy();
    const paths = Object.keys(doc.paths ?? {});
    for (const p of ["/profiles", "/profiles/{name}", "/profiles/{name}/start", "/scrape", "/screenshot", "/content", "/sessions"]) {
      expect(paths).toContain(p);
    }
    // bearer security registered
    expect(doc.components?.securitySchemes?.bearerAuth).toBeTruthy();
  });

  it("covers the remaining lifecycle and ops endpoints", () => {
    const paths = Object.keys(buildOpenApiDocument().paths ?? {});
    for (const p of ["/profiles/{name}/stop", "/profiles/{name}/clone", "/profiles/{name}/reset", "/profiles/{name}/events", "/health", "/pressure"]) {
      expect(paths).toContain(p);
    }
  });

  it("declares the operations each path actually serves", () => {
    const doc = buildOpenApiDocument();
    expect(Object.keys(doc.paths?.["/profiles"] ?? {}).sort()).toEqual(["get", "post"]);
    expect(Object.keys(doc.paths?.["/profiles/{name}"] ?? {}).sort()).toEqual(["delete", "get", "patch"]);
    expect(Object.keys(doc.paths?.["/scrape"] ?? {})).toEqual(["post"]);
  });

  it("serves the api under /api/v1 and requires bearer auth by default", () => {
    const doc = buildOpenApiDocument();
    expect(doc.servers?.[0]?.url).toContain("/api/v1");
    expect(doc.security).toContainEqual({ bearerAuth: [] });
  });
});
