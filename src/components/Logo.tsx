export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="rgb(var(--brand))" />
      <path d="M18 16h14c10 0 16 6.5 16 16s-6 16-16 16H18z" fill="#fff" />
      <path d="M26 24h5.5c5 0 8 3 8 8s-3 8-8 8H26z" fill="rgb(var(--brand))" />
      <rect x="18" y="30" width="30" height="4" fill="rgb(var(--brand))" />
    </svg>
  );
}

/**
 * The mark and the wordmark. `wordmark` sets when the word shows: the header passes "hidden sm:inline", so a phone's one row keeps
 * its width for the search box (the mark alone is the home link there, named by the link's aria-label).
 */
export function Logo({ wordmark = "" }: { wordmark?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark className="h-8 w-8 shrink-0" />
      <span className={`font-display text-[19px] font-extrabold tracking-tight ${wordmark}`}>
        Dex<span className="text-brand">Compare</span>
      </span>
    </span>
  );
}
