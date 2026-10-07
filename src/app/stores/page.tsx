import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, InShort } from "@/components/ui";
import { COUNTRY_LIST } from "@/lib/country";
import { getSiteStats } from "@/lib/data";
import { int } from "@/lib/format";
import { STORES } from "@/lib/stores";
import { DATA_TABLE } from "@/components/prose";

export const metadata: Metadata = {
  title: "One Piece Card Stores We Track — US, AU, UK, SG, CA, EU",
  description:
    "Every store OP Compare reads One Piece Card Game prices from, by market, with how many of their listings we match today.",
  alternates: { canonical: "/stores" },
};

export default async function StoresPage() {
  const stats = await getSiteStats();
  const by = new Map(
    stats.storeOffers.map((s) => [`${s.source}|${s.market}`, s]),
  );
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Stores we track" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Stores we track</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        OP Compare reads the public product listings of every store below twice
        a day and matches each listing to the exact One Piece printing it is —
        by card number, and by the printing words in its title (Parallel, Manga,
        SP…). A listing we cannot place with certainty is left out rather than
        guessed. TCGplayer&apos;s cheapest listing is added in the US.
      </p>
      <div className="mt-6">
        <InShort>
          Want your store listed? Stores on Shopify or ShadowPOS with card
          numbers in their product titles can usually be added in a day —{" "}
          <Link href="/stores/suggest" className="text-brand-400 hover:underline">
            suggest a store
          </Link>
          .
        </InShort>
      </div>
      {COUNTRY_LIST.map((c) => {
        const list = STORES.filter((s) => s.country === c.code)
          .map((s) => ({ s, st: by.get(`store:${s.key}|${c.code}`) }))
          .sort((a, b) => (b.st?.offers ?? 0) - (a.st?.offers ?? 0));
        const tcg = c.code === "US" ? by.get("tcgplayer|US") : undefined;
        return (
          <section key={c.code} className="mt-10">
            <h2 className="mb-3 text-xl text-white">
              {c.flag} {c.label}{" "}
              <span className="text-sm font-normal text-slate-500">
                ({list.length + (tcg ? 1 : 0)} sources · {c.currency})
              </span>
            </h2>
            <div className="card-surface overflow-x-auto">
              <table className={`${DATA_TABLE} min-w-[520px]`}>
                <thead>
                  <tr>
                    <th>Store</th>
                    <th className="text-right">Listings matched</th>
                    <th className="text-right">In stock</th>
                  </tr>
                </thead>
                <tbody>
                  {tcg ? (
                    <tr>
                      <td className="font-semibold text-white">
                        TCGplayer (marketplace)
                      </td>
                      <td className="num text-right text-slate-300">
                        {int(tcg.offers)}
                      </td>
                      <td className="num text-right text-emerald-400">
                        {int(tcg.inStock)}
                      </td>
                    </tr>
                  ) : null}
                  {list.map(({ s, st }) => (
                    <tr key={s.key}>
                      <td>
                        <Link
                          href={`/stores/${s.key}`}
                          className="font-semibold text-slate-100 hover:text-brand-400"
                        >
                          {s.name}
                        </Link>
                        <span className="ml-2 text-xs text-slate-500">
                          {s.base.replace(/^https?:\/\/(www\.)?/, "")}
                        </span>
                      </td>
                      <td className="num text-right text-slate-300">
                        {st ? int(st.offers) : "—"}
                      </td>
                      <td className="num text-right text-emerald-400">
                        {st ? int(st.inStock) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
