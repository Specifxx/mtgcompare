import { getDataRef, getSitemapPlan } from "@/lib/data";
import { publicDataHeaders } from "@/lib/data/plane/headers";
import { indexXml, sectionRefs } from "@/lib/sitemap-sections";

// /sitemap.xml: the INDEX of the sectioned sitemaps (contract 4.5, parity P01). A route handler, not app/sitemap.ts: a metadata route
// gets Next's own Cache-Control, which next.config.js headers() would double (measured), and one file of the real catalogue's roughly
// 58,000 URLs would be far past what a crawler wants. The plan comes from the published sm/plan.json at the commit the pointer names;
// each child carries the pointer's price day as lastmod. Rendered per request, cached by the CDN header of headers.json (rule 5, 12.7).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [plan, ptr] = await Promise.all([getSitemapPlan(), getDataRef()]);
    return new Response(indexXml(sectionRefs(plan), ptr?.priceDay), { headers: publicDataHeaders({ "content-type": "application/xml; charset=utf-8" }) });
  } catch {
    // the data host is unreachable and this instance holds nothing: say so, briefly, and let the CDN keep its last copy
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "retry-after": "120", "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" } });
  }
}
