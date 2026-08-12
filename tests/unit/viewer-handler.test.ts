import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { createUpgradeHandler } from "@/server/ws";
import { viewerHandler, type ViewerDeps } from "@/server/viewer-handler";
import type { Frame } from "@/server/viewer";

let front: Server;
let port: number;
let log: string[];
let sockets: WebSocket[];

const cfg = { apiKey: "k", port: 0, dataDir: "/tmp", maxProfiles: 5, launchTimeoutMs: 1000 };

/** Resolve once `pred` holds, polling the event loop — no fixed-duration sleeps. */
async function until(pred: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error(`condition not met within ${timeoutMs}ms; log=${JSON.stringify(log)}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

function deps(): ViewerDeps {
  return {
    async attach(name) {
      if (name === "missing") {
        const e = new Error("no") as Error & { code?: string };
        e.code = "profile_not_found";
        throw e;
      }
      let holder: string | null = null;
      const subs = new Set<(f: Frame) => void>();
      return {
        profileId: "prof_1",
        lockHolder: () => holder,
        takeControl: (id) => {
          log.push(`take:${id}`);
          if (holder !== null && holder !== id) return false;
          holder = id;
          return true;
        },
        releaseControl: (id) => {
          log.push(`release:${id}`);
          if (holder === id) holder = null;
        },
        input: async (id, msg) => {
          log.push(`input:${id}:${msg.type}:${(msg as { action: string }).action}`);
        },
        subscribe: (fn) => {
          subs.add(fn);
          const t = setInterval(() => fn({ data: Buffer.from([1, 2, 3]), url: "https://x.com", seq: 1 }), 10);
          return () => {
            clearInterval(t);
            subs.delete(fn);
          };
        },
        onDisconnect: (id) => {
          log.push(`disconnect:${id}`);
        },
      };
    },
  };
}

beforeEach(async () => {
  log = [];
  sockets = [];
  front = createServer();
  front.on("upgrade", createUpgradeHandler(cfg, { viewer: viewerHandler(deps()) }));
  await new Promise<void>((r) => front.listen(0, r));
  port = (front.address() as AddressInfo).port;
});

afterEach(async () => {
  // Await every close: a socket still tearing down would push cleanup entries
  // into the *next* test's log.
  await Promise.all(
    sockets.map(
      (ws) =>
        new Promise<void>((resolve) => {
          if (ws.readyState === WebSocket.CLOSED) return resolve();
          ws.on("close", () => resolve());
          ws.close();
        })
    )
  );
  await new Promise((r) => front.close(r));
});

function client(name = "a"): WebSocket {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/viewer/${name}?token=k`);
  sockets.push(ws);
  return ws;
}

describe("viewer handler", () => {
  it("streams frames as binary with json metadata and a lock status", async () => {
    const ws = client();
    const binary: Buffer[] = [];
    const json: Array<{ type: string; [k: string]: unknown }> = [];
    ws.on("message", (data, isBinary) => {
      if (isBinary) binary.push(data as Buffer);
      else json.push(JSON.parse(String(data)));
    });
    await until(() => binary.length > 0 && json.some((m) => m.type === "lock"));

    expect([...binary[0]]).toEqual([1, 2, 3]);
    const lock = json.find((m) => m.type === "lock")!;
    expect(lock.holder).toBeNull();
    expect(String(lock.you)).toMatch(/^viewer_/);
    const meta = json.find((m) => m.type === "frameMeta")!;
    expect(meta).toMatchObject({ url: "https://x.com", seq: 1 });
  });

  it("routes input and control from the client with the socket's viewer id", async () => {
    const ws = client();
    const json: Array<{ type: string; holder?: string | null; you?: string }> = [];
    ws.on("message", (data, isBinary) => {
      if (!isBinary) json.push(JSON.parse(String(data)));
    });
    await new Promise((r) => ws.on("open", r));
    await until(() => json.some((m) => m.type === "lock"));
    const you = json.find((m) => m.type === "lock")!.you!;

    ws.send(JSON.stringify({ type: "takeControl" }));
    ws.send(JSON.stringify({ type: "input", input: { type: "mouse", action: "move", x: 1, y: 2 } }));
    await until(() => log.some((l) => l === `take:${you}`) && log.some((l) => l === `input:${you}:mouse:move`));
    // the lock json echoed back names this viewer as the holder
    await until(() => json.some((m) => m.type === "lock" && m.holder === you));

    ws.send(JSON.stringify({ type: "releaseControl" }));
    await until(() => log.includes(`release:${you}`));
    await until(() => json.filter((m) => m.type === "lock").at(-1)!.holder === null);
  });

  it("ignores malformed client messages", async () => {
    const ws = client();
    await new Promise((r) => ws.on("open", r));
    ws.send("not json at all");
    ws.send(JSON.stringify({ type: "input" })); // no input payload
    ws.send(JSON.stringify({ type: "takeControl" }));
    await until(() => log.some((l) => l.startsWith("take:")));
    expect(log.some((l) => l.startsWith("input:"))).toBe(false);
  });

  it("releases control and unsubscribes when the socket closes", async () => {
    const ws = client();
    await new Promise((r) => ws.on("open", r));
    ws.send(JSON.stringify({ type: "takeControl" }));
    await until(() => log.some((l) => l.startsWith("take:")));
    ws.close();
    await until(() => log.some((l) => l.startsWith("disconnect:")));
    expect(log.some((l) => l.startsWith("release:"))).toBe(true);
    // cleanup must be idempotent — close and error must not double-report
    expect(log.filter((l) => l.startsWith("disconnect:"))).toHaveLength(1);
  });

  it("closes 4404 for an unknown profile", async () => {
    const ws = client("missing");
    const code = await new Promise<number>((r) => ws.on("close", (c) => r(c)));
    expect(code).toBe(4404);
    expect(log).toEqual([]);
  });
});
