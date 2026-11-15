import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * One fake browser server per launch, so a test can count launches and assert
 * which one was closed. `wsEndpoint` carries the launch number purely so a
 * failure message names the server rather than a bare boolean.
 */
let launches = 0;
const servers: { id: number; closed: boolean }[] = [];

vi.mock("camoufox-js", () => ({
  launchServer: vi.fn(async () => {
    const rec = { id: ++launches, closed: false };
    servers.push(rec);
    return {
      wsEndpoint: () => `ws://fake/${rec.id}`,
      close: async () => {
        rec.closed = true;
      },
    };
  }),
}));

vi.mock("playwright-core", () => ({
  firefox: {
    connect: vi.fn(async () => ({
      newContext: async () => ({ close: async () => {} }),
      close: async () => {},
    })),
  },
}));

vi.mock("@/server/profiles", () => ({ getProfileManager: () => ({ start: async () => ({}) }) }));

const { ephemeralResolver } = await import("@/server/browser/utility");

/** Acquire and immediately release, which is what a finished scrape does. */
async function scrape() {
  const acquired = await ephemeralResolver().acquire();
  await acquired.release();
}

beforeEach(() => {
  launches = 0;
  servers.length = 0;
  (globalThis as Record<string, unknown>).__morrow = {};
  delete process.env.MORROW_UTILITY_MAX_CONTEXTS;
});

afterEach(() => {
  delete process.env.MORROW_UTILITY_MAX_CONTEXTS;
});

describe("the utility browser is recycled", () => {
  // Closing a context returns what the page allocated, not what the browser's
  // parent process accumulated getting there. Without this the process grows
  // until it is OOM-killed, taking every request in flight with it.
  it("replaces the server once it has handed out its quota", async () => {
    process.env.MORROW_UTILITY_MAX_CONTEXTS = "2";

    await scrape();
    expect(launches).toBe(1);
    expect(servers[0].closed).toBe(false);

    await scrape();
    expect(servers[0].closed).toBe(true);

    await scrape();
    expect(launches).toBe(2);
    expect(servers[1].closed).toBe(false);
  });

  // Retiring a server with work still on it is the outage this prevents,
  // arriving on a schedule instead of at random.
  it("waits for the last context to close before closing the process", async () => {
    process.env.MORROW_UTILITY_MAX_CONTEXTS = "2";

    const held = await ephemeralResolver().acquire();
    await scrape(); // quota reached, but `held` is still open
    expect(servers[0].closed).toBe(false);

    await held.release();
    expect(servers[0].closed).toBe(true);
  });

  // The case that defeated the first attempt at this. A caller holding several
  // fetches in flight never leaves the server idle, so a retirement that waits
  // for `open === 0` before taking the server out of service waits forever and
  // the browser grows until it is killed. Retirement has to happen on the way
  // in: new work goes to a fresh server while the spent one drains.
  it("retires under sustained concurrency, with nothing ever idle", async () => {
    process.env.MORROW_UTILITY_MAX_CONTEXTS = "4";

    // Four always in flight: one is released only after its replacement has
    // been acquired, so the count never reaches zero.
    let held = await ephemeralResolver().acquire();
    const inflight = [
      await ephemeralResolver().acquire(),
      await ephemeralResolver().acquire(),
      await ephemeralResolver().acquire(),
    ];

    for (let i = 0; i < 20; i++) {
      const next = await ephemeralResolver().acquire();
      await held.release();
      held = next;
    }
    await held.release();
    for (const c of inflight) await c.release();

    // 24 contexts at a quota of 4 is several generations, not one.
    expect(launches).toBeGreaterThan(1);
    expect(servers.filter((s) => s.closed).length).toBeGreaterThan(0);
  });

  // A server that has been taken out of service must not be handed to anyone
  // new, or the replacement never gets used and the quota means nothing.
  it("sends work to a fresh server the moment the old one is spent", async () => {
    process.env.MORROW_UTILITY_MAX_CONTEXTS = "1";

    const first = await ephemeralResolver().acquire(); // spends server 1
    const second = await ephemeralResolver().acquire(); // must not be server 1
    expect(launches).toBe(2);

    await first.release();
    expect(servers[0].closed).toBe(true); // drained and closed
    expect(servers[1].closed).toBe(false); // still serving
    await second.release();
  });

  it("does not retire a server because a release arrived twice", async () => {
    process.env.MORROW_UTILITY_MAX_CONTEXTS = "4";

    const acquired = await ephemeralResolver().acquire();
    await acquired.release();
    await acquired.release();
    await acquired.release();

    expect(servers[0].closed).toBe(false);
    expect(launches).toBe(1);
  });

  it("reuses one server below the quota", async () => {
    process.env.MORROW_UTILITY_MAX_CONTEXTS = "100";
    for (let i = 0; i < 5; i++) await scrape();
    expect(launches).toBe(1);
    expect(servers[0].closed).toBe(false);
  });

  it("keeps the old behaviour when recycling is switched off", async () => {
    process.env.MORROW_UTILITY_MAX_CONTEXTS = "0";
    for (let i = 0; i < 300; i++) await scrape();
    expect(launches).toBe(1);
    expect(servers[0].closed).toBe(false);
  });

  it("falls back to the default when the setting is not a number", async () => {
    process.env.MORROW_UTILITY_MAX_CONTEXTS = "lots";
    for (let i = 0; i < 5; i++) await scrape();
    expect(launches).toBe(1);
  });
});
