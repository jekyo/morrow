import { firefox } from "playwright-core";
import { launchServer } from "camoufox-js";
import type { AcquiredContext, ContextResolver } from "@/server/browser/pagerunner";
import { getProfileManager } from "@/server/profiles";
import { globalSingletonAsync } from "@/server/global";

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
      return {
        context,
        release: async () => {
          await context.close().catch(() => {});
          await browser.close().catch(() => {});
        },
      };
    },
  };
}

interface UtilityServer { wsEndpoint: string; }

/** Lazily started once per process and reused; a failed launch is not cached. */
async function utilityServer(): Promise<UtilityServer> {
  return globalSingletonAsync("utilityServerPromise", async (): Promise<UtilityServer> => {
    const server = await launchServer({ headless: true } as Parameters<typeof launchServer>[0]);
    return { wsEndpoint: server.wsEndpoint() };
  });
}
