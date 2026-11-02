import { buildAlertFeed } from "@/lib/alert-feed";

// The static price feed RiftCompare's shared alert service reads once a day
// (lib/alert-feed.ts). Built with the deploy and served as a file: no function
// runs for it, and only a release changes it.
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(buildAlertFeed()), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, s-maxage=86400" } });
}
