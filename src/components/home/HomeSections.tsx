import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { ReviewsSection } from "@/components/ReviewsSection";
import { HowItWorks } from "./HowItWorks";
import { AccountStrip } from "./AccountStrip";
import { WelcomeBack } from "./WelcomeBack";
import { NextSetCountdownCard } from "./NextSetCountdownCard";
import { PartnersStrip } from "./PartnersStrip";
import { PopularCardsCarousel } from "./PopularCardsCarousel";
import { ReturnVisitCards } from "./ReturnVisitCards";
import type { HomeData } from "./home-data";
import { COLORS, COLOR_KEYS } from "@/lib/constants";
import { ldJson } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";

// RiftCompare's HomeSections, in its order: (EbayPicks — the catalogue
// track's, slotted in through `ebayPicks`), the popular-cards carousel, the
// return-visit tiles, How it works, "Explore the database" (sets, then
// colours), the next-set line, reviews (only once there are enough), the
// account strip or welcome-back band, and the partners strip, plus the
// ItemList JSON-LD for the carousel's lists.
const NEW_DAYS = 45;
const SET_TILES = 12;

export function HomeSections({ data, storeCount, ebayPicks = null }: { data: HomeData; storeCount: number; ebayPicks?: React.ReactNode }) {
  const { cat } = data;
  const storeWord = storeCount === 1 ? "store" : "stores";
  const now = Date.parse(data.renderedAt);
  const today = data.renderedAt.slice(0, 10);
  const newCutoff = new Date(now - NEW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const sets = cat.sets
    .filter((s) => (s.kind === "booster" || s.kind === "extra") && s.releasedOn)
    .sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? ""))
    // Two rows of six on a desktop: the newest boosters, upcoming ones first.
    // Every older set is one click away ("Every set, starter deck and promo").
    .slice(0, SET_TILES);
  const colorCounts = Object.fromEntries(COLOR_KEYS.map((k) => [k, 0])) as Record<string, number>;
  for (const c of cat.cards) for (const k of c.colors) if (k in colorCounts) colorCounts[k]++;

  return (
    <>
      {ebayPicks}
      <PopularCardsCarousel
        popular={data.popular}
        popularKind={data.popularKind}
        chaseSetName={data.chaseSetName}
        movers={data.biggestMovers}
        recentlyUpdated={data.recentlyUpdated}
        storeCount={storeCount}
        storeWord={storeWord}
      />
      <Reveal stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:[&>*:last-child]:col-span-2 min-[1440px]:grid-cols-3 min-[1440px]:[&>*:last-child]:col-span-1">
        <ReturnVisitCards newestSetCode={data.newestSetCode} />
      </Reveal>
      <HowItWorks totalCards={cat.cards.length} />
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Explore the database</h2>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By set</div>
        <Reveal stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {sets.map((s) => {
            const upcoming = (s.releasedOn ?? "") > today;
            const isNew = !upcoming && (s.releasedOn ?? "") >= newCutoff;
            return (
              <Link
                key={s.id}
                href={`/sets/${s.slug}`}
                className="card-surface flex flex-col gap-1 p-4 transition-colors duration-200 hover:border-brand-500 hover:bg-ink-800"
              >
                <span className="flex flex-wrap items-center gap-1.5 text-lg font-bold text-white">
                  {s.code}
                  {upcoming ? <span className="chip bg-gold/20 text-gold">Coming soon</span> : null}
                  {isNew ? <span className="chip bg-up/20 font-bold uppercase tracking-wide text-up">New</span> : null}
                </span>
                <span className="text-xs text-slate-400">{s.name}</span>
              </Link>
            );
          })}
        </Reveal>
        <div className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Browse by colour</div>
        <Reveal stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {COLOR_KEYS.map((k) => (
            <Link
              key={k}
              href={`/colors/${COLORS[k].slug}`}
              className="card-surface flex flex-col gap-1 p-4 transition-colors duration-200 hover:border-brand-500 hover:bg-ink-800"
            >
              <span className="flex items-center gap-2 text-lg font-bold text-white">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[k].hex }} aria-hidden />
                {k}
              </span>
              <span className="text-xs text-slate-400">
                {COLORS[k].tagline} · <span className="num">{colorCounts[k].toLocaleString("en-US")}</span> printings
              </span>
            </Link>
          ))}
        </Reveal>
        <p className="mt-3 text-sm">
          <Link href="/sets" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Every set, starter deck and promo →
          </Link>
          <span className="mx-2 text-slate-600">·</span>
          <Link href="/leaders" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Every Leader, priced →
          </Link>
        </p>
      </section>
      {data.nextSet ? (
        <Reveal>
          <NextSetCountdownCard set={data.nextSet} now={now} />
        </Reveal>
      ) : null}
      <ReviewsSection />
      <AccountStrip />
      <WelcomeBack />
      <PartnersStrip />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson(
            data.popular.length
              ? {
                  "@context": "https://schema.org",
                  "@type": "ItemList",
                  name: data.popularKind === "popular" ? "Most popular One Piece cards" : `${data.chaseSetName ?? "Newest set"} chase cards`,
                  itemListElement: data.popular.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.card.name, url: `${SITE_URL}/card/${t.card.slug}` })),
                }
              : null,
            data.recentlyUpdated.length
              ? {
                  "@context": "https://schema.org",
                  "@type": "ItemList",
                  name: "Recently updated One Piece card prices",
                  itemListElement: data.recentlyUpdated.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.card.name, url: `${SITE_URL}/card/${t.card.slug}` })),
                }
              : null,
          ),
        }}
      />
    </>
  );
}
