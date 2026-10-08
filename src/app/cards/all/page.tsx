import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/Pagination";
import { Breadcrumbs } from "@/components/ui";
import { getOracleAZ } from "@/lib/data";
import { int } from "@/lib/format";
import { pageOg } from "@/lib/og/meta";

// /cards/all — an A-Z index of ORACLE names (a rules object, however many printings it has), 100 a page, one letter at a time. Each name opens its card hub,
// /cards/name/[oracleSlug], where every printing is listed.
export const dynamic = "force-dynamic";
type Props = { searchParams: { letter?: string; page?: string } };
const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];
const PER = 100;
const letterOf = (v: string | undefined): string => (v && LETTERS.includes(v.toUpperCase()) ? v.toUpperCase() : "A");
const pageOf = (v: string | undefined): number => Math.max(1, parseInt(v ?? "1", 10) || 1);
const hrefOf = (letter: string, page = 1): string => `/cards/all${letter !== "A" || page > 1 ? `?letter=${encodeURIComponent(letter)}${page > 1 ? `&page=${page}` : ""}` : ""}`;

export function generateMetadata({ searchParams }: Props): Metadata {
  const letter = letterOf(searchParams.letter), page = pageOf(searchParams.page);
  return {
    title: `Every Magic Card A–Z — ${letter === "#" ? "Names Starting With a Number or Symbol" : `Names Starting With ${letter}`}`,
    description: "An A–Z index of every Magic: The Gathering card name, each linking to its printings and live prices.",
    alternates: { canonical: hrefOf(letter, page) },
    openGraph: pageOg(hrefOf(letter, page)),
  };
}

export default async function AllCardsPage({ searchParams }: Props) {
  const letter = letterOf(searchParams.letter), page = pageOf(searchParams.page);
  const { total, items } = await getOracleAZ(letter, page);
  const pages = Math.max(1, Math.ceil(total / PER));
  return (
    <div>
      <Breadcrumbs trail={[{ href: "/cards", name: "Cards" }, { name: "A–Z" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Every Magic card, A–Z</h1>
      <p className="mt-3 max-w-3xl text-[15px] text-slate-300">
        {int(total)} card names under {letter}. A name is one card, however many printings it has; open it to see every printing and its price.
      </p>
      <nav className="mt-4 flex flex-wrap gap-1" aria-label="Letters">
        {LETTERS.map((L) => (
          <Link
            key={L}
            href={hrefOf(L)}
            aria-current={L === letter ? "page" : undefined}
            className={`grid h-9 w-9 place-items-center rounded border text-sm font-semibold ${L === letter ? "border-brand-500 bg-ink-800 text-white" : "border-ink-700 bg-ink-900 text-slate-200 hover:border-brand-500"}`}
          >
            {L}
          </Link>
        ))}
      </nav>
      <ul className="mt-6 columns-1 gap-6 text-sm sm:columns-2 lg:columns-3">
        {items.map((o) => (
          <li key={o.no} className="break-inside-avoid py-0.5">
            <Link href={`/cards/name/${o.slug}`} className="text-slate-200 hover:text-brand-400 hover:underline">
              {o.name}
            </Link>{" "}
            <span className="text-xs text-slate-500">({o.nPrint})</span>
          </li>
        ))}
      </ul>
      {!items.length ? <p className="mt-6 text-slate-400">No card names under this letter.</p> : null}
      <Pagination page={page} totalPages={pages} params={{ letter: letter === "A" ? undefined : letter }} basePath="/cards/all" />
    </div>
  );
}
