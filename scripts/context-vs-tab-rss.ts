/**
 * Measures where the utility browser's memory actually goes.
 *
 * The utility browser is OOM-killed every few hours, and the only thing
 * holding it back is MORROW_UTILITY_MAX_CONTEXTS, which replaces the process
 * after a fixed number of contexts. The number it is set to was measured at
 * about 50 MiB of unreclaimed growth per context — but in the current design
 * every context serves exactly one navigation, so that measurement cannot
 * tell whether the cost is the context or the navigation inside it.
 *
 * Only the first case is fixed by reusing contexts and opening tabs, so this
 * script runs the two regimes side by side against one fixed local page:
 *
 *   context: connect, newContext, newPage, goto, close  (what we do today)
 *   tab:     one context, newPage, goto, close page     (the alternative)
 *
 * RSS is summed over the whole process tree, because Firefox spawns content
 * processes and it is the container's total that gets killed.
 *
 *   npx tsx scripts/context-vs-tab-rss.ts [navigations]
 */
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { firefox } from "playwright-core";
import { launchServer } from "camoufox-js";

const NAVIGATIONS = Number(process.argv[2] ?? 50);
const SAMPLE_EVERY = 10;
/**
 * Generous on purpose. The page is local, so a navigation this slow means the
 * browser is struggling rather than the network — which is itself a result
 * worth recording instead of a reason to stop.
 */
const NAV_TIMEOUT = 20_000;

/**
 * A page with the shape of the ones this actually fetches: real markup, a
 * stylesheet, several scripts, inline data. Fixed, so that the only variable
 * between the two regimes is how the browser was asked to open it.
 */
const PAGE = `<!doctype html><html><head>
<title>Bella Handbags</title>
<meta name="description" content="Leather handbags and purses">
<meta property="og:type" content="product">
<style>${"body{font:16px/1.5 system-ui;margin:0}.g{display:grid;gap:1rem}".repeat(40)}</style>
<script type="application/ld+json">{"@type":"Product","name":"Tote"}</script>
</head><body>
<div class="g">${'<article><h2>Tote</h2><p>Full grain hide, stitched by hand.</p><span>$129.00</span></article>'.repeat(120)}</div>
<script>window.__x=Array.from({length:5000},(_,i)=>({i,s:"row "+i}));</script>
<script>document.body.dataset.ready="1";</script>
<script>void 0;</script>
</body></html>`;

/** Total RSS in MiB across the process tree rooted at pid. */
function treeRSS(pid: number): number {
  // ps is the portable way to walk this; /proc would need the tree built by
  // hand and this runs a handful of times per regime.
  let out: string;
  try {
    out = execFileSync("ps", ["-o", "pid=,ppid=,rss="], { encoding: "utf8" });
  } catch {
    return NaN;
  }
  const kids = new Map<number, number[]>();
  const rss = new Map<number, number>();
  for (const line of out.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/);
    if (!m) continue;
    const [, p, pp, kb] = m;
    rss.set(Number(p), Number(kb));
    const list = kids.get(Number(pp)) ?? [];
    list.push(Number(p));
    kids.set(Number(pp), list);
  }
  let total = 0;
  const stack = [pid];
  const seen = new Set<number>();
  while (stack.length) {
    const p = stack.pop()!;
    if (seen.has(p)) continue;
    seen.add(p);
    total += rss.get(p) ?? 0;
    for (const k of kids.get(p) ?? []) stack.push(k);
  }
  return total / 1024;
}

async function serve(): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PAGE);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return {
    url: `http://127.0.0.1:${addr.port}/`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

interface Sample {
  at: number;
  rss: number;
}

/**
 * One regime. `perNavigationContext` is the only difference: true is today's
 * ephemeral path, false reuses a single context and opens tabs in it.
 */
async function run(url: string, perNavigationContext: boolean): Promise<Sample[]> {
  console.log(`\n  ${perNavigationContext ? "context per navigation" : "tab in one context"}:`);
  const server = await launchServer({ headless: true } as Parameters<typeof launchServer>[0]);
  const pid = server.process()?.pid;
  if (!pid) throw new Error("no server pid");

  const samples: Sample[] = [];
  const browser = await firefox.connect(server.wsEndpoint());
  // Reused only in the tab regime; the context regime makes its own each time.
  const shared = perNavigationContext ? undefined : await browser.newContext();

  // A first navigation warms the process: the browser allocates its caches
  // and content process on the way in, and counting that as growth would
  // flatter whichever regime happened to run second.
  {
    const ctx = shared ?? (await browser.newContext());
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.close();
    if (!shared) await ctx.close();
  }
  samples.push({ at: 0, rss: treeRSS(pid) });

  // A navigation that fails is reported and counted rather than ending the
  // run: the measurement is of memory, and a run that dies at iteration 40
  // throws away the forty samples that were the point.
  let failed = 0;
  for (let i = 1; i <= NAVIGATIONS; i++) {
    try {
      if (perNavigationContext) {
        // Today's path, as utility.ts drives it: a connection and a context
        // per request, both closed on the way out.
        const b = await firefox.connect(server.wsEndpoint());
        const ctx = await b.newContext();
        const page = await ctx.newPage();
        await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT });
        await page.close();
        await ctx.close();
        await b.close();
      } else {
        const page = await shared!.newPage();
        await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT });
        await page.close();
      }
    } catch (err) {
      failed++;
      process.stdout.write(`\n    navigation ${i} failed: ${(err as Error).message.split("\n")[0]}\n`);
    }
    if (i % SAMPLE_EVERY === 0) {
      const rss = treeRSS(pid);
      samples.push({ at: i, rss });
      // Printed as it goes, so a run that dies still shows where it got to.
      process.stdout.write(`    ${String(i).padStart(3)}: ${rss.toFixed(0)} MiB\n`);
    }
  }
  if (failed) console.log(`    (${failed} of ${NAVIGATIONS} navigations failed)`);

  if (shared) await shared.close();
  await browser.close();
  await server.close();
  return samples;
}

function slope(s: Sample[]): number {
  const first = s[0];
  const last = s[s.length - 1];
  return (last.rss - first.rss) / (last.at - first.at);
}

function report(name: string, s: Sample[]): void {
  console.log(`\n${name}`);
  for (const { at, rss } of s) {
    console.log(`  after ${String(at).padStart(3)} navigations: ${rss.toFixed(0)} MiB`);
  }
  console.log(`  growth: ${slope(s).toFixed(2)} MiB per navigation`);
}

const page = await serve();
try {
  // Context regime first, then tabs, each on its own browser process so
  // neither inherits the other's state.
  const ctxRun = await run(page.url, true);
  report(`context per navigation (today, n=${NAVIGATIONS})`, ctxRun);

  const tabRun = await run(page.url, false);
  report(`tab in one reused context (n=${NAVIGATIONS})`, tabRun);

  const a = slope(ctxRun);
  const b = slope(tabRun);
  console.log(`\ncontext ${a.toFixed(2)} vs tab ${b.toFixed(2)} MiB per navigation`);
  if (a > 0 && b / a < 0.5) {
    console.log("=> context churn is the leak; reusing contexts and opening tabs fixes it.");
  } else if (a > 0.5) {
    console.log("=> the growth follows the navigation, not the context; tabs will not help.");
  } else {
    console.log("=> no meaningful growth in either regime at this sample size.");
  }
} finally {
  await page.close();
}
