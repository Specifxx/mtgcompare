import type { Metadata } from "next";
import Link from "next/link";
import { AccountsExport, type ExportUser } from "@/components/admin/AccountsExport";
import { BillingRepair } from "@/components/admin/BillingRepair";
import { FormCleaner } from "@/components/FormCleaner";
import { StatTile } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import {
  ACCOUNT_FILTERS,
  ACCOUNT_FILTER_LABELS,
  MAX_ACCOUNT_ROWS,
  MAX_QUERY_LENGTH,
  accountStats,
  isAccountFilter,
  listAccounts,
  type AccountFilter,
  type AccountRow,
  type AccountStats,
} from "@/lib/admin-accounts";
import { ago, int, shortDate } from "@/lib/format";
import { DATA_TABLE } from "@/components/prose";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Accounts" });

function hrefFor(f: AccountFilter, q: string) {
  const p = new URLSearchParams();
  if (f !== "all") p.set("f", f);
  if (q) p.set("q", q);
  const s = p.toString();
  return `/admin/accounts${s ? `?${s}` : ""}`;
}

function Plan({ r }: { r: AccountRow }) {
  if (r.tier)
    return (
      <span className="text-gold">
        {r.tier === "plus" ? "Plus" : "Premium"} until {shortDate(r.premiumUntil)}
      </span>
    );
  if (r.lapsed) return <span className="text-slate-500">lapsed {shortDate(r.premiumUntil)}</span>;
  // The column is the PAID tier; an admin reads as Premium everywhere else, so say so.
  if (r.admin)
    return (
      <span className="text-slate-400" title="No paid plan; admins get every Premium feature">
        Free <span className="text-xs text-slate-500">(Premium as admin)</span>
      </span>
    );
  return <span className="text-slate-400">Free</span>;
}

function Signups({ stats }: { stats: AccountStats }) {
  const max = Math.max(1, ...stats.signups30.map((d) => d.n));
  return (
    <div className="card-surface p-4">
      <p className="text-sm text-slate-300">
        {int(stats.new30)} in 30 days · {int(stats.new7)} in 7 days
      </p>
      <div className="mt-3 flex h-16 items-end gap-0.5" aria-label="Sign-ups per day, last 30 days">
        {stats.signups30.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d.n}`}
            className="flex-1 rounded-sm bg-brand-500/80"
            style={{ height: `${Math.max(2, (d.n / max) * 100)}%`, opacity: d.n ? 1 : 0.25 }}
          />
        ))}
      </div>
    </div>
  );
}

export default async function AdminAccounts({ searchParams }: { searchParams: { q?: string; f?: string } }) {
  await requireAdminPage();
  const f: AccountFilter = isAccountFilter(searchParams.f) ? searchParams.f : "all";
  const q = (searchParams.q ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const [statsR, listR] = await Promise.allSettled([accountStats(), listAccounts({ q, f })]);
  const stats = statsR.status === "fulfilled" ? statsR.value : null;
  const list = listR.status === "fulfilled" ? listR.value : null;
  const exportRows: ExportUser[] = (list?.rows ?? []).map((r) => ({
    name: r.displayName,
    email: r.email,
    registered: r.createdAt.toISOString().slice(0, 10),
    lastSignIn: r.lastLoginAt ? r.lastLoginAt.toISOString().slice(0, 10) : "",
    verified: r.emailVerified,
    plan: r.tier ?? "none",
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl text-white">Accounts</h1>
      {stats ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatTile label="Total" value={int(stats.total)} />
            <StatTile label="Email-verified" value={int(stats.verified)} />
            <StatTile label="Plus active" value={int(stats.plusActive)} />
            <StatTile label="Premium active" value={int(stats.premiumActive)} tone="text-gold" />
            <StatTile label="Signed in · 7d" value={int(stats.signedIn7d)} />
          </div>
          <Signups stats={stats} />
          <div className="card-surface p-4" data-signups-by-source>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Sign-ups by source · 30 days <span className="normal-case tracking-normal text-slate-500">· active in 7 days: {int(stats.active7d)}</span>
            </p>
            {stats.bySource30.length === 0 ? (
              <p className="text-sm text-slate-500">–</p>
            ) : (
              <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {stats.bySource30.map((s) => (
                  <li key={s.k} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-300">{s.k}</span>
                    <span className="num text-white">{int(s.n)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <EmptyState title="Couldn't load the account stats" />
      )}

      <BillingRepair />

      <div className="space-y-3">
        <form id="account-search" method="get" action="/admin/accounts" className="flex flex-wrap gap-2">
          {f !== "all" ? <input type="hidden" name="f" value={f} /> : null}
          <input name="q" defaultValue={q} maxLength={MAX_QUERY_LENGTH} placeholder="Search email or name" className="input max-w-sm" />
          <button type="submit" className="btn-ghost">
            Search
          </button>
        </form>
        <FormCleaner formId="account-search" />
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_FILTERS.map((k) => (
            <Link
              key={k}
              href={hrefFor(k, q)}
              className={k === f ? "chip bg-brand-500 text-white" : "chip border border-ink-700 text-slate-300 hover:bg-ink-800"}
            >
              {ACCOUNT_FILTER_LABELS[k]}
            </Link>
          ))}
        </div>
      </div>

      {list ? (
        <>
          <AccountsExport rows={exportRows} />
          {list.capped ? <p className="text-sm text-gold">Showing the newest {MAX_ACCOUNT_ROWS} — narrow with search.</p> : null}
          {list.rows.length ? (
            <div className="card-surface overflow-x-auto">
              <table className={`${DATA_TABLE} min-w-[56rem]`}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Registered</th>
                    <th>Last sign-in</th>
                    <th>Verified</th>
                    <th>Sign-in</th>
                    <th>Plan</th>
                    <th>Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2">
                        <span className="block font-semibold text-white">{r.displayName}</span>
                        <span className="block text-xs text-slate-400">{r.email}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-300">{shortDate(r.createdAt)}</td>
                      <td className="px-3 py-2 text-slate-300">{r.lastLoginAt ? ago(r.lastLoginAt) : "–"}</td>
                      <td className="px-3 py-2 text-slate-300">{r.emailVerified ? "✓" : "–"}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1">
                          {r.google ? <span className="chip border border-ink-700 text-slate-300">Google</span> : null}
                          {r.discord ? <span className="chip border border-ink-700 text-slate-300">Discord</span> : null}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Plan r={r} />
                      </td>
                      <td className="px-3 py-2">
                        {r.admin ? (
                          <span className="chip bg-gold/15 text-gold" title="Premium everywhere on the site, whatever the Plan column says">
                            Admin
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No accounts match" />
          )}
        </>
      ) : (
        <EmptyState title="Couldn't load accounts" />
      )}
    </div>
  );
}
