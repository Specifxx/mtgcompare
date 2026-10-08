import type { Metadata } from "next";
import Link from "next/link";
import { FilterableArticles, type ArticleListItem, type ArticleSection } from "@/components/FilterableArticles";
import { Breadcrumbs, JsonLd } from "@/components/ui";
import { POSTS, postHref } from "@/lib/blog";
import { postContext } from "@/lib/blog/context";
import { GUIDE_PICKS } from "@/lib/content/featured";
import { getCountry } from "@/lib/get-country";
import { breadcrumbLd, itemListLd } from "@/lib/jsonld";
import { pageOg } from "@/lib/og/meta";

// Topic clusters for the unfiltered view, matched by tag (first section wins).
const GUIDE_SECTIONS: ArticleSection[] = [
  { title: "Buying & value", accent: "#eab308", tags: ["buying", "stores", "markets", "sealed", "booster box"] },
  { title: "Collecting & card knowledge", accent: "#a855f7", tags: ["collecting", "rarity", "printings", "treatments", "condition", "chase cards"] },
  { title: "Getting started", accent: "#06b6d4", tags: ["beginners", "budget", "rules", "deckbuilding"] },
];

const TOOL_LINKS = [
  { href: "/browse", label: "Card database" },
  { href: "/tools/best-basket", label: "Best Basket" },
  { href: "/tools/box-ev", label: "Box EV calculator" },
  { href: "/movers", label: "Price movers" },
  { href: "/market", label: "MTG Compare Index" },
];

export const metadata: Metadata = {
  title: "Magic: The Gathering Guides: Rarities, Where to Buy & More",
  description: "Evergreen Magic: The Gathering guides: what the rarities mean, where to buy in each market, and whether cards are cheaper abroad, with live figures from MTG Compare's own data.",
  alternates: { canonical: "/guides" },
  openGraph: pageOg("/guides"),
};

export default async function GuidesPage() {
  const ctx = await postContext(getCountry());
  const guides = POSTS.filter((p) => p.category === "guide");
  const items: ArticleListItem[] = guides.map((p) => ({
    slug: p.slug,
    href: postHref(p),
    title: p.title(ctx),
    excerpt: p.description,
    tags: p.tags.filter((t) => t !== "guide"),
    date: p.date,
    minutes: p.minutes,
    hero: p.build(ctx).heroCards.slice(0, 3).map((c) => c.id),
  }));
  return (
    <div>
      <JsonLd data={itemListLd("Magic: The Gathering guides", "/guides", items.map((i) => ({ name: i.title, path: i.href })))} />
      <Breadcrumbs trail={[{ name: "Guides" }]} />
      <h1 className="text-2xl font-extrabold text-white">Guides</h1>
      <div className="mt-3 max-w-3xl space-y-2 text-[15px] leading-relaxed text-slate-300">
        <p>
          Guides are the reference side of MTG Compare: what the rarities mean, how the markets we cover compare, and how to buy without overpaying. They are revised when the data changes rather than left to date, and most point you at the tool that does what the guide describes.
        </p>
        <p>
          Every figure in a guide is drawn from our own price data when the page loads. See{" "}
          <Link href="/authors" className="text-brand-400 hover:underline">who writes them</Link>, our{" "}
          <Link href="/editorial-policy" className="text-brand-400 hover:underline">editorial policy</Link> and{" "}
          <Link href="/methodology" className="text-brand-400 hover:underline">how prices are collected</Link>. Looking for dated market analysis and set reviews? That is the{" "}
          <Link href="/blog" className="text-brand-400 hover:underline">blog</Link>.
        </p>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-slate-500">Tools these guides explain:</span>
        {TOOL_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="tap-link font-semibold text-brand-400 hover:underline">
            {l.label}
          </Link>
        ))}
      </p>
      <div className="mt-4">
        <FilterableArticles articles={items} sections={GUIDE_SECTIONS} featured={GUIDE_PICKS} />
      </div>
    </div>
  );
}
