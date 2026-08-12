"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type InputMessage =
  | { type: "mouse"; action: "move" | "down" | "up"; x?: number; y?: number }
  | { type: "mouse"; action: "wheel"; dx: number; dy: number }
  | { type: "key"; action: "type"; text: string }
  | { type: "key"; action: "press"; key: string };

type ConnState = "connecting" | "open" | "reconnecting" | "error";

/**
 * Map a viewport pointer position to a coordinate in the frame's bitmap space.
 * The frame is drawn with `object-contain`, so it is scaled to fit inside the
 * canvas element preserving aspect ratio and centered, leaving letterbox bars
 * when the element's aspect ratio differs from the frame's (most visibly in
 * fullscreen). This accounts for that scale and centering offset so clicks land
 * where the user aimed; keyboard input needs no coordinates, which is why it
 * kept working when this was wrong. Exported for unit testing.
 */
export function frameCoords(
  rect: { left: number; top: number; width: number; height: number },
  bmpW: number,
  bmpH: number,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const scale = Math.min(rect.width / bmpW, rect.height / bmpH) || 1;
  const offX = (rect.width - bmpW * scale) / 2;
  const offY = (rect.height - bmpH * scale) / 2;
  const x = (clientX - rect.left - offX) / scale;
  const y = (clientY - rect.top - offY) / scale;
  return {
    x: Math.round(Math.max(0, Math.min(bmpW, x))),
    y: Math.round(Math.max(0, Math.min(bmpH, y))),
  };
}

const FATAL_CODES: Record<number, string> = {
  4404: "Profile not found.",
  4429: "Too many profiles running — stop another profile first.",
  4409: "Profile is busy starting or stopping.",
  4500: "Browser failed to launch. Check the timeline for details.",
};

const MAX_BACKOFF_MS = 8000;
const BASE_BACKOFF_MS = 500;

/**
 * The live remote browser (design system §21-22 / UI spec §4). Opens the
 * viewer websocket itself — connecting is what starts the profile server
 * side (see viewer-handler.ts's attach()) — draws incoming JPEG frames onto
 * a canvas, and forwards mouse/keyboard/wheel as input messages while
 * holding the control lock.
 */
export function BrowserViewer({
  name,
  token,
  viewportHint,
}: {
  name: string;
  token: string;
  viewportHint: { width: number; height: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingUrlRef = useRef<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(BASE_BACKOFF_MS);
  const mountedRef = useRef(true);

  const [connState, setConnState] = useState<ConnState>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const [lock, setLock] = useState<{ holder: string | null; you: string | null }>({ holder: null, you: null });
  const [retryTick, setRetryTick] = useState(0);
  const [urlInput, setUrlInput] = useState("");
  const [urlFocused, setUrlFocused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const controlling = lock.you !== null && lock.holder === lock.you;
  const contestedBy = lock.holder !== null && lock.holder !== lock.you ? lock.holder : null;

  const handleFrame = useCallback(async (blob: Blob) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      return; // partial/corrupt frame — skip it, the next one will land
    }
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      setFrameSize({ width: bitmap.width, height: bitmap.height });
    }
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    if (pendingUrlRef.current) setFrameUrl(pendingUrlRef.current);
    if (mountedRef.current) setConnState("open");
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      setConnState((s) => (s === "error" ? "connecting" : s === "open" ? "reconnecting" : "connecting"));
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${proto}//${window.location.host}/viewer/${encodeURIComponent(name)}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          let msg: { type?: string; url?: string; holder?: string | null; you?: string | null };
          try {
            msg = JSON.parse(ev.data);
          } catch {
            return;
          }
          if (msg.type === "frameMeta" && msg.url) {
            pendingUrlRef.current = msg.url;
          } else if (msg.type === "lock") {
            setLock({ holder: msg.holder ?? null, you: msg.you ?? null });
            setConnState("open");
          }
        } else {
          void handleFrame(ev.data as Blob);
        }
      };

      ws.onclose = (ev) => {
        if (cancelled) return;
        wsRef.current = null;
        const reason = FATAL_CODES[ev.code];
        if (reason) {
          setConnState("error");
          setErrorMessage(reason);
          return;
        }
        setConnState("reconnecting");
        const delay = retryDelayRef.current;
        retryDelayRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);
        retryTimerRef.current = setTimeout(() => {
          if (!cancelled) connect();
        }, delay);
      };
    }

    connect();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
    // `retryTick` lets the manual Retry button force a fresh attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, token, handleFrame, retryTick]);

  useEffect(() => {
    if (controlling) canvasRef.current?.focus();
  }, [controlling]);

  // The address bar mirrors the live frame url, but never while the user is
  // mid-edit — otherwise every incoming frameMeta would fight their typing.
  useEffect(() => {
    if (!urlFocused) setUrlInput(frameUrl ?? "");
  }, [frameUrl, urlFocused]);

  useEffect(() => {
    function onFullscreenChange() {
      const active = document.fullscreenElement === containerRef.current;
      setIsFullscreen(active);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  function send(input: InputMessage) {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", input }));
  }

  function toBrowserCoords(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const canvas = canvasRef.current!;
    return frameCoords(canvas.getBoundingClientRect(), canvas.width, canvas.height, e.clientX, e.clientY);
  }

  function takeControl() {
    wsRef.current?.send(JSON.stringify({ type: "takeControl" }));
  }
  function releaseControl() {
    wsRef.current?.send(JSON.stringify({ type: "releaseControl" }));
  }
  function navigate(url: string) {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "navigate", url }));
  }
  function handleUrlSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = urlInput.trim();
    if (!value || connState !== "open") return;
    // Sent as two messages on the same socket, in order: the server applies
    // takeControl before it looks at navigate, so the lock is already ours.
    if (!controlling) takeControl();
    navigate(value);
    urlInputRef.current?.blur();
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerRef.current?.requestFullscreen();
    }
  }
  function reload() {
    send({ type: "key", action: "press", key: "F5" });
  }
  function screenshot() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  const aspect = frameSize ?? viewportHint;

  return (
    <div className="flex flex-col gap-3">
      <div className="border-neutral bg-base-100 flex items-center gap-3 rounded-md border px-3 py-2 font-mono text-[12px]">
        <ControlIndicator controlling={controlling} contestedBy={contestedBy} />
        <span className="text-secondary/50">·</span>
        <form onSubmit={handleUrlSubmit} className="flex min-w-0 flex-1 items-center gap-1.5">
          <input
            ref={urlInputRef}
            type="text"
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onFocus={() => setUrlFocused(true)}
            onBlur={() => setUrlFocused(false)}
            placeholder="about:blank"
            aria-label="Address"
            title={controlling ? undefined : "Navigating takes control"}
            className="text-secondary focus:text-base-content placeholder:text-secondary/50 min-w-0 flex-1 bg-transparent outline-none"
          />
          <button
            type="submit"
            disabled={connState !== "open" || urlInput.trim() === ""}
            title="Go"
            aria-label="Go to address"
            className="text-secondary hover:text-base-content shrink-0 disabled:opacity-30"
          >
            ↵
          </button>
        </form>
        {connState === "open" && (
          <span className="text-primary/80 inline-flex items-center gap-1 text-[10px] tracking-[0.15em]">
            <span aria-hidden>●</span> LIVE
          </span>
        )}
        <button
          type="button"
          onClick={reload}
          disabled={!controlling}
          title={controlling ? "Reload (F5)" : "Take control to reload"}
          className="text-secondary hover:text-base-content disabled:opacity-30"
          aria-label="Reload"
        >
          ↻
        </button>
      </div>

      <div
        ref={containerRef}
        className={`border-neutral relative overflow-hidden border bg-black ${isFullscreen ? "" : "rounded-lg"}`}
        style={isFullscreen ? undefined : { aspectRatio: `${aspect.width} / ${aspect.height}` }}
      >
        <canvas
          ref={canvasRef}
          tabIndex={controlling ? 0 : -1}
          className={`block h-full w-full object-contain ${controlling ? "cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]" : "cursor-default"}`}
          onMouseMove={(e) => controlling && send({ type: "mouse", action: "move", ...toBrowserCoords(e) })}
          onMouseDown={(e) => {
            if (!controlling) return;
            e.preventDefault();
            canvasRef.current?.focus();
            send({ type: "mouse", action: "move", ...toBrowserCoords(e) });
            send({ type: "mouse", action: "down" });
          }}
          onMouseUp={() => controlling && send({ type: "mouse", action: "up" })}
          onWheel={(e) => {
            if (!controlling) return;
            e.preventDefault();
            // Normalize to pixels: page.mouse.wheel() expects pixel deltas, but
            // wheel events fire in line mode (deltaMode 1, deltaY≈3) on Firefox and
            // some configs, or page mode (2). Passing those raw scrolls ~3px, which
            // reads as "scroll doesn't work." A pixel-mode event (Chrome) is passed
            // through unchanged.
            const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? (frameSize?.height ?? 800) : 1;
            send({ type: "mouse", action: "wheel", dx: e.deltaX * factor, dy: e.deltaY * factor });
          }}
          onContextMenu={(e) => controlling && e.preventDefault()}
          onKeyDown={(e) => {
            if (!controlling) return;
            e.preventDefault();
            const key = e.key;
            if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              send({ type: "key", action: "type", text: key });
            } else {
              send({ type: "key", action: "press", key });
            }
          }}
        />

        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          className="border-neutral/60 bg-base-100/70 text-secondary hover:text-base-content hover:border-neutral absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border text-[13px] backdrop-blur-sm transition-colors"
        >
          ⛶
        </button>

        {connState !== "open" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            {connState === "connecting" && (
              <span className="text-secondary font-mono text-[12px] tracking-[0.1em] uppercase">◌ starting</span>
            )}
            {connState === "reconnecting" && (
              <span className="text-accent animate-pulse font-mono text-[12px] tracking-[0.1em] uppercase">
                Reconnecting…
              </span>
            )}
            {connState === "error" && (
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="text-error font-mono text-[12px] tracking-[0.1em] uppercase">× {errorMessage}</span>
                <button
                  type="button"
                  className="btn btn-neutral btn-sm"
                  onClick={() => {
                    retryDelayRef.current = BASE_BACKOFF_MS;
                    setErrorMessage(null);
                    setRetryTick((t) => t + 1);
                  }}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {controlling ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={releaseControl}>
            Release
          </button>
        ) : (
          <button type="button" className="btn btn-neutral btn-sm" onClick={takeControl} disabled={connState !== "open"}>
            Take Control
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={screenshot} disabled={!frameSize}>
          Screenshot
        </button>
      </div>
    </div>
  );
}

function ControlIndicator({ controlling, contestedBy }: { controlling: boolean; contestedBy: string | null }) {
  if (controlling) {
    return (
      <span className="text-primary inline-flex items-center gap-1.5">
        <span aria-hidden>●</span> HUMAN CONTROL
      </span>
    );
  }
  if (contestedBy) {
    return (
      <span className="text-accent inline-flex items-center gap-1.5">
        <span aria-hidden>●</span> HUMAN CONTROL — {contestedBy}
      </span>
    );
  }
  return (
    <span className="text-secondary inline-flex items-center gap-1.5">
      <span aria-hidden>●</span> AUTOMATED
    </span>
  );
}
