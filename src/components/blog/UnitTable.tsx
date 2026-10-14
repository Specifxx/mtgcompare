import type { ReactNode } from "react";
import CardQuickLink from "../CardQuickLink";
import { DATA_TABLE } from "@/components/prose";
import { finishLabel } from "@/lib/constants";
import type { Country } from "@/lib/country";
import { COUNTRIES } from "@/lib/country";
import type { CardLite } from "@/lib/data";
import { money } from "@/lib/format";
import { cardImage } from "@/lib/images";
import { headline } from "@/lib/price";

// The data-driven posts' card table (owner WP17): one row per card, in the unit the row was ranked by. Beside the card it names the printing
// (the label: treatment, version, stamp) and the FINISH of the unit, because a foil price read as the plain card's is the commonest misreading
// of a Magic price list. "Market" is the unit's TCGplayer market price, the only value the posts rank by; a unit priced only by a thin single
// listing shows that listing as "low only" and is never ranked (the selection rules in lib/blog/select.ts leave it out). The cards are a
// `cards` prop, so the article's shop strip finds them (components/blog/mentions.ts).
export interface ExtraColumn {
  head: string;
  cell: (c: CardLite) => ReactNode;
  align?: "l" | "r";
}

export function UnitTable({ cards, country, extra, here = true, caption }: { cards: CardLite[]; country: Country; extra?: ExtraColumn; here?: boolean; caption?: string }) {
  return (
    <div className="not-prose my-5 overflow-x-auto rounded-lg border border-ink-800">
      <table className={`${DATA_TABLE} min-w-[600px]`}>
        {caption ? <caption className="px-3 pt-3 text-left text-xs text-slate-400">{caption}</caption> : null}
        <thead>
          <tr>
            <th className="w-10">#</th>
            <th>Card</th>
            <th>Set · No.</th>
            <th className="text-right">TCGplayer market</th>
            {extra ? <th className={extra.align === "l" ? "" : "text-right"}>{extra.head}</th> : null}
            {here ? <th className="text-right">Cheapest in {COUNTRIES[country].code}</th> : null}
          </tr>
        </thead>
        <tbody>
          {cards.map((c, i) => {
            const h = headline(c, country);
            return (
              <tr key={`${c.id}.${c.headFinish}`}>
                <td className="num text-slate-500">{i + 1}</td>
                <td>
                  <CardQuickLink slug={c.slug} className="group flex items-center gap-3">
                    {c.hasImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cardImage.thumb(c.id)} alt="" loading="lazy" className="h-12 w-9 shrink-0 rounded-sm bg-ink-800 object-cover" />
                    ) : null}
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-100 group-hover:text-brand-400 group-hover:underline">{c.name}</span>
                      <span className="block text-xs text-slate-500">{[c.variant, finishLabel(c, c.headFinish)].filter(Boolean).join(" · ")}</span>
                    </span>
                  </CardQuickLink>
                </td>
                <td className="num whitespace-nowrap text-xs text-slate-400">
                  {c.setCode} · {c.number ?? "—"}
                </td>
                <td className="num whitespace-nowrap text-right font-semibold text-accent">
                  {c.marketUsd != null ? money(c.marketUsd, "US") : c.valueUsd != null ? <span className="font-normal text-slate-400">{money(c.valueUsd, "US")} low only</span> : "—"}
                </td>
                {extra ? <td className={extra.align === "l" ? "text-slate-300" : "num whitespace-nowrap text-right"}>{extra.cell(c)}</td> : null}
                {here ? (
                  <td className="num whitespace-nowrap text-right text-slate-300">
                    {h.kind === "listing" ? money(h.cents, country) : h.kind === "reference" ? <span className="text-slate-500">≈ {money(h.cents, country)}</span> : "—"}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
