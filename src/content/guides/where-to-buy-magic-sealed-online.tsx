// Guide: where to buy Magic sealed online. The region's stores with the most in stock today (StoreStat), how much of each type is
// open here, and what to check before ordering.
import Link from "@/components/Link";
import { money } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { Checklist, GuideBody, Lede, LiveBlock, NoneYet, Prose, StackTable, whereToBuy, type BodyProps, type GuideOutline } from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("where-to-buy-magic-sealed-online")!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  return {
    intro: (
      <Lede>
        Magic sealed product is sold online by independent game stores as well as the big retailers. MTG Compare reads {r.adjective} stores’ own listings{" "}
        {r.market === "US" ? "and TCGplayer " : ""}and puts their prices side by side, in {r.currency}. Here’s who has the most in stock today.
      </Lede>
    ),
    sections: [
      {
        id: "stores",
        title: `The stores with the most in stock in ${r.inName}`,
        live: true,
        body: (
          <LiveBlock r={r} checked={data.checked} footer={<Link href={`/${r.region}/stores`} className="font-semibold text-brand hover:underline">Every store we compare →</Link>}>
            {data.stores.length ? (
              <StackTable
                caption={`Stores with the most Magic sealed product in stock in ${r.inName} today`}
                head={["Store", "In stock", "Listed"]}
                rows={data.stores.map((s) => ({
                  key: s.store,
                  th: (
                    <Link href={`/${r.region}/stores/${s.store}`} prefetch={false} className="font-semibold text-ink hover:text-brand hover:underline">
                      {s.name}
                    </Link>
                  ),
                  cells: [String(s.inStock), String(s.listed)],
                }))}
              />
            ) : (
              <NoneYet />
            )}
          </LiveBlock>
        ),
      },
      {
        id: "types",
        title: "What’s in stock, by type",
        body: data.types.length ? (
          <StackTable
            caption={`Open Magic sealed products by type in ${r.inName} today`}
            head={["Type", "Products open", "From"]}
            rows={data.types.map((t) => ({ key: t.productType, th: <span className="font-semibold text-ink">{t.productType}</span>, cells: [String(t.open), t.fromCents != null ? money(t.fromCents, r.market) : "—"] }))}
          />
        ) : (
          <NoneYet />
        ),
      },
      {
        id: "before-you-order",
        title: "What to check before you order",
        body: (
          <>
            <Prose>
              <p>A lower price can cost more once it arrives. Before ordering from a store you don’t know:</p>
            </Prose>
            <Checklist
              items={[
                "Delivery: the cost to you, and whether it is tracked and insured. Our prices exclude shipping.",
                "Stock: is it in stock now, or a pre-order with a later ship date?",
                "Language: our listings are English product; check the listing says so.",
                "Returns: what happens if a box arrives damaged or the wrap is opened.",
                "Contact details: a real address, an email and a phone number.",
              ]}
            />
          </>
        ),
      },
      whereToBuy(r, { tcg: { query: "Magic sealed", label: "Magic sealed product" } }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
