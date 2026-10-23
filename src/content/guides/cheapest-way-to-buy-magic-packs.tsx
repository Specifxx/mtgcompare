// Guide: the cheapest way to buy Magic packs. Per product type, the region's cheapest open product per pack today (more-data.ts
// cheapestPackByType), with pack counts from lib/packs.ts only: a product it has no certain count for is left out of the ranking.
import type { RegionInfo } from "@/lib/regions";
import { money, plural } from "@/lib/format";
import { TYPE_BY_LABEL } from "@/lib/sealed-title";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { CheapestBadge, GuideBody, guideHref, Lede, LiveBlock, NextLinks, NoneYet, ProductTh, Prose, StackTable, storesPhrase, typeHref, whereText, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { faqSection } from "./kit-more";
import { cheapestPackByType, PER_PACK_TYPES, perPackRows } from "./more-data";

const GUIDE = GUIDE_BY_SLUG.get("cheapest-way-to-buy-magic-packs")!;

const keyOf = (label: string) => TYPE_BY_LABEL.get(label)?.key ?? "";

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const by = data.byType ?? {};
  const best = cheapestPackByType(by);
  const lead = [...best].sort((a, b) => a.row.perPack - b.row.perPack)[0] ?? null;
  const top = perPackRows(PER_PACK_TYPES.flatMap((t) => by[t] ?? [])).slice(0, 10);
  const m = (c: number) => money(c, r.market);
  return {
    intro: (
      <Lede>
        {lead ? (
          <>
            Right now the cheapest way to buy Magic packs in {r.inName} is a <strong>{lead.type}</strong>: <strong>{m(lead.row.perPack)} a pack</strong> for{" "}
            {lead.row.p.name} ({m(lead.row.p.lowestPriceCents ?? 0)} for {lead.row.packs} packs). Here is the cheapest per pack of each kind of product at {storesPhrase(r)} today.
          </>
        ) : (
          <>What a pack costs depends on how you buy it: in a box, in a Bundle or loose. Here is the cheapest per pack of each kind at {storesPhrase(r)} today.</>
        )}
      </Lede>
    ),
    sections: [
      {
        id: "by-type",
        title: "Cheapest per pack, by product type",
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              {best.length ? (
                <StackTable
                  caption={`The cheapest product per pack of each type in ${r.inName} today`}
                  head={["Type", "Per pack", "Price", "Open"]}
                  rows={best.map(({ type, row }) => ({
                    key: type,
                    type: keyOf(type),
                    highlight: lead?.type === type,
                    th: <ProductTh r={r} label={type} p={row.p} badge={lead?.type === type ? <CheapestBadge /> : undefined} />,
                    cells: [
                      <span key="pp" className="font-semibold">{m(row.perPack)}</span>,
                      <span key="p">
                        {m(row.p.lowestPriceCents ?? 0)} · {plural(row.packs, "pack")}
                      </span>,
                      <span key="w" className="text-muted">
                        {whereText(row.p)}
                        {data.openByType?.[type] != null ? ` · ${plural(data.openByType[type]!, "product")} of the type open` : ""}
                      </span>,
                    ],
                  }))}
                />
              ) : (
                <NoneYet />
              )}
            </LiveBlock>
            <p className="text-xs leading-5 text-muted">Per pack = the listed price ÷ the booster packs inside, excluding shipping. Products whose pack count we can’t confirm are left out.</p>
          </>
        ),
      },
      {
        id: "top-ten",
        title: "The ten cheapest products per pack",
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              {top.length ? (
                <StackTable
                  caption={`The ten cheapest Magic products per pack in ${r.inName} today`}
                  head={["Product", "Per pack", "Price", "Open"]}
                  rows={top.map((x, i) => ({
                    key: x.p.slug,
                    highlight: i === 0,
                    th: <ProductTh r={r} label={x.p.productType} p={x.p} />,
                    cells: [<span key="pp" className="font-semibold">{m(x.perPack)}</span>, m(x.p.lowestPriceCents ?? 0), <span key="w" className="text-muted">{whereText(x.p)}</span>],
                  }))}
                />
              ) : (
                <NoneYet />
              )}
            </LiveBlock>
            <NextLinks links={[{ href: `/${r.region}/cheapest-packs`, label: `Every product by price per pack in ${r.inName}`, icon: "tag" }]} />
          </>
        ),
      },
      {
        id: "how-to-read",
        title: "Box, Bundle or loose packs?",
        body: (
          <Prose>
            <p>
              A box usually costs less a pack than loose packs of the same set, and a Bundle sits between the two, with extras (basic lands, a promo card, a storage box)
              that are not priced here. Collector Boosters cost several times a Play Booster: compare them with each other, not with Play Boosters. See{" "}
              <a href={guideHref(r, "play-vs-collector-booster-box-value-by-set")}>Play vs Collector Booster box, set by set</a> and{" "}
              <a href={guideHref(r, "how-many-packs-in-magic-products")}>how many packs each product holds</a>.
            </p>
          </Prose>
        ),
      },
      faqSection([
        { q: `What is the cheapest way to buy Magic booster packs in ${r.inName}?`, a: lead ? `Today it is a ${lead.type}: ${lead.row.p.name} at ${m(lead.row.perPack)} a pack (${m(lead.row.p.lowestPriceCents ?? 0)} for ${lead.row.packs} packs), at the stores MTG Compare checks.` : `None of the products with a known pack count is in stock at the stores we compare right now; the table above fills in when one is.` },
        { q: "How is the price per pack worked out?", a: "The cheapest listed price, excluding shipping, divided by the booster packs inside. Extras like promo cards and storage boxes are not priced, and a product whose pack count is not certain is left out." },
        { q: "How many packs are in a Play Booster box?", a: "36 for the first Play Booster sets (from Murders at Karlov Manor to Innistrad Remastered) and 30 from Aetherdrift on." },
        { q: "Is a box always cheaper per pack than loose packs?", a: "Usually, but not always: compare a box with loose packs of the same set in the tables above, as prices differ by store and by set." },
      ]),
      whereToBuy(r, {
        tcg: { query: "Magic Play Booster Box", label: "Play Booster boxes" },
        links: [typeHref(r, "play-booster-box"), typeHref(r, "bundle")].filter((h): h is string => !!h).map((href, i) => ({ href, label: i ? "Bundles" : "Play Booster boxes" })),
      }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
