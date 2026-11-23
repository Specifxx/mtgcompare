// A section's footnote as an info icon that opens in place (owner's review of the Black Friday page, 2026-11-24: "footnotes become
// tooltips"). A <details>, so it works without script, by keyboard and on touch.
export function InfoTip({ label = "How this is worked out", children }: { label?: string; children: React.ReactNode }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-muted hover:text-ink">
        <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full border border-current text-[11px] font-bold">
          i
        </span>
        {label}
      </summary>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">{children}</p>
    </details>
  );
}
