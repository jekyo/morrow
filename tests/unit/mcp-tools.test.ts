import { describe, it, expect } from "vitest";
import { makeTools, type ToolDeps } from "@/server/mcp/tools";

function fakePage() {
  const calls: string[] = [];
  return {
    calls,
    goto: async (u: string) => { calls.push(`goto:${u}`); },
    title: async () => "Example",
    url: () => "https://example.com/",
    click: async (s: string) => { calls.push(`click:${s}`); },
    fill: async (s: string, t: string) => { calls.push(`fill:${s}:${t}`); },
    type: async (s: string, t: string) => { calls.push(`type:${s}:${t}`); },
    keyboard: { press: async (k: string) => { calls.push(`press:${k}`); } },
    mouse: { wheel: async (x: number, y: number) => { calls.push(`wheel:${x},${y}`); } },
    waitForSelector: async (s: string) => { calls.push(`wait:${s}`); },
    screenshot: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    accessibility: { snapshot: async () => ({ role: "WebArea", name: "Example", children: [] }) },
    content: async () => "<html><body><h1>Example</h1></body></html>",
    evaluate: async () => "Example body text",
  };
}

function deps(): { deps: ToolDeps; page: ReturnType<typeof fakePage>; log: string[] } {
  const page = fakePage();
  const log: string[] = [];
  const d: ToolDeps = {
    listProfiles: async () => [{ name: "a", status: "running" }],
    createProfile: async (name) => { log.push(`create:${name}`); return { name, status: "stopped" }; },
    startProfile: async (name) => { log.push(`start:${name}`); },
    stopProfile: async (name) => { log.push(`stop:${name}`); },
    activePage: async () => page as never,
    scrape: async (_profile, opts, fmt) => ({ url: "https://example.com/", markdown: "# Example" }),
  };
  return { deps: d, page, log };
}

describe("mcp tools", () => {
  it("list_profiles returns profiles", async () => {
    const { deps: d } = deps();
    const tools = makeTools(d);
    const r = await tools.list_profiles.handler({});
    expect(r).toEqual([{ name: "a", status: "running" }]);
  });

  it("navigate goes to url and returns title/url", async () => {
    const { deps: d, page } = deps();
    const tools = makeTools(d);
    const r = await tools.navigate.handler({ profile: "a", url: "https://example.com" });
    expect(page.calls).toContain("goto:https://example.com");
    expect(r).toMatchObject({ title: "Example", url: "https://example.com/" });
  });

  it("click and type act on the page", async () => {
    const { deps: d, page } = deps();
    const tools = makeTools(d);
    await tools.click.handler({ profile: "a", selector: "#btn" });
    await tools.type.handler({ profile: "a", selector: "#in", text: "hi" });
    expect(page.calls).toContain("click:#btn");
    expect(page.calls).toContain("fill:#in:hi");
  });

  it("snapshot returns the accessibility tree", async () => {
    const { deps: d } = deps();
    const tools = makeTools(d);
    const r = await tools.snapshot.handler({ profile: "a" });
    expect(r).toMatchObject({ role: "WebArea", name: "Example" });
  });

  it("scrape delegates and returns markdown", async () => {
    const { deps: d } = deps();
    const tools = makeTools(d);
    const r = await tools.scrape.handler({ profile: "a", format: "markdown" });
    expect(r).toMatchObject({ markdown: "# Example" });
  });

  it("create_profile / start_profile / stop_profile call deps", async () => {
    const { deps: d, log } = deps();
    const tools = makeTools(d);
    await tools.create_profile.handler({ name: "x" });
    await tools.start_profile.handler({ name: "x" });
    await tools.stop_profile.handler({ name: "x" });
    expect(log).toEqual(["create:x", "start:x", "stop:x"]);
  });
});
