import type { Metadata } from "next";
import Link from "next/link";
import { Light } from "@/components/admin/AdminPanel";
import { Icon } from "@/components/Icon";
import { StatTile } from "@/components/ui";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { getAdminHomeCounts } from "@/lib/admin-accounts";
import { deployLevel, type Level } from "@/lib/admin-alarms";
import { loadEbayBudget, loadFootprint } from "@/lib/admin-db-footprint";
import { loadPublication } from "@/lib/admin-publication";
import { currentDeploy, readReleaseHistory } from "@/lib/deploy-facts";
import { deployAgeDays } from "@/lib/release-schedule";
import { int } from "@/lib/format";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: { absolute: "Admin · MTG Compare" } });

const n = (v: number | null) => (v == null ? "–" : int(v));

// The groups of the console. Each tool is one page; the lights above them come from the panels' own alarm functions (src/lib/admin-alarms.ts).
const GROUPS = [
  {
    name: "Money",
    tools: [
      { href: "/admin/accounts", icon: "user", title: "Accounts", text: "Every account, plan and sign-in; grant, revoke, export." },
      { href: "/admin/subscriptions", icon: "chart", title: "Subscriptions", text: "MRR, churn, plan mix and cohorts from Stripe." },
      { href: "/admin/premium", icon: "crown", title: "Plus & Premium interest", text: "Who clicked a plan button or Pricing link, and from where." },
      { href: "/admin/clicks", icon: "chart", title: "Outbound clicks", text: "Clicks to stores, TCGplayer and eBay, by retailer and country." },
    ],
  },
  {
    name: "Data",
    tools: [
      { href: "/admin/data", icon: "chart", title: "Data publication", text: "What the site serves: pointer, files, repository size, alarms." },
      { href: "/admin/ebay", icon: "store", title: "eBay budget", text: "Quota spent today, the ledger, tiers, banner age, manual run." },
      { href: "/admin/store-health", icon: "store", title: "Store health", text: "Scrapers that broke quietly: failures, drops, match rate." },
      { href: "/admin/database", icon: "chart", title: "Database footprint", text: "Neon size against the 100 MB target; largest tables." },
    ],
  },
  { name: "Site", tools: [{ href: "/admin/deploys", icon: "chart", title: "Deploys", text: "Last and next weekly release; the data is newer than the code." }] },
  {
    name: "People",
    tools: [
      { href: "/admin/inbox", icon: "book", title: "Inbox", text: "Wrong-price reports, store suggestions, feedback, messages." },
      { href: "/admin/support", icon: "book", title: "Support", text: "Support tickets." },
      { href: "/admin/mail", icon: "book", title: "Newsletter and alerts", text: "Is mail on; subscribers, alerts, the last run." },
      { href: "/admin/lookup", icon: "user", title: "User lookup", text: "One account by e-mail or id, read-only." },
      { href: "/admin/loyalty", icon: "user", title: "Loyalty", text: "The most active members." },
    ],
  },
  {
    name: "Previews",
    tools: [
      { href: "/admin/demand", icon: "chart", title: "Demand", text: "Demand leaderboards behind the Premium tool." },
      { href: "/admin/rising", icon: "chart", title: "Rising", text: "Rising Cards ranking and the Hot 40 snapshot." },
      { href: "/admin/decks", icon: "book", title: "Decks", text: "Import published decks." },
    ],
  },
] as const;

const settle = async <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

export default async function AdminHome() {
  const user = await requireAdminPage();
  const now = new Date();
  const [counts, pub, ebay, db, hist] = await Promise.all([getAdminHomeCounts(), settle(loadPublication(now)), settle(loadEbayBudget()), settle(loadFootprint()), settle(readReleaseHistory({ now }))]);
  const age = deployAgeDays(hist?.commits[0]?.at ?? currentDeploy().builtAt, now);
  const lights: { href: string; label: string; level: Level }[] = [
    { href: "/admin/data", label: "Data", level: pub?.view.level ?? "unknown" },
    { href: "/admin/ebay", label: "eBay", level: ebay ? (ebay.latched ? "bad" : ebay.spend.level) : "unknown" },
    { href: "/admin/database", label: "Database", level: db?.level ?? "unknown" },
    { href: "/admin/deploys", label: "Deploy age", level: deployLevel(age) },
  ];
  return (
    <div>
      <h1 className="text-3xl text-white">Admin</h1>
      <p className="mt-1 text-sm text-slate-400">Signed in as {user.email}</p>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        {lights.map((l) => (
          <Link key={l.href} href={l.href} className="hover:opacity-80">
            <Light level={l.level} label={`${l.label}: ${l.level === "ok" ? "OK" : l.level === "warn" ? "watch" : l.level === "bad" ? "act" : "unknown"}`} />
          </Link>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Accounts" value={n(counts.accounts)} />
        <StatTile label="Paying now" value={n(counts.paying)} tone="text-gold" />
        <StatTile label="New inbox items" value={n(counts.inboxNew)} />
        <Link href="/admin/store-health#needs" className="block rounded-xl hover:opacity-90">
          <StatTile label="Stores whose last read failed" value={n(counts.storesFailed)} tone={counts.storesFailed ? "text-gold" : undefined} />
        </Link>
      </div>
      {GROUPS.map((g) => (
        <section key={g.name} className="mt-8">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.name}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {g.tools.map((t) => (
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
        </section>
      ))}
      <p className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/price-guide" className="text-brand-400 hover:underline">Price guide</Link>
        <Link href="/stores" className="text-brand-400 hover:underline">Stores</Link>
        <Link href="/" className="text-brand-400 hover:underline">Home</Link>
      </p>
    </div>
  );
}
