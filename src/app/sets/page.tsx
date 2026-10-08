import { EbayChase } from "@/components/EbayChase";
import { HubIntro } from "@/components/HubIntro";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, InShort, SectionHeader } from "@/components/ui";
import { HIDDEN_SET_KINDS, SET_KINDS } from "@/lib/constants";
import { getSets, getSetValueStats, getUpcomingSets, type SetLite } from "@/lib/data";
import { int, longDate, money, shortDate } from "@/lib/format";
import { pageOg } from "@/lib/og/meta";

// Every route that reaches the published data is dynamic: a build reads no data host (CLAUDE.md, contract C26).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Magic: The Gathering Sets — Card Lists & Prices for Every Set",
  description:
    "Every Magic: The Gathering set in release order: expansions, core sets, masters sets, Commander products, Secret Lair drops and promos, each with its full card list and live prices.",
  alternates: { canonical: "/sets" },
  openGraph: pageOg("/sets"),
};

function SetCard({ s, valueCents }: { s: SetLite; valueCents: number | null }) {
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
        {valueCents ? (
          <p className="truncate">
            Cards of $1 or more:{" "}
            <span className="num text-accent">{money(valueCents, "US")}</span> at market
          </p>
        ) : null}
        <p>{int(s.trackedCount)} tracked in stores</p>
      </div>
    </Link>
  );
}

export default async function SetsPage() {
  const [all, upcoming, values] = await Promise.all([getSets(), getUpcomingSets(60), getSetValueStats()]);
  const today = new Date().toISOString().slice(0, 10);
  // The hidden kinds (Art Series, oversized) are reachable by their link, not listed here.
  const released = all.filter((s) => (!s.releasedOn || s.releasedOn <= today) && !HIDDEN_SET_KINDS.includes(s.kind));
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
  const expansions = released.filter((s) => s.kind === "expansion").length;

  return (
    <div>
      <div className="card-surface border-brand-500/40 p-6 sm:p-8">
        <Breadcrumbs trail={[{ name: "Sets" }]} />
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
          Magic: The Gathering sets — card lists &amp; prices
        </h1>
        <HubIntro path="/sets" />
        <div className="mt-6">
          <InShort>
            Magic has {expansions} released expansions plus core sets, masters
            sets, Commander products, Secret Lair drops and years of promos
            {upcoming.length ? `, with ${upcoming.length} more announced` : ""}.
            Every set below links to its complete card list with the lowest live
            price for each card, Normal and Foil.
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
              <SetCard key={s.id} s={s} valueCents={values.get(s.id)?.totalCents ?? null} />
            ))}
          </div>
        </section>
      ))}
      <EbayChase page="sets" className="mt-2" />
    </div>
  );
}
