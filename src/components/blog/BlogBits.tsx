import CardQuickLink from "../CardQuickLink";
import type { Country } from "@/lib/country";
import type { CardLite, SetLite } from "@/lib/data";
import { money } from "@/lib/format";
import { cardImage } from "@/lib/images";
import { headline } from "@/lib/price";
import { DATA_TABLE } from "@/components/prose";

// Building blocks the posts share.

export function CardTable({ cards, setById, country, showMarket = true, caption }: { cards: CardLite[]; setById: Map<number, SetLite>; country: Country; showMarket?: boolean; caption?: string }) {
  return (
    <div className="not-prose my-5 overflow-x-auto rounded-lg border border-ink-800">
      <table className={`${DATA_TABLE} min-w-[560px]`}>
        {caption ? <caption className="px-3 pt-3 text-left text-xs text-slate-400">{caption}</caption> : null}
        <thead>
          <tr>
            <th className="w-10">#</th>
            <th>Card</th>
            <th>Set · No.</th>
            {showMarket ? <th className="text-right">TCGplayer market</th> : null}
            <th className="text-right">Cheapest here</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c, i) => {
            const h = headline(c, country);
            return (
              <tr key={c.id}>
                <td className="num text-slate-500">{i + 1}</td>
                <td>
                  <CardQuickLink slug={c.slug} className="group flex items-center gap-3">
                    {c.hasImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cardImage.thumb(c.id)} alt="" loading="lazy" className="h-12 w-9 shrink-0 rounded-sm bg-ink-800 object-cover" />
                    ) : null}
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-100 group-hover:text-brand-400 group-hover:underline">{c.name}</span>
                      {c.variant ? <span className="block text-xs text-slate-500">{c.variant}</span> : null}
                    </span>
                  </CardQuickLink>
                </td>
                <td className="num whitespace-nowrap text-xs text-slate-400">
                  {setById.get(c.setId)?.code} · {c.number ?? "DON!!"}
                </td>
                {showMarket ? <td className="num whitespace-nowrap text-right font-semibold text-accent">{money(c.marketUsd, "US")}</td> : null}
                <td className="num whitespace-nowrap text-right text-slate-300">
                  {h.kind === "listing" ? money(h.cents, country) : h.kind === "reference" ? <span className="text-slate-500">≈ {money(h.cents, country)}</span> : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SimpleTable({ head, rows, align }: { head: string[]; rows: React.ReactNode[][]; align?: ("l" | "r")[] }) {
  return (
    <div className="not-prose my-5 overflow-x-auto rounded-lg border border-ink-800">
      <table className={`${DATA_TABLE} min-w-[520px]`}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={align?.[i] === "r" ? "text-right" : ""}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={align?.[j] === "r" ? "num whitespace-nowrap text-right" : ""}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="not-prose my-6 rounded-lg border border-gold/30 bg-gold/[0.05] p-4">
      <p className="rb-eyebrow text-slate-500 mb-1">{title}</p>
      <div className="text-[15px] leading-relaxed text-slate-200">{children}</div>
    </div>
  );
}

export function CardLink({ c }: { c: CardLite }) {
  return (
    <CardQuickLink slug={c.slug}>
      {c.name}
      {c.variant ? ` (${c.variant})` : ""}
    </CardQuickLink>
  );
}

export const pct0 = (v: number) => `${Math.round(v)}%`;
