import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * One fake browser server per launch, so a test can count launches and assert
 * which one was closed. `wsEndpoint` carries the launch number purely so a
 * failure message names the server rather than a bare boolean.
 */
let launches = 0;
const servers: { id: number; closed: boolean }[] = [];
/**
 * When set, `context.close()` returns a promise that never settles. This is
 * the renderer-has-crashed case, and it is the one the old cleanup could not
 * survive: `.catch()` handles a rejection, nothing handles a hang.
 */
let hangContextClose = false;

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
      newContext: async () => ({
        close: () => (hangContextClose ? new Promise<void>(() => {}) : Promise.resolve()),
      }),
      close: async () => {},
    })),
  },
}));

vi.mock("@/server/profiles", () => ({ getProfileManager: () => ({ start: async () => ({}) }) }));

const { ephemeralResolver, utilityStats } = await import("@/server/browser/utility");

/** Acquire and immediately release, which is what a finished scrape does. */
async function scrape() {
  const acquired = await ephemeralResolver().acquire();
  await acquired.release();
}

beforeEach(() => {
  launches = 0;
  servers.length = 0;
  hangContextClose = false;
  (globalThis as Record<string, unknown>).__morrow = {};
  delete process.env.MORROW_UTILITY_MAX_CONTEXTS;
});

afterEach(() => {
  delete process.env.MORROW_UTILITY_MAX_CONTEXTS;
  vi.useRealTimers();
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

/**
 * The browser was OOM-killed roughly every four hours with recycling already
 * in place, which means a retired process was sometimes not dying. Every test
 * here is about that: the ways a close can fail to happen, and what must
 * happen anyway.
 */
describe("a retired browser is reaped even when cleanup misbehaves", () => {
  // The ordering fix. Releasing the last context on a retired server closes
  // the process, and the process takes the context with it — so the context's
  // own close is never awaited and cannot hang in front of the reaping.
  it("closes a drained server without waiting for the context to close", async () => {
    process.env.MORROW_UTILITY_MAX_CONTEXTS = "1";
    hangContextClose = true;

    const held = await ephemeralResolver().acquire(); // spends and retires server 1
    expect(servers[0].closed).toBe(false);

    // Would never resolve under the old order, which closed the context first.
    await held.release();
    expect(servers[0].closed).toBe(true);
  });

  // A live server keeps its contexts closed politely, and a context that will
  // not close must not stop the caller — or the slot it holds is never
  // returned and the server never drains.
  it("gives up on a context that will not close, and still releases", async () => {
    vi.useFakeTimers();
    hangContextClose = true;

    // No quota reached, so this server stays in service and the polite close
    // is actually attempted.
    const held = await ephemeralResolver().acquire();
    let released = false;
    const releasing = held.release().then(() => {
      released = true;
    });

    await vi.advanceTimersByTimeAsync(9_000);
    expect(released).toBe(false); // still giving it a chance

    await vi.advanceTimersByTimeAsync(2_000);
    await releasing;
    expect(released).toBe(true);
  });

  // The backstop. A context whose release never arrives at all would
  // otherwise keep a retired process, and every megabyte it grew, alive for
  // the lifetime of the pod.
  it("closes a retired server that never drains, once its grace period is up", async () => {
    vi.useFakeTimers();
    process.env.MORROW_UTILITY_MAX_CONTEXTS = "1";

    await ephemeralResolver().acquire(); // spent, retired, and never released
    expect(servers[0].closed).toBe(false);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(servers[0].closed).toBe(false); // not yet; draining is normal

    await vi.advanceTimersByTimeAsync(31_000);
    expect(servers[0].closed).toBe(true);
  });

  // A server that drained normally must not be closed a second time when its
  // grace period comes round.
  it("does not close a server twice", async () => {
    vi.useFakeTimers();
    process.env.MORROW_UTILITY_MAX_CONTEXTS = "1";

    const held = await ephemeralResolver().acquire();
    await held.release();
    expect(servers[0].closed).toBe(true);

    let closedAgain = false;
    servers[0].closed = false; // so a second close would be visible
    const watch = setInterval(() => {
      if (servers[0].closed) closedAgain = true;
    }, 1_000);
    await vi.advanceTimersByTimeAsync(120_000);
    clearInterval(watch);
    expect(closedAgain).toBe(false);
  });
});

/**
 * Morrow reported Node's RSS, which is a few hundred megabytes and never what
 * the kernel killed. The browsers are the rest of the container, and they were
 * invisible — so every OOM arrived without warning.
 */
describe("the browsers are visible in metrics", () => {
  it("counts a browser while it is live and stops counting it once closed", async () => {
    process.env.MORROW_UTILITY_MAX_CONTEXTS = "1";
    const before = utilityStats().browsers;

    const held = await ephemeralResolver().acquire();
    const during = utilityStats();
    expect(during.browsers).toBe(before + 1);
    expect(during.openContexts).toBeGreaterThanOrEqual(1);
    expect(during.retiring).toBeGreaterThanOrEqual(1); // quota of one, so already spent

    await held.release();
    expect(utilityStats().browsers).toBe(before);
  });

  it("reports the quota it is recycling against", async () => {
    process.env.MORROW_UTILITY_MAX_CONTEXTS = "75";
    expect(utilityStats().maxContexts).toBe(75);
  });
});
