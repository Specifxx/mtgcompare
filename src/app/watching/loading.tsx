import { Skeleton, SkeletonText, SkeletonTile } from "@/components/ui/Skeleton";

// SCOPED DELIBERATELY (RiftCompare's /watching loading.tsx): never at the app
// root. A loading.tsx streams its segment, so a notFound() after the shell can
// only swap the UI, not the status — every unknown URL under it would answer
// 200. This route is safe: no children, its page calls redirect() (not
// notFound()) for a signed-out visitor, and it reads no searchParams. It
// exists so the navigation commits at once: /watching is force-dynamic
// (session read) and would otherwise hold the visitor on the previous page.
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl" role="status" aria-label="Loading your watchlist">
      <div className="mb-5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-8 w-56 sm:h-9" />
        <SkeletonText lines={2} className="mt-2 max-w-2xl" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonTile key={i} />
        ))}
      </div>
    </div>
  );
}
