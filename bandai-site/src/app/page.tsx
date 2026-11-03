import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { SearchBox } from "@/components/SearchBox";
import { MarketChooser } from "@/components/ClientPrefs";
import { CreatorsTeaser } from "@/components/creators/CreatorsTeaser";
import { CardAdPair } from "@/components/CardAds";
import { adSearch, cardAds } from "@/lib/card-ads";
import { AdSlot } from "@/components/AdSlot";
import { HalloweenBanner } from "@/components/HalloweenDecor";
import { ChristmasDecor } from "@/components/ChristmasDecor";
import { ChristmasGifts } from "@/components/ChristmasGifts";
import { TileGrid } from "@/components/ProductTile";
import { byValue, deals, latestReleasedSet, meta, movers, products, productsInSet, sets } from "@/lib/data";
import { ago, money, pct } from "@/lib/format";
import { posts } from "@/lib/posts";
import { shortName } from "@/lib/names";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL } from "@/lib/site";
import { TOOLS } from "@/lib/tool-list";
import type { Metadata } from "next";
import { fitTitle } from "@/lib/seo-title";
import { featuredSealed, preorderSetList, sealedHubs } from "@/lib/hubs";
import { isPreorder, longDate, preorderPath } from "@/lib/preorders";
import { inSeason as bfSeason } from "@/lib/black-friday";
import { CORE_SALES, salesInSeason } from "@/lib/sale-seasons";
import { gradeHubs, kits, kitsOn, popular } from "@/lib/kits";
import { KitGrid } from "@/components/KitTile";
import { SealedHero } from "@/components/SealedHero";
import { SiteReviews } from "@/components/site-reviews/SiteReviews";
import { sealedHero } from "@/lib/sealed-hero";
import { GameTiles } from "@/components/GameTiles";

// The homepage leads with "<game> Card Prices" and the number of stores compared, as Rift Compare's does.
export function generateMetadata(): Metadata {
  const n = SITE.stores.length;
  // Keyword first, brand last (SEO audit, 2026-11-03: a long game name pushed the brand off Cyberpunk's title). Every
  // candidate is tried with the brand before any is tried bare.
  const g = SITE.gameShort;
  const brand = ` | ${SITE.name}`;
  const title = fitTitle([`${g} Card Prices — Compare ${n} Stores${brand}`, `${g} Card Prices — ${n} Stores${brand}`, `${g} Card Prices${brand}`, `${g} Card Prices — Compare ${n} Stores`, `${g} Card Prices`]);
  return {
    title,
    description: `Compare ${SITE.game} card and booster box prices across TCGplayer, eBay and ${n} online stores. Cheapest in-stock first, in your currency, updated daily.`,
    alternates: { canonical: "/", types: { "application/rss+xml": "/feed.xml" } },
    openGraph: { type: "website", siteName: SITE.name, url: "/", title: title.absolute },
  };
}

export const revalidate = 21600;

export default function Home() {
  const m = meta();
  const latest = latestReleasedSet();
  const releases = preorderSetList();
  const upcoming = releases.find((s) => isPreorder(s)) ?? null;
  const chase = latest ? byValue(productsInSet(latest.id).filter((p) => p.kind === "card")).slice(0, 12) : [];
  const mv = movers(7, 300);
  const topDeals = deals(6);
  const shelf = featuredSealed(6);
  const sealedLinks = sealedHubs();
  // Sealed-led sites (SITE.homeSealedHero) open with the big sealed hero; it replaces the plain shelf below.
  const hero = SITE.homeSealedHero ? sealedHero() : null;
  const storeCount = SITE.stores.length;
  const faqs = [
    { q: `What is ${SITE.name}?`, a: `${SITE.name} is a free ${SITE.game} price comparison site. It compares prices for every ${SITE.gameShort} card and sealed product across TCGplayer, eBay and ${storeCount} online game stores in the US, UK, Canada, Australia and Europe, and updates them every day.` },
    { q: `Where is the cheapest place to buy ${SITE.gameShort} cards?`, a: `It changes card by card. Search a card on ${SITE.name} to see every store's price for it, cheapest in-stock first, in your own currency, with a direct link to buy.` },
    { q: `How often are ${SITE.gameShort} prices updated?`, a: `Every day. TCGplayer prices and store listings refresh daily; eBay listings for cards worth $20 or more are re-checked every one to four days depending on value and demand.` },
    { q: `Is ${SITE.name} free?`, a: `Yes, completely, and you don't need an account. ${SITE.name} is paid for by affiliate commissions: when you buy through some links, the store may pay us a small fee at no cost to you.` },
  ];
  return (
    <div className="flex flex-col gap-10">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", "@id": `${SITE_URL}/#org`, name: SITE.name, url: SITE_URL, logo: `${SITE_URL}/icon.svg` }} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, url: SITE_URL, publisher: { "@id": `${SITE_URL}/#org` }, potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/cards?q={q}`, "query-input": "required name=q" } }} />
      {/* The products on this page, by their own URLs: the shelf and the newest set's chase cards (SEO audit, 2026-11-03). */}
      {shelf.length + chase.length > 0 && (
        <JsonLd data={{ "@context": "https://schema.org", "@type": "ItemList", name: `${SITE.gameShort} sealed and chase card prices`, itemListElement: [...shelf, ...chase].map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/card/${p.slug}`, name: p.name })) }} />
      )}
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />

      <section className={`hero-band relative -mx-4 overflow-hidden rounded-none px-4 md:rounded-2xl ${hero ? "py-6 md:py-9" : "py-10 md:py-14"}`}>
        {/* Christmas (1 November to Boxing Day): snow, lights, trees. */}
        <ChristmasDecor />
        <ChristmasGifts />
        <h1 className={`font-display font-black ${hero ? "text-2xl md:text-4xl" : "text-3xl md:text-5xl"}`}>
          <span className="wordmark">{SITE.gameShort}</span> card prices, every store, one search
        </h1>
        {/* With the sealed hero, a phone gets the title and goes straight to the boxes: the header already has the search and the market. */}
        <p className={`mt-3 max-w-2xl text-muted ${hero ? "hidden sm:block" : ""}`}>
          Compare {m?.counts.cards.toLocaleString() ?? "every"} {SITE.gameShort} cards and {m?.counts.sealed ?? ""} sealed products across TCGplayer, eBay and {storeCount} stores — in your currency, updated daily.
        </p>
        <MarketChooser className={hero ? "mt-5 hidden sm:flex" : "mt-5"} />
        <div className={`mt-4 max-w-2xl ${hero ? "hidden sm:block" : ""}`}><SearchBox big /></div>
        <p className="mt-3 text-xs text-muted">
          {m ? `Prices updated ${ago(m.updatedAt)} · ${m.counts.offers.toLocaleString()} live prices` : "Prices update daily"}
          {upcoming && <> · <Link className="link" href={preorderPath(upcoming)}>{upcoming.name} pre-orders →</Link></>}
        </p>
        {/* With the sealed hero right below, its own links replace this row (one screen less to scroll on a phone). */}
        {!hero && <div className="mt-4 flex flex-wrap gap-2">
          <Link href={sealedLinks.some((h) => h.slug === "booster-box") ? "/sealed/booster-box" : "/sealed"} className="btn-primary">Booster box prices</Link>
          <Link href="/sealed" className="btn-ghost">All sealed products</Link>
          <Link href="/cards" className="btn-ghost">Card prices</Link>
          {SITE.kits && kitsOn() && <Link href="/kits" className="btn-ghost">{SITE.kits.label} prices</Link>}
        </div>}
      </section>

      {/* Multi-game sites (SITE.lines): one tile per game, straight under the hero. */}
      <GameTiles />

      {hero && hero.featured.length > 0 && (
        <SealedHero data={hero} game={SITE.gameShort} sealedHref={sealedLinks.some((h) => h.slug === "booster-box") ? "/sealed/booster-box" : "/sealed"} />
      )}

      <HalloweenBanner />
      {/* Ad banners near the top of the homepage, as on Rift Compare: real
          cards on eBay (the visitor's market) and on TCGplayer under the hero,
          then one display slot (lib/card-ads.ts). */}
      <CardAdPair ads={cardAds({ kind: "card", limit: 12 })} page="home" {...adSearch()} ebayTitle={`Chase ${SITE.gameShort} cards on eBay right now`} tcgTitle={`Top ${SITE.gameShort} cards on TCGplayer`} />
      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME} />
      <CreatorsTeaser />

      {/* Sealed is as big a market as singles: it gets the first shelf. */}
      {shelf.length > 0 && !(hero && hero.featured.length > 0) && (
        <section>
          <Header title={`${SITE.gameShort} booster boxes and sealed`} href="/sealed" sub="Newest sets first. Open one to compare every store." />
          <TileGrid items={shelf} />
          {sealedLinks.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {sealedLinks.map((h) => (
                <Link key={h.slug} href={`/sealed/${h.slug}`} className="chip hover:border-brand/60 hover:text-fg">{h.label} ({h.items.length})</Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Model kits (SITE.kits): the kits most shops have in stock. */}
      {SITE.kits && kitsOn() && (
        <section>
          <Header title={`${SITE.kits.label} prices`} href="/kits" sub={`${kits().length.toLocaleString()} ${SITE.kits.noun} across ${SITE.kits.stores.length} hobby shops, matched by barcode.`} />
          <KitGrid items={popular(kits()).slice(0, 6)} />
          <div className="mt-3 flex flex-wrap gap-2">
            {gradeHubs().map((h) => (
              <Link key={h.slug} href={`/kits/grade/${h.slug}`} className="chip hover:border-brand/60 hover:text-fg">{h.label} ({h.items.length})</Link>
            ))}
          </div>
        </section>
      )}

      {topDeals.length > 0 && (
        <section>
          <Header title="Today's top deals" href="/tools/deal-finder" sub="In-stock listings below TCGplayer market" />
          {bfSeason((meta()?.updatedAt ?? new Date().toISOString()).slice(0, 10)) && (
            <p className="mb-3 text-sm"><Link className="link" href="/black-friday">Black Friday and Cyber Monday deals, updated daily →</Link></p>
          )}
          {salesInSeason(CORE_SALES, (meta()?.updatedAt ?? new Date().toISOString()).slice(0, 10)).map((s) => (
            <p key={s.slug} className="mb-3 text-sm"><Link className="link" href={`/${s.slug}`}>{s.linkLabel}, updated daily →</Link></p>
          ))}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topDeals.map((d) => (
              <Link key={`${d.p.id}${d.offer.source}`} href={`/card/${d.p.slug}`} className="card-surface flex min-w-0 items-center gap-3 p-3 hover:border-brand/60">
                {d.p.image && <img src={d.p.image} alt={d.p.name} className="h-20 w-14 object-contain" loading="lazy" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{shortName(d.p.name)}</p>
                  <p className="text-xs text-muted">Market {money(d.market)}</p>
                  <p className="text-sm"><b className="text-buy-400">{money(d.offer.cents, d.offer.currency)}</b> <span className="text-xs text-muted">({d.saving}% under)</span></p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <Header title="Free price tools" href="/tools" sub="Everything that's Premium on other sites, free here. No account needed." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <Link key={t.href} href={t.href} className="card-surface p-4 hover:border-brand/60">
              <p className="font-semibold">{t.name}</p>
              <p className="mt-1 text-sm text-muted">{t.text}</p>
            </Link>
          ))}
        </div>
      </section>

      {releases.length > 0 && (
        <section>
          <Header title="Pre-orders and new releases" href="/preorders" sub="Every store's booster box and sealed price for each new set, cheapest first." />
          <div className="grid gap-3 md:grid-cols-2">
            {releases.slice(0, 4).map((s) => (
              <Link key={s.id} href={preorderPath(s)} className="card-surface flex flex-col gap-1 p-5 hover:border-brand/60">
                <span className="text-xs uppercase tracking-wide text-brand-400">{isPreorder(s) ? `Out ${longDate(s.releasedOn)}` : `Released ${longDate(s.releasedOn)}`}</span>
                <span className="text-xl font-bold">{s.name} {isPreorder(s) ? "pre-orders" : "booster box prices"}</span>
                <span className="text-sm link">Compare every store →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {latest && chase.length > 0 && (
        <section>
          <Header title={`Most valuable ${latest.name} cards`} href={`/sets/${latest.slug}`} sub="Chase cards from the newest set" />
          <TileGrid items={chase} />
        </section>
      )}

      {/* Hidden until there is a week of daily history to compare against. */}
      {(mv.up.length > 0 || mv.down.length > 0) && (
        <section className="grid gap-6 md:grid-cols-2">
          <MoverList title="Biggest risers (7 days)" rows={mv.up.slice(0, 8)} />
          <MoverList title="Biggest fallers (7 days)" rows={mv.down.slice(0, 8)} />
        </section>
      )}

      <section>
        <Header title="Set price guides" href="/sets" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {sets().filter((s) => s.productCount > 20).slice(0, 12).map((s) => (
            <Link key={s.id} href={`/sets/${s.slug}`} className="card-surface px-4 py-3 hover:border-brand/60">
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-muted">{s.upcoming ? "Upcoming · " : ""}{s.releasedOn} · {s.productCount} products</p>
            </Link>
          ))}
        </div>
      </section>

      {posts().length > 0 && (
        <section>
          <Header title="Guides" href="/blog" />
          <div className="grid gap-3 md:grid-cols-3">
            {posts().slice(0, 3).map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="card-surface p-4 hover:border-brand/60">
                <p className="font-semibold">{p.title}</p>
                <p className="mt-1 line-clamp-3 text-sm text-muted">{p.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* The site's own star score and approved reviews (owner, 2026-11-03), loaded in the browser; nothing until there is a rating. */}
      <SiteReviews />

      <section className="max-w-3xl">
        <h2 className="mb-3 text-xl font-bold">Frequently asked questions</h2>
        {faqs.map((f) => (
          <details key={f.q} className="border-b border-ink-800 py-3">
            <summary className="cursor-pointer font-medium">{f.q}</summary>
            <p className="mt-2 text-sm text-muted">{f.a}</p>
          </details>
        ))}
      </section>
      <p className="sr-only">{products().length} products tracked</p>
    </div>
  );
}

function Header({ title, href, sub }: { title: string; href?: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {href && <Link href={href} className="link text-sm">See all →</Link>}
    </div>
  );
}

function MoverList({ title, rows }: { title: string; rows: ReturnType<typeof movers>["up"] }) {
  return (
    <div className="card-surface p-4">
      <h2 className="mb-2 font-bold">{title}</h2>
      {rows.length === 0 && <p className="text-sm text-muted">Movers appear after a week of daily prices.</p>}
      <ul>
        {rows.map((r) => (
          <li key={r.p.id} className="flex items-center justify-between border-t border-ink-800 py-1.5 text-sm">
            <Link href={`/card/${r.p.slug}`} className="truncate hover:underline">{shortName(r.p.name)}</Link>
            <span className="ml-2 shrink-0 tabular-nums">{money(r.cents)} <span className={r.change >= 0 ? "text-up" : "text-down"}>{pct(r.change)}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

