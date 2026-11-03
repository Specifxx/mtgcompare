// Pings IndexNow (Bing, Yandex, Seznam…) with the pages that change daily:
// the hubs, the newest sets and every product in a set from the last 45 days
// (new cards are the pages most worth getting crawled), plus the guides.
// At most 1,000 URLs a day. Bing Webmaster Tools also reads the sitemap.
import fs from "node:fs";
import path from "node:path";
import type { Catalog } from "@/lib/site-types";
import { SITE_URL } from "@/lib/site";
import { posts } from "@/lib/posts";

async function main() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return console.log("[indexnow] INDEXNOW_KEY not set — skipped");
  const site = SITE_URL;
  const cat = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/public/catalog.json"), "utf8")) as Catalog;
  const now = Date.now();
  const fresh = new Set(
    cat.sets.filter((s) => s.upcoming || (s.releasedOn && now - new Date(s.releasedOn).getTime() < 45 * 86_400_000)).map((s) => s.id),
  );
  const hubs = ["", "/cards", "/sets", "/sealed", "/movers", "/preorders", "/tools/deal-finder", "/tools/rising", "/blog"].map((p) => `${site}${p}`);
  const recent = cat.sets.filter((s) => s.productCount > 0).slice(0, 6).map((s) => `${site}/sets/${s.slug}`);
  const guides = posts().map((p) => `${site}/blog/${p.slug}`);
  const newCards = cat.products.filter((p) => fresh.has(p.setId)).map((p) => `${site}/card/${p.slug}`);
  const urls = [...new Set([...hubs, ...recent, ...guides, ...newCards])].slice(0, 1000);
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/indexnow-key.txt`, urlList: urls }),
  });
  console.log(`[indexnow] ${res.status} for ${urls.length} URLs`);
}
main();
