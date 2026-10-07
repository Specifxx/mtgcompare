import type { Metadata } from "next";
import Link from "next/link";
import { StatTile } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { CLICK_RETENTION_DAYS, PLAN_CLICK_SAMPLE, loadPlanInterest, type PlanInterestReport } from "@/lib/admin-clicks";
import { int, shortDate } from "@/lib/format";
import { TIER_NAMES } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Plus & Premium interest" });

// Premium interest (RiftCompare's /admin/premium): who clicked a Plus/Premium
// call to action (PlanButton, the Pricing links, the slide-in, checkout) and
// from which surface (lib/nudge-surface.ts): an interest signal ahead of, and
// independent of, subscribing.
export default async function AdminPremiumInterest() {
  await requireAdminPage();
  let data: PlanInterestReport | null = null;
  let error: string | null = null;
  try {
    data = await loadPlanInterest();
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-white">Plus &amp; Premium interest</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Every click on a Plus or Premium call to action, and where it was. &ldquo;checkout&rdquo; is a press of a buy button that went on to Stripe. See{" "}
          <Link href="/admin/subscriptions" className="text-brand-400 hover:underline">
            Subscriptions
          </Link>{" "}
          for who actually paid.
        </p>
      </div>
      {error ? (
        <EmptyState title="Couldn't load interest" body={error} />
      ) : !data || data.totals.d90 === 0 ? (
        <EmptyState title="No clicks recorded yet" body="They appear as soon as someone opens the plan dialog or a Pricing link." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatTile label={`Clicks · ${CLICK_RETENTION_DAYS} days`} value={int(data.totals.d90)} />
            <StatTile label="Clicks · 30 days" value={int(data.totals.d30)} sub={`${int(data.totals.d7)} in 7 days`} />
            <StatTile label="Checkout · 30 days" value={int(data.totals.checkout30)} tone="text-gold" />
            <StatTile label="Signed-out clicks" value={int(data.anon)} sub="in the sample" />
            <StatTile label="Interested → member" value={int(data.converted)} sub={`of ${int(data.users.length)} signed in`} />
          </div>
          <div className="card-surface p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">By surface · 30 days</p>
            {data.bySurface30.length === 0 ? (
              <p className="text-sm text-slate-500">–</p>
            ) : (
              <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {data.bySurface30.map((s) => (
                  <li key={s.k} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-300">{s.k}</span>
                    <span className="num text-white">{int(s.n)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card-surface p-4" data-checkout-by-surface>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Started checkout by surface · 30 days</p>
            {data.checkoutBySurface30.length === 0 ? (
              <p className="text-sm text-slate-500">–</p>
            ) : (
              <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {data.checkoutBySurface30.map((s) => (
                  <li key={s.k} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-300">{s.k === "checkout" ? "unknown (no surface)" : s.k}</span>
                    <span className="num text-white">{int(s.n)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {data.users.length ? (
            <section>
              <h2 className="mb-1 text-xl text-white">Signed-in people</h2>
              <p className="mb-3 text-xs text-slate-500">
                Newest first{data.sampled ? `, from the most recent ${int(PLAN_CLICK_SAMPLE)} clicks` : ""}.
              </p>
              <div className="overflow-x-auto rounded-lg border border-ink-800 bg-ink-900">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2 font-medium">Account</th>
                      <th className="px-3 py-2 text-right font-medium">Clicks</th>
                      <th className="px-3 py-2 font-medium">Where</th>
                      <th className="px-3 py-2 font-medium">Last</th>
                      <th className="px-3 py-2 font-medium">Plan now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.userId} className="border-b border-ink-800 align-top last:border-0">
                        <td className="px-3 py-2">
                          <span className="block font-medium text-white">{u.displayName}</span>
                          <span className="block text-xs text-slate-500">{u.email}</span>
                        </td>
                        <td className="num px-3 py-2 text-right text-slate-300">{int(u.count)}</td>
                        <td className="px-3 py-2">
                          <span className="flex flex-wrap gap-1">
                            {u.surfaces.map((s) => (
                              <span key={s} className={`chip ${s === "checkout" ? "bg-gold/20 text-gold" : "bg-ink-800 text-slate-400"}`}>
                                {s}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-300">{shortDate(u.last)}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {u.tier ? <span className="chip bg-brand-500/15 text-brand-400">{TIER_NAMES[u.tier]}</span> : <span className="chip bg-ink-800 text-slate-500">not yet</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
