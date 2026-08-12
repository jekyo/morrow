/**
 * Morrow brand mark: an "M" of twin peaks framing a rising sun over the horizon
 * — "browsers that remember" / a new day. Recreated from the brand board in the
 * design-system palette. Kept in sync with src/app/icon.svg (the favicon).
 */

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="14" fill="#13161A" />
      <defs>
        <linearGradient id="morrowSun" x1="32" y1="28" x2="32" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFC98F" />
          <stop offset="1" stopColor="#E56F24" />
        </linearGradient>
      </defs>
      <path d="M22 46a10 10 0 0 1 20 0z" fill="url(#morrowSun)" />
      <g stroke="#F5F1EA" strokeWidth="2.2" strokeLinecap="round">
        <path d="M15 46h5" />
        <path d="M44 46h5" />
      </g>
      <path
        d="M13 48V22l19 18 19-18v26"
        stroke="#F5F1EA"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark + wordmark lockup. `wordmark` defaults to the lowercase brand hero style. */
export function Logo({
  size = 32,
  showWordmark = true,
  className,
}: {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark size={size} />
      {showWordmark && (
        <span className="font-semibold tracking-tight text-base-content" style={{ fontSize: size * 0.62 }}>
          morrow
        </span>
      )}
    </span>
  );
}
