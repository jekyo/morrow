/**
 * Attach spike (Plan 2, Task 1) — experiment, NOT production code.
 *
 * Question: can a *stock* Playwright client (`firefox.connect(wsEndpoint)`) drive a
 * Camoufox profile that persists across browser restarts? The public API says no:
 * `launchServer()` takes no `userDataDir`, `launchPersistentContext()` exposes no ws
 * endpoint, and Firefox has no CDP.
 *
 * Experiments, in order:
 *   A1  launchServer + args ["-profile", dir]           -> expect playwright's guard
 *   A2  launchServer + ignoreDefaultArgs + manual argv  -> bypasses guard; persistence?
 *   C   two clients against an A2 server                -> cross-connection visibility
 *   D   launchServer({ _userDataDir, _sharedBrowser })  -> undocumented options
 *   D2  same dir reopened via Camoufox({user_data_dir}) -> interop with Morrow's own path
 *
 * Run: npx tsx scripts/spike-attach.ts
 * Results are recorded verbatim in docs/notes/attach-spike.md.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { firefox } from "playwright-core";
import type { BrowserContext, BrowserServer } from "playwright-core";
import { Camoufox, launchServer } from "camoufox-js";

const DIR_A = "/tmp/spike-profile";
const DIR_D = "/tmp/spike-profile-shared";
const ORIGIN = "https://example.com";

/** Session cookies (expires -1) are never written to cookies.sqlite; use a real expiry. */
function cookie(value: string) {
  return {
    name: "spike_session",
    value,
    domain: "example.com",
    path: "/",
    expires: Math.floor(Date.now() / 1000) + 86400,
  };
}

/** Playwright's own juggler argv (server/firefox/firefox.ts defaultArgs), our dir. */
function jugglerArgs(dir: string): string[] {
  return ["-no-remote", "-headless", "-profile", dir, "-juggler-pipe", "-silent"];
}

function port(): number {
  return 40000 + Math.floor(Math.random() * 20000);
}

function storageSnapshot(dir: string, label: string): void {
  console.log(`\n--- profile storage (${label}): ${dir}`);
  if (!existsSync(dir)) return void console.log("  (does not exist)");
  const entries = readdirSync(dir).sort();
  console.log(`  (${entries.length} entries; showing storage files)`);
  for (const e of entries.filter((x) => /^(cookies|places|webappsstore)\.sqlite$/.test(x))) {
    const s = lstatSync(`${dir}/${e}`);
    console.log(`  ${e}  ${s.size} bytes  mtime=${s.mtime.toISOString()}`);
  }
}

async function start(label: string, opts: Record<string, unknown>): Promise<BrowserServer> {
  const full = { headless: true as const, port: port(), ...opts };
  console.log(`\n=== launchServer (${label}) opts=${JSON.stringify(full)}`);
  const server = await launchServer(full);
  console.log(`    wsEndpoint: ${server.wsEndpoint()}  pid: ${server.process().pid}`);
  return server;
}

async function readCookies(ctx: BrowserContext): Promise<string> {
  return JSON.stringify((await ctx.cookies(ORIGIN)).map((c) => `${c.name}=${c.value}`));
}

// ---------------------------------------------------------------- experiment A1
async function experimentA1(): Promise<void> {
  console.log("\n########## A1: launchServer + args ['-profile', dir] ##########");
  try {
    const s = await start("A1", { args: ["-profile", DIR_A] });
    console.log("    UNEXPECTED: launch succeeded");
    await s.close();
  } catch (err) {
    console.log(`    LAUNCH REJECTED: ${String(err).split("\n")[0]}`);
  }
}

// ------------------------------------------------------- experiments A2 and C
async function experimentA2(): Promise<void> {
  console.log("\n########## A2: launchServer + ignoreDefaultArgs:true + manual juggler argv ##########");
  const opts = { args: jugglerArgs(DIR_A), ignoreDefaultArgs: true };
  storageSnapshot(DIR_A, "before A2 phase 1");

  const server = await start("A2 phase 1", opts);
  const browser = await firefox.connect(server.wsEndpoint());
  console.log(`    connected. browser.contexts().length = ${browser.contexts().length}`);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(ORIGIN);
  console.log(`    navigated to ${ORIGIN}, title=${JSON.stringify(await page.title())}`);
  await ctx.addCookies([cookie("v1")]);
  console.log(`    cookies after set: ${await readCookies(ctx)}`);

  console.log("\n########## C: second concurrent client on the same server ##########");
  const other = await firefox.connect(server.wsEndpoint());
  console.log(`    client2.contexts().length = ${other.contexts().length} (client1 has 1 open context)`);
  const otherCtx = await other.newContext();
  console.log(`    client2's own context sees: ${await readCookies(otherCtx)}`);
  await otherCtx.close();
  await other.close();

  await ctx.close();
  await browser.close();
  await server.close();
  console.log("\n    A2 phase 1 closed cleanly");
  storageSnapshot(DIR_A, "after A2 phase 1");

  const server2 = await start("A2 phase 2 (same profile dir)", opts);
  const browserB = await firefox.connect(server2.wsEndpoint());
  console.log(`    connected. browser.contexts().length = ${browserB.contexts().length}`);
  const ctx2 = await browserB.newContext();
  const cookies = await ctx2.cookies(ORIGIN);
  console.log(`    cookies read back: ${JSON.stringify(cookies)}`);
  console.log(`\n>>> VERDICT A2: ${cookies.length ? "PERSISTED" : "NOT-PERSISTED"}`);
  await ctx2.close();
  await browserB.close();
  await server2.close();
  storageSnapshot(DIR_A, "after A2 phase 2");
}

// ---------------------------------------------------------------- experiment D
async function experimentD(): Promise<void> {
  console.log("\n########## D: launchServer({ _userDataDir, _sharedBrowser }) ##########");
  const opts = { _userDataDir: DIR_D, _sharedBrowser: true };

  const server = await start("D phase 1", opts);
  const b1 = await firefox.connect(server.wsEndpoint());
  const b2 = await firefox.connect(server.wsEndpoint());
  console.log(`    client1.contexts()=${b1.contexts().length}  client2.contexts()=${b2.contexts().length}`);
  const c1 = b1.contexts()[0];
  const c2 = b2.contexts()[0];
  if (!c1 || !c2) {
    console.log(">>> VERDICT D: NO DEFAULT CONTEXT EXPOSED");
    await b1.close();
    await b2.close();
    await server.close();
    return;
  }

  const page = await c1.newPage();
  await page.goto(ORIGIN);
  await c1.addCookies([cookie("v1")]);
  console.log(`    client1 wrote cookie: ${await readCookies(c1)}`);
  console.log(`    client2 sees cookie:  ${await readCookies(c2)}`);
  console.log(`    client2 sees client1's pages: ${c2.pages().length}`);

  await b1.close();
  console.log(`    after client1 browser.close(): server process killed? ${server.process().killed}`);
  const b3 = await firefox.connect(server.wsEndpoint());
  console.log(`    reconnect: contexts=${b3.contexts().length} pages=${b3.contexts()[0].pages().length}`);
  await b3.close();
  await b2.close();
  await server.close();
  storageSnapshot(DIR_D, "after D phase 1");

  // phase 2: relaunch the server on the same dir, read the cookie back
  const server2 = await start("D phase 2 (same profile dir)", opts);
  const bb = await firefox.connect(server2.wsEndpoint());
  const ctx = bb.contexts()[0];
  const cookies = await ctx.cookies(ORIGIN);
  console.log(`    cookies read back: ${JSON.stringify(cookies)}`);
  console.log(`\n>>> VERDICT D: ${cookies.length ? "PERSISTED" : "NOT-PERSISTED"}`);
  await bb.close();
  await server2.close();

  // D2: same dir through Morrow's own persistent-context path
  console.log("\n########## D2: reopen the same dir with Camoufox({ user_data_dir }) ##########");
  const persistent = await Camoufox({ headless: true, user_data_dir: DIR_D });
  console.log(`    Camoufox persistent context sees: ${await readCookies(persistent)}`);
  await persistent.close();
}

async function main(): Promise<void> {
  for (const dir of [DIR_A, DIR_D]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  await experimentA1();
  await experimentA2();
  await experimentD();
}

main().catch((err) => {
  console.error("\nSPIKE ERROR:");
  console.error(err);
  process.exit(1);
});
