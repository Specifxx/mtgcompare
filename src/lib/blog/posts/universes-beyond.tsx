// The Universes Beyond post (owner, 2026-11-04: insightful posts on the latest trends, the history and where things are going).
// The calendar counts are src/lib/sets.ts's (what the site itself lists); the live blocks are the dearest boxes in stock in every
// market and the Star Trek products open today. No value talk, no forecast of a price: what has happened, and what is dated.
import Link from "@/components/Link";
import { SETS } from "@/lib/sets";
import type { PostData } from "../data";
import { ByMarket, Lede, MarketsBlock, NoFx, Prose, StackTable, type PostOutline } from "../kit";

const YEARS = ["2022", "2023", "2024", "2025", "2026"] as const;

function calendar() {
  return YEARS.map((y) => {
    const sets = SETS.filter((s) => s.releaseDate.startsWith(y));
    const ub = sets.filter((s) => s.series === "Universes Beyond");
    return { y, total: sets.length, ub: ub.length, names: ub.map((s) => s.name) };
  });
}

export const universesBeyond = {
  outline(data: PostData): PostOutline {
    const cal = calendar();
    return {
      intro: (
        <Lede>
          Four years ago a Magic: The Gathering set was, almost always, a Magic story. In 2026 more than half of the sets in our release
          calendar are licensed worlds: Teenage Mutant Ninja Turtles, Marvel Super Heroes, The Hobbit and, on 13 November, Star Trek.
          This post counts how that happened year by year, looks at what it did to the sealed shelf (the dearest boxes in stock today
          are below, market by market), and lays out what is already dated for the next twelve months. Dates are English release dates
          from our calendar; the live blocks show today&rsquo;s store listings.
        </Lede>
      ),
      sections: [
        {
          id: "by-year",
          title: "Universes Beyond, year by year",
          body: (
            <>
              <Prose>
                <p>
                  Universes Beyond is Wizards of the Coast&rsquo;s name for Magic sets built on someone else&rsquo;s world. The first full
                  booster set was The Lord of the Rings: Tales of Middle-earth in June 2023; before that the crossovers were Commander decks
                  (Warhammer 40,000, October 2022) and Secret Lair drops. Counting the sets with sealed product in our calendar:
                </p>
              </Prose>
              <StackTable
                caption="Sets with sealed product in MTG Compare's release calendar, by year, and how many are Universes Beyond"
                head={["Year", "Sets", "Universes Beyond", "Which"]}
                rows={cal.map((r) => ({ key: r.y, th: r.y, cells: [String(r.total), String(r.ub), r.names.join(", ") || "—"] }))}
              />
              <Prose>
                <p>
                  The step up is 2025. Final Fantasy (June 2025) was the first Universes Beyond set to release as a Standard-legal set rather
                  than a side product, and Hasbro described it in its second-quarter 2025 results as the best-selling Magic set it had ever
                  made. Marvel&rsquo;s Spider-Man and Avatar: The Last Airbender followed in the same year. In 2026 the pattern is set: a
                  licensed set every other release, each one Standard-legal, each one with Play Boosters, Collector Boosters, a Bundle and
                  Commander decks like any in-universe set.
                </p>
                <p>
                  Two things did not change. Every set still ships the same product families, so the{" "}
                  <Link href="/us/guides/play-booster-vs-collector-booster-vs-bundle">Play Booster vs Collector Booster vs Bundle</Link>{" "}
                  choice is the same for Star Trek as for Reality Fracture. And the in-universe sets did not stop: Lorwyn Eclipsed, Secrets of
                  Strixhaven and Reality Fracture released around the licensed ones in 2026, with Edge of Eternities and Tarkir: Dragonstorm in
                  2025.
                </p>
              </Prose>
            </>
          ),
        },
        {
          id: "shelf",
          title: "What it did to the sealed shelf: the dearest boxes in stock today",
          body: (
            <>
              <Prose>
                <p>
                  The clearest effect is at the top of the price list. Here are the most expensive booster boxes in stock in each market
                  today, at each one&rsquo;s cheapest store. Look at the set names: how many are licensed worlds, and how many are Collector
                  Booster boxes.
                </p>
              </Prose>
              <MarketsBlock checked={data.checked}>
                <ByMarket cards={data.boxes} take={6} />
              </MarketsBlock>
              <NoFx />
              <Prose>
                <p>
                  Why licensed sets sit there: they are bought by two groups at once. Magic players buy them as they buy any set, and fans
                  of the licensed world buy them who may never play a game. A Collector Booster box, the product made of foils and special
                  versions, is the one both groups want, and it is the one stores list highest. Our{" "}
                  <Link href="/us/guides/universes-beyond-sealed-price-guide">Universes Beyond sealed price guide</Link> tracks every
                  licensed set&rsquo;s products by market, and the{" "}
                  <Link href="/us/guides/collector-booster-box-prices">Collector Booster box prices</Link> guide lists every set&rsquo;s box.
                </p>
                <p>
                  Prices are shown in each market&rsquo;s own currency and never converted, so compare within a market, not across
                  them. Shipping is extra everywhere.
                </p>
              </Prose>
            </>
          ),
        },
        {
          id: "star-trek",
          title: "Star Trek, 13 November: what is open for pre-order today",
          body: (
            <>
              <Prose>
                <p>
                  The next licensed set is Magic: The Gathering | Star Trek, out in English on 13 November 2026 with prerelease events from
                  6 November. Here is every Star Trek product the stores we compare have open today, cheapest first in each market. Our{" "}
                  <Link href="/blog/magic-star-trek-release-date-products">release date and products</Link> post has what each one holds, and{" "}
                  <Link href="/blog/star-trek-mtg-chase-cards">the chase cards</Link> post lists every mythic rare.
                </p>
              </Prose>
              <MarketsBlock checked={data.checked}>
                <ByMarket cards={data.named} take={6} />
              </MarketsBlock>
              <NoFx />
            </>
          ),
        },
        {
          id: "next",
          title: "What is already dated for the next twelve months",
          body: (
            <Prose>
              <p>
                We do not predict prices, and we do not print a date Wizards has not published. What is on the calendar as of today is on
                the <Link href="/us/releases">release calendar</Link> and in the{" "}
                <Link href="/us/guides/magic-release-dates-preorder-calendar">release dates and pre-order guide</Link>, which is rebuilt
                from the same list every day. Three things about the shape of it are worth knowing before you buy:
              </p>
              <ul>
                <li>
                  <strong>Licensed sets rotate like Standard sets now.</strong> Final Fantasy, Spider-Man, Avatar, TMNT, Marvel Super Heroes,
                  The Hobbit and Star Trek are all Standard-legal, so their sealed product is bought by tournament players for the cards
                  inside as well as by collectors for the box. That is new since 2025, and it is why these boxes sell through at ordinary
                  store prices rather than sitting as premium side products the way Lord of the Rings did.
                </li>
                <li>
                  <strong>The product line is identical across both kinds of set.</strong> Pack counts, families and the Bundle&rsquo;s contents
                  are the same, so the <Link href="/us/guides/how-many-packs-in-magic-products">packs-per-product</Link> rules apply without
                  exception. Only the Commander decks differ: a licensed set&rsquo;s decks are built on its own characters.
                </li>
                <li>
                  <strong>Reprint policy is the open question.</strong> Wizards has said licensed sets are printed to demand like any set, and
                  nothing in our data contradicts that. What we can show is the price of every box in every market today, and whether it is
                  in stock; what we will not do is tell you what it will cost next year.
                </li>
              </ul>
              <p>
                If you want the cheapest way in rather than the dearest, start with{" "}
                <Link href="/blog/cheapest-magic-booster-boxes">the cheapest Magic booster boxes in stock</Link> and{" "}
                <Link href="/us/guides/cheapest-way-to-buy-magic-packs">the cheapest way to buy Magic packs</Link>.
              </p>
            </Prose>
          ),
        },
      ],
    };
  },
};
