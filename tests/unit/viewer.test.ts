import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ViewerHub, type ViewerPage } from "@/server/viewer";

function fakePage() {
  const calls: string[] = [];
  let shot = 0;
  const page: ViewerPage = {
    async screenshot() { shot++; return Buffer.from([shot]); },
    url: () => "https://x.com/home",
    async goto(url) { calls.push(`goto:${url}`); },
    mouse: {
      move: async (x, y) => { calls.push(`move:${x},${y}`); },
      down: async () => { calls.push("down"); },
      up: async () => { calls.push("up"); },
      wheel: async (dx, dy) => { calls.push(`wheel:${dx},${dy}`); },
    },
    keyboard: {
      type: async (t) => { calls.push(`type:${t}`); },
      press: async (k) => { calls.push(`press:${k}`); },
    },
  };
  return { page, calls, shots: () => shot };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ViewerHub", () => {
  it("streams frames to a subscriber while running", async () => {
    const { page, shots } = fakePage();
    const hub = new ViewerHub(page, { fps: 10 });
    const frames: Buffer[] = [];
    const unsub = hub.subscribe((f) => frames.push(f.data));
    hub.start();
    await vi.advanceTimersByTimeAsync(350); // ~3 frames at 10fps
    expect(shots()).toBeGreaterThanOrEqual(3);
    expect(frames.length).toBeGreaterThanOrEqual(3);
    unsub();
    hub.stop();
  });

  it("stops the loop when the last subscriber leaves", async () => {
    const { page, shots } = fakePage();
    const hub = new ViewerHub(page, { fps: 10 });
    const unsub = hub.subscribe(() => {});
    hub.start();
    await vi.advanceTimersByTimeAsync(150);
    const before = shots();
    unsub();
    await vi.advanceTimersByTimeAsync(300);
    expect(shots()).toBe(before); // no new frames after everyone left
  });

  it("applies input only from the control holder", async () => {
    const { page, calls } = fakePage();
    const hub = new ViewerHub(page, { fps: 10 });
    hub.lock.take("v1");
    hub.input("v1", { type: "mouse", action: "move", x: 10, y: 20 });
    hub.input("v2", { type: "mouse", action: "move", x: 99, y: 99 }); // not holder
    hub.input("v1", { type: "key", action: "type", text: "hello" });
    await vi.advanceTimersByTimeAsync(1); // let the input queue drain
    expect(calls).toEqual(["move:10,20", "type:hello"]);
  });

  it("reports current url with frames", async () => {
    const { page } = fakePage();
    const hub = new ViewerHub(page, { fps: 10 });
    let meta: string | undefined;
    hub.subscribe((f) => { meta = f.url; });
    hub.start();
    await vi.advanceTimersByTimeAsync(150);
    expect(meta).toBe("https://x.com/home");
    hub.stop();
  });

  it("navigates for the control holder, normalizing a bare host to https", async () => {
    const { page, calls } = fakePage();
    const hub = new ViewerHub(page, { fps: 10 });
    hub.lock.take("v1");
    await hub.navigate("v1", "example.com");
    expect(calls).toEqual(["goto:https://example.com/"]);
  });

  it("does nothing when a non-holder tries to navigate", async () => {
    const { page, calls } = fakePage();
    const hub = new ViewerHub(page, { fps: 10 });
    hub.lock.take("v1");
    await hub.navigate("v2", "example.com");
    expect(calls).toEqual([]);
  });

  it("rejects non-http(s) schemes without calling goto", async () => {
    const { page, calls } = fakePage();
    const hub = new ViewerHub(page, { fps: 10 });
    hub.lock.take("v1");
    await hub.navigate("v1", "javascript:alert(1)");
    expect(calls).toEqual([]);
  });

  it("swallows a failed navigation instead of throwing", async () => {
    const { page, calls } = fakePage();
    page.goto = async () => { throw new Error("nav failed"); };
    const hub = new ViewerHub(page, { fps: 10 });
    hub.lock.take("v1");
    await expect(hub.navigate("v1", "example.com")).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("keeps delivering to healthy subscribers when one throws", async () => {
    const { page } = fakePage();
    const hub = new ViewerHub(page, { fps: 10 });
    const healthy: number[] = [];
    hub.subscribe(() => { throw new Error("socket gone"); }); // e.g. ws.send on a closing socket
    hub.subscribe((f) => healthy.push(f.seq));
    hub.start();
    await vi.advanceTimersByTimeAsync(350);
    expect(healthy.length).toBeGreaterThanOrEqual(3);
    hub.stop();
  });
});
