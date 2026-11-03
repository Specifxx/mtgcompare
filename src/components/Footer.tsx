import Link from "@/components/Link";
import { COUNTRY_GUIDE } from "@/content/guides/country-prices";
import { REGION_LIST, REGIONS, type Region } from "@/lib/regions";
import { menuSets } from "@/lib/release";
import { SET_BY_CODE } from "@/lib/sets";
import { CONTACT_EMAIL, FAN_CONTENT_DISCLAIMER, OPERATOR, SITE_NAME, sectionHref, type SectionKey } from "@/lib/site";
import { AMAZON_DISCLOSURE, AMAZON_TRADEMARK } from "@/lib/amazon";
import { NETWORK_PAGE, footerSisters } from "@/lib/family-network";
import { LogoMark } from "./Logo";
import { footerSeoSections } from "./seo/HubLinks";
import { RateUsLink } from "./site-reviews/SiteReviews";
import { Flag } from "@/components/Flag";

type FooterLink = { href: string; label: string };

/** The footer's link columns. Region pages get Shop, Latest sets, Explore and MTG Compare; pages with no region, Regions and MTG Compare. Pure (no database). */
export function footerColumns(region: Region | null, listed?: ReadonlySet<string> | null): { title: string; links: FooterLink[] }[] {
  const site: FooterLink[] = [
    { href: "/about", label: "About & how it works" },
    { href: "/blog", label: "Blog" },
    { href: "/creators", label: "Creators" },
    { href: "/widgets", label: "Free price widgets" },
    { href: "/about#stores", label: "For stores" },
    { href: "/forum", label: "Community forum (beta)" },
    { href: "/contact", label: "Contact" },
    { href: "/contact#suggest", label: "Suggest a store" },
    { href: "/how-we-pick-stores", label: "How we pick stores" },
    { href: "/affiliate-disclosure", label: "Affiliate disclosure" },
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
  ];
  if (!region) {
    return [
      { title: "Regions", links: [...REGION_LIST.map((r) => ({ href: `/${r.region}`, label: r.name })), { href: COUNTRY_GUIDE.path, label: "Prices by country" }] },
      { title: "MTG Compare", links: site },
    ];
  }
  const s = (key: SectionKey, label: string) => ({ href: sectionHref(region, key), label });
  return [
    {
      title: "Shop",
      links: [s("boosterBoxes", "Play Booster Boxes"), s("collectorBoxes", "Collector Booster Boxes"), s("bundles", "Bundles"), s("commanderDecks", "Commander decks"), s("secretLair", "Secret Lair"), s("perPack", "Cheapest per pack")],
    },
    // The newest released set first, the one on pre-order second (release.ts featureOrder): never a pre-order at the top.
    { title: "Latest sets", links: menuSets(6, undefined, listed).map((c) => SET_BY_CODE.get(c)!).map((set) => ({ href: `/${region}/sets/${set.slug}`, label: set.name })) },
    {
      title: "Explore",
      links: [s("deals", "Deals"), s("blackFriday", "Black Friday deals"), s("boxingDay", "Boxing Day deals"), s("januarySales", "January sales"), s("lunarNewYear", "Lunar New Year deals"), s("thisWeek", "This week"), s("backInStock", "Back in stock"), s("priceMoves", "Price moves"), s("outOfPrint", "Older sets in stock"), s("releases", "Releases"), s("guides", "Guides"), s("tools", "Tools"), s("stores", "Where to buy"), s("sealed", "All sealed"), { href: COUNTRY_GUIDE.path, label: "Prices by country" }],
    },
    // Every guide offered in the region (components/seo/HubLinks): no guide is an orphan.
    ...footerSeoSections(region).filter((sec) => sec.title === "Guides"),
    { title: "MTG Compare", links: site },
  ];
}

/**
 * The site footer: where to go next (by region when the page has one), what the site is, and how it is paid for, in two lines.
 * Static: no database read, so it costs nothing on the pages it closes. Rendered by the [region] and (site) layouts, the 404 and
 * the error page (each after its <main>).
 *
 * The address (CONTACT_EMAIL, compareempire@gmail.com) is shown on every page beside a link to /contact (owner, 2026-10-30 and
 * 2026-11-01: contact information "really clear", the sites without their own inbox on compareempire@gmail.com).
 */
export function Footer({ region, listed }: { region: Region | null; listed?: ReadonlySet<string> | null }) {
  const r = region ? REGIONS[region] : null;
  const cols = footerColumns(region, listed);
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className={`page grid gap-x-6 gap-y-10 py-12 ${r ? "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,3fr)]" : "md:grid-cols-[minmax(0,1.35fr)_minmax(0,1.5fr)]"}`}>
        <div className="max-w-sm">
          <Link href={r ? `/${r.region}` : "/"} className="inline-flex min-h-10 items-center gap-2 font-display text-lg font-extrabold tracking-tight">
            <LogoMark className="h-7 w-7" />
            <span>
              MTG <span className="text-brand">Compare</span>
            </span>
            {r && (
              <span className="ml-1 rounded-full border border-line px-2 py-0.5 font-sans text-xs font-semibold text-muted">
                <Flag code={r.short} /> {r.short}
              </span>
            )}
          </Link>
          <p className="mt-3 text-sm leading-6 text-muted">
            Magic: The Gathering sealed — booster boxes, bundles, Commander decks and more — compared across independent stores, in stock and
            cheapest first.
          </p>
          <p className="mt-4 text-xs leading-5 text-muted">
            eBay and TCGplayer links are affiliate links and are marked where they appear.
            <br />
            No store pays to be listed or to rank.{" "}
            <Link href="/about#money" className="whitespace-nowrap font-semibold text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
              How we make money&nbsp;→
            </Link>
          </p>
          <p className="mt-2 text-xs leading-5 text-muted" data-amazon-disclosure="">
            {AMAZON_DISCLOSURE} {AMAZON_TRADEMARK}{" "}
            <Link href="/affiliate-disclosure" prefetch={false} className="whitespace-nowrap font-semibold text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
              Affiliate disclosure
            </Link>
          </p>
          <p className="mt-3 text-xs text-muted">
            <Link href="/contact" prefetch={false} className="font-semibold text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
              Contact us
            </Link>
            : <a href={`mailto:${CONTACT_EMAIL}`} className="underline decoration-line underline-offset-2 hover:decoration-ink">{CONTACT_EMAIL}</a>
          </p>
        </div>

        <div className={`grid grid-cols-2 gap-x-6 gap-y-8 ${r ? "sm:grid-cols-4" : ""}`}>
          {cols.map((c) => (
            <nav key={c.title} aria-label={`Footer: ${c.title}`}>
              <h2 className="eyebrow mb-2">{c.title}</h2>
              <ul className="text-sm">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} prefetch={false} className="flex min-h-10 items-center text-muted transition-colors hover:text-ink sm:min-h-8">
                      {l.label}
                    </Link>
                  </li>
                ))}
                {c.links.some((l) => l.href === "/contact") && (
                  <li>
                    <RateUsLink className="flex min-h-10 items-center text-muted transition-colors hover:text-ink sm:min-h-8">Rate us</RateUsLink>
                  </li>
                )}
              </ul>
            </nav>
          ))}
        </div>
        {/* One short line (owner, 2026-11-02: the old list of every site was "convoluted"): the other card-game sites, then one
            link to the network page that lists every site (lib/family-network.ts, DECISIONS.md "Sites that grow each other"). */}
        <nav aria-label="Sister sites" className={r ? "lg:col-span-2" : "md:col-span-2"}>
          <h2 className="eyebrow mb-2">Other card games</h2>
          <p className="text-sm text-muted">
            {footerSisters("mtg").map((s, i) => (
              <span key={s.id}>
                {i ? " · " : ""}
                <a href={s.url} rel="noopener" title={s.label} className="font-semibold hover:text-ink">
                  {s.name}
                </a>
              </span>
            ))}
          </p>
          <p className="mt-2 text-sm text-muted">
            <a href={NETWORK_PAGE} rel="noopener" className="hover:text-ink">
              A Compare Empire site →
            </a>
          </p>
        </nav>
      </div>

      {r && (
        <div className="page pb-8">
          <nav aria-label="Regions" className="flex flex-wrap items-center gap-2 border-t border-line pt-6">
            <span className="eyebrow mr-1">Regions</span>
            {REGION_LIST.map((x) => (
              <Link
                key={x.region}
                href={`/${x.region}`}
                prefetch={false}
                aria-current={x.region === r.region ? "true" : undefined}
                className={`chip min-h-10 ${x.region === r.region ? "chip-on" : ""}`}
              >
                <Flag code={x.short} /> {x.name}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <div className="border-t border-line">
        <div className="page flex flex-col gap-1 py-5 text-xs leading-5 text-muted sm:flex-row sm:flex-wrap sm:justify-between sm:gap-x-6">
          <p>
            Prices and stock are read from each store about twice a day; the store&rsquo;s own page is final.
            {OPERATOR !== SITE_NAME && ` Operated by ${OPERATOR}.`}
          </p>
          <p>{FAN_CONTENT_DISCLAIMER}</p>
        </div>
      </div>
    </footer>
  );
}
