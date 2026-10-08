"use client";

import { useState } from "react";
import Link from "next/link";
import { CardTile, type CardTileCard } from "@/components/CardTile";
import { Reveal } from "@/components/Reveal";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

export type TileItem = { card: CardTileCard; setCode: string };
type ItemWithDelta = TileItem & { pct: number };

type Tab = {
  key: string;
  label: string;
  heading: string;
  description: string;
  allHref: string;
  allLabel: string;
  items: TileItem[];
  deltas?: number[]; // when set, a % caption under each tile
};

// RiftCompare's PopularCardsCarousel: one SegmentedTabs strip, each tab a horizontal snap-scroller of card tiles: "Popular", "Chase
// cards", "Biggest movers", "Recently updated". Every panel stays in the DOM (renderAllPanels) so all lists are crawlable and feed the
// page's ItemList JSON-LD.
//
// "Popular" is the published EDHREC order (Scryfall's edhrec_rank: how many Commander decks play a card) and says so; no counter of ours
// sits behind it. "Chase cards" is the catalogue's dearest printings on their market price, a different list: a Black Lotus is chased
// by collectors, not played in every Commander deck.
export function PopularCardsCarousel({
  popular,
  chase,
  movers,
  recentlyUpdated,
  storeCount,
  storeWord,
}: {
  popular: TileItem[];
  chase: TileItem[];
  movers: ItemWithDelta[];
  recentlyUpdated: ItemWithDelta[];
  storeCount: number;
  storeWord: string;
}) {
  const tabs: Tab[] = [
    ...(popular.length === 0
      ? []
      : [
          {
            key: "popular",
            label: "Popular",
            heading: "Most popular Magic cards",
            description: `The cards Commander players run most (EDHREC's ranking) — compare ${storeCount} ${storeWord} for every one to find the best price.`,
            allHref: "/browse?sort=popular",
            allLabel: "View all →",
            items: popular,
          },
        ]),
    ...(chase.length === 0
      ? []
      : [
          {
            key: "chase",
            label: "Chase cards",
            heading: "Chase cards",
            description: "The most valuable printings in the database, on TCGplayer's market price — the cards collectors hunt.",
            allHref: "/browse",
            allLabel: "View all →",
            items: chase,
          },
        ]),
    ...(movers.length > 0
      ? [
          {
            key: "movers",
            label: "Biggest movers",
            heading: "Biggest movers",
            description: "Magic cards moving the most this week, up or down, in TCGplayer's market price.",
            allHref: "/movers",
            allLabel: "See all movers →",
            items: movers,
            deltas: movers.map((m) => m.pct),
          },
        ]
      : []),
    ...(recentlyUpdated.length > 0
      ? [
          {
            key: "recent",
            label: "Recently updated",
            heading: "Recently updated prices",
            description: `${recentlyUpdated.length} Magic cards whose price just changed — updated with every daily price refresh.`,
            allHref: "/movers",
            allLabel: "See all movers →",
            items: recentlyUpdated,
            deltas: recentlyUpdated.map((u) => u.pct),
          },
        ]
      : []),
  ];

  const [active, setActive] = useState(tabs[0]?.key ?? "");
  if (tabs.length === 0) return null;

  return (
    <section>
      <SegmentedTabs
        label="Popular cards"
        active={active}
        onActiveChange={setActive}
        renderAllPanels
        tabs={tabs.map((t) => ({
          key: t.key,
          label: t.label,
          content: (
            <div>
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold text-white">{t.heading}</h2>
                  <p className="mt-0.5 text-sm text-slate-400">{t.description}</p>
                </div>
                <Link href={t.allHref} className="btn-ghost shrink-0 text-xs">
                  {t.allLabel}
                </Link>
              </div>
              <div className="relative">
                <Reveal stagger className="-mx-1 flex snap-x scroll-px-1 gap-4 overflow-x-auto px-1 pb-2">
                  {t.items.map((it, i) => {
                    const pct = t.deltas?.[i];
                    return (
                      <div key={it.card.id} className="w-36 shrink-0 snap-start sm:w-44">
                        <CardTile card={it.card} setCode={it.setCode} />
                        {pct != null && (
                          <p className={`num mt-1 text-center text-xs font-bold ${pct > 0 ? "text-up" : "text-down"}`}>
                            {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%
                          </p>
                        )}
                      </div>
                    );
                  })}
                </Reveal>
                <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-ink-950 to-transparent sm:w-16" />
              </div>
            </div>
          ),
        }))}
      />
    </section>
  );
}
