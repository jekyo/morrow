import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "morrow-api-"));
  vi.stubEnv("MORROW_API_KEY", "secret");
  vi.stubEnv("MORROW_DATA_DIR", dir);
  (globalThis as Record<string, unknown>).__morrow = {}; // reset singletons per test
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

const auth = { authorization: "Bearer secret" };

async function POST_profiles(body: unknown) {
  const { POST } = await import("@/app/api/v1/profiles/route");
  return POST(new Request("http://x/api/v1/profiles", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("POST /profiles", () => {
  it("creates a profile", async () => {
    const res = await POST_profiles({ name: "x-marketing", locale: "en-US" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("x-marketing");
    expect(json.status).toBe("stopped");
    expect(json.id).toMatch(/^prof_/);
  });

  it("rejects invalid names", async () => {
    const res = await POST_profiles({ name: "Bad Name!" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_request");
  });

  it("rejects duplicates with profile_exists", async () => {
    await POST_profiles({ name: "a" });
    const res = await POST_profiles({ name: "a" });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("profile_exists");
  });

  it("requires auth", async () => {
    const { POST } = await import("@/app/api/v1/profiles/route");
    const res = await POST(new Request("http://x/api/v1/profiles", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });
});

describe("GET /profiles + /profiles/:name", () => {
  it("lists and gets", async () => {
    await POST_profiles({ name: "a" });
    const { GET } = await import("@/app/api/v1/profiles/route");
    const list = await GET(new Request("http://x/api/v1/profiles", { headers: auth }));
    expect((await list.json()).profiles.map((p: { name: string }) => p.name)).toEqual(["a"]);

    const { GET: GET_ONE } = await import("@/app/api/v1/profiles/[name]/route");
    const one = await GET_ONE(new Request("http://x/api/v1/profiles/a", { headers: auth }), {
      params: Promise.resolve({ name: "a" }),
    });
    expect((await one.json()).name).toBe("a");
    const missing = await GET_ONE(new Request("http://x/api/v1/profiles/zz", { headers: auth }), {
      params: Promise.resolve({ name: "zz" }),
    });
    expect(missing.status).toBe(404);
  });
});

describe("PATCH + DELETE /profiles/:name", () => {
  it("updates config", async () => {
    await POST_profiles({ name: "a" });
    const { PATCH } = await import("@/app/api/v1/profiles/[name]/route");
    const res = await PATCH(
      new Request("http://x/api/v1/profiles/a", {
        method: "PATCH",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ proxy: "http://u:p@h:1" }),
      }),
      { params: Promise.resolve({ name: "a" }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).proxy).toBe("http://u:p@h:1");
  });

  it("deletes a stopped profile", async () => {
    await POST_profiles({ name: "a" });
    const { DELETE } = await import("@/app/api/v1/profiles/[name]/route");
    const res = await DELETE(new Request("http://x/api/v1/profiles/a", { method: "DELETE", headers: auth }), {
      params: Promise.resolve({ name: "a" }),
    });
    expect(res.status).toBe(204);
  });
});
