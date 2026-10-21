// Guide: how to pre-order Magic sets. The process (general facts), the next set's dates (Star Trek, src/content/star-trek.ts, while it
// is still to come) and its products open at the region's stores today.
import Link from "next/link";
import type { RegionInfo } from "@/lib/regions";
import { longDate, STAR_TREK_DATES, starTrekLine, WIZARDS_COLLECTING_STAR_TREK } from "../star-trek";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { Checklist, GuideBody, Lede, LiveBlock, NoneYet, PriceTable, Prose, storesPhrase, whereToBuy, type BodyProps, type GuideOutline } from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("how-to-preorder-magic-sets")!;

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const out = data.today >= STAR_TREK_DATES.release;
  const named = (data.rows.named ?? []).filter((p) => starTrekLine(p.name) || /booster|bundle|commander/i.test(p.name)).slice(0, 12);
  return {
    intro: (
      <Lede>
        A pre-order reserves a product before its release date: you pay now (or a deposit), and the store ships it on or around release day. Stores open pre-orders weeks
        ahead, at prices of their own, so comparing them is worth a minute.
      </Lede>
    ),
    sections: [
      {
        id: "how",
        title: "How pre-orders work",
        body: (
          <Prose>
            <p>
              Wizards of the Coast announces each set months ahead, with its release date and products. Stores then list the products as pre-orders. Some charge the full price
              up front, some a deposit; most ship to arrive around the release date, but a store can only ship what its distributor sends it.
            </p>
            <p>
              A set’s prerelease events at local game stores usually come about a week before its release, and its MTG Arena release a few days before.
            </p>
          </Prose>
        ),
      },
      {
        id: "next-set",
        title: out ? "Star Trek: out now" : "The next set: Star Trek",
        live: true,
        body: (
          <>
            <Prose>
              <p>
                {out ? "Star Trek released" : "Star Trek releases"} on <strong>{longDate(STAR_TREK_DATES.release)}</strong>, with prerelease events from{" "}
                {longDate(STAR_TREK_DATES.prerelease.from)} to {longDate(STAR_TREK_DATES.prerelease.to)} and the MTG Arena release on {longDate(STAR_TREK_DATES.arena)} (
                <a href={WIZARDS_COLLECTING_STAR_TREK.url} rel="noopener">
                  {WIZARDS_COLLECTING_STAR_TREK.label}
                </a>
                ). Here’s what {storesPhrase(r)} list for it right now:
              </p>
            </Prose>
            <LiveBlock r={r} checked={data.checked}>
              {named.length ? (
                <PriceTable r={r} caption={`Star Trek products open in ${r.inName} today`} lines={named.map((p) => ({ label: starTrekLine(p.name)?.name ?? "Star Trek", p }))} whereHead="Open at" />
              ) : (
                <NoneYet>No store we compare in {r.inName} lists Star Trek product right now.</NoneYet>
              )}
            </LiveBlock>
            <p className="text-sm">
              <Link href={`/${r.region}/releases`} prefetch={false} className="font-semibold text-brand hover:underline">
                Every upcoming release →
              </Link>
            </p>
          </>
        ),
      },
      {
        id: "before-you-pay",
        title: "What to check before you pay",
        body: (
          <Checklist
            items={[
              "When it ships: on release day, or when the store receives stock.",
              "Whether you pay now or a deposit, and when the rest is charged.",
              "What happens if the store’s allocation is cut: a refund, or a wait?",
              "Shipping: the cost, and whether a pre-order ships with the rest of your order.",
              "Cancellation: whether you can cancel, and until when.",
            ]}
          />
        ),
      },
      whereToBuy(r, { tcg: { query: "Magic Star Trek", label: "Star Trek product" }, links: [{ href: `/${r.region}/preorders`, label: "Pre-orders" }] }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
