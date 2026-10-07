import { MoversSkeleton } from "@/components/RouteLoading";

// SCOPED DELIBERATELY — never move this to src/app/loading.tsx.
//
// A loading.tsx wraps its whole segment subtree in a Suspense boundary, which
// makes Next stream the response: the shell flushes with a committed HTTP 200
// before the page component runs. A notFound() thrown after that can only swap
// the UI, not the status — so every unknown /card/…, /sets/… URL
// returned "200 OK" with the 404 page rendered inside it. Google treats
// HTTP-200 error pages as a quality problem and will happily crawl an unlimited
// supply of them.
//
// This route has no dynamic child that calls notFound(), so the boundary is
// safe here. scripts/adsense-guard.ts fails the build if a loading.tsx appears
// at the app root, or in any segment that has a notFound()-calling descendant.
export default function Loading() {
  return <MoversSkeleton />;
}
