"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type InputMessage =
  | { type: "mouse"; action: "move" | "down" | "up"; x?: number; y?: number }
  | { type: "mouse"; action: "wheel"; dx: number; dy: number }
  | { type: "key"; action: "type"; text: string }
  | { type: "key"; action: "press"; key: string };

type ConnState = "connecting" | "open" | "reconnecting" | "error";

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

  function send(input: InputMessage) {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", input }));
  }

  function toBrowserCoords(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: Math.round((e.clientX - rect.left) * scaleX), y: Math.round((e.clientY - rect.top) * scaleY) };
  }

  function takeControl() {
    wsRef.current?.send(JSON.stringify({ type: "takeControl" }));
  }
  function releaseControl() {
    wsRef.current?.send(JSON.stringify({ type: "releaseControl" }));
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
        <span className="text-secondary min-w-0 flex-1 truncate">{frameUrl ?? "about:blank"}</span>
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
        className="border-neutral relative overflow-hidden rounded-lg border bg-black"
        style={{ aspectRatio: `${aspect.width} / ${aspect.height}` }}
      >
        <canvas
          ref={canvasRef}
          tabIndex={controlling ? 0 : -1}
          className={`block h-full w-full ${controlling ? "cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]" : "cursor-default"}`}
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
            send({ type: "mouse", action: "wheel", dx: e.deltaX, dy: e.deltaY });
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
