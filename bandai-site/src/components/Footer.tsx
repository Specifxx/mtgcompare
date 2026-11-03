import Link from "@/components/Link";
import { RateUsLink } from "./site-reviews/SiteReviews";
import { SITE } from "@/site.config";
import { creatorsOn } from "@/lib/creators";
import { NETWORK_PAGE, footerSisters } from "@/lib/family-network";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-ink-700/60 bg-ink-950">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm md:grid-cols-4">
        <div>
          <p className="flex items-center gap-2 font-display font-black"><img src="/icon.svg" alt={`${SITE.name} logo`} width={24} height={24} className="h-6 w-6 rounded-md" /><span className="wordmark">{SITE.wordmark[0]}</span> {SITE.wordmark[1]}</p>
          <p className="mt-2 text-muted">{SITE.tagline}. Free, no account needed.</p>
        </div>
        <div>
          <p className="mb-2 font-semibold">Prices</p>
          <ul className="space-y-1 text-muted">
            <li><Link href="/cards">All cards</Link></li>
            <li><Link href="/sets">Set price guides</Link></li>
            <li><Link href="/sealed">Booster box prices</Link></li>
            {SITE.kits && <li><Link href="/kits">{SITE.kits.label} prices</Link></li>}
            <li><Link href="/movers">Price movers</Link></li>
            <li><Link href="/price-report">Monthly price report</Link></li>
            <li><Link href="/black-friday">Black Friday deals</Link></li>
            <li><Link href="/boxing-day">Boxing Day deals</Link></li>
            <li><Link href="/january-sales">January sales</Link></li>
            <li><Link href="/lunar-new-year">Lunar New Year deals</Link></li>
            <li><Link href="/embed">Free price widgets</Link></li>
            <li><Link href="/tools/deal-finder">Deal Finder</Link></li>
            <li><Link href="/tools/rising">Rising cards</Link></li>
            <li><Link href="/tools/demand">Demand Finder</Link></li>
            <li><Link href="/tools/best-basket">Best Basket</Link></li>
            <li><Link href="/preorders">Pre-orders</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold">{SITE.name}</p>
          <ul className="space-y-1 text-muted">
            <li><Link href="/about">About</Link></li>
            <li><Link href="/methodology">How prices work</Link></li>
            <li><Link href="/stores">Stores we track</Link></li>
            <li><Link href="/blog">Guides</Link></li>
            <li><Link href="/forum">Community forum</Link> <span className="text-xs">· beta</span></li>
            {creatorsOn() && <li><Link href="/creators">Creators</Link></li>}
            <li><Link href="/contact">Contact</Link></li>
            <li><RateUsLink className="hover:underline">Rate us</RateUsLink></li>
            <li><Link href="/stores#suggest">Suggest a store</Link></li>
            <li><Link href="/how-we-pick-stores">How we pick stores</Link></li>
            <li><a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a></li>
            <li><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></li>
          </ul>
        </div>
        <div>
          {/* The other card sites, by brand name only (owner, 2026-11-03: no hobby or tech sites in a card
              site's footer), then one link to the network page that lists every site (DECISIONS.md). */}
          <p className="mb-2 font-semibold">Other card games</p>
          <p className="text-muted">
            {footerSisters(SITE.family.id).map((s, i) => (
              <span key={s.id}>{i ? " · " : ""}<a href={s.url} rel="noopener" title={s.label}>{s.name}</a></span>
            ))}
          </p>
          <p className="mt-2 text-muted"><a href={NETWORK_PAGE} rel="noopener">A Compare Empire site →</a></p>
        </div>
      </div>
      <p className="mx-auto max-w-7xl px-4 pb-8 text-xs text-muted">
        {SITE.name} is an independent price comparison site, not affiliated with or endorsed by the publisher of {SITE.game}{SITE.kits ? ` or by ${SITE.kits.maker}` : ""}. As an eBay Partner and TCGplayer affiliate we may earn a commission from qualifying purchases made through links on this site, at no cost to you.{SITE.disclaimer ? ` ${SITE.disclaimer}` : ""} As an Amazon Associate we earn from qualifying purchases. Amazon and the Amazon logo are trademarks of Amazon.com, Inc. or its affiliates. Prices change often; the store&apos;s checkout price is final.
      </p>
    </footer>
  );
}
