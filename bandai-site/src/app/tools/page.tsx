import type { Metadata } from "next";
import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { TOOLS } from "@/lib/tool-list";

export const revalidate = 86400;
export const metadata: Metadata = {
  title: `Free ${SITE.gameShort} price tools`,
  description: `Free ${SITE.game} tools: Deal Finder, Rising Cards, Demand Finder, Best Basket, a trade calculator and a selling-fee calculator. No account needed.`,
  ...canon("/tools"),
};


export default function Tools() {
  return (
    <div>
      <h1 className="font-display text-3xl font-black">Free {SITE.gameShort} price tools</h1>
      <p className="mt-2 text-muted">All free, no account, updated every morning.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="card-surface p-5 hover:border-brand/60">
            <p className="text-lg font-bold">{t.name}</p>
            <p className="mt-1 text-sm text-muted">{t.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
