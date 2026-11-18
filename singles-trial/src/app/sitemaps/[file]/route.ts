import { cardEntries, cardFiles, setEntries, urlsetXml, type Entry } from "@/lib/sitemap";
import { readMeta, readSet, readSets } from "@/lib/store";
import { LIVE_GAMES, SITE, gameBySlug } from "@/site.config";

export const dynamic = "force-dynamic";
const xml = (entries: Entry[]) => new Response(urlsetXml(SITE.url, entries), { headers: { "Content-Type": "application/xml; charset=utf-8" } });

export function GET(_req: Request, { params }: { params: { file: string } }) {
  const name = params.file.replace(/\.xml$/, "");
  const meta = readMeta();
  if (name === "pages") {
    const day = meta.generatedAt.slice(0, 10) || undefined;
    return xml([{ path: "/", lastmod: day }, ...LIVE_GAMES.filter((g) => (meta.games[g.slug]?.indexed ?? 0) > 0).map((g) => ({ path: `/${g.slug}`, lastmod: day })), { path: "/about" }]);
  }
  const m = /^([a-z0-9-]+?)-(sets|cards-(\d+))$/.exec(name);
  const game = m && gameBySlug(m[1]);
  if (!m || !game) return new Response("Not found", { status: 404 });
  const { sets, generatedAt } = readSets(game.slug);
  if (m[2] === "sets") return xml(setEntries(game.slug, sets, generatedAt.slice(0, 10) || undefined));
  const n = Number(m[3]);
  if (n < 1 || n > cardFiles(meta.games[game.slug]?.indexed ?? 0)) return new Response("Not found", { status: 404 });
  return xml(cardEntries(game.slug, sets, (s) => readSet(game.slug, s), n));
}
