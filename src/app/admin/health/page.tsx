import type { Metadata } from "next";
import Link from "next/link";
import { Light } from "@/components/admin/AdminPanel";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { loadOpsView } from "@/lib/admin-ops";
import { INBOX_LABEL, overall, type HealthCheck } from "@/lib/ops-health";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Health" });

const BAR: Record<string, string> = { ok: "bg-emerald-400", warn: "bg-amber-400", bad: "bg-red-500", unknown: "bg-slate-500" };
const ago = (iso: string, now: Date): string => {
  const m = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  return m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

function Item({ c }: { c: HealthCheck }) {
  const pct = c.used != null && c.limit ? Math.min(100, Math.round((c.used / c.limit) * 100)) : null;
  const inner = (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold text-white">{c.label}</span>
        <Light level={c.level} />
      </div>
      <p className="mt-1 text-sm text-slate-300">{c.detail}</p>
      {pct != null ? (
        <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-ink-700" role="img" aria-label={`${pct}% of the limit used`}>
          <div className={`h-full ${BAR[c.level]}`} style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
      ) : null}
    </div>
  );
  return c.href ? (c.href.startsWith("http") ? <a href={c.href} rel="noreferrer" className="block hover:bg-ink-800/60">{inner}</a> : <Link href={c.href} className="block hover:bg-ink-800/60">{inner}</Link>) : inner;
}

export default async function AdminHealth() {
  await requireAdminPage();
  const now = new Date();
  const v = await loadOpsView(now);
  const checks = v.snapshot?.checks ?? [];
  const groups = [...new Set(checks.map((c) => c.group))];
  const lvl = overall(checks);
  return (
    <div>
      <h1 className="text-3xl text-white">Health</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Every area of the site against its limit, checked hourly. You are e-mailed when something is new or gets worse, once a day while it stays red, and when something new lands in the inbox, so there is nothing to
        check by hand.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <Light level={checks.length ? lvl : "unknown"} label={checks.length ? (lvl === "ok" ? "Everything is fine" : lvl === "warn" ? "Something to watch" : lvl === "bad" ? "Something needs action" : "Some checks could not be read") : "No check has run yet"} />
        <span className="text-slate-400">{v.snapshot ? `Last check ${ago(v.snapshot.at, now)}` : "Waiting for the first hourly run (Actions: Ops watch)"}</span>
      </div>
      {v.watch === "bad" ? (
        <p role="alert" className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          The watch itself has stopped: the last check is more than 3 hours old, so nothing is being checked and no e-mail will arrive. Open the <a className="underline" href="https://github.com/Specifxx/mtgcompare/actions/workflows/ops-watch.yml">Ops watch</a> workflow
          (GitHub turns schedules off after 60 quiet days; the keepalive job prevents that).
        </p>
      ) : null}

      <section className="mt-6" aria-labelledby="inbox">
        <h2 id="inbox" className="mb-2 text-xl text-white">Inbox</h2>
        <Link href="/admin/inbox" className="card-surface block px-4 py-3 hover:opacity-90">
          <span className="text-2xl font-extrabold text-white">{v.inboxOpen ?? "–"}</span>
          <span className="ml-2 text-sm text-slate-400">open{v.inbox ? `: ${[["report", v.inbox.reports], ["suggestion", v.inbox.suggestions], ["feedback", v.inbox.feedback], ["message", v.inbox.contact], ["support", v.inbox.support]].filter(([, n]) => n).map(([k, n]) => `${n} ${INBOX_LABEL[k as keyof typeof INBOX_LABEL].toLowerCase()}${n === 1 ? "" : "s"}`).join(", ") || "nothing waiting"}` : " (could not be read)"}</span>
        </Link>
      </section>

      {groups.map((g) => (
        <section key={g} className="mt-6" aria-label={g}>
          <h2 className="mb-2 text-xl text-white">{g}</h2>
          <div className="card-surface divide-y divide-ink-700 overflow-hidden">{checks.filter((c) => c.group === g).map((c) => <Item key={c.key} c={c} />)}</div>
        </section>
      ))}

      <section className="mt-8 max-w-2xl text-sm text-slate-400">
        <h2 className="mb-1 text-base text-white">What is not watched</h2>
        <p>
          Vercel&apos;s own bandwidth and build limits, and Stripe, are not visible from here without more keys. The Neon monthly transfer and compute figures appear once <code>NEON_API_KEY</code> and <code>NEON_PROJECT_ID</code> are
          added to Actions; until then they show as unknown, never green.
        </p>
      </section>
    </div>
  );
}
