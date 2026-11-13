import Link from "@/components/Link";
import type { ProductCardData } from "@/lib/data";
import { cardOpen } from "@/lib/compact";
import { medianSaving, money, pctOf } from "@/lib/format";
import { CARD_SIZES, thumb, thumbSet } from "@/lib/images";
import { packsForLabel, perPackCents } from "@/lib/packs";
import { isPreorderSet } from "@/lib/release";
import { REGIONS, type Region } from "@/lib/regions";
import { usMsrpForCard } from "@/lib/rrp";
import { StockPill } from "./StockPill";

// The grid lives in ProductGrid.tsx (its in-feed tiles are the ads code's, the card is the shell's); re-exported here so
// existing `import { ProductGrid } from "./ProductCard"` lines keep working.
export { ProductGrid } from "./ProductGrid";

/**
 * The card's stock sentence, as [words, count unit]: the stock line's title (a pointer's tooltip, and what a screen reader's user can
 * ask for). Open: "In stock at 12 of 15 stores" (independent stores in stock, of the stores that list it; "Pre-order at …" for a set
 * not out yet), or "On TCGplayer" when no store has it. Sold out: "Sold out at all 5 stores" (dormant stores are not counted,
 * importer.ts dormantStores), or plainly "Not in stock".
 */
export function cardStockLabel(p: Pick<ProductCardData, "inStockStores" | "listedStores" | "marketplaceOpen">, preorder: boolean): [string, string] {
  const unit = (n: number) => ` ${n === 1 ? "store" : "stores"}`;
  const of = Math.max(p.listedStores, p.inStockStores);
  if (cardOpen(p)) return p.inStockStores ? [`${preorder ? "Pre-order" : "In stock"} at ${p.inStockStores} of ${of}`, unit(of)] : ["On TCGplayer", ""];
  if (!p.listedStores) return ["Not in stock", ""];
  return p.listedStores === 1 ? ["Sold out at 1", " store"] : [`Sold out at all ${p.listedStores}`, unit(p.listedStores)];
}

/**
 * The card's one stock line, as [words, count unit]: "In stock · 12 stores", "Pre-order · 3 stores", "On TCGplayer", "Sold out"
 * (the minimal card, 2026-11-13: where it can be bought and at how many stores, nothing else). The unit (" stores") is its own part:
 * a card too narrow for it (a 320px phone) drops it (globals.css .card-body); the line's title keeps the whole sentence.
 */
export function cardStockShort(p: Pick<ProductCardData, "inStockStores" | "listedStores" | "marketplaceOpen">, preorder: boolean): [string, string] {
  if (cardOpen(p)) return p.inStockStores ? [`${preorder ? "Pre-order" : "In stock"} · ${p.inStockStores}`, p.inStockStores === 1 ? " store" : " stores"] : ["On TCGplayer", ""];
  return [p.listedStores ? "Sold out" : "Not in stock", ""];
}

/**
 * A product, as little as says it (owner, 2026-11-13: "cull … all the display aesthetics"): its photo, its name, where it is in stock
 * and the price to beat. One badge at most, on the photo: how far the price is under the median of the stores that have it, else (US)
 * that it is under Wizards' published MSRP. No type pill (the name says the type), no series line, no second stock line, no "compare" cue: the
 * whole card is the link, and a click opens the quick view.
 */
export function ProductCard({ p, region, priority = false }: { p: ProductCardData; region: Region; priority?: boolean }) {
  const market = REGIONS[region].market;
  const open = cardOpen(p);
  const n = p.inStockStores; // independent stores; TCGplayer is named, never counted
  const pre = isPreorderSet(p.setCode);
  const img = thumb(p.imageUrl, 400);
  // Price signals, each a fact about the current listings: per pack when the product line fixes a pack count, the median when
  // enough stores are in stock, and (US only) Wizards' published MSRP where there is one (lib/rrp.ts).
  const perPack = open ? perPackCents(p.lowestPriceCents, packsForLabel(p.productType, p.setCode, p.name)) : null;
  const saving = open ? medianSaving(p.lowestPriceCents, p.medianOpenCents, n) : null;
  const savingPct = saving && p.lowestPriceCents != null ? pctOf(p.lowestPriceCents, p.medianOpenCents) : null;
  const msrp = open ? usMsrpForCard(market, p.productType, p.setCode) : null;
  // Same rounding as the product page ("N% below US MSRP" appears at 1% or more): a price within half a percent is at MSRP.
  const belowMsrp = msrp != null && p.lowestPriceCents != null && (pctOf(p.lowestPriceCents, msrp) ?? 0) < 0;
  const [full, fullUnit] = cardStockLabel(p, pre);
  const [stock, unit] = cardStockShort(p, pre);
  // Short classes from globals.css (.pc-*): grids repeat the card dozens of times, in the HTML and the payload.
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
        className="group pc-link"
      >
        {/* The photo on its plate (globals.css .plate): white in light mode, where multiply melts a photo's own white into it; a
            light plate in dark mode, so a store's white-backed photo is never a glaring square on a dark page. */}
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
          {savingPct != null && savingPct < 0 ? (
            <span className="pc-badge" title={saving ?? undefined}>
              −{-savingPct}%
            </span>
          ) : belowMsrp ? (
            <span className="pc-badge">Below MSRP</span>
          ) : null}
        </div>
        <div className="card-body pc-body">
          <h3 className="pc-name">{p.name}</h3>
          <div className="mt-auto">
            {/* Stock, then the price: where it can be bought is what a buyer hunting a box needs to know (owner, 2026-10-25). */}
            <p className="pc-stock" title={`${full}${fullUnit}${open && n > 0 && p.marketplaceOpen ? " and on TCGplayer" : ""}`}>
              <StockPill state={open ? "open" : "soldout"} preorder={pre} size="sm">
                {stock}
                {unit && <span className="stock-unit">{unit}</span>}
              </StockPill>
            </p>
            {open ? (
              <p className="pc-row">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="text-xs font-medium text-muted">From</span>
                  <span className="pc-price">{money(p.lowestPriceCents, market)}</span>
                </span>
                {perPack != null && <span className="pc-per">{money(perPack, market)} / pack</span>}
              </p>
            ) : (
              <p className="pc-row text-xs font-medium text-faint">No price while sold out</p>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
