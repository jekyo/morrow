import { ControlLock } from "@/server/lock";
import { globalSingleton } from "@/server/global";

export interface ViewerPage {
  screenshot(opts?: { type?: "jpeg"; quality?: number }): Promise<Buffer>;
  url(): string;
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  mouse: {
    move(x: number, y: number): Promise<void>;
    down(): Promise<void>;
    up(): Promise<void>;
    wheel(dx: number, dy: number): Promise<void>;
  };
  keyboard: {
    type(text: string): Promise<void>;
    press(key: string): Promise<void>;
  };
}

export interface Frame { data: Buffer; url: string; seq: number }

export type InputMessage =
  | { type: "mouse"; action: "move" | "down" | "up"; x?: number; y?: number }
  | { type: "mouse"; action: "wheel"; dx: number; dy: number }
  | { type: "key"; action: "type"; text: string }
  | { type: "key"; action: "press"; key: string };

type Subscriber = (frame: Frame) => void;

export class ViewerHub {
  readonly lock = new ControlLock();
  private subs = new Set<Subscriber>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private busy = false;
  /** Pending input applied serially; consecutive moves are coalesced (see input()). */
  private inputQueue: InputMessage[] = [];
  private draining = false;

  constructor(private page: ViewerPage, private opts: { fps: number; quality?: number } = { fps: 10 }) {}

  subscribe(fn: Subscriber): () => void {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
      if (this.subs.size === 0) this.stop();
    };
  }

  start(): void {
    if (this.timer) return;
    const interval = Math.max(1, Math.floor(1000 / this.opts.fps));
    this.timer = setInterval(() => void this.tick(), interval);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private async tick(): Promise<void> {
    if (this.busy || this.subs.size === 0) return;
    this.busy = true;
    try {
      const data = await this.page.screenshot({ type: "jpeg", quality: this.opts.quality ?? 60 });
      const frame: Frame = { data, url: this.page.url(), seq: ++this.seq };
      // Fan-out is isolated: one bad consumer (e.g. ws.send on a socket that
      // just closed) must not starve the others or kill the loop.
      for (const fn of this.subs) {
        try {
          fn(frame);
        } catch {
          // dead subscriber — it unsubscribes on its own close handler
        }
      }
    } catch {
      // transient (page navigating/closing) — skip this frame
    } finally {
      this.busy = false;
    }
  }

  input(controllerId: string, msg: InputMessage): void {
    if (!this.lock.has(controllerId)) return;
    // page.mouse/keyboard are stateful and NOT safe to drive concurrently, so we
    // apply input serially from a queue (in arrival order). But a real mouse fires
    // hundreds of moves/second: queued naively they back up and block keyboard/clicks
    // behind them ("keyboard stalls while moving"). So we COALESCE consecutive moves
    // — a run of hover moves collapses to just the latest position — while preserving
    // order across down/up/keys (a down breaks the run, so drags keep their path).
    const last = this.inputQueue[this.inputQueue.length - 1];
    if (msg.type === "mouse" && msg.action === "move" && last?.type === "mouse" && last.action === "move") {
      this.inputQueue[this.inputQueue.length - 1] = msg;
    } else {
      this.inputQueue.push(msg);
    }
    if (!this.draining) void this.drain();
  }

  private async drain(): Promise<void> {
    this.draining = true;
    try {
      let msg: InputMessage | undefined;
      while ((msg = this.inputQueue.shift())) {
        await this.applyInput(msg).catch((err) => console.error("viewer input failed", err));
      }
    } finally {
      this.draining = false;
    }
  }

  private async applyInput(msg: InputMessage): Promise<void> {
    if (msg.type === "mouse") {
      if (msg.action === "move") await this.page.mouse.move(msg.x ?? 0, msg.y ?? 0);
      else if (msg.action === "down") await this.page.mouse.down();
      else if (msg.action === "up") await this.page.mouse.up();
      else if (msg.action === "wheel") await this.page.mouse.wheel(msg.dx, msg.dy);
    } else {
      if (msg.action === "type") await this.page.keyboard.type(msg.text);
      else if (msg.action === "press") await this.page.keyboard.press(msg.key);
    }
  }

  /** Navigate the page for the current control holder; a no-op for anyone else. */
  async navigate(controllerId: string, url: string): Promise<void> {
    if (!this.lock.has(controllerId)) return;
    const normalized = normalizeNavigationUrl(url);
    if (!normalized) return;
    try {
      await this.page.goto(normalized, { waitUntil: "commit" });
    } catch {
      // bad host, timeout, etc. — a failed nav must not throw out of the hub
    }
  }
}

/**
 * Bare hosts (`example.com`) get an `https://` scheme assumed; anything with
 * an explicit scheme that isn't http/https (`javascript:`, `file:`, ...) is
 * rejected outright rather than handed to the page.
 */
function normalizeNavigationUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
}

/**
 * Hub registry keyed by profile id. Lives on globalThis so the custom server
 * and Next's route bundles share one hub per running profile (see global.ts).
 */
const hubs = () => globalSingleton("viewerHubs", () => new Map<string, ViewerHub>());

export function getOrCreateHub(profileId: string, page: ViewerPage, fps = 10): ViewerHub {
  const map = hubs();
  let hub = map.get(profileId);
  if (!hub) {
    hub = new ViewerHub(page, { fps });
    map.set(profileId, hub);
  }
  return hub;
}

/** Stop and forget a profile's hub — called when the profile stops or crashes. */
export function dropHub(profileId: string): void {
  const map = hubs();
  map.get(profileId)?.stop();
  map.delete(profileId);
}
