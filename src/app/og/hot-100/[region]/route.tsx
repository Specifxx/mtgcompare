import { cardsFor } from "@/content/guides/more-data";
import { money } from "@/lib/format";
import { hotChart, hotDrops } from "@/lib/hot100";
import { hotCard } from "@/lib/og/hot100-card";
import { readPriceHistory } from "@/lib/price-history";
import { regionOrNotFound } from "@/lib/regions";
import { formatRelease } from "@/lib/release";
import { SITE_URL } from "@/lib/site";

// /og/hot-100/<region>: the Hot 100's share card (lib/og/hot100-card.tsx): the week's three biggest rises beside its three
// biggest drops (owner, 2026-11-20), each with its real change and prices. Drawn on its first request from the public data files and kept by Vercel's CDN for a
// day, like /og/p (never prerendered: it reads the product files). The page's og:image carries the week (?w=), so a link
// posted after a release never shows last week's picture from a cache.
export const dynamic = "force-dynamic";

const CDN = "public, s-maxage=86400, stale-while-revalidate=86400";

const NOUN = "Magic sealed";

export async function GET(_req: Request, { params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const history = readPriceHistory();
  const c = hotChart(history, r.market);
  const top = (c?.rows ?? []).slice(0, 3);
  const falls = hotDrops(history, r.market, 3);
  const all = [...top, ...falls];
  const cards = all.length ? await cardsFor(r.market, all.map((x) => x.slug)).catch(() => []) : [];
  const bySlug = new Map(cards.map((x) => [x.slug, x]));
  const draw = (list: typeof all) =>
    list.flatMap((row) => {
      const card = bySlug.get(row.slug);
      return card ? [{ rank: row.rank, name: card.name, imageUrl: card.imageUrl, pct: row.pct, before: money(row.before, r.market), after: money(row.after, r.market), stores: row.stores }] : [];
    });
  const res = await hotCard({
    region: r.name,
    noun: NOUN,
    through: c ? formatRelease(c.through) : "this week",
    total: c?.rows.length ?? 0,
    path: `${new URL(SITE_URL).host}/${r.region}/hot-100`,
    where: `${r.adjective} stores`,
    rows: draw(top),
    drops: draw(falls),
  });
  res.headers.set("Cache-Control", "public, max-age=3600");
  res.headers.set("CDN-Cache-Control", CDN);
  res.headers.set("Vercel-CDN-Cache-Control", CDN);
  return res;
}
