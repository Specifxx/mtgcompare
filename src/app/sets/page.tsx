import { EbayChase } from "@/components/EbayChase";
import { HubIntro } from "@/components/HubIntro";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, InShort, SectionHeader } from "@/components/ui";
import { SET_KINDS } from "@/lib/constants";
import { COUNTRIES } from "@/lib/country";
import { getCatalog, type CardLite, type SetLite } from "@/lib/data";
import { int, longDate, money, shortDate } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { upcomingSets } from "@/lib/selectors";
import { pageOg } from "@/lib/og/meta";
import { withArticle } from "@/lib/filter-chips";

export const metadata: Metadata = {
  title: "One Piece Sets — Card Lists & Prices for Every Set",
  description:
    "Every One Piece Card Game set in release order — booster sets, extra boosters, premium boosters, starter decks and promos — each with its full card list and live prices.",
  alternates: { canonical: "/sets" },
  openGraph: pageOg("/sets"),
};

function SetCard({
  s,
  cards,
  country,
}: {
  s: SetLite;
  cards: CardLite[];
  country: ReturnType<typeof getCountry>;
}) {
  const top = [...cards].sort(
    (a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0),
  )[0];
  const priced = cards.filter((c) => c.low[country] != null).length;
  return (
    <Link
      href={`/sets/${s.slug}`}
      className="card-surface group flex flex-col p-4 hover:border-ink-600"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="rb-eyebrow text-slate-500">
          {s.code}
        </span>
        <span className="rounded bg-ink-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
          {int(s.cardCount)} cards
        </span>
      </div>
      <h3 className="mt-2 text-lg leading-snug text-white group-hover:text-brand-400">
        {s.name}
      </h3>
      <p className="text-xs text-slate-400">
        {s.releasedOn
          ? `Released ${shortDate(s.releasedOn)}`
          : "Release date TBA"}
      </p>
      <div className="mt-auto pt-3 text-xs text-slate-400">
        {top?.marketUsd ? (
          <p className="truncate">
            Top card: <span className="text-slate-200">{top.name}</span>{" "}
            <span className="num text-accent">
              {money(top.marketUsd, "US")}
            </span>
          </p>
        ) : null}
        <p>
          {int(priced)} with {withArticle(COUNTRIES[country].adjective)} listing
        </p>
      </div>
    </Link>
  );
}

export default async function SetsPage() {
  const country = getCountry();
  const c = COUNTRIES[country];
  const cat = await getCatalog();
  const bySet = new Map<number, CardLite[]>();
  for (const card of cat.cards)
    (bySet.get(card.setId) ?? bySet.set(card.setId, []).get(card.setId)!).push(
      card,
    );
  const today = new Date().toISOString().slice(0, 10);
  const released = cat.sets.filter(
    (s) => !s.releasedOn || s.releasedOn <= today,
  );
  const upcoming = upcomingSets(cat.sets);
  const groups = Object.entries(SET_KINDS)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([kind, v]) => ({
      kind,
      label: v.plural,
      sets: released
        .filter((s) => s.kind === kind)
        .sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? "")),
    }))
    .filter((g) => g.sets.length);
  const boosters = released.filter((s) => s.kind === "booster").length;

  return (
    <div>
      <div className="card-surface border-brand-500/40 p-6 sm:p-8">
        <Breadcrumbs trail={[{ name: "Sets" }]} />
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
          One Piece sets — card lists &amp; prices
        </h1>
        <HubIntro path="/sets" />
        <div className="mt-6">
          <InShort>
            The One Piece Card Game has {boosters} released booster sets plus
            extra boosters, premium boosters,{" "}
            {released.filter((s) => s.kind === "starter").length} starter and
            ultra decks and years of promos
            {upcoming.length ? `, with ${upcoming.length} more announced` : ""}.
            Every set below links to its complete card list with the lowest live
            price for each card.
          </InShort>
        </div>
      </div>

      {upcoming.length ? (
        <section className="mt-10">
          <SectionHeader
            title="Coming soon"
            sub="Announced sets, with pre-order prices where TCGplayer and stores list them."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((s) => (
              <Link
                key={s.id}
                href={`/sets/${s.slug}`}
                className="card-surface flex items-center justify-between gap-3 p-4 hover:border-ink-600"
              >
                <span>
                  <span className="rb-eyebrow text-slate-500">
                    {s.code}
                  </span>
                  <span className="block text-base font-bold text-white">
                    {s.name}
                  </span>
                </span>
                <span className="text-right text-xs text-slate-400">
                  {longDate(s.releasedOn)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {groups.map((g) => (
        <section key={g.kind} className="mt-10">
          <SectionHeader title={g.label} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.sets.map((s) => (
              <SetCard
                key={s.id}
                s={s}
                cards={bySet.get(s.id) ?? []}
                country={country}
              />
            ))}
          </div>
        </section>
      ))}
      <EbayChase page="sets" className="mt-2" />
    </div>
  );
}
