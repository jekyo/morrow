import { spawn, type ChildProcess } from "node:child_process";
import { createServer, connect } from "node:net";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * A per-profile virtual desktop: an Xvfb display, a minimal window manager to
 * map/size the browser window, and an x11vnc server exposing that display over
 * RFB on localhost. Camoufox runs headful into the display (see camoufox.ts),
 * and Morrow's viewer proxies a websocket to `vncPort` for the noVNC client.
 *
 * The recipe (and the gotchas behind each flag) is documented in
 * docs/notes/novnc-viewer.md; the short version:
 *  - software GL is mandatory or Firefox can't create a window on Xvfb;
 *  - the launching env must not leak a real DISPLAY (:0) or the window escapes
 *    to the host desktop — we build a clean env here and hand it to the browser;
 *  - x11vnc refuses to start if WAYLAND_DISPLAY is set (even empty).
 */
export interface DisplaySession {
  /** X display string, e.g. ":137". */
  readonly display: string;
  /** localhost TCP port serving RFB for this display. */
  readonly vncPort: number;
  /** Environment a headful browser must inherit to render into this display. */
  readonly browserEnv: NodeJS.ProcessEnv;
  /** Stop x11vnc, the window manager, and Xvfb. Idempotent. */
  close(): Promise<void>;
}

export interface DisplayOptions {
  width?: number;
  height?: number;
  /** Overridable for tests / non-standard installs. */
  bin?: { xvfb?: string; openbox?: string; x11vnc?: string };
}

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;

/**
 * A browser env with every trace of the host graphics session stripped, plus
 * the software-rendering flags Xvfb needs. DISPLAY is set by the caller once
 * the Xvfb display number is known.
 */
function cleanGraphicsEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // A real DISPLAY (e.g. :0 on a dev desktop) would be inherited by the browser
  // and its window would open on the host screen instead of our Xvfb.
  delete env.DISPLAY;
  // x11vnc (and Firefox) treat these as "you are on Wayland"; on a headless
  // server they're absent, but on a dev desktop they must go.
  delete env.WAYLAND_DISPLAY;
  delete env.MOZ_ENABLE_WAYLAND;
  env.XDG_SESSION_TYPE = "x11";
  // No GPU inside Xvfb — force Mesa software GL or the browser paints nothing.
  env.LIBGL_ALWAYS_SOFTWARE = "1";
  env.__GLX_VENDOR_LIBRARY_NAME = "mesa";
  return env;
}

/** Ask the OS for a free localhost TCP port. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("could not determine a free port")));
      }
    });
  });
}

/** Poll until something is listening on a localhost port, or time out. */
async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const conn = connect(port, "127.0.0.1");
      conn.once("connect", () => { conn.destroy(); resolve(true); });
      conn.once("error", () => { conn.destroy(); resolve(false); });
    });
    if (ok) return;
    await sleep(100);
  }
  throw new Error(`nothing listening on port ${port} after ${timeoutMs}ms`);
}

/**
 * Spawn a background process and capture its async `'error'` event (e.g. ENOENT
 * for a missing binary). Node crashes the whole process with an *uncaught
 * exception* if a spawn `'error'` has no listener, so every child gets one.
 * `failed` resolves — never rejects — with the error, so it can be raced or
 * left dangling without ever producing an unhandled rejection.
 */
function spawnBg(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv
): { child: ChildProcess; failed: Promise<Error> } {
  const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"], env });
  const failed = new Promise<Error>((resolve) => {
    child.once("error", (e) => resolve(e instanceof Error ? e : new Error(String(e))));
  });
  return { child, failed };
}

/**
 * Boot an Xvfb display, a window manager, and x11vnc for one profile.
 * Throws (after cleaning up any partially-started processes) if the stack
 * doesn't come up within the timeouts.
 */
export async function startDisplay(opts: DisplayOptions = {}): Promise<DisplaySession> {
  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;
  const xvfbBin = opts.bin?.xvfb ?? process.env.MORROW_XVFB_BIN ?? "Xvfb";
  const openboxBin = opts.bin?.openbox ?? process.env.MORROW_OPENBOX_BIN ?? "openbox";
  const x11vncBin = opts.bin?.x11vnc ?? process.env.MORROW_X11VNC_BIN ?? "x11vnc";

  const env = cleanGraphicsEnv();
  const procs: ChildProcess[] = [];
  const killAll = () => {
    for (const p of procs) {
      try { p.kill("SIGKILL"); } catch { /* already gone */ }
    }
  };

  try {
    // 1. Start Xvfb on an explicit high display number. We do NOT use Xvfb's
    //    -displayfd auto-picker: on a Wayland host the real :0 (XWayland) has no
    //    /tmp/.X0-lock, so the picker grabs :0 and x11vnc would then serve the
    //    user's real desktop. We allocate a free high number ourselves instead.
    const { xvfb, display } = await startXvfb(xvfbBin, width, height, env);
    procs.push(xvfb);
    env.DISPLAY = display;

    // 2. Window manager: maps and sizes the browser's top-level window so it
    //    fills the screen. Without one the window never maps and RFB is blank.
    const openbox = spawnBg(openboxBin, [], env);
    procs.push(openbox.child);

    // 3. x11vnc serving this display on a private localhost port.
    const vncPort = await freePort();
    const x11vnc = spawnBg(
      x11vncBin,
      ["-display", display, "-rfbport", String(vncPort), "-localhost",
       "-forever", "-shared", "-nopw", "-noxdamage", "-repeat", "-quiet"],
      env
    );
    procs.push(x11vnc.child);
    let x11vncErr = "";
    x11vnc.child.stderr?.on("data", (d) => { x11vncErr += String(d); });
    x11vnc.child.once("exit", (code) => {
      if (code) console.error(`x11vnc for ${display} exited (${code}): ${x11vncErr.slice(-200)}`);
    });

    // Wait for x11vnc to accept connections, but bail immediately if openbox or
    // x11vnc failed to spawn at all (e.g. binary missing) instead of hanging
    // until the timeout. Every branch resolves — none reject — so the losers
    // settling late can't raise an unhandled rejection.
    const outcome = await Promise.race([
      waitForPort(vncPort, 8_000).then(() => ({ ok: true as const })),
      openbox.failed.then((e) => ({ ok: false as const, who: "openbox", err: e })),
      x11vnc.failed.then((e) => ({ ok: false as const, who: "x11vnc", err: e })),
    ]).catch((e: Error) => ({ ok: false as const, who: "x11vnc", err: e }));
    if (!outcome.ok) {
      throw new Error(
        `${outcome.who} failed to start for ${display}: ${outcome.err.message} ${x11vncErr.slice(-200)}`.trim()
      );
    }

    let closed = false;
    return {
      display,
      vncPort,
      browserEnv: env,
      close: async () => {
        if (closed) return;
        closed = true;
        killAll();
        await sleep(50);
      },
    };
  } catch (err) {
    killAll();
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/** True once the X socket for a display exists (Xvfb is accepting clients). */
function displayReady(displayNum: number): boolean {
  return existsSync(`/tmp/.X11-unix/X${displayNum}`);
}

/**
 * Launch Xvfb on a free high display number (never :0). Tries a handful of
 * random numbers to dodge races with other profiles starting concurrently.
 */
async function startXvfb(
  xvfbBin: string,
  width: number,
  height: number,
  env: NodeJS.ProcessEnv
): Promise<{ xvfb: ChildProcess; display: string }> {
  const MIN = 100;
  const RANGE = 800; // display numbers 100..899
  let lastErr = "";
  for (let attempt = 0; attempt < 12; attempt++) {
    // Deterministic-enough spread without Math.random (unavailable in some
    // sandboxes): walk pseudo-randomly from a time-seeded base.
    const n = MIN + ((Date.now() + attempt * 137) % RANGE);
    if (existsSync(`/tmp/.X${n}-lock`) || displayReady(n)) continue;
    const xvfb = spawn(
      xvfbBin,
      [`:${n}`, "-screen", "0", `${width}x${height}x24`, "-ac", "-nolisten", "tcp"],
      { stdio: ["ignore", "ignore", "pipe"], env }
    );
    let err = "";
    xvfb.stderr?.on("data", (d) => { err += String(d); });
    // Wait for the X socket to appear, or the process to die (number taken).
    const ok = await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (v: boolean) => { if (!settled) { settled = true; resolve(v); } };
      xvfb.once("exit", () => done(false));
      // A missing Xvfb binary emits 'error' (not 'exit'); handle it so it can't
      // escape as an uncaught exception, and treat it as a failed attempt.
      xvfb.once("error", (e) => { err = e instanceof Error ? e.message : String(e); done(false); });
      const deadline = Date.now() + 5000;
      const poll = setInterval(() => {
        if (displayReady(n)) { clearInterval(poll); done(true); }
        else if (Date.now() > deadline) { clearInterval(poll); done(false); }
      }, 50);
    });
    if (ok) return { xvfb, display: `:${n}` };
    try { xvfb.kill("SIGKILL"); } catch { /* already gone */ }
    lastErr = err.slice(-160);
  }
  throw new Error(`could not start Xvfb on a free display after 12 attempts. ${lastErr}`);
}
