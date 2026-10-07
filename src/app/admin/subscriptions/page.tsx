import type { Metadata } from "next";
import { StatTile } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { entitledInDbCount, fetchSubscriptionRows } from "@/lib/admin-subscriptions";
import { int, moneyCode } from "@/lib/format";
import { stripeEnabled } from "@/lib/stripe";
import { computeSubscriptionMetrics, type SubscriptionMetrics } from "@/lib/subscription-metrics";
import { DATA_TABLE } from "@/components/prose";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Subscriptions" });

const pctOf = (v: number | null) => (v == null ? "–" : `${v.toFixed(1)}%`);

function Bar({ label, a, b, aLabel, bLabel }: { label: string; a: number; b: number; aLabel: string; bLabel: string }) {
  const total = a + b;
  const share = total ? (a / total) * 100 : 0;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-1.5 flex h-3 overflow-hidden rounded bg-ink-800">
        <div className="bg-brand-500" style={{ width: `${share}%` }} />
        <div className="bg-gold" style={{ width: `${total ? 100 - share : 0}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-400">
        <span className="text-slate-200">{aLabel}</span> {int(a)} · <span className="text-slate-200">{bLabel}</span> {int(b)}
      </p>
    </div>
  );
}

function Metrics({ m, entitled, capped }: { m: SubscriptionMetrics; entitled: number | null; capped: boolean }) {
  const cur = m.currency;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="MRR" value={moneyCode(m.mrrCents, cur)} tone="text-gold" />
        <StatTile label="ARR" value={moneyCode(m.arrCents, cur)} />
        <StatTile label="Active" value={int(m.active)} sub={m.pastDue ? `${m.pastDue} past due` : undefined} />
        <StatTile label="ARPU" value={moneyCode(m.arpuCents, cur)} sub="per month" />
        <StatTile label="New 30d" value={int(m.new30)} sub={`${m.new7} in 7d`} />
        <StatTile label="Churned 30d" value={int(m.churned30)} />
        <StatTile label="Churn %" value={pctOf(m.churnRatePct)} sub="monthly, estimated" />
        <StatTile label="LTV" value={m.ltvCents == null ? "–" : moneyCode(m.ltvCents, cur)} sub="ARPU ÷ churn" />
        {m.trialsStarted > 0 ? <StatTile label="Trialing" value={int(m.trialing)} /> : null}
        {m.trialsStarted > 0 ? <StatTile label="Trial → paid" value={pctOf(m.trialConvPct)} sub={`${m.trialsConverted} of ${m.trialsStarted}`} /> : null}
      </div>

      <section className="card-surface space-y-4 p-5">
        <h2 className="text-lg text-white">Plan mix</h2>
        <Bar label="Billing" a={m.monthlyActive} b={m.annualActive} aLabel="Monthly" bLabel="Annual" />
        <Bar label="Tier" a={m.plusActive} b={m.premiumActive} aLabel="Plus" bLabel="Premium" />
      </section>

      <p className="text-sm text-slate-400">
        Stripe active: <span className="text-slate-200">{int(m.active)}</span> · entitled in DB:{" "}
        <span className="text-slate-200">{entitled == null ? "–" : int(entitled)}</span> (includes manual grants; admins are not counted)
        {capped ? " · Stripe listing capped at 2,000 subscriptions" : ""}
      </p>

      <section className="card-surface overflow-x-auto">
        <h2 className="px-4 pt-4 text-lg text-white">Cohorts</h2>
        {m.cohorts.length ? (
          <table className={`${DATA_TABLE} mt-2 min-w-[32rem]`}>
            <thead>
              <tr>
                <th>Month</th>
                <th>Started</th>
                <th>Still active</th>
                <th>Retention</th>
              </tr>
            </thead>
            <tbody>
              {m.cohorts.map((c) => (
                <tr key={c.month}>
                  <td className="px-3 py-2 text-slate-200">{c.month}</td>
                  <td className="num px-3 py-2">{c.started}</td>
                  <td className="num px-3 py-2">{c.active}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-24 overflow-hidden rounded bg-ink-800">
                        <span className="block h-full bg-emerald-400" style={{ width: `${c.retentionPct}%` }} />
                      </span>
                      <span className="num text-slate-300">{c.retentionPct.toFixed(0)}%</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 pb-4 text-sm text-slate-400">No cohorts yet.</p>
        )}
      </section>

      {m.byCurrency.length > 1 ? (
        <p className="text-xs text-slate-500">
          Money above is in {cur.toUpperCase()}, the currency with the most subscribers. By currency:{" "}
          {m.byCurrency.map((b) => `${b.currency.toUpperCase()} ${b.active} active, MRR ${moneyCode(b.mrrCents, b.currency)}`).join(" · ")}
        </p>
      ) : null}
    </>
  );
}

export default async function AdminSubscriptions() {
  await requireAdminPage();
  let body: React.ReactNode;
  if (!stripeEnabled()) {
    body = <EmptyState title="Stripe isn't configured" body="Set STRIPE_SECRET_KEY to see subscription metrics." />;
  } else {
    try {
      const [{ rows, capped }, entitled] = await Promise.all([fetchSubscriptionRows(), entitledInDbCount().catch(() => null)]);
      body = rows.length ? (
        <Metrics m={computeSubscriptionMetrics(rows, Date.now())} entitled={entitled} capped={capped} />
      ) : (
        <EmptyState title="No subscriptions yet" />
      );
    } catch (e) {
      body = <EmptyState title="Couldn't load" body={e instanceof Error ? e.message : "Stripe request failed"} />;
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-3xl text-white">Subscriptions</h1>
      {body}
    </div>
  );
}
