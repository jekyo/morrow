/** Mono code block on base-200, matching the design system's terminal/log surface treatment. */
export function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div className="border-neutral bg-base-200 my-4 overflow-hidden rounded-lg border">
      {label && (
        <div className="border-neutral text-secondary/70 border-b px-4 py-1.5 font-mono text-[10px] tracking-[0.15em] uppercase">
          {label}
        </div>
      )}
      <pre className="overflow-x-auto px-4 py-3">
        <code className="text-base-content/90 font-mono text-[13px] leading-relaxed">{children}</code>
      </pre>
    </div>
  );
}
