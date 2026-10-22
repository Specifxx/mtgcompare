// The two cross-market posts: where to buy (stores and stock per market) and whether sealed is cheaper abroad (the same set's box
// in every market, each in its own currency).
import Link from "@/components/Link";
import { cheapestPerMarket, perPackOf, whereText, type FamilyKey, type MarketCard } from "@/content/families";
import { money } from "@/lib/format";
import { REGION_LIST, regionOfMarket } from "@/lib/regions";
import { SET_BY_CODE } from "@/lib/sets";
import type { PostData } from "../data";
import { Lede, MarketsBlock, NoFx, Prose, StackTable, type PostOutline } from "../kit";

export const whereToBuy = {
  outline(data: PostData): PostOutline {
    return {
      intro: (
        <Lede>
          MTG Compare reads the Magic sealed listings of independent stores in seven markets, about twice a day. Here is how many stores each market has, how much is in stock
          there today, and which stores carry the most.
        </Lede>
      ),
      sections: [
        {
          id: "markets",
          title: "The seven markets at a glance",
          body: (
            <MarketsBlock checked={data.checked}>
              <StackTable
                caption="Stores and open sealed products per market today"
                head={["Market", "Stores", "Products in stock"]}
                rows={data.counts.map((c) => {
                  const r = regionOfMarket(c.market)!;
                  return {
                    key: c.market,
                    th: (
                      <Link href={`/${r.region}/stores`} prefetch={false} className="font-semibold text-ink hover:text-brand hover:underline">
                        {r.name}
                      </Link>
                    ),
                    cells: [String(c.stores), String(c.open)],
                  };
                })}
              />
            </MarketsBlock>
          ),
        },
        {
          id: "stores",
          title: "Who has the most in stock",
          body: (
            <MarketsBlock checked={data.checked}>
              {REGION_LIST.map((r) => {
                const rows = data.stores[r.market] ?? [];
                return (
                  <div key={r.region} className="border-t border-line pt-4 first:border-0 first:pt-0 [&+&]:mt-4">
                    <h3 className="mb-1 font-display text-lg font-bold">{r.name}</h3>
                    {rows.length ? (
                      <p className="text-sm text-muted">
                        {rows.map((s, i) => (
                          <span key={s.store}>
                            {i > 0 && " · "}
                            <Link href={`/${r.region}/stores/${s.store}`} prefetch={false} className="font-medium text-brand hover:underline">
                              {s.name}
                            </Link>{" "}
                            ({s.inStock} in stock)
                          </span>
                        ))}
                      </p>
                    ) : (
                      <p className="text-sm text-muted">No store with stock right now.</p>
                    )}
                  </div>
                );
              })}
            </MarketsBlock>
          ),
        },
        {
          id: "how",
          title: "How we compare them",
          body: (
            <Prose>
              <p>
                Each market compares only stores that charge in its currency, at their own listed price, excluding shipping. Stores pay nothing to be listed, and the order is
                by price and stock alone. In the US, TCGplayer’s marketplace is shown beside the stores. The guide{" "}
                <Link href="/us/guides/where-to-buy-magic-sealed-online">where to buy Magic sealed online</Link> says what to check before ordering.
              </p>
            </Prose>
          ),
        },
      ],
    };
  },
};

/** Per set with a box open in the most markets: the cheapest of the family in each market. */
function setLines(cards: readonly MarketCard[], fam: FamilyKey) {
  const markets = new Map<string, Set<string>>();
  for (const c of cards) if (c.setCode && cheapestPerMarket([c], fam).some((x) => x.p)) (markets.get(c.setCode) ?? markets.set(c.setCode, new Set()).get(c.setCode)!).add(c.market);
  const best = [...markets.entries()].filter(([, m]) => m.size >= 3).sort((a, b) => b[1].size - a[1].size || (SET_BY_CODE.get(b[0])?.releaseDate ?? "").localeCompare(SET_BY_CODE.get(a[0])?.releaseDate ?? ""))[0];
  if (!best) return null;
  const code = best[0];
  return { name: SET_BY_CODE.get(code)?.name ?? code.toUpperCase(), lines: cheapestPerMarket(cards, fam, (c) => c.setCode === code) };
}

function SetTable({ cards, fam, label }: { cards: readonly MarketCard[]; fam: FamilyKey; label: string }) {
  const s = setLines(cards, fam);
  if (!s) return <p className="text-sm text-muted">No {label} is in stock in three or more markets right now.</p>;
  return (
    <>
      <h3 className="mb-2 font-display text-lg font-bold">
        {s.name} {label}
      </h3>
      <StackTable
        caption={`${s.name} ${label}: the cheapest listing in each market today`}
        head={["Market", "Price", "Per pack", "In stock at"]}
        rows={s.lines.map(({ market, p }) => {
          const r = regionOfMarket(market)!;
          return {
            key: market,
            th: <span className="font-semibold text-ink">{r.name}</span>,
            cells: p ? [money(p.lowestPriceCents, market), perPackOf(p) != null ? money(perPackOf(p), market) : "—", whereText(p)] : ["None right now", "—", "—"],
          };
        })}
      />
    </>
  );
}

export const cheaperAbroad = {
  outline(data: PostData): PostOutline {
    return {
      intro: (
        <Lede>
          The same Magic booster box sells at very different numbers in different markets, but the currencies differ too. Here is one box of the same set in every market we
          compare, each at its cheapest store price in its own currency, and what to add before you decide to import one.
        </Lede>
      ),
      sections: [
        {
          id: "one-box",
          title: "One box, seven markets",
          body: (
            <>
              <MarketsBlock checked={data.checked}>
                <SetTable cards={data.boxes} fam="play-box" label="Play Booster Box" />
                <div className="mt-6">
                  <SetTable cards={data.boxes} fam="collector-box" label="Collector Booster Box" />
                </div>
              </MarketsBlock>
              <NoFx />
            </>
          ),
        },
        {
          id: "what-to-add",
          title: "What importing adds",
          body: (
            <Prose>
              <ul>
                <li>International postage on a box, which is heavy and bulky, and insurance.</li>
                <li>Import tax or duty in your country, and any handling fee the carrier charges to collect it.</li>
                <li>Sales tax: US prices usually exclude it, while UK, EU, Australian and New Zealand prices include VAT or GST.</li>
                <li>Your card’s currency conversion fee.</li>
                <li>Returns: sending a damaged box back overseas is slow and expensive.</li>
              </ul>
              <p>
                For one box, these usually outweigh a gap in the sticker price. The guide <Link href="/guides/magic-booster-box-prices-by-country">Magic booster box prices by
                country</Link> shows the newest sets side by side.
              </p>
            </Prose>
          ),
        },
      ],
    };
  },
};
