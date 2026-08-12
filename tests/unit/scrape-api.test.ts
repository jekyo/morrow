import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.stubEnv("MORROW_API_KEY", "secret"));
afterEach(() => vi.unstubAllEnvs());
const auth = { authorization: "Bearer secret", "content-type": "application/json" };

async function post(path: string, body: unknown, headers: Record<string, string> = auth) {
  const mod = await import(`@/app/api/v1/${path}/route`);
  return mod.POST(new Request(`http://x/api/v1/${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
}

describe("scrape family validation", () => {
  it("401 without token", async () => {
    expect((await post("scrape", { url: "https://x.com" }, { "content-type": "application/json" })).status).toBe(401);
  });
  it("400 when neither url nor html", async () => {
    const res = await post("content", {});
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_request");
  });
  it("400 on bad screenshot type", async () => {
    expect((await post("screenshot", { url: "https://x.com", type: "gif" })).status).toBe(400);
  });
  it("400 on bad scrape format", async () => {
    expect((await post("scrape", { url: "https://x.com", format: "yaml" })).status).toBe(400);
  });
});
