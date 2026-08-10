import { describe, it, expect, vi, afterEach } from "vitest";
import { requireAuth } from "@/server/api";

afterEach(() => vi.unstubAllEnvs());

describe("requireAuth", () => {
  it("returns 401 response for missing/wrong token", async () => {
    vi.stubEnv("MORROW_API_KEY", "secret");
    const res = requireAuth(new Request("http://x/api/v1/pressure"));
    expect(res?.status).toBe(401);
    expect(await res!.json()).toEqual({ error: { code: "unauthorized", message: "Invalid API key" } });
  });

  it("returns undefined for correct bearer token", () => {
    vi.stubEnv("MORROW_API_KEY", "secret");
    const res = requireAuth(
      new Request("http://x/api/v1/pressure", { headers: { authorization: "Bearer secret" } })
    );
    expect(res).toBeUndefined();
  });
});
