import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { StatTile } from "@/components/ui";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { getAdminHomeCounts } from "@/lib/admin-accounts";
import { int } from "@/lib/format";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: { absolute: "Admin · OP Compare" } });

const n = (v: number | null) => (v == null ? "–" : int(v));

const TOOLS = [
  { href: "/admin/accounts", icon: "user", title: "Accounts", text: "Every account, plan and sign-in; grant, revoke, export." },
  { href: "/admin/subscriptions", icon: "chart", title: "Subscriptions", text: "MRR, churn, plan mix and cohorts from Stripe." },
  { href: "/admin/store-health", icon: "store", title: "Store health", text: "Scrapers that broke quietly: failures, drops, match rate." },
  { href: "/admin/inbox", icon: "book", title: "Inbox", text: "Wrong-price reports, store suggestions, feedback, messages." },
  { href: "/admin/premium", icon: "crown", title: "Plus & Premium interest", text: "Who clicked a plan button or Pricing link, and from where." },
] as const;

export default async function AdminHome() {
  const user = await requireAdminPage();
  const counts = await getAdminHomeCounts();
  return (
    <div>
      <h1 className="text-3xl text-white">Admin</h1>
      <p className="mt-1 text-sm text-slate-400">Signed in as {user.email}</p>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Accounts" value={n(counts.accounts)} />
        <StatTile label="Paying now" value={n(counts.paying)} tone="text-gold" />
        <StatTile label="New inbox items" value={n(counts.inboxNew)} />
        <Link href="/admin/store-health#needs" className="block rounded-xl hover:opacity-90">
          <StatTile label="Stores whose last read failed" value={n(counts.storesFailed)} tone={counts.storesFailed ? "text-gold" : undefined} />
        </Link>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="card-surface flex items-start gap-3 p-5 hover:border-ink-600">
            <Icon name={t.icon} className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-semibold text-white">
                {t.title}
                {t.href === "/admin/inbox" && counts.inboxNew ? <span className="chip bg-brand-500 text-white">{int(counts.inboxNew)} new</span> : null}
              </span>
              <span className="mt-1 block text-sm text-slate-400">{t.text}</span>
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-6 flex flex-wrap gap-4 text-sm">
        <Link href="/price-guide" className="text-brand-400 hover:underline">
          Price guide
        </Link>
        <Link href="/stores" className="text-brand-400 hover:underline">
          Stores
        </Link>
        <Link href="/" className="text-brand-400 hover:underline">
          Home
        </Link>
      </p>
    </div>
  );
}
