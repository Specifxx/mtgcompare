import { indexFiles, indexXml } from "@/lib/sitemap";
import { readMeta } from "@/lib/store";
import { LIVE_GAMES, SITE } from "@/site.config";

export const dynamic = "force-dynamic";
export function GET() {
  const meta = readMeta();
  const files = indexFiles(LIVE_GAMES.map((g) => ({ slug: g.slug, indexed: meta.games[g.slug]?.indexed ?? 0 })));
  return new Response(indexXml(SITE.url, files), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
