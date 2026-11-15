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
      const browser = await firefox.connect(server.wsEndpoint);
      const context = await browser.newContext();
      server.handed += 1;
      server.open += 1;
      let released = false;
      return {
        context,
        release: async () => {
          if (released) return; // releasing twice must not retire a live server
          released = true;
          await context.close().catch(() => {});
          await browser.close().catch(() => {});
          server.open -= 1;
          await retireIfSpent(server);
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
  retiring: boolean;
}

/**
 * Retire a spent server once nothing is using it.
 *
 * The singleton is dropped before the process is closed, so a request
 * arriving mid-retirement starts a fresh browser rather than connecting to
 * one that is going away. Anything still open keeps its own reference and
 * finishes normally.
 */
async function retireIfSpent(server: UtilityServer): Promise<void> {
  const max = maxContexts();
  if (max <= 0 || server.retiring) return;
  if (server.handed < max || server.open > 0) return;

  server.retiring = true;
  const current = await peekUtilityServer();
  if (current === server) dropGlobalSingleton(SINGLETON_KEY);
  await server.close().catch(() => {});
}

/** The cached server, or undefined when none has been started. */
async function peekUtilityServer(): Promise<UtilityServer | undefined> {
  const s = (globalThis as Record<string, unknown>).__morrow as
    | Record<string, unknown>
    | undefined;
  const promise = s?.[SINGLETON_KEY] as Promise<UtilityServer> | undefined;
  return promise ? promise.catch(() => undefined) : undefined;
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
    };
  });
}
