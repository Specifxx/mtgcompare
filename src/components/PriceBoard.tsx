import type { Finish } from "@/lib/constants";
import type { Country } from "@/lib/country";
import type { OfferRow } from "@/lib/data";
import { boardModel } from "@/lib/board-model";
import { PriceBoardView } from "./PriceBoardView";

// The one-market price comparison for a server page (the sealed page and the others that render per market): the model is
// resolved here (lib/board-model.ts) and drawn by PriceBoardView, the same view the card page's client island draws.
export function PriceBoard({
  productId,
  offers,
  country,
  ebayQuery,
  page,
  title,
  noun,
  id,
  slug,
  name,
  preRelease = false,
  finish = "N",
}: {
  productId: number;
  finish?: Finish;
  offers: OfferRow[];
  country: Country;
  ebayQuery: string;
  page: string;
  title?: string;
  noun?: string;
  id?: string;
  slug?: string;
  name?: string;
  preRelease?: boolean;
}) {
  return <PriceBoardView model={boardModel(offers, country, { page, ebayQuery })} productId={productId} finish={finish} country={country} now={Date.now()} page={page} title={title} noun={noun} id={id} slug={slug} name={name} preRelease={preRelease} />;
}
