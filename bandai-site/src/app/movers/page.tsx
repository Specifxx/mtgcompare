import type { Metadata } from "next";
import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { movers } from "@/lib/data";
import { money, pct } from "@/lib/format";
import { shortName } from "@/lib/names";

export const revalidate = 86400; // data only changes with a release (DECISIONS.md, "Vercel cost")
export const metadata: Metadata = {
  title: `${SITE.gameShort} price movers — biggest risers and fallers`,
  description: `The ${SITE.game} cards whose prices moved most this week and this month, from daily TCGplayer market prices.`,
  ...canon("/movers"),
};

export default function Movers() {
  const w = movers(7, 300);
  const mo = movers(30, 300);
  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-3xl font-black">{SITE.gameShort} price movers</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <List title="Risers this week" rows={w.up} />
        <List title="Fallers this week" rows={w.down} />
        <List title="Risers this month" rows={mo.up} />
        <List title="Fallers this month" rows={mo.down} />
      </div>
      <p className="text-xs text-muted">Cards worth $3 or more. Based on TCGplayer market price, recorded daily.</p>
    </div>
  );
}

function List({ title, rows }: { title: string; rows: ReturnType<typeof movers>["up"] }) {
  return (
    <section className="card-surface p-4">
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      {!rows.length && <p className="text-sm text-muted">Not enough history yet — movers appear after the first week of daily prices.</p>}
      <ol>
        {rows.slice(0, 25).map((r, i) => (
          <li key={r.p.id} className="flex items-center justify-between gap-2 border-t border-ink-800 py-1.5 text-sm">
            <span className="w-6 text-muted">{i + 1}</span>
            <Link className="flex-1 truncate hover:underline" href={`/card/${r.p.slug}`}>{shortName(r.p.name)}</Link>
            <span className="tabular-nums">{money(r.cents)}</span>
            <span className={`w-16 text-right tabular-nums ${r.change >= 0 ? "text-up" : "text-down"}`}>{pct(r.change)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
