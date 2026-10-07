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

const TITLE = "One Piece Deck Price Calculator — Price Any Decklist";
const DESC =
  "Paste a One Piece Card Game decklist and price every card at the cheapest in-stock store in your market, with TCGplayer's market price, a total and a link to each store. Free, no account.";

// ?list= is UTF-8 base64 (lib/deck.ts encodeList, the encoding Best Basket
// decodes); a plain list from an older link still reads as itself.
function readList(sp: { list?: string | string[] }): string {
  const v = Array.isArray(sp.list) ? sp.list[0] : sp.list;
  return decodeList((v ?? "").slice(0, 12000));
}

// A shared list unfurls with its own total ("This One Piece deck costs $X"),
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
    const title = `This One Piece deck costs ${money(t.cents, country)}`;
    const description = `${t.totalQty} cards, priced at the cheapest in-stock store in ${COUNTRIES[country].place} on OP Compare.`;
    return { ...base, robots: { index: false, follow: true }, openGraph: pageOg("/deck", { title, description }), twitter: { card: "summary_large_image", title, description } };
  } catch {
    return base;
  }
}

const FAQS = [
  {
    q: "Which decklist formats does the deck pricer read?",
    a: "The exports of the common One Piece deck builders (4xOP01-016, as OPTCGSim, Egman and Limitless write them), plain quantities (4 OP01-016 or OP01-016 x4), names with numbers (4 Nami (OP01-016)) and names alone, which count as one copy. Section headers such as Leader, Characters, Events and DON!! are skipped, and DON!! cards are never priced. A line it cannot match is listed under the total with a search for it, never silently dropped. Up to 200 lines are priced.",
  },
  {
    q: "Which printing does it price?",
    a: "A card number on its own means the card's standard print. Every line has a printing switch, so you can price the Parallel, Manga, SP or a reprint instead; the switch is kept in the share link. A name without a number is matched to the card most printings share, and a name we could only match in part is marked as a guess with a search to fix it.",
  },
  {
    q: "Where do the prices come from?",
    a: "Each card is priced at its cheapest in-stock listing among the stores OP Compare reads in your market (TCGplayer's cheapest listing counts in the US), refreshed twice a day. TCGplayer's market price is shown beside it as a reference. Totals are item prices; postage is charged by each store.",
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
          name: "One Piece Deck Price Calculator",
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
          Paste any One Piece decklist and every card is matched to its exact printing and priced at the cheapest in-stock store in {c.place}, with
          a total, a link to each store and the same list priced in all six markets. Switch any line to its Parallel or Manga print, copy a link that
          loads your list, or hand it to{" "}
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
