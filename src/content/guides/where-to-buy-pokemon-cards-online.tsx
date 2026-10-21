// Guide: where to buy Pokémon cards (sealed product) online, region by region. The store count comes from the registry (stores.ts),
// the live block from StoreStat (the region's stores with the most Pokémon sealed in stock right now, at most 12 rows) and typeSummary
// (what is in stock, by product type, and from what price). Then how the stores are chosen (the About page's facts), a checklist for a
// new store phrased as checks (never claims about any store), and the usual close.
import Link from "next/link";
import { money, plural } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import { TYPE_BY_LABEL } from "@/lib/sealed-title";
import { STORE_BY_KEY, storesInMarket } from "@/lib/stores";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import {
  Checklist,
  GuideBody,
  guideHref,
  Lede,
  LiveBlock,
  NextLinks,
  Prose,
  StackTable,
  typeHref,
  whereToBuy,
  type BodyProps,
  type GuideOutline,
} from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("where-to-buy-pokemon-cards-online")!;

/** The product types the "what's in stock" list shows, in this order, when the region has any in stock. */
const SHOWN_TYPES = ["Booster Box", "Elite Trainer Box", "Booster Bundle", "Pokémon Center Elite Trainer Box", "Ultra-Premium Collection", "Collection", "Tin", "Booster Pack"];

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const count = storesInMarket(r.market).length;
  const stores = data.stores.filter((s) => STORE_BY_KEY.has(s.store));
  const types = SHOWN_TYPES.map((label) => data.types.find((t) => t.productType === label)).filter((t): t is NonNullable<typeof t> => !!t && t.inStock > 0);
  const us = r.market === "US";

  return {
    intro: (
      <Lede>
        DexCompare compares <strong>{plural(count, `${r.adjective} store`)}</strong> that sell Pokémon TCG sealed product online{us ? ", plus TCGplayer" : ""}, every price in{" "}
        {r.currency}. Here’s who has the most in stock in {r.inName} today, what you can buy, and what to check before you order from a store you haven’t used.
      </Lede>
    ),
    sections: [
      {
        id: "most-in-stock",
        title: `Stores with the most in stock in ${r.inName}, today`,
        live: true,
        body: (
          <>
            <LiveBlock
              r={r}
              checked={data.checked}
              footer={
                <Link href={`/${r.region}/stores`} prefetch={false} className="font-semibold text-brand hover:underline">
                  All {plural(count, "store")} we compare in {r.inName} →
                </Link>
              }
            >
              {stores.length ? (
                <StackTable
                  caption={`The stores with the most Pokémon sealed products in stock in ${r.inName} today`}
                  head={["Store", "In stock", "Listed"]}
                  rows={stores.map((s) => ({
                    key: s.store,
                    th: (
                      <Link href={`/${r.region}/stores/${s.store}`} prefetch={false} className="font-semibold text-ink hover:text-brand hover:underline">
                        {STORE_BY_KEY.get(s.store)!.name}
                      </Link>
                    ),
                    cells: [<span key="i" className="font-semibold">{s.inStock}</span>, <span key="l" className="text-muted">{s.listed}</span>],
                  }))}
                />
              ) : (
                <p className="text-sm text-muted">The stores’ counts appear here after the next price check.</p>
              )}
            </LiveBlock>
            <p className="text-xs leading-5 text-muted">
              Sealed Pokémon products each store has in stock and lists, as of our last check. A bigger range isn’t a cheaper one: each product page ranks every store by price.
            </p>
          </>
        ),
      },
      {
        id: "what-you-can-buy",
        title: "What you can buy",
        body: (
          <>
            {types.length > 0 && (
              <div className="card my-6 px-4 py-2 sm:px-5 sm:py-3">
                <StackTable
                  caption={`Pokémon sealed products in stock in ${r.inName} today, by type, with the lowest price`}
                  head={["Product", "In stock", "From"]}
                  rows={types.map((t) => {
                    const info = TYPE_BY_LABEL.get(t.productType)!;
                    return {
                      key: info.key,
                      type: info.key,
                      th: (
                        <Link href={typeHref(r, info.key)} prefetch={false} className="font-semibold text-ink hover:text-brand hover:underline">
                          {info.plural}
                        </Link>
                      ),
                      cells: [<span key="n">{plural(t.inStock, "product")}</span>, <span key="f" className="font-semibold">{t.fromCents != null ? money(t.fromCents, r.market) : "—"}</span>],
                    };
                  })}
                />
              </div>
            )}
            <Prose>
              <p>
                Every listing is English-language sealed product: <Link href={typeHref(r, "booster-box")}>booster boxes</Link>,{" "}
                <Link href={typeHref(r, "etb")}>Elite Trainer Boxes</Link>, <Link href={typeHref(r, "booster-bundle")}>booster bundles</Link>,{" "}
                <Link href={typeHref(r, "collection")}>collections</Link>, tins and more. Singles, graded cards, accessories and store-made bundles are left out on purpose, so a
                product page compares like with like.
              </p>
            </Prose>
          </>
        ),
      },
      {
        id: "how-stores-are-chosen",
        title: "How the stores are chosen",
        body: (
          <>
            <Prose>
              <ul>
                <li>
                  <strong>They sell online, in {r.currency}.</strong> Each store was read live before it was added, and its prices are checked to be in {r.currency}.
                </li>
                <li>
                  <strong>Prices are read about twice a day.</strong> Each listing says when we last read it, and a store we couldn’t read for three days is marked, not guessed.
                </li>
                <li>
                  <strong>Nobody pays to be listed.</strong> Stores are ranked by price and stock only, and store links carry no affiliate tag.
                </li>
              </ul>
            </Prose>
            <NextLinks
              links={[
                { href: `/${r.region}/stores`, label: `Every store in ${r.inName}`, icon: "store" },
                { href: `/${r.region}/deals`, label: "Today’s deals", icon: "tag" },
              ]}
            />
          </>
        ),
      },
      {
        id: "before-you-order",
        title: "Before you order from a new store",
        body: (
          <Checklist
            items={[
              <>
                <strong>Check the contact details:</strong> a business name, an email address and a way to reach someone.
              </>,
              <>
                <strong>Check the delivery cost</strong> at checkout: our prices exclude shipping.
              </>,
              <>
                <strong>Check the returns policy</strong> for sealed product, before you pay.
              </>,
              <>
                <strong>Check it’s the exact product:</strong> the right set, the right type, and English-language.
              </>,
              <>
                <strong>Check a pre-order’s dispatch date</strong> if the set isn’t out yet (the <Link href={guideHref(r, "how-to-preorder-pokemon-tcg")}>pre-order guide</Link> has more).
              </>,
              <>
                <strong>Check the shrink-wrap and seals</strong> when it arrives. The <Link href={guideHref(r, "how-to-avoid-resealed-pokemon-products")}>resealed product guide</Link> says what to look for.
              </>,
            ]}
          />
        ),
      },
      whereToBuy(r, {
        tcg: { query: "", label: "Pokémon sealed product" },
        links: [{ href: `/${r.region}/sealed`, label: "All sealed products" }],
      }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
