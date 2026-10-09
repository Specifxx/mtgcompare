import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Breadcrumbs, Faq, InShort, JsonLd } from "@/components/ui";
import { COUNTRIES } from "@/lib/country";
import { priceDeck } from "@/lib/deck-price";
import { money } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { faqLd } from "@/lib/jsonld";
import { pageOg } from "@/lib/og/meta";
import { ipKey, rateLimit } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/site";
import { DeckBuilder } from "@/components/DeckBuilder";
import { HubIntro } from "@/components/HubIntro";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";
import { decodeList } from "@/lib/deck";
import { getEmailStatus } from "@/lib/data";

export const dynamic = "force-dynamic";

const TITLE = "Magic Deck Price Calculator — Price Any Decklist";
const DESC =
  "Paste a Magic: The Gathering decklist and price every card at the cheapest in-stock store in your market, with TCGplayer's market price, a total and a link to each store. Checks Commander legality and colour identity. Free, no account.";

// ?list= is UTF-8 base64 (lib/deck.ts encodeList, the encoding Best Basket
// decodes); a plain list from an older link still reads as itself.
function readList(sp: { list?: string | string[] }): string {
  const v = Array.isArray(sp.list) ? sp.list[0] : sp.list;
  return decodeList((v ?? "").slice(0, 12000));
}

// A shared list unfurls with its own total ("This Magic deck costs $X"),
// priced exactly as the page prices it (each card's cached offers, stores and
// TCGplayer only), so the unfurl and the page quote the same total. That is up
// to DECK_DETAIL_CAP card loads per request, so it shares /api/deck/price's
// per-IP budget; past it the page unfurls with the generic title.
export async function generateMetadata({ searchParams }: { searchParams: { list?: string | string[] } }): Promise<Metadata> {
  const base: Metadata = { title: TITLE, description: DESC, alternates: { canonical: "/deck" }, openGraph: pageOg("/deck") };
  const list = readList(searchParams);
  if (!list.trim()) return base;
  try {
    if (!rateLimit(`deck-price:${ipKey(new Request("http://deck.local/", { headers: headers() }))}`, 30, 60_000).ok) return base;
    const country = getCountry();
    const r = await priceDeck(list, country);
    const t = r.totals[country];
    if (!t.cents) return base;
    const title = `This Magic deck costs ${money(t.cents, country)}`;
    const description = `${t.totalQty} cards, priced at the cheapest in-stock store in ${COUNTRIES[country].place} on MTG Compare.`;
    return { ...base, robots: { index: false, follow: true }, openGraph: pageOg("/deck", { title, description }), twitter: { card: "summary_large_image", title, description } };
  } catch {
    return base;
  }
}

const FAQS = [
  {
    q: "Which decklist formats does the deck pricer read?",
    a: "The exports of the common Magic deck builders (Moxfield, Archidekt, MTG Arena, MTGO, Deckbox), plain quantities (4 Lightning Bolt or 4x Lightning Bolt), names with a set and number (1 Sol Ring (C21) 263) and names alone, which count as one copy. Section headers such as Commander, Companion, Deck and Sideboard are understood, and a Commander section sets the commander. A line it cannot match is listed under the total with a search for it, never silently dropped. Up to 200 lines are priced.",
  },
  {
    q: "Which printing does it price?",
    a: "A bare card name is priced at its cheapest printing. Add a set code for the cheapest printing of that set, a set and number for one exact printing, or mark a line *F* (foil) or *E* (etched) to price that finish. Every line has a printing switch, and the choice is kept in the share link.",
  },
  {
    q: "Does it check my deck is legal?",
    a: "Pick a format and it checks the deck size, the copy limit, banned cards and, for Commander, the commander, the singleton rule and colour identity. Legality is Scryfall's. A card whose legality we do not know is left alone rather than called illegal.",
  },
  {
    q: "Where do the prices come from?",
    a: "Each card is priced at its cheapest in-stock listing among the stores MTG Compare reads in your market (TCGplayer's cheapest listing counts in the US), refreshed once a day. TCGplayer's market price is shown beside it as a reference. A card with only a thin single listing is shown as low only. Totals are item prices; postage is charged by each store.",
  },
  {
    q: "Is it free?",
    a: "Yes, with no account. To buy the list, \"Buy this deck for less\" hands it to Best Basket, which prices the whole order with each store's measured postage: a Premium tool that shows which store to buy each card from.",
  },
];

export default async function DeckPage({ searchParams }: { searchParams: { list?: string | string[] } }) {
  const c = COUNTRIES[getCountry()];
  const emailOn = (await getEmailStatus()) === "on";
  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Magic Deck Price Calculator",
          url: `${SITE_URL}/deck`,
          applicationCategory: "UtilitiesApplication",
          operatingSystem: "Web",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />
      <JsonLd data={faqLd(FAQS)} />
      <Breadcrumbs trail={[{ href: "/tools", name: "Tools" }, { name: "Deck Price Calculator" }]} />
      <h1 className="mb-3 text-2xl font-extrabold text-white">Deck Price Calculator</h1>
      <DeckBuilder initialList={readList(searchParams)} emailOn={emailOn} />
      {/* The editorial intro sits BELOW the builder: /deck opens on the tool. */}
      <HubIntro path="/deck" className="mt-8 max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400" />
      <div className="mt-6">
        <InShort>
          Paste any Magic decklist and every card is matched to its printing and priced at the cheapest in-stock store in {c.place}, with a total,
          a link to each store and the same list priced in all six markets. Switch any line to another printing or its foil, check the list against a
          format, copy a link that loads your list, or hand it to{" "}
          <Link href="/tools/best-basket" className="text-brand-400 hover:underline">
            Best Basket
          </Link>{" "}
          for the cheapest delivered order.
        </InShort>
      </div>
      <RelatedGuides guides={guidesForTool("/deck")} />
      <section className="mt-8 max-w-3xl">
        <h2 className="mb-3 text-2xl text-white">Questions</h2>
        <Faq items={FAQS} />
      </section>
    </div>
  );
}
