import Link from "next/link";
import type { ProductCardData } from "@/lib/data";
import { cardOpen } from "@/lib/compact";
import { medianSaving, money, pctOf, plural } from "@/lib/format";
import { CARD_SIZES, thumb, thumbSet } from "@/lib/images";
import { packsForLabel, perPackCents } from "@/lib/packs";
import { isPreorderSet } from "@/lib/release";
import { REGIONS, type Region } from "@/lib/regions";
import { usMsrpForCard } from "@/lib/rrp";
import { SET_BY_CODE } from "@/lib/sets";
import { StockPill } from "./StockPill";

// The grid lives in ProductGrid.tsx (its in-feed tiles are the ads code's, the card is the shell's); re-exported here so
// existing `import { ProductGrid } from "./ProductCard"` lines keep working.
export { ProductGrid } from "./ProductGrid";

// The type pill sits over the photo, so it says the type the way collectors do. A label not here is short already.
const SHORT_TYPE: Record<string, string> = {
  "Pokémon Center Elite Trainer Box": "PC ETB",
  "Elite Trainer Box": "ETB",
  "Elite Trainer Box Case": "ETB Case",
  "Ultra-Premium Collection": "UPC",
  "Build & Battle Box": "B&B Box",
  "Build & Battle Stadium": "B&B Stadium",
  "Booster Bundle": "Bundle",
  "Booster Bundle Case": "Bundle Case",
  "Booster Box Case": "Box Case",
};

/** "Pokémon Center Elite Trainer Box" → "PC ETB"; a label with no short form is itself. */
export function shortTypeLabel(label: string): string {
  return SHORT_TYPE[label] ?? label;
}

/**
 * The card's stock line, as [words, count unit]. Open: "In stock · 12 stores" ("Pre-order · …" for a set not out yet), or "On
 * TCGplayer" when no store has it. Sold out: how many stores list it (dormant stores are not counted, importer.ts dormantStores),
 * or plainly "Not in stock". The unit (" stores") is its own part: a card too narrow for it (a 320px phone) drops it (globals.css
 * .card-body), and the pill's title keeps the whole sentence.
 */
export function cardStockLabel(p: Pick<ProductCardData, "inStockStores" | "listedStores" | "marketplaceOpen">, preorder: boolean): [string, string] {
  const unit = (n: number) => ` ${n === 1 ? "store" : "stores"}`;
  if (cardOpen(p)) return p.inStockStores ? [`${preorder ? "Pre-order" : "In stock"} · ${p.inStockStores}`, unit(p.inStockStores)] : ["On TCGplayer", ""];
  return p.listedStores ? [`Listed at ${p.listedStores}`, unit(p.listedStores)] : ["Not in stock", ""];
}

/** The card's last line: what the click opens. Counts every listing on the product page (stores, plus TCGplayer when it is open). */
export function cardCompareLabel(p: Pick<ProductCardData, "inStockStores" | "listedStores" | "marketplaceOpen">): string {
  if (!cardOpen(p)) return "See alternatives";
  const listed = p.listedStores + (p.marketplaceOpen ? 1 : 0);
  return listed > 1 ? `Compare ${listed} prices` : "See the offer";
}

export function ProductCard({ p, region, priority = false }: { p: ProductCardData; region: Region; priority?: boolean }) {
  const market = REGIONS[region].market;
  const open = cardOpen(p);
  const n = p.inStockStores; // independent stores; TCGplayer is named, never counted
  const pre = isPreorderSet(p.setCode);
  const set = p.setCode ? SET_BY_CODE.get(p.setCode) : null;
  const img = thumb(p.imageUrl, 400);
  // Price signals, each a fact about the current listings: per pack when the
  // product line fixes a pack count, the median when enough stores are in
  // stock, and (US only) TPCi's published MSRP.
  const perPack = open ? perPackCents(p.lowestPriceCents, packsForLabel(p.productType, p.setCode, p.name)) : null;
  const saving = open ? medianSaving(p.lowestPriceCents, p.medianOpenCents, n) : null;
  const msrp = open ? usMsrpForCard(market, p.productType, p.setCode) : null;
  // Same rounding as the product page ("N% below US MSRP" appears at 1% or more): a price within half a percent is at MSRP.
  const belowMsrp = msrp != null && p.lowestPriceCents != null && (pctOf(p.lowestPriceCents, msrp) ?? 0) < 0;
  const [stock, unit] = cardStockLabel(p, pre);
  return (
    <div className="flex flex-col">
      <Link
        href={`/${region}/p/${p.slug}`}
        prefetch={false}
        className="group card flex flex-1 flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lift"
      >
        {/* The photo on its plate (globals.css .plate): white in light mode, where multiply melts a photo's own white into it; a
            light plate in dark mode, so a store's white-backed photo is never a glaring square on a dark card. */}
        <div className="plate relative m-2 aspect-square lg:mb-0 lg:aspect-[8/7]">
          {img ? (
            <img
              src={img}
              srcSet={thumbSet(p.imageUrl, [200, 400]) ?? undefined}
              sizes={CARD_SIZES}
              alt={p.name}
              width={400}
              height={400}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              decoding="async"
              className="absolute inset-0 h-full w-full object-contain p-3 mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm font-semibold text-[#5c606c]">{p.productType}</div>
          )}
          <span
            title={p.productType}
            className="absolute left-2 top-2 max-w-[calc(100%-1.5rem)] truncate rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-semibold text-muted shadow-card backdrop-blur"
          >
            {shortTypeLabel(p.productType)}
          </span>
        </div>
        <div className="card-body flex flex-1 flex-col gap-2 px-3 pb-3 pt-1 sm:px-4 sm:pb-4 lg:pt-3">
          <div className="min-h-[2.5rem]">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-brand sm:text-[15px]">{p.name}</h3>
            {set && <p className="mt-0.5 text-xs text-faint">{set.series}</p>}
          </div>
          {(saving || belowMsrp) && (
            <p className="flex flex-wrap gap-1.5 text-[11px] font-semibold leading-4 text-open">
              {saving && <span>{saving}</span>}
              {belowMsrp && <span className="rounded-full border border-open/40 px-1.5">below MSRP</span>}
            </p>
          )}
          <div className="mt-auto">
            <p className="flex items-baseline gap-1.5">
              {open && <span className="text-xs font-medium text-muted">From</span>}
              <span className={`tabular font-display text-lg font-bold ${open ? "" : "text-faint"}`}>{open ? money(p.lowestPriceCents, market) : "Sold out"}</span>
            </p>
            {perPack != null && <p className="tabular text-xs text-muted">≈ {money(perPack, market)} / pack</p>}
            {/* The pill, then "+ TCGplayer" beside it where the card is wide enough (a desktop) and under it where not (a phone). */}
            <div
              className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5"
              title={`${stock}${unit}${open && n > 0 && p.marketplaceOpen ? " and on TCGplayer" : ""}`}
            >
              <StockPill state={open ? "open" : "soldout"} preorder={pre} size="sm">
                {stock}
                {unit && <span className="stock-unit">{unit}</span>}
              </StockPill>
              {n > 0 && p.marketplaceOpen && <span className="text-[11px] font-medium leading-4 text-muted">+ TCGplayer</span>}
            </div>
          </div>
          {/* What the click opens. On a phone or tablet it is always there (the cue that a card opens a price comparison); on a
              desktop it shows on hover or keyboard focus, its line reserved (invisible until then), so nothing moves. */}
          <p
            aria-hidden="true"
            className="h-4 truncate text-[11px] font-semibold leading-4 text-brand-strong lg:h-5 lg:text-xs lg:leading-5 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:group-focus-visible:opacity-100"
          >
            {cardCompareLabel(p)}&nbsp;→
          </p>
        </div>
      </Link>
    </div>
  );
}
