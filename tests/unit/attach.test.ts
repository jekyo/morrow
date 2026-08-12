import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { createUpgradeHandler } from "@/server/ws";
import { playwrightAttachHandler, type AttachDeps } from "@/server/attach";

let upstreamHttp: Server;
let upstreamWss: WebSocketServer;
let upstreamUrl: string;
let front: Server;
let frontPort: number;
let events: string[];

const cfg = { apiKey: "k", port: 0, dataDir: "/tmp", maxProfiles: 5, launchTimeoutMs: 1000 };

function deps(overrides?: Partial<AttachDeps>): AttachDeps {
  return {
    ensureStarted: async (name) => {
      if (name === "missing") { const e = new Error("nope") as Error & { code?: string }; e.code = "profile_not_found"; throw e; }
      return { wsEndpoint: upstreamUrl, profileId: "prof_1" };
    },
    onConnect: () => { events.push("connect"); return "sess_1"; },
    onDisconnect: () => { events.push("disconnect"); },
    ...overrides,
  };
}

beforeEach(async () => {
  events = [];
  upstreamHttp = createServer();
  upstreamWss = new WebSocketServer({ server: upstreamHttp });
  upstreamWss.on("connection", (ws) => {
    ws.on("message", (data, isBinary) => ws.send(data, { binary: isBinary })); // echo
  });
  await new Promise<void>((r) => upstreamHttp.listen(0, r));
  upstreamUrl = `ws://127.0.0.1:${(upstreamHttp.address() as AddressInfo).port}`;

  front = createServer();
  front.on("upgrade", createUpgradeHandler(cfg, { playwright: playwrightAttachHandler(deps()) }));
  await new Promise<void>((r) => front.listen(0, r));
  frontPort = (front.address() as AddressInfo).port;
});

afterEach(async () => {
  upstreamWss.close();
  await new Promise((r) => upstreamHttp.close(r));
  await new Promise((r) => front.close(r));
});

function client(path: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${frontPort}${path}?token=k`);
}

describe("playwright attach passthrough", () => {
  it("pipes text and binary frames both ways", async () => {
    const ws = client("/playwright/a");
    await new Promise((r) => ws.on("open", r));
    const got: Array<{ data: Buffer; isBinary: boolean }> = [];
    ws.on("message", (data, isBinary) => got.push({ data: data as Buffer, isBinary }));
    ws.send("hello");
    ws.send(Buffer.from([1, 2, 3]), { binary: true });
    await new Promise((r) => setTimeout(r, 200));
    expect(got).toHaveLength(2);
    expect(got[0].data.toString()).toBe("hello");
    expect(got[0].isBinary).toBe(false);
    expect(got[1].isBinary).toBe(true);
    expect([...got[1].data]).toEqual([1, 2, 3]);
    ws.close();
  });

  it("buffers client frames sent before upstream opens", async () => {
    const slow = deps({
      ensureStarted: async () => {
        await new Promise((r) => setTimeout(r, 150));
        return { wsEndpoint: upstreamUrl, profileId: "prof_1" };
      },
    });
    front.removeAllListeners("upgrade");
    front.on("upgrade", createUpgradeHandler(cfg, { playwright: playwrightAttachHandler(slow) }));
    const ws = client("/playwright/a");
    await new Promise((r) => ws.on("open", r));
    ws.send("early"); // upstream not connected yet
    const first = await new Promise<string>((r) => ws.once("message", (d) => r(String(d))));
    expect(first).toBe("early");
    ws.close();
  });

  it("closes 1009 when a client floods the pre-start buffer", async () => {
    const slow = deps({
      ensureStarted: async () => {
        await new Promise((r) => setTimeout(r, 3000));
        return { wsEndpoint: upstreamUrl, profileId: "prof_1" };
      },
    });
    front.removeAllListeners("upgrade");
    front.on("upgrade", createUpgradeHandler(cfg, { playwright: playwrightAttachHandler(slow) }));
    const ws = client("/playwright/a");
    await new Promise((r) => ws.on("open", r));
    const chunk = Buffer.alloc(4 * 1024 * 1024);
    for (let i = 0; i < 12; i++) ws.send(chunk, { binary: true }); // 48MB > 32MB cap
    const code = await new Promise<number>((r) => ws.on("close", (c) => r(c)));
    expect(code).toBe(1009);
    expect(events).toEqual([]); // never became a session
  }, 15000);

  it("closes 4404 when the profile does not exist", async () => {
    const ws = client("/playwright/missing");
    const code = await new Promise<number>((r) => ws.on("close", (c) => r(c)));
    expect(code).toBe(4404);
    expect(events).toEqual([]); // no session for failed attach
  });

  it("records session connect/disconnect", async () => {
    const ws = client("/playwright/a");
    await new Promise((r) => ws.on("open", r));
    ws.send("x");
    await new Promise((r) => ws.once("message", r));
    expect(events).toEqual(["connect"]);
    ws.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(events).toEqual(["connect", "disconnect"]);
  });

  it("closes the client when upstream dies", async () => {
    const ws = client("/playwright/a");
    await new Promise((r) => ws.on("open", r));
    ws.send("x");
    await new Promise((r) => ws.once("message", r));
    upstreamWss.clients.forEach((c) => c.terminate());
    const code = await new Promise<number>((r) => ws.on("close", (c) => r(c)));
    expect(code).toBeGreaterThanOrEqual(1000);
  });
});
