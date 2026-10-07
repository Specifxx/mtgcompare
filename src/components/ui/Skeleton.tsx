// Loading placeholders. `Skeleton`/`SkeletonText`/`SkeletonTile` are for
// perceived-performance shells (route loading.tsx files, card grids arriving
// over a slow connection); `Spinner` replaces the hand-rolled
// `animate-spin` borders that used to be copy-pasted per component
// (QuickView, RouteLoading, PremiumDialog's checkout button, AuthForm).

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-800 motion-reduce:animate-none ${className}`} />;
}

export function SkeletonText({ lines = 2, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/** Mirrors CardTile's shape: an aspect-[5/7] image block + two text lines. */
export function SkeletonTile({ className = "" }: { className?: string }) {
  return (
    <div className={`card-surface overflow-hidden ${className}`}>
      <Skeleton className="aspect-[5/7] w-full rounded-none" />
      <div className="space-y-1.5 p-2.5">
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

const SPINNER_SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-2",
};

export function Spinner({ size = "sm", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-ink-600 border-t-brand-400 motion-reduce:animate-none ${SPINNER_SIZE[size]} ${className}`}
    />
  );
}
