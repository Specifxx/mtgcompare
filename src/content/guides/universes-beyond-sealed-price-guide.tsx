// Guide: Universes Beyond sealed prices. Every Universes Beyond set in sets.ts (names, series and English release dates are its), with
// the region's listed/open counts per set and the cheapest open product of each (more-data.ts openOfSets, setCountsOf).
import type { RegionInfo } from "@/lib/regions";
import { money } from "@/lib/format";
import { formatRelease, isPreorderSet } from "@/lib/release";
import { SETS } from "@/lib/sets";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { GuideBody, guideHref, Lede, LiveBlock, productHref, Prose, StackTable, storesPhrase, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { CardTable, faqSection, SetLink } from "./kit-more";
import Link from "@/components/Link";

const GUIDE = GUIDE_BY_SLUG.get("universes-beyond-sealed-price-guide")!;
export const UB_SETS = SETS.filter((s) => s.series === "Universes Beyond");

export function outline(r: RegionInfo, data: GuideData, now: Date = new Date()): GuideOutline {
  const all = data.byType?.ub ?? [];
  const cheapest = (code: string) => all.find((p) => p.setCode === code) ?? null;
  const sets = data.sets ?? {};
  const open = UB_SETS.reduce((n, s) => n + (sets[s.code]?.open ?? 0), 0);
  const next = [...UB_SETS].reverse().find((s) => isPreorderSet(s.code, now)) ?? null;
  return {
    intro: (
      <Lede>
        Universes Beyond is Magic’s line of sets from other worlds, from Warhammer 40,000 to {UB_SETS[0].name}. MTG Compare tracks {UB_SETS.length} of them; {storesPhrase(r)} have{" "}
        <strong>{open} Universes Beyond sealed products</strong> open today{next ? <>, and {next.name} is up for pre-order ahead of {formatRelease(next.releaseDate)}</> : null}.
      </Lede>
    ),
    sections: [
      {
        id: "sets",
        title: "Every Universes Beyond set, today",
        live: true,
        body: (
          <LiveBlock r={r} checked={data.checked}>
            <StackTable
              caption={`Universes Beyond sets: release dates and sealed products in ${r.inName} today`}
              head={["Set", "English release", "Open / listed", "Cheapest open"]}
              rows={UB_SETS.map((s) => {
                const c = cheapest(s.code);
                const n = sets[s.code];
                return {
                  key: s.code,
                  th: <SetLink r={r} slug={s.slug}>{s.name}</SetLink>,
                  cells: [
                    <span key="d">{formatRelease(s.releaseDate)}{isPreorderSet(s.code, now) ? " (pre-order)" : ""}</span>,
                    <span key="n">{n ? `${n.open} / ${n.products}` : "—"}</span>,
                    c ? (
                      <Link key="c" href={productHref(r, c)} prefetch={false} className="text-brand underline-offset-2 hover:underline">
                        {money(c.lowestPriceCents, r.market)} <span className="text-muted">{c.productType}</span>
                      </Link>
                    ) : (
                      <span key="c" className="text-faint">None open</span>
                    ),
                  ],
                };
              })}
            />
          </LiveBlock>
        ),
      },
      {
        id: "cheapest",
        title: "The cheapest Universes Beyond sealed products",
        body: <LiveBlock r={r} checked={data.checked}><CardTable r={r} caption={`The cheapest Universes Beyond sealed products in ${r.inName} today`} products={all.slice(0, 10)} /></LiveBlock>,
      },
      {
        id: "what-it-is",
        title: "What Universes Beyond sets sell",
        body: (
          <Prose>
            <p>
              The earlier Universes Beyond releases (Warhammer 40,000, Doctor Who, Fallout, Assassin’s Creed) were sold as Commander decks and Collector Boosters; from Final
              Fantasy on, they are full sets with Play Boosters, Bundles and Commander decks. Each set’s page lists everything stores have of it. For decks, see the{" "}
              <a href={guideHref(r, "commander-precon-price-guide")}>Commander precon price guide</a>.
            </p>
          </Prose>
        ),
      },
      faqSection([
        { q: "What is Magic: The Gathering Universes Beyond?", a: "Universes Beyond is the name Wizards of the Coast gives to Magic sets based on other franchises, such as The Lord of the Rings, Final Fantasy and Star Trek." },
        { q: `How many Universes Beyond sealed products are in stock in ${r.inName}?`, a: `${open} at the stores MTG Compare checks today, across ${UB_SETS.length} Universes Beyond sets.` },
        { q: "Which Universes Beyond set is next?", a: next ? `${next.name}, out in English on ${formatRelease(next.releaseDate)}.` : "Every Universes Beyond set MTG Compare tracks is already out." },
      ]),
      whereToBuy(r, { tcg: { query: "Magic Universes Beyond", label: "Universes Beyond sealed" } }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
