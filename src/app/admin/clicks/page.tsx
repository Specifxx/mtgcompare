import type { Metadata } from "next";
import { RollupList } from "@/components/admin/AdminPanel";
import { StatTile } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { loadClickReport, type ClickReport } from "@/lib/admin-outbound";
import { ago, int } from "@/lib/format";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Outbound clicks" });

// Outbound clicks (ClickEvent): sampled, anonymous, swept at 90 days. The counts are of the SAMPLE: multiply by 1 / CLICK_SAMPLE_RATE for an estimate.
export default async function AdminClicks() {
  await requireAdminPage();
  let r: ClickReport | null = null;
  let error: string | null = null;
  try {
    r = await loadClickReport();
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 200) : "Failed";
  }
  return (
    <div className="space-y-6">
      <h1 className="text-3xl text-white">Outbound clicks</h1>
      {error ? <EmptyState title="Couldn't load clicks" body={error} /> : !r || r.windows.all === 0 ? <EmptyState title="No clicks recorded yet" body="They appear after the first batch flush (the first minute of each half hour) once CLICK_LOG is not 0." /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="7 days" value={int(r.windows.d7)} />
            <StatTile label="30 days" value={int(r.windows.d30)} />
            <StatTile label="All kept" value={int(r.windows.all)} />
            <StatTile label="eBay / TCGplayer / stores (30 d)" value={`${int(r.byKind.ebay)} / ${int(r.byKind.tcgplayer)} / ${int(r.byKind.store)}`} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <RollupList title="By retailer, 30 days" rows={r.byRetailer} />
            <RollupList title="By country, 30 days" rows={r.byCountry} />
            <RollupList title="By page, 30 days" rows={r.byPage} />
          </div>
          <div className="card-surface overflow-x-auto p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Latest {r.recent.length}</p>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400"><th>When</th><th>Retailer</th><th>Page</th><th>Slug</th><th>Country</th><th>Entry</th></tr></thead>
              <tbody>
                {r.recent.map((c, i) => (
                  <tr key={i} className="border-t border-ink-700"><td className="py-1.5 text-slate-400">{ago(c.createdAt)}</td><td className="text-slate-300">{c.retailer}</td><td className="text-slate-300">{c.page}</td><td className="text-slate-400">{c.slug ?? "–"}</td><td className="text-slate-300">{c.country}</td><td className="text-slate-400">{c.entry ?? "–"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
