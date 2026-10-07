import { HubIntro } from "@/components/HubIntro";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, ColorDots, InShort } from "@/components/ui";
import { COLORS, COLOR_KEYS } from "@/lib/constants";
import { COUNTRIES } from "@/lib/country";
import { getCatalog } from "@/lib/data";
import { leaderSlug } from "@/lib/facets";
import { money } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { cardImage } from "@/lib/images";
import { headline } from "@/lib/price";
import { pageOg } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: "One Piece Leader Cards — Every Leader, Priced",
  description:
    "Every One Piece Card Game Leader card by colour, with its life, power and the cheapest price for each printing.",
  alternates: { canonical: "/leaders" },
  openGraph: pageOg("/leaders"),
};

export default async function LeadersPage() {
  const country = getCountry();
  const cat = await getCatalog();
  const all = cat.cards.filter((x) => x.cardType === "Leader");
  // One row per Leader (card number), listing its printings' cheapest price.
  const byNumber = new Map<string, typeof all>();
  for (const c of all)
    if (c.number)
      (
        byNumber.get(c.number) ?? byNumber.set(c.number, []).get(c.number)!
      ).push(c);
  const leaders = [...byNumber.values()].map((ps) => {
    const base = ps.find((p) => p.printing === "standard") ?? ps[0];
    return { base, prints: ps };
  });
  const groups = [
    ...COLOR_KEYS.map((k) => ({
      title: k,
      hex: COLORS[k].hex,
      rows: leaders.filter(
        (l) => l.base.colors.length === 1 && l.base.colors[0] === k,
      ),
    })),
    {
      title: "Multicolour",
      hex: "#94a3b8",
      rows: leaders.filter((l) => l.base.colors.length > 1),
    },
  ];
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Leaders" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
        One Piece Leader cards
      </h1>
      <HubIntro path="/leaders" />
      <div className="mt-6">
        <InShort>
          {leaders.length} Leaders across six colours and the multicolour
          Leaders. Alternate-art Leaders are listed on each Leader&apos;s page.
        </InShort>
      </div>
      {groups
        .filter((g) => g.rows.length)
        .map((g) => (
          <section key={g.title} className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-xl text-white">
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: g.hex }}
              />
              {g.title} Leaders{" "}
              <span className="text-sm font-normal text-slate-500">
                ({g.rows.length})
              </span>
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {g.rows
                .sort((a, b) =>
                  (a.base.number ?? "").localeCompare(b.base.number ?? ""),
                )
                .map(({ base, prints }) => {
                  const h = headline(base, country);
                  return (
                    <Link
                      key={base.id}
                      href={`/leaders/${leaderSlug(base.name, base.number)}`}
                      className="card-surface flex items-center gap-3 p-3 hover:border-ink-600"
                    >
                      {base.hasImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cardImage.thumb(base.id)}
                          alt=""
                          loading="lazy"
                          className="h-16 w-12 shrink-0 rounded bg-ink-800 object-cover"
                        />
                      ) : (
                        <span className="h-16 w-12 shrink-0 rounded bg-ink-800" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-white">
                          {base.name}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-slate-400">
                          <ColorDots colors={base.colors} /> {base.number} ·
                          Life {base.life ?? "—"} ·{" "}
                          {base.power?.toLocaleString("en-US") ?? "—"}
                        </span>
                        <span className="text-xs text-slate-500">
                          {prints.length} printing
                          {prints.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="num shrink-0 text-sm font-semibold text-accent">
                        {h.cents == null
                          ? "—"
                          : `${h.kind === "reference" ? "≈" : ""}${money(h.cents, country)}`}
                      </span>
                    </Link>
                  );
                })}
            </div>
          </section>
        ))}
    </div>
  );
}
