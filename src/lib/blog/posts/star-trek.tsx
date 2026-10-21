// The four Star Trek posts. Every fact is src/content/star-trek.ts's, with its source; every price is a store's live listing.
import type { MarketCard } from "@/content/families";
import {
  longDate,
  PLAYGROUP_STAR_TREK,
  STAR_TREK_CHECKED,
  STAR_TREK_DATES,
  STAR_TREK_MECHANICS,
  STAR_TREK_PRECONS,
  STAR_TREK_PRODUCTS,
  STAR_TREK_TRADEMARK,
  STAR_TREK_TREATMENTS,
  starTrekLine,
  WIZARDS_COLLECTING_STAR_TREK,
  WIZARDS_STAR_TREK,
} from "@/content/star-trek";
import { money } from "@/lib/format";
import type { PostData } from "../data";
import { ByMarket, Lede, MarketsBlock, NoFx, Note, Prose, StackTable, type PostOutline, type PostSection } from "../kit";

const Src = ({ s }: { s: { label: string; url: string } }) => (
  <a href={s.url} rel="noopener">
    {s.label}
  </a>
);

const lineOf = (p: MarketCard) => starTrekLine(p.name)?.name ?? "Star Trek";
const isLine = (names: string[]) => (p: MarketCard) => names.includes(starTrekLine(p.name)?.name ?? "");
const out = (d: PostData) => d.today >= STAR_TREK_DATES.release;

function prices(d: PostData, title: string, keep: (p: MarketCard) => boolean = () => true, take = 10): PostSection {
  return {
    id: "prices",
    title,
    body: (
      <>
        <MarketsBlock checked={d.checked}>
          <ByMarket cards={d.named} keep={keep} take={take} label={lineOf} />
        </MarketsBlock>
        <NoFx />
      </>
    ),
  };
}

const trademark = (): PostSection => ({
  id: "sources",
  title: "Sources",
  body: (
    <Prose>
      <p>
        <Src s={WIZARDS_STAR_TREK} />; <Src s={WIZARDS_COLLECTING_STAR_TREK} />; <Src s={PLAYGROUP_STAR_TREK} /> for what is marked as reported. Read{" "}
        {longDate(STAR_TREK_CHECKED)}.
      </p>
      <p className="text-xs">{STAR_TREK_TRADEMARK}</p>
    </Prose>
  ),
});

const msrpTable = () => (
  <>
    <StackTable
      caption="Star Trek US MSRP"
      head={["Product", "US MSRP"]}
      rows={STAR_TREK_PRODUCTS.filter((p) => p.msrpUsCents != null).map((p) => ({ key: p.name, th: <span className="font-semibold text-ink">{p.name}</span>, cells: [`${money(p.msrpUsCents, "US")} a ${p.each}`] }))}
    />
    <p className="mt-2 text-xs leading-5 text-muted">
      Wizards of the Coast’s US list prices, from its Collecting Star Trek article. Stores set their own; Wizards sets none for a box of boosters or the Prerelease Pack.
    </p>
  </>
);

export const releaseDate = {
  outline(d: PostData): PostOutline {
    return {
      intro: (
        <Lede>
          Magic: The Gathering | Star Trek {out(d) ? "came out" : "comes out"} on <strong>{longDate(STAR_TREK_DATES.release)}</strong>. Prerelease events run from{" "}
          {longDate(STAR_TREK_DATES.prerelease.from)} to {longDate(STAR_TREK_DATES.prerelease.to)}, and it reaches MTG Arena on {longDate(STAR_TREK_DATES.arena)}. Here is
          every sealed product, what it holds, and what stores ask for it today.
        </Lede>
      ),
      sections: [
        {
          id: "dates",
          title: "Key dates",
          body: (
            <StackTable
              caption="Star Trek key dates"
              head={["What", "When"]}
              rows={[
                { key: "first", th: <span className="font-semibold text-ink">First look</span>, cells: [longDate(STAR_TREK_DATES.firstLook)] },
                { key: "pre", th: <span className="font-semibold text-ink">Prerelease events</span>, cells: [`${longDate(STAR_TREK_DATES.prerelease.from)} to ${longDate(STAR_TREK_DATES.prerelease.to)}`] },
                { key: "arena", th: <span className="font-semibold text-ink">MTG Arena</span>, cells: [longDate(STAR_TREK_DATES.arena)] },
                { key: "rel", th: <span className="font-semibold text-ink">Release</span>, cells: [longDate(STAR_TREK_DATES.release)] },
              ]}
            />
          ),
        },
        {
          id: "products",
          title: "Every product, and what it holds",
          body: (
            <>
              <Prose>
                <ul>
                  {STAR_TREK_PRODUCTS.map((p) => (
                    <li key={p.name}>
                      <strong>{p.name}:</strong> {p.holds}
                    </li>
                  ))}
                </ul>
                <p>Wizards has cancelled the Star Trek Beginner Box.</p>
              </Prose>
              {msrpTable()}
            </>
          ),
        },
        prices(d, "What stores ask today"),
        trademark(),
      ],
    };
  },
};

export const commanderDecks = {
  outline(d: PostData): PostOutline {
    return {
      intro: (
        <Lede>
          Commander: Star Trek is four ready-to-play 100-card decks, each also sold as a Collector’s Edition in surge foil. Here is what each deck holds, what has been reported
          of their colours and themes, and what stores ask for them today.
        </Lede>
      ),
      sections: [
        {
          id: "decks",
          title: "The four decks",
          body: (
            <>
              <StackTable
                caption="The four Star Trek Commander decks"
                head={["Deck", "Colours", "Theme"]}
                align="left"
                rows={STAR_TREK_PRECONS.map((p) => ({ key: p.name, th: <span className="font-semibold text-ink">{p.name}</span>, cells: [`${p.colours} (${p.identity})`, p.theme] }))}
              />
              <Note>
                The deck names are Wizards’. Their colours and themes are as <Src s={PLAYGROUP_STAR_TREK} /> reports them; Wizards had published no decklists when we read it.
              </Note>
            </>
          ),
        },
        {
          id: "contents",
          title: "What’s in the box",
          body: (
            <Prose>
              {STAR_TREK_PRODUCTS.filter((p) => /Commander/.test(p.name)).map((p) => (
                <p key={p.name}>
                  <strong>{p.name}</strong> (US MSRP {money(p.msrpUsCents, "US")}): {p.holds}
                </p>
              ))}
            </Prose>
          ),
        },
        prices(d, "Commander deck prices today", isLine(["Commander Deck", "Collector's Edition Commander Deck"]), 8),
        trademark(),
      ],
    };
  },
};

export const mechanics = {
  outline(d: PostData): PostOutline {
    return {
      intro: (
        <Lede>
          Star Trek brings three new mechanics, assimilate, face a dilemma and federation, and the return of Spacecraft and station from Edge of Eternities. Here is how Wizards
          of the Coast describes each, the set’s special card treatments, and where its boosters are in stock.
        </Lede>
      ),
      sections: [
        {
          id: "mechanics",
          title: "The mechanics, in Wizards’ words",
          body: (
            <Prose>
              {STAR_TREK_MECHANICS.map((m) => (
                <div key={m.name}>
                  <h3>{m.name}</h3>
                  <p>{m.says}</p>
                </div>
              ))}
            </Prose>
          ),
        },
        {
          id: "booster-fun",
          title: "Booster Fun: the special treatments",
          body: (
            <Prose>
              <ul>
                {STAR_TREK_TREATMENTS.map((t) => (
                  <li key={t.name}>
                    <strong>{t.name}:</strong> {t.what}
                  </li>
                ))}
              </ul>
            </Prose>
          ),
        },
        prices(d, "Boosters in stock today", (p) => /booster|bundle/i.test(p.name), 6),
        trademark(),
      ],
    };
  },
};

export const whereToBuyStarTrek = {
  outline(d: PostData): PostOutline {
    return {
      intro: (
        <Lede>
          {out(d) ? "Star Trek is out" : `Star Trek releases on ${longDate(STAR_TREK_DATES.release)}`}, and stores in all seven markets we compare list it. Here is what each
          market’s stores ask today, in their own currency, with the US MSRP Wizards set.
        </Lede>
      ),
      sections: [
        prices(d, out(d) ? "Star Trek in stock, by market" : "Star Trek pre-orders, by market"),
        { id: "msrp", title: "The US MSRP", body: msrpTable() },
        {
          id: "tips",
          title: "Before you order",
          body: (
            <Prose>
              <ul>
                <li>A pre-order ships when the store receives stock: check its ship date.</li>
                <li>Check whether a box is a Play Booster or a Collector Booster box: they differ a lot in price.</li>
                <li>Prices exclude shipping, and a store abroad adds postage and import charges.</li>
              </ul>
            </Prose>
          ),
        },
        trademark(),
      ],
    };
  },
};
