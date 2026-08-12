# Attach spike — 2026-08-12

Decision record for Morrow's Playwright attach endpoint (spec §4 "Playwright attach", vision §13).
Produced by Plan 2 Task 1. Reproduce with `npx tsx scripts/spike-attach.ts`.

**Question:** can a *stock* Playwright client (`firefox.connect(wsEndpoint)`) drive a Camoufox
profile whose state survives a browser restart?

**Why it looked impossible.** Public API only: `browserType.launchServer()` accepts no
`userDataDir`, so the browser it serves is non-persistent; `browserType.launchPersistentContext()`
returns a `BrowserContext` with no ws endpoint. Browserless solves the same problem with CDP
(`Target.createBrowserContext` against a Chromium launched with `--user-data-dir`, plus
`/devtools/browser/:id` passthrough) — Firefox has no CDP at all, so that route does not exist
here. Playwright's Firefox uses the juggler protocol over a **pipe**, not a socket, so there is
also nothing to proxy at the browser's own port.

**Outcome: a working non-public mechanism was found (recommendation 1).**

## Environment

| Component | Version |
| --- | --- |
| Node | v25.9.0 |
| playwright-core | 1.60.0 |
| camoufox-js | 0.12.0 |
| Camoufox browser | 152.0.4 beta.28 (`~/.cache/camoufox`) |
| tsx | 4.23.12 |

---

## Experiment A — browser server + forced profile dir

### A1: `launchServer({ args: ["-profile", dir] })`

```ts
await launchServer({ headless: true, port, args: ["-profile", "/tmp/spike-profile"] });
```

```text
LAUNCH REJECTED: Error: Pass userDataDir parameter to 'browserType.launchPersistentContext(userDataDir, options)' instead of specifying '--profile' argument Failed to launch browser.
```

Playwright's Firefox launcher guards it explicitly
(`packages/playwright-core/src/server/firefox/firefox.ts`, `defaultArgs`), because it appends its
own `-profile <tempdir>`:

```js
const userDataDirArg = args.find((arg) => arg.startsWith("-profile") || arg.startsWith("--profile"));
if (userDataDirArg) throw this._createUserDataDirArgMisuseError("--profile");
```

**Verdict A1: rejected before launch.**

### A2: `ignoreDefaultArgs: true` + hand-rolled juggler argv

`_prepareToLaunch` skips `defaultArgs()` entirely when `ignoreAllDefaultArgs` is set (which is what
`ignoreDefaultArgs: true` maps to), so the guard is bypassed *and* playwright's own `-profile` is
not appended. Reproducing playwright's argv by hand with our own dir:

```ts
await launchServer({
  headless: true,
  port,
  ignoreDefaultArgs: true,
  args: ["-no-remote", "-headless", "-profile", "/tmp/spike-profile", "-juggler-pipe", "-silent"],
});
```

This **launches and serves fine** — the Firefox launcher's `prepareUserDataDir` is a no-op (prefs
are pushed over the juggler protocol, not written into the profile), so a bare directory works:

```text
=== launchServer (A2 phase 1) opts={"headless":true,"port":49213,"args":["-no-remote","-headless","-profile","/tmp/spike-profile","-juggler-pipe","-silent"],"ignoreDefaultArgs":true}
    wsEndpoint: ws://[::1]:49213/e64ad30df5fad9fe3e2a585432ba7ce5  pid: 233929
    connected. browser.contexts().length = 0
    navigated to https://example.com, title="Example Domain"
    cookies after set: ["spike_session=v1"]
```

Firefox does populate the directory (46 entries, incl. `cookies.sqlite`, `places.sqlite`), but the
cookie written through `browser.newContext()` never reaches it. After a clean close and a relaunch
on the same dir:

```text
=== launchServer (A2 phase 2 (same profile dir)) ...
    connected. browser.contexts().length = 0
    cookies read back: []

>>> VERDICT A2: NOT-PERSISTED
```

Direct confirmation that nothing was written to disk:

```console
$ sqlite3 /tmp/spike-profile/cookies.sqlite "select count(*) from moz_cookies;"
0
```

`cookies.sqlite` mtime is also unchanged between "after phase 1" and "after phase 2".

**Verdict A2: server starts on a forced profile dir, but `browser.newContext()` produces a juggler
browser context that is memory-only. NOT-PERSISTED.** Forcing the profile directory is necessary
but not sufficient — the state lives in the *default* context, which a non-persistent
`launchServer` browser never exposes.

> Note on cookie shape: a cookie with `expires: -1` (Playwright's default) is a *session* cookie
> and is never written to `cookies.sqlite` by design. All persistence checks here use an explicit
> `expires`. Getting this wrong produces a false NOT-PERSISTED.

---

## Experiment C — cross-connection context visibility (on an A2 server)

Two stock clients connected to the same `launchServer` endpoint, client 1 holding an open context
with a cookie:

```text
    client2.contexts().length = 0 (client1 has 1 open context)
    client2's own context sees: []
```

**Verdict C: with default `launchServer`, connections are fully isolated.** Each connection gets a
`BrowserDispatcher` with `isolateContexts: true`, so a client sees only contexts it created itself.
Morrow could therefore not even *observe* an attached client's contexts to checkpoint their
`storageState`. (This turns out to be moot — see D.)

---

## Experiment B — playwright-core non-public server modes

### B1: what is reachable through the export map

```console
$ node -e "const cb = require('playwright-core/lib/coreBundle'); console.log(Object.keys(cb))"
[
  'clientEventEmitter', 'getPlaywrightVersion', 'getUserAgent', 'inprocess',
  'iso', 'libCli', 'libCliTestStub', 'oop', 'registry', 'remote', 'server',
  'tools', 'utils'
]
```

Sub-namespaces of interest:

```text
remote:  PlaywrightServer
server:  Browser, BrowserContext, DispatcherConnection, Page, PlaywrightDispatcher, Request,
         RequestDispatcher, Response, ResponseDispatcher, RootDispatcher, WebSocketTransport,
         createPlaywright, deviceDescriptors, ... startTraceViewerServer
tools:   BrowserBackend, Tab, browserTools, cliProgram, createConnection, isProfileLocked, start, ...
inprocess: createInProcessPlaywright, playwright
```

Deeper paths are blocked by the export map, as expected:

```console
$ node -e "require('playwright-core/lib/server')"
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/server' is not defined by "exports" in /code/morrow/node_modules/playwright-core/package.json

$ node -e "require('playwright-core/lib/remote/playwrightServer')"
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/remote/playwrightServer' is not defined by "exports"
```

So `coreBundle` is the single reachable door, and it does expose `remote.PlaywrightServer` and
`server.createPlaywright` — enough to hand-roll a server around a pre-launched browser.

### B2: `npx playwright-core run-server`

The command exists but is hidden from top-level `--help`:

```console
$ npx playwright-core run-server --help
Usage: npx playwright run-server [options]

Options:
  --port <port>                   Server port
  --host <host>                   Server host
  --path <path>                   Endpoint Path (default: "/")
  --max-clients <maxClients>      Maximum clients
  --mode <mode>                   Server mode, either "default" or "extension"
  --artifacts-dir <artifactsDir>  Artifacts directory
  --unsafe                        Allow clients to set unsafe launch options (args, executablePath,
                                  ignoreAllDefaultArgs, etc)
```

A stock client *can* reach it, and `--unsafe` does let the client name the Camoufox binary:

```console
$ npx playwright-core run-server --port 41337 --path / --unsafe
Listening on ws://[::1]:41337/
$ node .spike-tmp/runserver-client.mjs
CONNECTED, contexts= 0 version= 152.0.4-beta.28
title= Example Domain
```

But it cannot serve a persistent context, and this is structural, not a missing flag.
`filterLaunchOptions` (`remote/playwrightServer.ts`) enumerates every option a client may pass —
`channel, args, ignoreAllDefaultArgs, ignoreDefaultArgs, timeout, headless, proxy, chromiumSandbox,
firefoxUserPrefs, slowMo, executablePath, downloadsPath, artifactsDir` — and there is **no
`userDataDir`**. `_initLaunchBrowserMode` then calls `browserType.launch()`, never
`launchPersistentContext()`. The most a client can do is replay experiment A2 remotely
(`ignoreDefaultArgs: true` + `-profile`), which A2 already proved non-persistent.

**Verdict B2: `run-server` works with stock clients but can only ever serve ephemeral contexts.**
Not usable for Morrow attach.

### B3: serving a PRE-LAUNCHED persistent browser — the mechanism that works

Reading `PlaywrightServer` and `BrowserServerLauncherImpl` in the bundle turned up two
underscore-prefixed options on `launchServer` that the public typings omit:

```js
// browserServerImpl.ts (bundled)
if (options._userDataDir !== undefined) {
  const context = await playwright[this._browserName].launchPersistentContext(progress, options._userDataDir, launchOptions);
  return context._browser;                       // <- persistent browser becomes preLaunchedBrowser
} else {
  return await playwright[this._browserName].launch(progress, launchOptions);
}
...
const server = new PlaywrightServer({
  mode: options._sharedBrowser ? "launchServerShared" : "launchServer",
  path, maxConnections: Infinity, preLaunchedBrowser: browser,
});
```

and, in `PlaywrightDispatcher` → `BrowserDispatcher`, `sharedBrowser` is what un-hides the default
context:

```js
browserDispatcher = new BrowserDispatcher(browserTypeDispatcher, options.preLaunchedBrowser, {
  ignoreStopAndKill: true,
  isolateContexts: !options.sharedBrowser,
});
...
if (!options.isolateContexts) {
  if (browser._defaultContext)
    this._dispatchEvent("context", { context: BrowserContextDispatcher.from(this, browser._defaultContext) });
  for (const context of browser.contexts())
    this._dispatchEvent("context", { context: BrowserContextDispatcher.from(this, context) });
}
```

So no hand-rolled `PlaywrightServer` was needed: `_userDataDir` + `_sharedBrowser` on the ordinary
`launchServer()` call is the whole recipe. camoufox-js passes unknown options straight through
(`launchOptions()` ends with `...launch_options`), so it works through `camoufox-js`'s wrapper
unchanged.

---

## Experiment D — `launchServer({ _userDataDir, _sharedBrowser })`

```ts
import { launchServer } from "camoufox-js";
const server = await launchServer({
  headless: true,
  port,
  _userDataDir: "/tmp/spike-profile-shared",
  _sharedBrowser: true,
});
// client side is 100% stock:
const browser = await firefox.connect(server.wsEndpoint());
const ctx = browser.contexts()[0];      // the PERSISTENT profile context
```

Verbatim run:

```text
=== launchServer (D phase 1) opts={"headless":true,"port":45900,"_userDataDir":"/tmp/spike-profile-shared","_sharedBrowser":true}
    wsEndpoint: ws://[::1]:45900/e9a23338fdc298f7f11580a123faa625  pid: 234222
    client1.contexts()=1  client2.contexts()=1
    client1 wrote cookie: ["spike_session=v1"]
    client2 sees cookie:  ["spike_session=v1"]
    client2 sees client1's pages: 2
    after client1 browser.close(): server process killed? false
    reconnect: contexts=1 pages=2

=== launchServer (D phase 2 (same profile dir)) ...
    cookies read back: [{"name":"spike_session","value":"v1","domain":"example.com","path":"/","expires":1786598667,...}]

>>> VERDICT D: PERSISTED
```

And the same directory reopened through Morrow's own persistent-context path:

```text
########## D2: reopen the same dir with Camoufox({ user_data_dir }) ##########
    Camoufox persistent context sees: ["spike_session=v1"]
```

**Verdict D: PERSISTED.** Observed properties, all directly measured:

| Property | Observed |
| --- | --- |
| `browser.contexts()[0]` on a stock client | the persistent profile context |
| Cookie survives server restart | yes (`D phase 2`) |
| Interop with `Camoufox({ user_data_dir })` | yes — same dir, same cookie (`D2`) |
| Two concurrent clients | **share** the same context and the same pages |
| Client calls `browser.close()` | server browser **not** killed (`ignoreStopAndKill: true`); reconnect keeps contexts and pages |
| Client `newContext()` | still allowed, creates an extra non-isolated context |

Caveats, also measured or read directly from the bundle:

- **Undocumented API.** `_userDataDir` / `_sharedBrowser` are not in `playwright-core`'s public
  typings; they need a cast (`launchServer({...} as never)` or a local `.d.ts` augmentation) and a
  pinned `playwright-core` version. They exist in 1.60.0 and are used by Playwright's own tooling,
  but nothing guarantees them across minor bumps. Any upgrade must re-run this spike.
- **Client/server version lock.** `userAgentVersionMatchesErrorMessage` rejects the WebSocket
  upgrade unless the client's `major.minor` equals the server's, i.e. attaching clients must run
  playwright(-core) 1.60.x. This is normal for `firefox.connect` and must be documented.
- **Sharing is real sharing, not isolation.** Two attached clients see each other's pages and
  cookies. That matches Morrow's "one profile = one identity" model, but it makes spec §22 profile
  locking load-bearing rather than optional.

---

## Recommendation for Plan 3

**Option 1 — ship attach via the working non-public mechanism.**

Exact recipe for Plan 3:

1. Start a profile with
   `launchServer({ ...camoufoxOptions, headless, port: 0, _userDataDir: <profileDir>, _sharedBrowser: true })`
   from `camoufox-js` (cast required; add a local module augmentation for the two options).
2. Keep `server.wsEndpoint()` internal. `ws://host:3000/playwright/:name?token=…` stays a raw byte
   passthrough to it, exactly as spec §4 describes — attach semantics do not change.
3. Morrow's own consumers (viewer, scrape, MCP) drive `browser.contexts()[0]` of a locally
   connected client, or the `BrowserContext` returned by a parallel `Camoufox({ user_data_dir })`
   — D2 shows both see the same profile state.
4. Pin `playwright-core` exactly (`1.60.0`, no caret) and make `scripts/spike-attach.ts` (or a
   trimmed version of experiment D) a CI test, so a playwright bump that removes `_userDataDir` or
   `_sharedBrowser` fails loudly instead of silently degrading to ephemeral contexts.
5. Document the client version requirement (playwright-core 1.60.x) in the API reference.

Justification: it is the only option that keeps the v1 promise verbatim — a stock
`firefox.connect(wsEndpoint)` client, driving the *persistent* profile, with no Morrow-specific
client library. The cost is a pinned dependency plus a regression test, which is small and
mechanical. No spec amendment is required.

Fallbacks if a future playwright removes the options: option 2 (attach = ephemeral browser-server
contexts, documented honestly as "attach gives you a fresh context in the profile's browser; only
Morrow-mediated APIs touch profile state"). In that world, experiment C says storageState
checkpointing could **not** narrow the gap — with default `launchServer`, Morrow cannot see an
attached client's contexts at all, so there is nothing to checkpoint without a client-side shim.
Option 3 (Morrow-mediated only, spec §13 amended) would then be the honest fallback.
