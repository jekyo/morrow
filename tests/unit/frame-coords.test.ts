import { describe, it, expect } from "vitest";
import { frameCoords } from "@/components/BrowserViewer";

const bmp = { w: 1280, h: 720 };

describe("frameCoords", () => {
  it("maps a matching-aspect element (no letterbox) like a plain scale", () => {
    // element 640x360 at origin, same 16:9 aspect as the 1280x720 frame
    const rect = { left: 0, top: 0, width: 640, height: 360 };
    expect(frameCoords(rect, bmp.w, bmp.h, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(frameCoords(rect, bmp.w, bmp.h, 320, 180)).toEqual({ x: 640, y: 360 });
    expect(frameCoords(rect, bmp.w, bmp.h, 640, 360)).toEqual({ x: 1280, y: 720 });
  });

  it("accounts for the element offset on the page", () => {
    const rect = { left: 100, top: 50, width: 640, height: 360 };
    expect(frameCoords(rect, bmp.w, bmp.h, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(frameCoords(rect, bmp.w, bmp.h, 420, 230)).toEqual({ x: 640, y: 360 });
  });

  it("accounts for horizontal-bar letterbox in fullscreen (element taller than frame)", () => {
    // fullscreen 1920x1200 (16:10), frame 1280x720 (16:9) → scale 1.5, 60px bars top/bottom
    const rect = { left: 0, top: 0, width: 1920, height: 1200 };
    // center of the visible content maps to frame center
    expect(frameCoords(rect, bmp.w, bmp.h, 960, 600)).toEqual({ x: 640, y: 360 });
    // top edge of the content (y = 60px bar) maps to y=0
    expect(frameCoords(rect, bmp.w, bmp.h, 960, 60)).toEqual({ x: 640, y: 0 });
    // a click inside the top letterbox bar clamps to 0, not negative
    expect(frameCoords(rect, bmp.w, bmp.h, 960, 20).y).toBe(0);
  });

  it("accounts for vertical-bar letterbox (element wider than frame)", () => {
    // ultrawide 2560x720, frame 1280x720 → scale 1, 640px bars left/right
    const rect = { left: 0, top: 0, width: 2560, height: 720 };
    expect(frameCoords(rect, bmp.w, bmp.h, 1280, 360)).toEqual({ x: 640, y: 360 });
    expect(frameCoords(rect, bmp.w, bmp.h, 640, 360)).toEqual({ x: 0, y: 360 });
    expect(frameCoords(rect, bmp.w, bmp.h, 100, 360).x).toBe(0); // in the left bar, clamped
  });
});
