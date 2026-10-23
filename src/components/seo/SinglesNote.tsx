// "Looking for MTG card prices?": the short answer for the searches that still find MTG Compare by its singles past ("mtg card
// prices", "magic card prices"). Since 2026-10-21 the site compares sealed product only (CLAUDE.md); this says so plainly and sends
// the reader to the sealed pages and guides that answer what they can do here. Static: no read. On the landing page and every
// region's guides index.
import Link from "@/components/Link";
import { guideHref } from "@/content/guides/kit";
import type { RegionInfo } from "@/lib/regions";
import { sectionHref } from "@/lib/site";

const A = "font-semibold text-brand underline-offset-2 hover:underline";

export function SinglesNote({ r, className = "page mt-14" }: { r: RegionInfo; className?: string }) {
  return (
    <section className={className} aria-labelledby="singles-h">
      <div className="mx-auto max-w-3xl rounded-xl border border-line bg-surface p-5 text-[15px] leading-7 text-muted sm:p-6">
        <h2 id="singles-h" className="font-display text-xl font-bold tracking-tight text-ink">
          Looking for MTG card prices?
        </h2>
        <p className="mt-2">
          MTG Compare compares <strong className="text-ink">sealed Magic: The Gathering product</strong>, not single cards: booster boxes, Collector Booster boxes, Bundles,
          Commander decks and packs, across independent stores in {r.inName} and six other regions. Single cards, graded cards and store-made bundles are left out, so every
          product page compares the same factory-sealed item from store to store.
        </p>
        <p className="mt-2">
          If you are pricing a set rather than one card, these answer it with today’s prices:{" "}
          <Link href={guideHref(r, "mtg-booster-box-prices")} prefetch={false} className={A}>
            MTG booster box prices
          </Link>
          ,{" "}
          <Link href={guideHref(r, "collector-booster-box-prices")} prefetch={false} className={A}>
            Collector Booster box prices
          </Link>
          ,{" "}
          <Link href={guideHref(r, "commander-precon-price-guide")} prefetch={false} className={A}>
            Commander deck prices
          </Link>{" "}
          and{" "}
          <Link href={guideHref(r, "cheapest-way-to-buy-magic-packs")} prefetch={false} className={A}>
            the cheapest way to buy packs
          </Link>
          . Or go straight to{" "}
          <Link href={sectionHref(r.region, "boosterBoxes")} prefetch={false} className={A}>
            booster boxes in stock in {r.inName}
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
