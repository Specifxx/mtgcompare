import type { Metadata } from "next";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CardTiles } from "@/components/CardTiles";
import { CardSearchForm } from "@/components/CardSearchForm";
import { CARDS_HUB } from "@/lib/cards";
import { cardSearch } from "@/lib/card-search";
import { SITE_NAME } from "@/lib/site";

// Card search results (DECISIONS.md "Card prices: every card"): a name, a set code and number ("FDN 101"), or both. Noindex (a
// query page), and robots.txt keeps crawlers off query URLs. It depends only on its URL, so the CDN keeps each query a day.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search MTG card prices",
  robots: { index: false, follow: true },
  alternates: { canonical: undefined },
};

export default function CardSearchPage({ searchParams }: { searchParams: { q?: string | string[] } }) {
  const q = (Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q ?? "").slice(0, 80).trim();
  const { hits, total } = q ? cardSearch(q, 60) : { hits: [], total: 0 };
  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: "/", label: SITE_NAME }, { href: CARDS_HUB, label: "Card prices" }, { label: "Search" }]} />
      <h1 className="page-title">{q ? `Cards matching “${q}”` : "Search card prices"}</h1>
      <CardSearchForm q={q} className="mt-5 max-w-xl" />
      {q && (
        <p className="mt-4 text-sm text-muted">
          {total === 0 ? (
            <>
              No card matches. Try the card&rsquo;s name, or its set code and number (&ldquo;FDN 101&rdquo;), or{" "}
              <Link href={CARDS_HUB} prefetch={false} className="font-semibold text-brand hover:underline">
                browse every set
              </Link>
              .
            </>
          ) : (
            `${total.toLocaleString("en-US")} ${total === 1 ? "card" : "cards"}${total > hits.length ? `, the first ${hits.length} shown` : ""}, best match first.`
          )}
        </p>
      )}
      {hits.length > 0 && (
        <div className="mt-6">
          <CardTiles cards={hits.map((h) => ({ set: h.set, setName: h.setName, s: h.s, n: h.n, no: h.no, r: null, id: h.id, v: h.v }))} eager={10} />
        </div>
      )}
    </div>
  );
}
