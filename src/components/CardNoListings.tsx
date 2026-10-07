import Link from "next/link";
import { COUNTRIES, type Country } from "@/lib/country";
import type { CardPriceState } from "@/lib/card-price-state";
import { PriceWatchButton } from "./PriceWatchButton";

// "No live listings for X yet" / "Why there's no price" (RiftCompare's empty
// state, card-price-state.ts). A card with no open listing is not a shell: this
// says honestly why, and gives the ways forward (a watch, the in-stock printings,
// the set) instead of an empty table. Shown only when nothing in the visitor's
// market, or anywhere, has a copy; never claims a price will appear.
export function CardNoListings({
  cardId,
  name,
  slug,
  country,
  state,
  setName,
  setSlug,
  preRelease,
  inStockPrintings,
}: {
  cardId: number;
  name: string;
  slug: string;
  country: Country;
  state: CardPriceState;
  setName: string;
  setSlug: string;
  preRelease: boolean;
  /** Other printings of this card number that DO have an open listing somewhere. */
  inStockPrintings: number;
}) {
  const place = COUNTRIES[country].place;
  const heading = state.noRetailChannel ? `Why there's no price for ${name}` : `No live listings for ${name} yet`;
  const body = state.noRetailChannel ? (
    <>
      Cards from {setName} are handed out at events and in promotional kits rather than sold through shops, so no store we track lists them. The only price this card can have is a resale price, and this page shows one as soon as a copy changes hands somewhere we can see it.
    </>
  ) : preRelease ? (
    <>
      {setName} has not been released yet, so nothing is in stock. Pre-order and pre-release listings appear here as soon as a store we track lists one.
    </>
  ) : state.hasListings ? (
    <>
      No store we track in {place} has a copy in stock right now, though {state.otherMarketStores > 0 ? `${state.otherMarketStores} ${state.otherMarketStores === 1 ? "store" : "stores"} in other markets ${state.otherMarketStores === 1 ? "does" : "do"}` : "another market does"}. Switch market to see them, or watch this card and we will flag it when it comes back.
    </>
  ) : (
    <>
      No store we track has a copy in stock in any of our six markets right now. That is usually a sold-out card, not a missing one: it appears on this page as soon as a store lists it again.
    </>
  );
  return (
    <section className="card-surface p-5" aria-label={heading}>
      <h2 className="font-bold text-white">{heading}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {state.noRetailChannel ? null : <PriceWatchButton cardId={cardId} slug={slug} name={name} variant="full" />}
        {inStockPrintings > 0 ? (
          <a href="#printings" className="btn-ghost">
            See printings in stock ({inStockPrintings}) →
          </a>
        ) : null}
        <Link href={`/sets/${setSlug}`} className="btn-ghost">
          Browse {setName} →
        </Link>
      </div>
    </section>
  );
}
