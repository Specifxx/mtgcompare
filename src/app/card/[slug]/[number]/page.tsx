import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/ui";
import { setNumberOutcome } from "@/lib/card-seo";
import { nkey } from "@/lib/constants";
import { resolveBySetNumber, type CardLite } from "@/lib/data";
import { money } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { headline } from "@/lib/price";

// /card/<Scryfall set code>/<collector number>, e.g. /card/cmm/270. The first
// segment is named [slug] because sibling dynamic directories must share one
// name (a differently named [sc] beside [slug] makes `next build` throw); here
// it holds the set code. One match redirects to the card's own page; several
// are listed, never guessed. Reads the published data only.
export const dynamic = "force-dynamic";

type Props = { params: { slug: string; number: string } };

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function SetNumberPage({ params }: Props) {
  const set = decodeURIComponent(params.slug).toLowerCase();
  const number = decodeURIComponent(params.number);
  const key = nkey(number);
  if (!key || !/^[a-z0-9]{2,8}$/.test(set)) notFound();
  const found = await resolveBySetNumber([{ set, number }]).catch(() => new Map<string, CardLite[]>());
  const outcome = setNumberOutcome(found.get(`${set}|${key}`));
  if (outcome.kind === "missing") notFound();
  if (outcome.kind === "redirect") permanentRedirect(outcome.to);
  const country = getCountry();
  return (
    <div>
      <Breadcrumbs trail={[{ href: "/browse", name: "Cards" }, { name: `${set.toUpperCase()} ${number}` }]} />
      <h1 className="text-2xl font-extrabold text-white">
        {set.toUpperCase()} #{number}
      </h1>
      <p className="mt-2 text-sm text-slate-400">More than one product has this set code and number. Pick the one you mean.</p>
      <ul className="mt-4 divide-y divide-ink-800 card-surface">
        {outcome.cards.map((c) => {
          const h = headline(c, country);
          return (
            <li key={c.id}>
              <Link href={`/card/${c.slug}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-800/60">
                <span className="min-w-0 truncate text-sm font-semibold text-white">
                  {c.name}
                  {c.label ? <span className="text-slate-400"> ({c.label})</span> : null}
                </span>
                <span className="num shrink-0 text-sm text-accent">{h.cents != null ? money(h.cents, country) : "No price yet"}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
