import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => vi.stubEnv("MORROW_API_KEY", "secret"));
afterEach(() => vi.unstubAllEnvs());

const auth = { authorization: "Bearer secret", "content-type": "application/json" };

async function post(body: unknown, headers: Record<string, string> = auth) {
  const { POST } = await import("@/app/api/v1/proxy/check/route");
  return POST(new Request("http://x/api/v1/proxy/check", { method: "POST", headers, body: JSON.stringify(body) }));
}

describe("POST /proxy/check", () => {
  it("401 without a token", async () => {
    const res = await post({ proxy: "http://u:p@h:1" }, { "content-type": "application/json" });
    expect(res.status).toBe(401);
  });

  it("400 when proxy is missing", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_request");
  });

  it("400 when proxy is an empty string", async () => {
    const res = await post({ proxy: "" });
    expect(res.status).toBe(400);
  });

  it("400 (proxy_unreachable) when the proxy can't be resolved", async () => {
    const res = await post({ proxy: "http://u:p@127.0.0.1:1" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("proxy_unreachable");
  }, 20_000);
});
