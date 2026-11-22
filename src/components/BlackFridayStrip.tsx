import { Ago } from "@/components/Ago";

// The Black Friday strip on a product page (lib/bf-strip.ts; DECISIONS.md, "Black Friday strip on sealed pages", 2026-11-19): one
// short card of facts the page already holds, under the best price. Server HTML, no script of its own beyond the "checked" time,
// never fixed or floating (the phone strip ad and the quick view's A/B are untouched). Its one link (2026-11-21, partner terms:
// TCGplayer pays by calendar-month tier, so Cyber Weekend sales lift the whole month's rate) is a labelled "Ad" TCGplayer search
// for this product, on a line of its own under the facts: never a price, never ranked, never the cheapest.
export interface BlackFridayStripProps {
  /** "Black Friday" or "Cyber Monday" (lib/black-friday.ts saleStrip), else "Holiday sales". */
  label: string;
  /** "$189.99 at Card Kingdom" */
  cheapest: string | null;
  /** "Free shipping", "+ $9.95 shipping" (the store's measured shipping), or null when we have no measurement. */
  shipping: string | null;
  /** ISO time the cheapest price was read. */
  checked: string | null;
  checkedInitial: string;
  /** "Pre-order · out 5 Dec 2026", or null. */
  preorder: string | null;
  /** The history cue (lowCueText), or null. */
  cue: { text: string; lowest: boolean } | null;
  /** Not drawn since 2026-11-22 (page budget rule 3: no ad above the price table); kept so the data stays typed. The tagged TCGplayer search for this product (tcgplayerSearchUrl, placement "tcgplayer-bf-strip"), or null. */
  tcgplayerHref?: string | null;
}

export function BlackFridayStrip({ label, cheapest, shipping, checked, checkedInitial, preorder, cue }: BlackFridayStripProps) {
  if (!cheapest && !preorder && !cue) return null;
  return (
    <section aria-label={`${label} price check`} data-bf-strip="" className="card mt-3 px-4 py-3 text-sm leading-6">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rounded-full bg-raised px-2.5 py-0.5 text-xs font-semibold text-ink">{label} check</span>
        {cheapest && (
          <span>
            Cheapest today <b className="tabular font-semibold">{cheapest}</b>
          </span>
        )}
        {shipping && (
          <>
            <span className={/^free/i.test(shipping) ? "font-medium text-open" : "text-muted"}>{shipping}</span>
          </>
        )}
        {checked && (
          <>
            <span className="text-muted">
              checked <Ago iso={checked} initial={checkedInitial} />
            </span>
          </>
        )}
        {preorder && (
          <>
            <span className="font-medium text-pre">{preorder}</span>
          </>
        )}
        {cue && (
          <>
            <span className={cue.lowest ? "font-semibold text-open" : "text-muted"}>{cue.text}</span>
          </>
        )}
      </p>
    </section>
  );
}
