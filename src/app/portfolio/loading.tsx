import { Skeleton } from "@/components/ui/Skeleton";

// SCOPED DELIBERATELY — never move this to src/app/loading.tsx: a loading.tsx
// streams its subtree, so a notFound() below it would answer 200. /portfolio has
// no dynamic child that calls notFound(). (A PortfolioSkeleton could
// replace this when the shell has one.)
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6" aria-busy="true" aria-label="Loading your binder">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="aspect-[5/7] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
