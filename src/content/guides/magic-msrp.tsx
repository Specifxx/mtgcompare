// Guide (US only): Magic MSRP. The US list prices Wizards of the Coast set for Star Trek (src/content/star-trek.ts, with its source),
// and the cheapest open listing of each product at US stores and TCGplayer today.
import { money } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import { longDate, STAR_TREK_CHECKED, STAR_TREK_PRODUCTS, starTrekLine, WIZARDS_COLLECTING_STAR_TREK } from "../star-trek";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { GuideBody, Lede, LiveBlock, Prose, StackTable, whereText, whereToBuy, type BodyProps, type GuideOutline } from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("magic-msrp")!;

export const MSRP_NOTE = `MSRP is Wizards of the Coast's US list price, from ${WIZARDS_COLLECTING_STAR_TREK.label} (read ${longDate(STAR_TREK_CHECKED)}); stores set their own.`;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const priced = STAR_TREK_PRODUCTS.filter((p) => p.msrpUsCents != null);
  const cheapest = (name: string) => (data.rows.named ?? []).find((p) => starTrekLine(p.name)?.name === name) ?? null;
  return {
    intro: (
      <Lede>
        Wizards of the Coast sets a US list price (MSRP) for each product of a set. Stores set their own prices. Here are the MSRPs Wizards set for Star Trek, against the
        cheapest listing at US stores and TCGplayer today.
      </Lede>
    ),
    sections: [
      {
        id: "star-trek",
        title: "Star Trek: MSRP and today’s price",
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              <StackTable
                caption="Star Trek US MSRP, and the cheapest US listing today"
                head={["Product", "MSRP", "Today", "Open at"]}
                rows={priced.map((x) => {
                  const p = cheapest(x.name);
                  return {
                    key: x.name,
                    th: <span className="font-semibold text-ink">{x.name}</span>,
                    cells: [`${money(x.msrpUsCents, "US")} a ${x.each}`, p ? money(p.lowestPriceCents, "US") : "—", p ? whereText(p) : "—"],
                  };
                })}
              />
            </LiveBlock>
            <p className="mt-3 text-xs leading-5 text-muted">{MSRP_NOTE} Wizards sets no MSRP for a box or case of boosters, or for the Prerelease Pack.</p>
          </>
        ),
      },
      {
        id: "why-different",
        title: "Why prices differ from MSRP",
        body: (
          <Prose>
            <p>
              MSRP is a suggestion: each store prices its own stock. A box of boosters has no MSRP of its own, so a store’s box price is not compared with a pack’s MSRP here.
            </p>
          </Prose>
        ),
      },
      whereToBuy(r, { tcg: { query: "Magic Star Trek", label: "Star Trek product" } }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
