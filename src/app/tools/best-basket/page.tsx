import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { HubIntro } from "@/components/HubIntro";
import { HubFaq } from "@/components/HubFaq";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { SITE_URL } from "@/lib/site";
import { faqLd } from "@/lib/jsonld";
import { pageOg } from "@/lib/og/meta";
import { getCatalog, getEmailStatus } from "@/lib/data";
import { RARITY_KEYS } from "@/lib/constants";
import { parseScope } from "@/lib/set-scope";
import { decodeList, DECK_LINE_CAP } from "@/lib/deck";
import { BestBasket, type BasketSetOption, type BasketSetStart, type BasketSource } from "@/components/BestBasket";
import { loadBasketPrefs } from "@/lib/basket-server";
import { findOwnDeckWatch } from "@/lib/deck-watch";
import { initialMinCondition, storedMinCondition } from "@/lib/basket-condition";
import PlanButton from "@/components/PlanButton";
import { formatMeasuredDate, marketHasZonePricing, marketMeasuredAt, marketMeasuredPlaces, regionFromGeo, regionOptionsFor } from "@/lib/shipping";

export const dynamic = "force-dynamic";

const TITLE = "Best Basket — Cheapest Way to Buy a Magic Deck | MTG Compare";
const DESCRIPTION =
  "Paste a Magic: The Gathering decklist, or send your watchlist, and get the cheapest delivered way to buy it across stores — each store's measured postage included. A Premium tool: the store-by-store plan beside the best one-store and two-store orders, at the minimum condition you set.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/tools/best-basket" },
  openGraph: pageOg("/tools/best-basket", { title: TITLE, description: DESCRIPTION }),
};

// What a visitor wants to know before signing in or upgrading — also the
// substance a crawler sees while logged out, since the tool itself renders only
// for a signed-in account. Every claim here is something the tool does today.
const FAQS = [
  {
    q: "Is Best Basket free?",
    a: "No. Best Basket is an MTG Compare Premium tool: the delivered total, the store-by-store plan with a link for every card, and the best one-store and two-store orders beside it. The deck and list pricer at /deck stays free and shows every card's cheapest price.",
  },
  {
    q: "Does it account for shipping?",
    a: "Yes — that's the whole point. Buying each card from its individual cheapest store usually spreads an order over a dozen stores and buries the saving in postage. Best Basket searches store combinations for the lowest total including each store's postage, and with Premium it also shows the best one-store and two-store orders beside it. The postage is each store's own checkout rate, measured for orders of different sizes and values to addresses across your market (in the US: New York, Chicago, Dallas and San Francisco): the store's rate name, whether its name says it's tracked, where a cheap untracked letter stops being offered, and the order value where postage goes free, if it ever does. It starts from your region and prices it at the address we measured there, or at the dearer of the two either side of it; leave it unset and it uses each store's highest. An order bigger than any we measured is marked 'from', a store we haven't measured yet (and TCGplayer, where every seller charges their own postage) is marked as an estimate, and the store's own checkout is always final.",
  },
  {
    q: "What can I paste in?",
    a: `Any decklist or card list, one card per line — the exports of the common Magic deck builders ("4 Lightning Bolt (M11) 149"), plain quantities ("4 Lightning Bolt"), names with a set code ("1 Sol Ring (C21)") or plain names. A set and number pick that exact printing and a bare name is priced at its cheapest printing; a "#" product id from /deck pins a specific printing, and "*F*" marks a foil copy. Section headers such as Commander, Deck and Sideboard are understood (the maybeboard is left out), and any line we can't match is listed back to you rather than dropped. A list is priced up to its first ${DECK_LINE_CAP} lines, and the page tells you when yours runs past that. Signed in, you can also send your watchlist.`,
  },
  {
    q: "Is the cheapest split guaranteed to be the cheapest possible?",
    a: "It's the cheapest the search finds, not a proof — with free-shipping thresholds there's no fast exact answer. It is never dearer than buying each card's cheapest copy separately, or than the single-store and two-store orders shown beside it so you can compare. The single-store order is the cheapest one store offers; the two-store order is the cheapest split the search finds, shown only when it beats buying everything from one store. One exception: where an order is bigger than any the store's checkout was measured on and its postage was still rising with size, the search allows for it to keep rising, so an order resting on that store's 'from' figure can show a slightly lower total than the one it picks.",
  },
  {
    q: "What does minimum condition do?",
    a: "Premium lets you set the lowest condition you'll accept: Near Mint only, Lightly Played or better, or anything. Best Basket and the deck price watch then only use listings at or above it, so the cheapest plan can't quietly include a heavily played copy. Each line still shows its condition. Each store's price is the best-condition copy it lists, so if nothing at that grade is in stock the card is shown as not covered rather than filled with a played copy. A new session starts on Lightly Played or better, and your last choice is remembered.",
  },
  {
    q: "Do I need Premium just to price a list, not buy it?",
    a: "No — the free deck and list pricer at /deck needs no account at all if you only want per-card prices. Premium is only needed for Best Basket.",
  },
];

interface Params {
  list?: string;
  source?: string;
  watch?: string;
  set?: string;
  scope?: string;
  rarity?: string;
  skipOwned?: string;
}

// This page's own URL with its entry parameters, for the sign-in round trip.
function selfHref(sp: Params): string {
  const q = new URLSearchParams();
  if (sp.list) q.set("list", sp.list);
  if (sp.source === "watchlist" || sp.source === "binder") q.set("source", sp.source);
  if (sp.source === "set" && typeof sp.set === "string" && /^[a-z0-9-]{1,80}$/i.test(sp.set)) {
    q.set("source", "set");
    q.set("set", sp.set);
    if (typeof sp.scope === "string") q.set("scope", sp.scope);
    if (typeof sp.rarity === "string" && (RARITY_KEYS as readonly string[]).includes(sp.rarity)) q.set("rarity", sp.rarity);
  }
  if (sp.skipOwned === "1") q.set("skipOwned", "1");
  const qs = q.toString();
  return qs ? `/tools/best-basket?${qs}` : "/tools/best-basket";
}

export default async function BestBasketPage({ searchParams }: { searchParams: Params }) {
  const user = await getCurrentUser();
  // The store-by-store plan is PREMIUM; any account gets the preview. The
  // route enforces the same split — this only picks the UI.
  const premium = isPremium(user, "premium");
  const country = getCountry();
  const info = COUNTRIES[country];
  // A saved deck price watch (?watch=, from its alert or /watching): its OWNER,
  // while Premium, gets the list run straight away with the delivery it was
  // saved with. One primary-key read, scoped to the viewer.
  const watchRow = premium && user && typeof searchParams.watch === "string" ? await findOwnDeckWatch(user.id, searchParams.watch) : null;
  // The minimum condition to start on: a saved watch's own floor, else the
  // member's last choice, else "LP or better" for a new session.
  const startFloor = watchRow ? storedMinCondition(watchRow.minCondition) : premium && user ? initialMinCondition(await loadBasketPrefs(user.id)) : initialMinCondition(null);
  const initialList = watchRow ? watchRow.listText : searchParams.list ? decodeList(searchParams.list) : undefined;
  // "Finish a set" (?source=set&set=<slug>&scope=&rarity=, from the set checklist's
  // "Plan the purchase"): only a known, RELEASED set starts the source; anything
  // else is the ordinary paste tab. An unreleased set is a disabled option.
  const today = new Date().toISOString().slice(0, 10);
  const cat = await getCatalog();
  const setOptions: BasketSetOption[] = [...cat.sets]
    .filter((x) => x.cardCount > 0)
    .sort((a, b) => (b.releasedOn ?? "9999").localeCompare(a.releasedOn ?? "9999"))
    .map((x) => ({ code: x.code, slug: x.slug, name: x.name, released: !!x.releasedOn && x.releasedOn <= today }));
  const wantedSet = typeof searchParams.set === "string" ? searchParams.set.toLowerCase() : "";
  const startSet = wantedSet ? setOptions.find((x) => x.slug === wantedSet) : undefined;
  const initialSet: BasketSetStart | null =
    !watchRow && searchParams.source === "set" && startSet?.released
      ? {
          slug: startSet.slug,
          scope: parseScope(searchParams.scope),
          rarity: typeof searchParams.rarity === "string" && (RARITY_KEYS as readonly string[]).includes(searchParams.rarity) ? searchParams.rarity : null,
        }
      : null;
  const initialSource: BasketSource = watchRow
    ? "deck"
    : initialSet
      ? "set"
      : searchParams.source === "watchlist" || searchParams.source === "binder"
        ? searchParams.source
        : "deck";
  const handedIn = initialSource !== "deck" || !!initialList?.trim();
  const regions = regionOptionsFor(country);
  const measuredAt = formatMeasuredDate(marketMeasuredAt(country)) || null;
  // The visitor's region from Vercel's geo headers (this page is already
  // dynamic, so reading them costs no caching): the picker starts there.
  const h = headers();
  const geoRegion = regionFromGeo(country, h.get("x-vercel-ip-country"), h.get("x-vercel-ip-country-region"));
  const emailOn = (await getEmailStatus()) === "on";

  return (
    <div className="mx-auto max-w-4xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
                { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
                { "@type": "ListItem", position: 3, name: "Best Basket", item: `${SITE_URL}/tools/best-basket` },
              ],
            },
            // No `offers`: the full tool is paid.
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Magic Best Basket Optimiser",
              url: `${SITE_URL}/tools/best-basket`,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web",
              description: "Find the cheapest delivered way to buy a whole Magic: The Gathering deck or card list across stores — each store's measured postage included.",
            },
            faqLd(FAQS),
          ]),
        }}
      />
      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">
            Home
          </Link>
          <span>/</span>
          <Link href="/tools" className="hover:text-slate-300">
            Tools
          </Link>
          <span>/</span>
          <span className="text-slate-300">Best Basket</span>
        </nav>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Best Basket Optimiser</h1>
        <HubIntro path="/tools/best-basket" />
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          The cheapest way to actually <strong className="text-slate-200">buy</strong> a whole deck or card list — not just the lowest price per
          card, but the lowest <strong className="text-slate-200">delivered total</strong> across {info.adjective} stores once each store&apos;s
          real postage is counted — measured from its own checkout, not guessed. Buying each card from its cheapest store usually spreads your
          order over a dozen stores and buries you in postage; this searches for a better split and shows it store by store,
          beside the best one-store and two-store orders. A Premium tool.
        </p>
      </div>

      {user && premium ? (
        <BestBasket
          full
          initialList={initialList}
          initialSource={initialSource}
          initialSkipOwned={searchParams.skipOwned === "1"}
          sets={setOptions}
          initialSet={initialSet}
          initialMinCondition={startFloor}
          autoRun={premium && handedIn}
          market={country}
          regions={regions}
          zonePriced={marketHasZonePricing(country)}
          measuredAt={measuredAt}
          measuredTo={marketMeasuredPlaces(country)}
          geoRegion={geoRegion}
          watch={watchRow ? { id: watchRow.id, name: watchRow.name, region: watchRow.region, trackedOnly: !!watchRow.trackedOnly, minCondition: storedMinCondition(watchRow.minCondition) } : null}
          emailOn={emailOn}
        />
      ) : user ? (
        <div className="card-surface p-6 text-center">
          <h2 className="text-lg font-extrabold text-white">Best Basket is a Premium tool</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            Premium finds the cheapest delivered way to buy your whole list across {info.adjective} stores, postage included, and shows which store to
            buy each card from, beside the best one-store and two-store orders.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <PlanButton surface="gate:basket" tier="premium" />
            <Link href="/deck" className="btn-ghost text-sm">
              Free deck and list pricer
            </Link>
          </div>
        </div>
      ) : (
        <div className="card-surface p-6 text-center">
          <h2 className="text-lg font-extrabold text-white">Sign in to use Best Basket</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            Best Basket is part of MTG Compare Premium: the cheapest delivered order for your whole list, store by store, postage included.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link href={`/login?next=${encodeURIComponent(selfHref(searchParams))}&src=tool_gate`} rel="nofollow" className="btn-primary text-sm">
              Sign in free
            </Link>
            <Link href="/tools" className="btn-ghost text-sm">
              Browse free tools
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-600">
            Just want per-card prices? The{" "}
            <Link href="/deck" className="text-brand-400 hover:underline">
              deck and list pricer
            </Link>{" "}
            needs no account.
          </p>
        </div>
      )}

      {/* Rendered regardless of sign-in state, so a signed-out visitor — and the
          crawler that indexes this page while logged out — gets real substance
          beyond the sign-in card above. */}
      <RelatedGuides guides={guidesForTool("/tools/best-basket")} className="card-surface mt-8 p-5" />
      <HubFaq faqs={FAQS} />
    </div>
  );
}
