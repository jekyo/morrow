import { describe, it, expect, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { createUpgradeHandler, matchWsRoute } from "@/server/ws";

const cfg = { apiKey: "k", port: 0, dataDir: "/tmp", maxProfiles: 5, launchTimeoutMs: 1000 };

function fakeSocket() {
  return { destroy: vi.fn(), write: vi.fn() } as unknown as Duplex & { destroy: ReturnType<typeof vi.fn> };
}

function fakeReq(url: string): IncomingMessage {
  return { url, headers: {} } as unknown as IncomingMessage;
}

describe("matchWsRoute", () => {
  it("matches playwright route", () =>
    expect(matchWsRoute("/playwright/x-marketing")).toEqual({
      kind: "playwright",
      profileName: "x-marketing",
    }));
  it("matches viewer route", () =>
    expect(matchWsRoute("/viewer/my-profile")).toEqual({ kind: "viewer", profileName: "my-profile" }));
  it("decodes URL-encoded names", () =>
    expect(matchWsRoute("/viewer/x%20marketing")).toEqual({ kind: "viewer", profileName: "x marketing" }));
  it("rejects other paths", () => {
    expect(matchWsRoute("/other/x")).toBeUndefined();
    expect(matchWsRoute("/playwright/")).toBeUndefined();
    expect(matchWsRoute("/playwright/a/b")).toBeUndefined();
  });
  it("returns undefined on malformed percent-encoding", () => {
    expect(matchWsRoute("/viewer/%zz")).toBeUndefined();
  });
});

describe("createUpgradeHandler — non-morrow upgrades", () => {
  it("does not destroy the socket for an unmatched path (e.g. Next's dev HMR websocket)", () => {
    const handler = createUpgradeHandler(cfg, {});
    const socket = fakeSocket();
    handler(fakeReq("/_next/webpack-hmr"), socket, Buffer.alloc(0));
    expect(socket.destroy).not.toHaveBeenCalled();
  });

  it("hands unmatched paths to the provided fallback instead of destroying them", () => {
    const fallback = vi.fn();
    const handler = createUpgradeHandler(cfg, {}, fallback);
    const socket = fakeSocket();
    const req = fakeReq("/_next/webpack-hmr");
    const head = Buffer.alloc(0);
    handler(req, socket, head);
    expect(fallback).toHaveBeenCalledWith(req, socket, head);
    expect(socket.destroy).not.toHaveBeenCalled();
  });

  it("still destroys the socket for a malformed morrow route", () => {
    const handler = createUpgradeHandler(cfg, {});
    const socket = fakeSocket();
    handler(fakeReq("/playwright/"), socket, Buffer.alloc(0));
    expect(socket.destroy).toHaveBeenCalled();
  });
});
