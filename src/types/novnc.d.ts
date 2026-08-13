// Minimal typings for @novnc/novnc (RFB client). The library ships no types;
// we declare only the surface VncViewer uses. See https://github.com/novnc/noVNC.
declare module "@novnc/novnc" {
  export interface RFBOptions {
    credentials?: { username?: string; password?: string; target?: string };
    shared?: boolean;
    repeaterID?: string;
    wsProtocols?: string[];
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: RFBOptions);
    /** Scale the remote framebuffer to fit the container. */
    scaleViewport: boolean;
    /** Ask the server to resize its session to the container (unsupported here). */
    resizeSession: boolean;
    /** CSS background shown around a letterboxed framebuffer. */
    background: string;
    /** Grab keyboard focus when the canvas is clicked. */
    focusOnClick: boolean;
    /** Whether the view is view-only (no input sent). */
    viewOnly: boolean;
    disconnect(): void;
    sendCredentials(credentials: { username?: string; password?: string }): void;
  }
}
