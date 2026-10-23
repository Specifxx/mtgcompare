// Guide (US only): Magic MSRP. The US list prices Wizards of the Coast set for Star Trek (src/content/star-trek.ts, with its source),
// and the cheapest open listing of each product at US stores and TCGplayer today.
import { money } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import { longDate, STAR_TREK_CHECKED, STAR_TREK_PRODUCTS, starTrekLine, WIZARDS_COLLECTING_STAR_TREK } from "../star-trek";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { faqSection } from "./kit-more";
import { GuideBody, guideHref, Lede, LiveBlock, Prose, StackTable, whereText, whereToBuy, type BodyProps, type GuideOutline } from "./kit";

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
      {
        id: "other-sets",
        title: "Other sets",
        body: (
          <Prose>
            <p>
              Wizards does not publish an MSRP for most sets, so MTG Compare shows one only where Wizards published it, with its source. For every other set, compare
              stores against each other: see <a href={guideHref(r, "cheapest-way-to-buy-magic-packs")}>the cheapest way to buy packs</a> and{" "}
              <a href={`/${r.region}/deals`}>today’s deals</a>.
            </p>
          </Prose>
        ),
      },
      faqSection([
        { q: "What is the MSRP of a Star Trek Play Booster?", a: (() => { const x = STAR_TREK_PRODUCTS.find((p) => p.name === "Play Booster" && p.msrpUsCents != null); return x ? `${money(x.msrpUsCents, "US")}, the US list price Wizards of the Coast set (${WIZARDS_COLLECTING_STAR_TREK.label}).` : "Wizards has not published one we can confirm."; })() },
        { q: "Do stores have to sell at MSRP?", a: "No. MSRP is a suggested list price; each store sets its own." },
        { q: "Why is there no MSRP for a booster box?", a: "Wizards lists MSRPs per pack and per product, not for a box of packs, so MTG Compare never works one out from a pack's MSRP." },
      ]),
      whereToBuy(r, { tcg: { query: "Magic Star Trek", label: "Star Trek product" } }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
