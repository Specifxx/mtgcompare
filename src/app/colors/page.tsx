import { HubIntro } from "@/components/HubIntro";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, InShort } from "@/components/ui";
import { COLORS, COLOR_KEYS } from "@/lib/constants";
import { getCatalog } from "@/lib/data";
import { int, money } from "@/lib/format";
import { pageOg } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: "One Piece Card Colours — Red, Green, Blue, Purple, Black, Yellow",
  description:
    "Browse One Piece Card Game cards by colour, each with its cards and live prices compared across stores.",
  alternates: { canonical: "/colors" },
  openGraph: pageOg("/colors"),
};

export default async function ColorsPage() {
  const cat = await getCatalog();
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Colours" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
        One Piece cards by colour
      </h1>
      <HubIntro path="/colors" />
      <div className="mt-6">
        <InShort>
          Multicolour cards appear on each of their colours&apos; pages, so the
          counts below add up to more than the card database.
        </InShort>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COLOR_KEYS.map((k) => {
          const cs = cat.cards.filter((x) => x.colors.includes(k));
          const leaders = cs.filter(
            (x) => x.cardType === "Leader" && x.printing === "standard",
          ).length;
          const top = [...cs].sort(
            (a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0),
          )[0];
          return (
            <Link
              key={k}
              href={`/colors/${COLORS[k].slug}`}
              className="card-surface group relative overflow-hidden p-5 hover:border-ink-600"
            >
              <span
                className="absolute inset-y-0 left-0 w-1.5"
                style={{ background: COLORS[k].hex }}
              />
              <h2 className="text-2xl text-white group-hover:text-brand-400">
                {k}
              </h2>
              <p className="text-sm text-slate-400">{COLORS[k].tagline}</p>
              <p className="num mt-3 text-sm text-slate-300">
                {int(cs.length)} printings · {leaders} Leaders
              </p>
              {top ? (
                <p className="mt-1 truncate text-xs text-slate-500">
                  Top card: {top.name}{" "}
                  <span className="num text-accent">
                    {money(top.marketUsd, "US")}
                  </span>
                </p>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
