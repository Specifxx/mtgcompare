import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, InShort, SectionHeader } from "@/components/ui";
import { RELEASE_SET_KINDS, SET_KINDS } from "@/lib/constants";
import { getSets } from "@/lib/data";
import { int, longDate } from "@/lib/format";
import { pageOg } from "@/lib/og/meta";
import { DATA_TABLE } from "@/components/prose";
import { ReleaseCountdownTimer } from "@/components/ReleaseCountdownTimer";
import { ReleaseAlertSlot } from "@/components/ReleaseAlertSlot";

// Every route that reaches the published data is dynamic: a build reads no data host (CLAUDE.md, contract C26).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Magic: The Gathering Release Dates — Next Set & Every Past Set",
  description:
    "When the next Magic: The Gathering set comes out, and the release date of every expansion, core set, masters set and Commander product, with the announced sets still to come.",
  alternates: { canonical: "/release-dates" },
  openGraph: pageOg("/release-dates"),
};

function daysUntil(iso: string): number {
  return Math.ceil((Date.parse(iso) - Date.now()) / 864e5);
}

export default async function ReleaseDates() {
  const today = new Date().toISOString().slice(0, 10);
  const main = (await getSets()).filter((s) => RELEASE_SET_KINDS.includes(s.kind) && s.releasedOn);
  const upcoming = main
    .filter((s) => s.releasedOn! > today)
    .sort((a, b) => a.releasedOn!.localeCompare(b.releasedOn!));
  const past = main
    .filter((s) => s.releasedOn! <= today)
    .sort((a, b) => b.releasedOn!.localeCompare(a.releasedOn!));
  const next = upcoming[0];
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Release dates" }]} />
      <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
        Magic: The Gathering release dates
      </h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        The release date of every Magic expansion, core set, masters set and
        Commander product, newest first, with the announced sets still to come.
        Dates are the sets&apos; release dates as published by Scryfall and
        TCGplayer for the English product; a set can ship to stores or
        pre-release events a week or so before its street date.
      </p>
      {next ? (
        <div className="mt-6">
          <InShort>
            The next set is{" "}
            <Link href={`/sets/${next.slug}`} className="text-brand-400 hover:underline">
              {next.name}
            </Link>{" "}
            ({next.code}), out {longDate(next.releasedOn)} —{" "}
            {int(Math.max(0, daysUntil(next.releasedOn!)))} days from today.
          </InShort>
          {/* The day line above is server-computed (no-JS and crawlers); the ticking
              timer starts from the same date at 00:00 UTC. */}
          <ReleaseCountdownTimer targetIso={`${next.releasedOn}T00:00:00Z`} />
          <p className="mt-4 text-center text-sm">
            <a href="/release-dates/calendar" className="font-semibold text-brand-400 hover:underline">
              Add {next.code} to your calendar (.ics) →
            </a>
          </p>
        </div>
      ) : null}
      {next ? <ReleaseAlertSlot setSlug={next.slug} setName={next.name} releasedOn={next.releasedOn} source="release-dates" className="mt-6 max-w-2xl" /> : null}
      {upcoming.length ? (
        <section className="mt-8">
          <SectionHeader title="Coming up" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((s) => (
              <Link
                key={s.id}
                href={`/sets/${s.slug}`}
                className="card-surface p-4 hover:border-ink-600"
              >
                <p className="rb-eyebrow text-slate-500">
                  {s.code} · {SET_KINDS[s.kind]?.label}
                </p>
                <p className="mt-1 text-lg font-bold text-white">{s.name}</p>
                <p className="num mt-2 text-sm text-slate-300">
                  {longDate(s.releasedOn)} · in{" "}
                  {int(Math.max(0, daysUntil(s.releasedOn!)))} days
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <section className="mt-10">
        <SectionHeader title="Released" />
        <div className="card-surface overflow-x-auto">
          <table className={`${DATA_TABLE} min-w-[560px]`}>
            <thead>
              <tr>
                <th>Released</th>
                <th>Set</th>
                <th>Type</th>
                <th className="text-right">Printings</th>
              </tr>
            </thead>
            <tbody>
              {past.map((s) => (
                <tr key={s.id}>
                  <td className="num whitespace-nowrap text-slate-300">
                    {longDate(s.releasedOn)}
                  </td>
                  <td>
                    <Link
                      href={`/sets/${s.slug}`}
                      className="font-semibold text-brand-400 hover:underline"
                    >
                      {s.name}
                    </Link>{" "}
                    <span className="text-xs text-slate-500">{s.code}</span>
                  </td>
                  <td className="text-slate-400">{SET_KINDS[s.kind]?.label}</td>
                  <td className="num text-right text-slate-300">
                    {int(s.cardCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
