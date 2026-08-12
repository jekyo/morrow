import { describe, it, expect, vi } from "vitest";
import { MorrowClient } from "@/lib/api";

describe("MorrowClient", () => {
  it("attaches bearer token and parses json", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ profiles: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    const c = new MorrowClient("secret", fetchMock as unknown as typeof fetch);
    const r = await c.get("/profiles");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/profiles", expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer secret" }),
    }));
    expect(r).toEqual({ profiles: [] });
  });

  it("throws ApiClientError with the envelope code on failure", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code: "profile_not_found", message: "x" } }), { status: 404, headers: { "content-type": "application/json" } }));
    const c = new MorrowClient("secret", fetchMock as unknown as typeof fetch);
    await expect(c.get("/profiles/zz")).rejects.toMatchObject({ code: "profile_not_found", status: 404 });
  });
});
