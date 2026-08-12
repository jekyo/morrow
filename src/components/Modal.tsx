"use client";

import { useEffect, type ReactNode } from "react";

/**
 * System-dialog shell (design system §30): centered panel over a dim
 * backdrop, no glassmorphism. Esc closes; backdrop click closes unless
 * `busy` (an in-flight request shouldn't be dismissable mid-submit).
 */
export function Modal({
  title,
  onClose,
  busy,
  children,
  widthClassName = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
  widthClassName?: string;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`border-neutral bg-base-200 w-full ${widthClassName} rounded-[10px] border p-6 shadow-lg`}
      >
        <h2 className="text-base-content text-lg font-semibold">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
