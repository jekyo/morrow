import { firefox } from "playwright-core";
import { launchServer } from "camoufox-js";
import type { AcquiredContext, ContextResolver } from "@/server/browser/pagerunner";
import { getProfileManager } from "@/server/profiles";
import { globalSingletonAsync, dropGlobalSingleton } from "@/server/global";

/** Runs inside a profile's persistent context — authenticated scraping. Never closes it. */
export function profileResolver(name: string): ContextResolver {
  return {
    async acquire(): Promise<AcquiredContext> {
      const rp = await getProfileManager().start(name);
      return { context: rp.browser.context, release: async () => {} };
    },
  };
}

/** Ephemeral: a throwaway context on a shared lazily-started utility browser server. */
export function ephemeralResolver(): ContextResolver {
  return {
    async acquire(): Promise<AcquiredContext> {
      const server = await utilityServer();
      // The slot is taken before the connection is made, so a server cannot
      // decide it has drained while a caller is still on its way in.
      server.handed += 1;
      server.open += 1;
      // Retire on the way in, not on the way out. A spent server must stop
      // taking new work the moment it is spent; waiting for a quiet moment to
      // decide means never deciding, because a caller that keeps several
      // fetches in flight never has one.
      retireWhenDrained(server);

      let browser;
      let context;
      try {
        browser = await firefox.connect(server.wsEndpoint);
        context = await browser.newContext();
      } catch (err) {
        server.open -= 1;
        await closeIfDrained(server);
        throw err;
      }

      let released = false;
      return {
        context,
        release: async () => {
          if (released) return; // releasing twice must not close a live server
          released = true;
          // The accounting happens first, and nothing after it can be skipped.
          // Previously the two closes came first, and `.catch()` guards a
          // rejection but not a hang: a page whose renderer had crashed could
          // leave `context.close()` pending forever, so `server.open` never
          // came down, so a retired process was never reaped and kept every
          // megabyte it had grown.
          server.open -= 1;
          // A retired server with nothing left on it is closed outright,
          // which frees this context along with everything else the process
          // was holding. Closing them politely first would gain nothing and
          // risks the hang above standing between the process and its reaping.
          if (await closeIfDrained(server)) return;
          await closeSoon("context", () => context.close());
          await closeSoon("browser connection", () => browser.close());
        },
      };
    },
  };
}

const SINGLETON_KEY = "utilityServerPromise";

/**
 * Contexts one utility browser hands out before it is replaced.
 *
 * Closing a context returns what the page allocated; it does not return what
 * the browser's parent process accumulated on the way. Over thousands of
 * navigations that parent grows without bound and is eventually OOM-killed,
 * taking every request in flight with it. Replacing the process on a counter
 * turns an outage into a pause of about the launch timeout.
 *
 * 200 is deliberately conservative. The cost of being wrong low is a browser
 * relaunch every few minutes; the cost of being wrong high is the crash this
 * exists to prevent.
 */
const DEFAULT_MAX_CONTEXTS = 200;

function maxContexts(): number {
  const set = process.env.MORROW_UTILITY_MAX_CONTEXTS;
  if (set === undefined || set.trim() === "") return DEFAULT_MAX_CONTEXTS;
  const raw = Number(set);
  // 0 or below disables recycling, for anyone who wants the old behaviour.
  // A value that is not a number at all is operator error rather than an
  // instruction to run unprotected, so it falls back to the default.
  return Number.isFinite(raw) ? raw : DEFAULT_MAX_CONTEXTS;
}

/**
 * How long any single close is given before it is abandoned.
 *
 * A close that rejects is already handled; a close that never settles is the
 * one that did the damage, because every piece of bookkeeping behind it never
 * runs. Ten seconds is far above a healthy close and far below the time it
 * takes an abandoned process to matter.
 */
const CLOSE_TIMEOUT_MS = 10_000;

/**
 * How long a retired server is given to drain before it is closed anyway.
 *
 * A retired server takes no new work, so the only thing keeping it alive is
 * contexts that have not been released. Measured locally 2026-11-16, one such
 * process holds about 25 MiB per navigation it served — roughly 2 GiB at the
 * recycle threshold — and the container's cap is hard. Work still pinning a
 * retired process has already outlived the fetch timeout of every caller, so
 * closing it loses nothing that was still going to be returned.
 */
const DRAIN_GRACE_MS = 60_000;

/**
 * Await `fn`, giving up after CLOSE_TIMEOUT_MS.
 *
 * Failure is deliberately silent: every caller is on a cleanup path where the
 * real outcome has already been decided, and the point is only that the caller
 * continues. What must not happen is the caller waiting here forever.
 */
async function closeSoon(what: string, fn: () => Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${what} did not close within ${CLOSE_TIMEOUT_MS}ms`)),
          CLOSE_TIMEOUT_MS
        );
      }),
    ]);
  } catch {
    // ignored: see above
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface UtilityServer {
  wsEndpoint: string;
  close: () => Promise<void>;
  /** Contexts handed out over this server's life. */
  handed: number;
  /** Contexts handed out and not yet released. */
  open: number;
  /** Out of service: taking no new contexts, draining the ones it has. */
  retiring: boolean;
  closed: boolean;
  /** Fires if a retired server has still not drained; see DRAIN_GRACE_MS. */
  drainTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Every server this process has launched and not yet closed.
 *
 * Kept so the browsers can be counted. Morrow's own metrics reported Node's
 * RSS, which is a few hundred megabytes and never the thing that gets killed;
 * the browsers are the rest of the container and were invisible, so each OOM
 * arrived without warning.
 */
const live = new Set<UtilityServer>();

/** What the utility browser is doing right now, for /v1/metrics. */
export function utilityStats(): {
  browsers: number;
  retiring: number;
  openContexts: number;
  handedContexts: number;
  maxContexts: number;
} {
  let retiring = 0;
  let openContexts = 0;
  let handedContexts = 0;
  for (const s of live) {
    if (s.retiring) retiring += 1;
    openContexts += s.open;
    handedContexts += s.handed;
  }
  return { browsers: live.size, retiring, openContexts, handedContexts, maxContexts: maxContexts() };
}

/**
 * Take a spent server out of service immediately.
 *
 * Dropping the singleton is what retires it: the next caller finds nothing
 * cached and launches a fresh browser, while the contexts already on this one
 * hold their own reference and finish normally. The process itself closes in
 * `closeIfDrained` once the last of them lets go.
 *
 * This runs when a context is handed out rather than when one is released,
 * because the condition "nothing is using it" is never true on a caller that
 * keeps several fetches in flight. Deciding on the way out meant never
 * deciding, and the browser grew until it was killed.
 */
function retireWhenDrained(server: UtilityServer): void {
  const max = maxContexts();
  if (max <= 0 || server.retiring) return;
  if (server.handed < max) return;

  server.retiring = true;
  dropGlobalSingleton(SINGLETON_KEY);

  // Draining is the normal path and usually takes seconds. This is for the
  // case where it does not happen at all: a context whose release never
  // arrives would otherwise keep this process, and everything it has grown,
  // alive for the lifetime of the pod.
  server.drainTimer = setTimeout(() => void forceClose(server), DRAIN_GRACE_MS);
  // Unreferenced so a pending grace period cannot hold the process open at
  // shutdown.
  server.drainTimer.unref?.();
}

/**
 * Close a retired server once its last context has been released.
 *
 * Reports whether it closed, so a caller releasing the last context can skip
 * closing that context by hand: the process is gone and took it with it.
 */
async function closeIfDrained(server: UtilityServer): Promise<boolean> {
  if (!server.retiring || server.closed || server.open > 0) return false;
  await forceClose(server);
  return true;
}

/**
 * Close a server whatever it thinks it is still doing.
 *
 * Reached either by draining normally or by outlasting the grace period. The
 * bookkeeping is done before the close is awaited, so a close that hangs
 * cannot leave this server looking live to the next caller that counts them.
 */
async function forceClose(server: UtilityServer): Promise<void> {
  if (server.closed) return;
  server.closed = true;
  if (server.drainTimer) {
    clearTimeout(server.drainTimer);
    server.drainTimer = undefined;
  }
  live.delete(server);
  await closeSoon("utility browser", () => server.close());
}

/** Lazily started and reused; a failed launch is not cached. */
async function utilityServer(): Promise<UtilityServer> {
  return globalSingletonAsync(SINGLETON_KEY, async (): Promise<UtilityServer> => {
    const server = await launchServer({ headless: true } as Parameters<typeof launchServer>[0]);
    const rec: UtilityServer = {
      wsEndpoint: server.wsEndpoint(),
      close: () => server.close(),
      handed: 0,
      open: 0,
      retiring: false,
      closed: false,
    };
    live.add(rec);
    return rec;
  });
}
