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
          await context.close().catch(() => {});
          await browser.close().catch(() => {});
          server.open -= 1;
          await closeIfDrained(server);
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
}

/** Close a retired server once its last context has been released. */
async function closeIfDrained(server: UtilityServer): Promise<void> {
  if (!server.retiring || server.closed || server.open > 0) return;
  server.closed = true;
  await server.close().catch(() => {});
}

/** Lazily started and reused; a failed launch is not cached. */
async function utilityServer(): Promise<UtilityServer> {
  return globalSingletonAsync(SINGLETON_KEY, async (): Promise<UtilityServer> => {
    const server = await launchServer({ headless: true } as Parameters<typeof launchServer>[0]);
    return {
      wsEndpoint: server.wsEndpoint(),
      close: () => server.close(),
      handed: 0,
      open: 0,
      retiring: false,
      closed: false,
    };
  });
}
