"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Grouped as the landing page groups them: Money, Data, Site, People, Previews.
const LINKS = [
  { href: "/admin/health", label: "Health" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/premium", label: "Interest" },
  { href: "/admin/clicks", label: "Clicks" },
  { href: "/admin/data", label: "Data" },
  { href: "/admin/ebay", label: "eBay" },
  { href: "/admin/store-health", label: "Store health" },
  { href: "/admin/database", label: "Database" },
  { href: "/admin/deploys", label: "Deploys" },
  { href: "/admin/inbox", label: "Inbox" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/mail", label: "Mail" },
  { href: "/admin/lookup", label: "Lookup" },
  { href: "/admin/loyalty", label: "Loyalty" },
  { href: "/admin/demand", label: "Demand" },
  { href: "/admin/rising", label: "Rising" },
  { href: "/admin/decks", label: "Decks" },
];

// The admin bar's links, with the current section highlighted.
export function AdminNav({ inboxOpen = null }: { inboxOpen?: number | null }) {
  const path = usePathname() ?? "/admin";
  const cls = (active: boolean) => (active ? "text-sm font-semibold text-white" : "text-sm text-slate-300 hover:text-white");
  return (
    <nav aria-label="Admin" className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3">
      <Link href="/admin" className={`${cls(path === "/admin")} mr-2`}>
        Admin
      </Link>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={cls(path === l.href || path.startsWith(`${l.href}/`))}>
          {l.label}
          {l.href === "/admin/inbox" && inboxOpen ? <span className="ml-1.5 rounded-full bg-brand-500 px-1.5 py-0.5 text-[11px] font-bold text-white" aria-label={`${inboxOpen} open`}>{inboxOpen}</span> : null}
        </Link>
      ))}
      <Link href="/" className="ml-auto text-sm text-slate-400 hover:text-white">
        Back to site
      </Link>
    </nav>
  );
}
