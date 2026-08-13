"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
// @novnc/novnc's package `exports` maps the root to core/rfb.js. RFB does all
// the work: framebuffer rendering onto a canvas it creates, plus
// mouse/keyboard/clipboard — the reason this replaces the bespoke
// screencast+input viewer. Types are declared in src/types/novnc.d.ts.
import RFB from "@novnc/novnc";

type Status = "connecting" | "connected" | "disconnected";

/**
 * Full remote view of a profile's browser over noVNC. Connects to Morrow's
 * `/vnc/:name` websocket, which proxies straight to the profile's x11vnc
 * (see src/server/vnc-handler.ts). All input and rendering is handled by the
 * battle-tested RFB client — no custom event forwarding.
 */
export function VncViewer({ name, token }: { name: string; token: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [detail, setDetail] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;
    let disposed = false;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/vnc/${encodeURIComponent(name)}?token=${encodeURIComponent(token)}`;

    setStatus("connecting");
    setDetail("");

    const rfb = new RFB(el, url, {});
    rfbRef.current = rfb;
    // Fit the remote 1280×800 desktop into whatever space we have, keeping it
    // interactive. We don't resize the server session (fixed Xvfb geometry);
    // noVNC re-fits on container resize, so entering fullscreen just works.
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.background = "transparent";
    rfb.focusOnClick = true;

    const onConnect = () => { if (!disposed) setStatus("connected"); };
    const onDisconnect = (e: Event) => {
      if (disposed) return;
      const clean = (e as CustomEvent<{ clean?: boolean }>).detail?.clean;
      setStatus("disconnected");
      setDetail(clean ? "the browser session ended" : "connection lost");
    };
    rfb.addEventListener("connect", onConnect);
    rfb.addEventListener("disconnect", onDisconnect);

    return () => {
      disposed = true;
      rfb.removeEventListener("connect", onConnect);
      rfb.removeEventListener("disconnect", onDisconnect);
      try { rfb.disconnect(); } catch { /* already gone */ }
      rfbRef.current = null;
    };
  }, [name, token]);

  // Keep local state in sync with the actual fullscreen element (covers the
  // Esc key and browser-native exit paths, not just our button).
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void frameRef.current?.requestFullscreen().catch(() => {});
    }
  }, []);

  return (
    <div
      ref={frameRef}
      className="group relative w-full overflow-hidden rounded-box border border-base-300 bg-base-200 data-[fs=true]:flex data-[fs=true]:h-screen data-[fs=true]:items-center data-[fs=true]:justify-center data-[fs=true]:rounded-none data-[fs=true]:border-0 data-[fs=true]:bg-black"
      data-fs={isFullscreen}
      style={isFullscreen ? undefined : { aspectRatio: "1280 / 800" }}
    >
      <div
        ref={screenRef}
        className="h-full w-full data-[fs=true]:absolute data-[fs=true]:inset-0"
        data-fs={isFullscreen}
      />

      {status === "connected" && (
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          className="btn btn-circle btn-sm absolute right-3 top-3 z-10 border-0 bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
        >
          {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </button>
      )}

      {status !== "connected" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-base-200/80">
          {status === "connecting" && <span className="loading loading-spinner loading-lg text-primary" />}
          <span className="text-sm text-base-content/70">
            {status === "connecting" ? "Connecting to the browser…" : detail || "Disconnected"}
          </span>
          {status === "disconnected" && (
            <button
              className="btn btn-sm btn-primary pointer-events-auto"
              onClick={() => { rfbRef.current?.disconnect(); location.reload(); }}
            >
              Reconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
