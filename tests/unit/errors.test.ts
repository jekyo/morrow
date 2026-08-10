import { describe, it, expect } from "vitest";
import { ApiError, toErrorBody } from "@/server/errors";

describe("errors", () => {
  it("serializes ApiError with its code and status", () => {
    const e = new ApiError("profile_not_found", "No such profile", 404);
    expect(e.status).toBe(404);
    expect(toErrorBody(e)).toEqual({ error: { code: "profile_not_found", message: "No such profile" } });
  });

  it("wraps unknown errors as internal_error", () => {
    expect(toErrorBody(new Error("boom"))).toEqual({
      error: { code: "internal_error", message: "boom" },
    });
  });
});
