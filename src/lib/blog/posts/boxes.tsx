// The two booster-box posts: the cheapest boxes in stock in each market, and the dearest. Built from the stores' live listings.
import Link from "@/components/Link";
import { FAMILY } from "@/content/families";
import type { PostData } from "../data";
import {
  ByMarket,
  Lede,
  MarketsBlock,
  NoFx,
  Prose,
  type PostOutline,
} from "../kit";

const KINDS = () => (
  <Prose>
    <ul>
      <li>
        <strong>Play Booster box:</strong> the main box of every set since
        Murders at Karlov Manor (2024), of 30 or 36 packs depending on the set.
      </li>
      <li>
        <strong>Collector Booster box:</strong> {FAMILY["collector-box"].packs}{" "}
        Collector Boosters, packs made of foils and special versions of cards.
      </li>
      <li>
        <strong>Draft Booster box</strong> ({FAMILY["draft-box"].packs} packs)
        and <strong>Set Booster box</strong> ({FAMILY["set-box"].packs} packs):
        the boxes of the sets before Play Boosters.
      </li>
    </ul>
  </Prose>
);

export const cheapest = {
  outline(data: PostData): PostOutline {
    return {
      intro: (
        <Lede>
          The cheapest Magic: The Gathering booster boxes in stock today, market
          by market, from the stores we compare. A box’s price per pack shows
          where its pack count is certain: a Collector Booster box always holds{" "}
          {FAMILY["collector-box"].packs}.
        </Lede>
      ),
      sections: [
        {
          id: "cheapest",
          title: "The cheapest booster boxes in stock, by market",
          body: (
            <>
              <MarketsBlock checked={data.checked}>
                <ByMarket cards={data.boxes} />
              </MarketsBlock>
              <NoFx />
            </>
          ),
        },
        { id: "kinds", title: "Which kind of box is which", body: KINDS() },
        {
          id: "before-you-buy",
          title: "Before you buy the cheapest",
          body: (
            <Prose>
              <p>
                The cheapest box is often an older set’s, or a Draft or Set
                Booster box. Check the set and the kind of booster, and add
                shipping: our prices exclude it. More in the guide{" "}
                <Link href="/us/guides/play-booster-vs-collector-booster-vs-bundle">
                  Play Booster vs Collector Booster vs Bundle
                </Link>
                .
              </p>
            </Prose>
          ),
        },
      ],
    };
  },
};

export const dearest = {
  outline(data: PostData): PostOutline {
    return {
      intro: (
        <Lede>
          The most expensive Magic: The Gathering booster boxes in stock today,
          in each of the seven markets we compare, at each one’s cheapest store
          price. Most of the top end is Collector Booster boxes and boxes of
          older sets.
        </Lede>
      ),
      sections: [
        {
          id: "dearest",
          title: "The dearest booster boxes in stock, by market",
          body: (
            <>
              <MarketsBlock checked={data.checked}>
                <ByMarket cards={data.boxes} />
              </MarketsBlock>
              <NoFx />
            </>
          ),
        },
        {
          id: "kinds",
          title: "Play, Collector, Draft and Set Booster boxes",
          body: KINDS(),
        },
        {
          id: "cheapest",
          title: "Looking for the cheapest instead?",
          body: (
            <Prose>
              <p>
                See{" "}
                <Link href="/blog/cheapest-magic-booster-boxes">
                  the cheapest Magic booster boxes in stock
                </Link>
                , or the price per pack of every set on the{" "}
                <Link href="/us/cheapest-packs">cheapest packs</Link> page.
              </p>
            </Prose>
          ),
        },
      ],
    };
  },
};
