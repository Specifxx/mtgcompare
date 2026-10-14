import Link from "next/link";
import { Callout } from "@/components/blog/BlogBits";
import { UnitTable } from "@/components/blog/UnitTable";
import { Delta } from "@/components/ui";
import { finishLabel } from "../../constants";
import type { CardLite } from "../../data";
import { longDate, money, pct, shortDate } from "../../format";
import { indexChange } from "../../portfolio-performance";
import { MONTH_MOVER_ROWS, MOVER_FLOOR_CENTS, moveOf, moverList } from "../select";
import type { Post, PostSection } from "../types";
import { cardLabel } from "../util";

const FLOOR = money(MOVER_FLOOR_CENTS, "US");
const unit = (c: CardLite): string => finishLabel(c, c.headFinish).toLowerCase();
/** A move's size without its sign, for a sentence that already says up or down. */
const size = (v: number | null): string => (v == null ? "—" : `${Math.abs(v).toFixed(1)}%`);

// The weekly movers as a post: the free /movers feed (the headline unit of each tracked card, one row per card) told as a report, with the
// month's moves once the history holds thirty days. Ranked by the TCGplayer MARKET change of the unit shown; the finish of every row is named.
// Not Rising Cards: nothing here forecasts, and no paid ranking is read.
export const priceMovers: Post = {
  slug: "magic-card-price-movers",
  title: ({ cat }) => `Biggest Magic Card Price Movers This Week (${shortDate(cat.pricesAt)})`,
  description: `The Magic: The Gathering cards whose TCGplayer market price rose or fell the most over the last seven days, one printing per row with its finish named, among cards worth ${FLOOR} or more.`,
  tags: ["prices", "market", "movers"],
  date: "2026-10-14",
  minutes: 5,
  related: [
    { href: "/movers", label: "Weekly movers" },
    { href: "/market", label: "MTG Compare Index" },
    { href: "/price-guide", label: "Price guide" },
  ],
  faq: [
    {
      q: "How is a weekly price move worked out?",
      a: `We compare each card's TCGplayer market price today with its market price seven days earlier, in US dollars, and rank the change as a percentage. Each printing is ranked once, in the finish its headline price uses, and only cards worth ${FLOOR} or more today are ranked.`,
    },
    {
      q: "Why is a card I follow missing from the list?",
      a: `A card appears only when its price was recorded at both ends of the week, it is worth ${FLOOR} or more today and its move is among the largest. Price history is kept for printings worth about ${FLOOR} and up, so cheaper cards have no weekly move. The card's own page always shows its current price.`,
    },
    {
      q: "Does a rising price mean I should buy now?",
      a: "Not on its own. A spike often follows news, such as a ban, a reprint announcement or a new card that combines with an old one, and some spikes cool within weeks. Compare the card's price across stores on its page and look at its history first; nothing here is a forecast or financial advice.",
    },
    {
      q: "Are foil and non-foil prices ranked separately?",
      a: "Each printing appears once, in the finish its headline price uses: the non-foil when it has a price, otherwise the foil. The finish is named under the card in every row, so a foil price is never read as the plain card's. Every card page shows both finishes.",
    },
    {
      q: "How often is this report updated?",
      a: "Prices are imported once a day, and the tables are rebuilt from the newest import each time the page is generated. The [movers page](/movers) shows the same feed with sparklines and a best-value list.",
    },
  ],
  build: ({ movers, index, overview, country }) => {
    const firstDay = index[0]?.day ?? null;
    const readyOn = firstDay ? new Date(Date.parse(firstDay) + 7 * 864e5).toISOString().slice(0, 10) : null;
    const method: PostSection = {
      id: "method",
      title: "How this list is made",
      body: (
        <ul>
          <li>Every figure is TCGplayer&apos;s market price in US dollars, a reference built from recent sales, so a move reads the same in every market.</li>
          <li>A move is the change in that price over seven days (thirty for the monthly tables), as a percentage.</li>
          <li>
            Only cards worth {FLOOR} or more today are ranked. Price history is kept for printings at about that price and up, so every row has a recorded week
            behind it, and a card worth a few cents cannot top the list by moving a few cents.
          </li>
          <li>Each row is one printing in one finish: the non-foil when it has a price, otherwise the foil. Tokens, art cards and other non-game cards are never ranked.</li>
          <li>
            It is the feed the <Link href="/movers">movers page</Link> shows, rebuilt with every daily import. It describes the past week; it does not forecast the
            next one.
          </li>
        </ul>
      ),
    };
    if (!movers) {
      return {
        heroCards: [],
        summary: [],
        lede: (
          <p>
            The movers feed could not be read just now, so this report has no tables on this page load. The same lists are on the <Link href="/movers">movers page</Link>.
          </p>
        ),
        sections: [method],
      };
    }
    const up = moverList(movers.up7, "up", 7);
    const down = moverList(movers.down7, "down", 7);
    const up30 = moverList(movers.up30, "up", 30, { n: MONTH_MOVER_ROWS });
    const down30 = moverList(movers.down30, "down", 30, { n: MONTH_MOVER_ROWS });
    const week = indexChange(index, 7);
    const breadth = overview.advancing + overview.declining > 0 ? overview : null;
    const rise = up[0];
    const fall = down[0];
    const change = (window: 7 | 30) => ({ head: window === 7 ? "7 days" : "30 days", cell: (c: CardLite) => <Delta v={moveOf(c, window)} /> });
    const heroCards = [up[0], down[0], up[1], down[1]].filter((c): c is CardLite => !!c && c.hasImage).slice(0, 3);

    if (!up.length && !down.length) {
      return {
        heroCards: [],
        summary: [<>No card worth {FLOOR} or more has a recorded weekly move yet.</>],
        lede: (
          <p>
            <strong>This report needs a week of price history, and it is still being built.</strong> MTG Compare&apos;s price history starts on{" "}
            {firstDay ? longDate(firstDay) : "the day of its first import"}; a weekly move needs two prices seven days apart, so the tables fill in
            {readyOn ? ` from ${longDate(readyOn)}` : " a week after that"}. Until then, today&apos;s prices are in the <Link href="/price-guide">price guide</Link>.
          </p>
        ),
        sections: [method],
      };
    }

    const sections: PostSection[] = [];
    if (up.length) {
      sections.push({
        id: "risers",
        title: `The ${up.length} biggest risers this week`,
        body: (
          <>
            <p>
              Ranked by how far the TCGplayer market price rose over seven days. &ldquo;Cheapest in&rdquo; is the lowest in-stock listing we track in your market today;
              when no store has the card it is a reference converted from the US price.
            </p>
            <UnitTable cards={up} country={country} extra={change(7)} />
          </>
        ),
      });
    }
    if (down.length) {
      sections.push({
        id: "fallers",
        title: `The ${down.length} biggest fallers this week`,
        body: (
          <>
            <p>The same ranking the other way: the largest falls in TCGplayer market price over seven days.</p>
            <UnitTable cards={down} country={country} extra={change(7)} />
          </>
        ),
      });
    }
    if (up30.length || down30.length) {
      sections.push({
        id: "month",
        title: "The month's biggest moves",
        body: (
          <>
            <p>Over thirty days a one-week spike and a slow slide look different. The largest moves over the month:</p>
            {up30.length ? <UnitTable cards={up30} country={country} extra={change(30)} here={false} caption="Up the most over 30 days" /> : null}
            {down30.length ? <UnitTable cards={down30} country={country} extra={change(30)} here={false} caption="Down the most over 30 days" /> : null}
          </>
        ),
      });
    }
    sections.push(
      {
        id: "why",
        title: "Why Magic card prices move",
        body: (
          <>
            <p>Most weekly moves have one of a few causes:</p>
            <ul>
              <li>
                <strong>Bans and unbans.</strong> A card banned in a format loses the players who needed it; a card unbanned, or one that replaces a banned card,
                gains them.
              </li>
              <li>
                <strong>Reprints.</strong> A new printing in a Commander deck or a Masters set adds supply, and older printings of the card usually follow its price
                down.
              </li>
              <li>
                <strong>New cards.</strong> A card revealed for an upcoming set can make an old card much better in a deck, and the old card&apos;s price moves before
                the new one is out.
              </li>
              <li>
                <strong>Tournament results and new decks.</strong> A deck that wins draws players to its cards within days.
              </li>
              <li>
                <strong>A set&apos;s first weeks.</strong> New cards often start high and fall as boxes are opened and supply arrives.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "reading",
        title: "Reading a move",
        body: (
          <>
            <p>
              A percentage says more about a cheap card than a dear one: a {FLOOR} card that gains a few dollars can top the risers, while a large move in dollars on a
              card worth hundreds may be a small one in percent. The price column shows where each card stands now, and the{" "}
              <Link href="/blog/most-expensive-magic-cards">most expensive Magic cards</Link> are ranked on their own.
            </p>
            <p>
              TCGplayer&apos;s market price follows sales, so it moves after the listings do. What you pay is the cheapest listing in your market: each card&apos;s page
              compares the stores we track. For the cards nearly every Commander deck plays, the <Link href="/blog/commander-staples-prices">Commander staples price list</Link>{" "}
              shows what each costs at its cheapest ordinary printing.
            </p>
            <Callout title="Follow a card">
              Watch a card from its page to see its price history and be told when it moves, rather than buying in the week of a spike.
            </Callout>
          </>
        ),
      },
      method,
    );

    return {
      heroCards,
      summary: [
        rise ? (
          <>
            <strong>The biggest riser this week</strong> is <Link href={`/card/${rise.slug}`}>{cardLabel(rise)}</Link> ({unit(rise)}), up {size(moveOf(rise, 7))} to{" "}
            {money(rise.marketUsd, "US")}.
          </>
        ) : null,
        fall ? (
          <>
            <strong>The biggest faller</strong> is <Link href={`/card/${fall.slug}`}>{cardLabel(fall)}</Link> ({unit(fall)}), down {size(moveOf(fall, 7))} to{" "}
            {money(fall.marketUsd, "US")}.
          </>
        ) : null,
        week != null ? (
          <>
            The <Link href="/market">MTG Compare Index</Link> moved {pct(week)} over the same seven days
            {breadth ? `, with ${breadth.advancing.toLocaleString("en-US")} of the cards it follows up and ${breadth.declining.toLocaleString("en-US")} down` : ""}.
          </>
        ) : null,
        <>Every figure is TCGplayer&apos;s market price in US dollars, for cards worth {FLOOR} or more today; each row names its printing and finish.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>Which Magic cards moved the most this week?</strong> This report ranks the cards we track by how far their TCGplayer market price moved over the last
          seven days, up and down. Each row is one printing in one finish (the non-foil when it has a price, otherwise the foil), and only cards worth {FLOOR} or more
          today are ranked, so a few cents on a bulk card cannot top the list. It is rebuilt from the newest prices each time the page is generated.
        </p>
      ),
      sections,
    };
  },
};
