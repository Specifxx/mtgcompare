import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { loadLoyalty, type LoyaltyRow } from "@/lib/admin-loyalty";
import { ago, int } from "@/lib/format";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Loyalty" });

// The most active members by distinct active days. The counter starts at deploy, so the first weeks are thin by construction; admins are excluded.
export default async function AdminLoyalty() {
  await requireAdminPage();
  let rows: LoyaltyRow[] | null = null;
  let error: string | null = null;
  try {
    rows = await loadLoyalty();
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 200) : "Failed";
  }
  return (
    <div className="space-y-6">
      <h1 className="text-3xl text-white">Loyalty</h1>
      {error ? <EmptyState title="Couldn't load members" body={error} /> : !rows || rows.length === 0 ? <EmptyState title="No active members yet" body="A member counts one active day per UTC day they use the site while signed in." /> : (
        <div className="card-surface overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th>#</th><th>Member</th><th className="text-right">Active days</th><th className="text-right">Member for</th><th className="text-right">Collection lines</th><th>Plan</th><th>Last seen</th></tr></thead>
            <tbody>
              {rows.map((u, i) => (
                <tr key={u.userId} className="border-t border-ink-700">
                  <td className="py-1.5 text-slate-500">{i + 1}</td>
                  <td className="text-slate-300">{u.displayName} <span className="text-xs text-slate-500">{u.email}</span></td>
                  <td className="num text-right text-white">{int(u.activeDays)}</td>
                  <td className="num text-right text-slate-300">{int(u.memberDays)} d</td>
                  <td className="num text-right text-slate-300">{int(u.collectionLines)}</td>
                  <td className="text-slate-300">{u.plan}</td>
                  <td className="text-slate-400">{ago(u.lastActiveAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
