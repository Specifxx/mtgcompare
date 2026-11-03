import Link from "@/components/Link";
import type { Product } from "@/lib/site-types";
import { setById } from "@/lib/data";
import { shortName } from "@/lib/names";

export function ToolTable({ head, rows }: { head: string[]; rows: { p: Product; cells: React.ReactNode[] }[] }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-ink-700/60">
      <table className="w-full text-sm">
        <thead className="bg-ink-850 text-left text-xs uppercase text-muted">
          <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Card</th>{head.map((h) => <th key={h} className="px-3 py-2 text-right">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.p.id} className="border-t border-ink-800">
              <td className="px-3 py-2 text-muted">{i + 1}</td>
              <td className="px-3 py-2"><Link className="hover:underline" href={`/card/${r.p.slug}`}>{shortName(r.p.name)}</Link><span className="block text-xs text-muted">{setById(r.p.setId)?.name}{r.p.rarity ? ` · ${r.p.rarity}` : ""}</span></td>
              {r.cells.map((c, j) => <td key={j} className="px-3 py-2 text-right tabular-nums">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="p-4 text-muted">Not enough price history yet — this fills in after the first week of daily prices.</p>}
    </div>
  );
}
