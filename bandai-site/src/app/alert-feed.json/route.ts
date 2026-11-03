import { SITE } from "@/site.config";
import { buildAlertFeed } from "@/lib/alert-feed";

// The static price feed RiftCompare's shared alert service reads once a day
// (lib/alert-feed.ts). Built with the deploy, served from the CDN: no function
// runs for it. A site with alerts off serves an empty feed.
export const revalidate = 86400;

export function GET() {
  const feed = SITE.priceAlerts ? buildAlertFeed() : { v: 1, site: SITE.key, generatedAt: new Date().toISOString(), items: {}, deals: [] };
  return new Response(JSON.stringify(feed), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, s-maxage=86400" } });
}
