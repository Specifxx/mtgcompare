import Link from "@/components/Link";
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
  "Play Booster Box": "Play box",
  "Collector Booster Box": "Collector box",
  "Collector Booster Box Case": "Collector case",
  "Play Booster Box Case": "Box Case",
  "Play Booster Pack": "Play Booster",
  "Collector Booster Pack": "Collector Booster",
  "Secret Lair Drop": "Secret Lair",
};

/** "Collector Booster Box" → "Collector box"; a label with no short form is itself. */
export function shortTypeLabel(label: string): string {
  return SHORT_TYPE[label] ?? label;
}

/**
 * The card's stock line, as [words, count unit], and the first thing under the name (stock first: owner's feedback, 2026-10-25).
 * Open: "In stock at 12 of 15 stores" (independent stores in stock, of the stores that list it; "Pre-order at …" for a set not out
 * yet), or "On TCGplayer" when no store has it. Sold out: "Sold out at all 5 stores" (dormant stores are not counted, importer.ts
 * dormantStores), or plainly "Not in stock". The unit (" stores") is its own part: a card too narrow for it (a 320px phone) drops it
 * (globals.css .card-body), and the pill's title keeps the whole sentence.
 */
export function cardStockLabel(p: Pick<ProductCardData, "inStockStores" | "listedStores" | "marketplaceOpen">, preorder: boolean): [string, string] {
  const unit = (n: number) => ` ${n === 1 ? "store" : "stores"}`;
  const of = Math.max(p.listedStores, p.inStockStores);
  if (cardOpen(p)) return p.inStockStores ? [`${preorder ? "Pre-order" : "In stock"} at ${p.inStockStores} of ${of}`, unit(of)] : ["On TCGplayer", ""];
  if (!p.listedStores) return ["Not in stock", ""];
  return p.listedStores === 1 ? ["Sold out at 1", " store"] : [`Sold out at all ${p.listedStores}`, unit(p.listedStores)];
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
        // A plain click opens the quick view (QuickView.tsx); the link itself stays for crawlers and new tabs.
        data-qv={p.slug}
        data-qv-region={region}
        data-qv-name={p.name}
        data-qv-sub={p.productType}
        data-qv-img={img ?? undefined}
        className="group card pc-link"
      >
        {/* The photo on its plate (globals.css .plate): white in light mode, where multiply melts a photo's own white into it; a
            light plate in dark mode, so a store's white-backed photo is never a glaring square on a dark card. */}
        <div className="plate pc-plate">
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
              className="pc-img"
            />
          ) : (
            <div className="pc-noimg">{p.productType}</div>
          )}
          <span
            title={p.productType}
            className="pc-type"
          >
            {shortTypeLabel(p.productType)}
          </span>
        </div>
        <div className="card-body pc-body">
          <div className="min-h-[2.5rem]">
            <h3 className="pc-name">{p.name}</h3>
            {set && <p className="mt-0.5 text-xs text-faint">{set.series}</p>}
          </div>
          {(saving || belowMsrp) && (
            <p className="pc-save">
              {saving && <span>{saving}</span>}
              {belowMsrp && <span className="pc-msrp">below MSRP</span>}
            </p>
          )}
          <div className="mt-auto">
            {/* Stock first, then the price: where it can be bought is what a buyer hunting a box needs to know (owner, 2026-10-25). The
                pill, then "+ TCGplayer" beside it where the card is wide enough (a desktop) and under it where not (a phone). */}
            <div
              className="pc-stock"
              title={`${stock}${unit}${open && n > 0 && p.marketplaceOpen ? " and on TCGplayer" : ""}`}
            >
              <StockPill state={open ? "open" : "soldout"} preorder={pre} size="sm">
                {stock}
                {unit && <span className="stock-unit">{unit}</span>}
              </StockPill>
              {n > 0 && p.marketplaceOpen && <span className="pc-tcg">+ TCGplayer</span>}
            </div>
            {open ? (
              <p className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-xs font-medium text-muted">From</span>
                <span className="pc-price">{money(p.lowestPriceCents, market)}</span>
              </p>
            ) : (
              <p className="mt-1.5 text-xs font-medium text-faint">No price while sold out</p>
            )}
            {perPack != null && <p className="tabular text-xs text-muted">≈ {money(perPack, market)} / pack</p>}
          </div>
          {/* What the click opens. On a phone or tablet it is always there (the cue that a card opens a price comparison); on a
              desktop it shows on hover or keyboard focus, its line reserved (invisible until then), so nothing moves. */}
          <p
            aria-hidden="true"
            className="pc-cue"
          >
            {cardCompareLabel(p)}&nbsp;→
          </p>
        </div>
      </Link>
    </div>
  );
}
