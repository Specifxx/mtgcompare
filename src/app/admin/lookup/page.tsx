import type { Metadata } from "next";
import Link from "next/link";
import { Rows } from "@/components/admin/AdminPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { lookupAccount, parseLookup, type LookupResult } from "@/lib/admin-lookup";
import { ago, longDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "User lookup" });

// One account by e-mail or id, read-only. Grant and revoke are on /admin/accounts (audited).
export default async function AdminLookup({ searchParams }: { searchParams: { q?: string } }) {
  await requireAdminPage();
  const q = typeof searchParams.q === "string" ? searchParams.q : "";
  let u: LookupResult | null = null;
  let error: string | null = null;
  if (parseLookup(q)) {
    try {
      u = await lookupAccount(q);
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 200) : "Failed";
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-3xl text-white">User lookup</h1>
      <form method="get" className="flex flex-wrap gap-3">
        <input name="q" defaultValue={q} placeholder="E-mail or account id" className="w-80 rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-sm text-white" />
        <button type="submit" className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white">Look up</button>
      </form>
      {error ? <EmptyState title="Lookup failed" body={error} /> : !q ? null : !parseLookup(q) ? <EmptyState title="Not a lookup" body="Enter a full e-mail address or an account id." /> : !u ? <EmptyState title="No such account" body="Nothing matched." /> : (
        <>
          <Rows
            rows={[
              { label: "Account", value: `${u.displayName} (${u.email})`, note: u.isAdmin ? "admin" : undefined },
              { label: "Plan", value: u.plan, note: u.premiumUntil ? `until ${longDate(u.premiumUntil)}` : undefined },
              { label: "Stripe customer", value: u.stripeCustomerTail ? `...${u.stripeCustomerTail}` : "none" },
              { label: "Signed up", value: longDate(u.createdAt), note: u.signupSource ? `via ${u.signupSource}` : undefined },
              { label: "Last login", value: u.lastLoginAt ? ago(u.lastLoginAt) : "never", note: `${u.activeDays} active days` },
              { label: "Sign-in", value: u.signIns.join(", ") || "none" },
              { label: "Holds", value: `${u.counts.priceAlerts} price alerts, ${u.counts.sealedWatches} sealed watches, ${u.counts.deckWatches} deck watches, ${u.counts.collectionLines} collection lines, ${u.counts.publishedDecks} published decks, ${u.counts.supportTickets} tickets` },
              { label: "Notifications", value: `${u.counts.notifications} total`, note: u.notifications.map((n) => n.type).join(", ") || undefined },
            ]}
          />
          <p className="text-sm">
            <Link href="/admin/subscriptions" className="text-brand-400 hover:underline">Subscriptions</Link>
            {" · "}
            <Link href="/admin/accounts" className="text-brand-400 hover:underline">Accounts (grant and revoke)</Link>
          </p>
        </>
      )}
    </div>
  );
}
