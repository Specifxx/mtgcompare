import Link from "next/link";
import { COUNTRY_GUIDE } from "@/content/guides/country-prices";
import { REGION_LIST, REGIONS, type Region } from "@/lib/regions";
import { SETS } from "@/lib/sets";
import { CONTACT_EMAIL_SET, OPERATOR, SISTER_SITES, SITE_NAME, sectionHref, type SectionKey } from "@/lib/site";
import { LogoMark } from "./Logo";

type FooterLink = { href: string; label: string };

/** The footer's link columns. Region pages get Shop, Latest sets, Explore and DexCompare; pages with no region, Regions and DexCompare. Pure (no database). */
export function footerColumns(region: Region | null): { title: string; links: FooterLink[] }[] {
  const site: FooterLink[] = [
    { href: "/about", label: "About & how it works" },
    { href: "/about#stores", label: "For stores" },
    { href: "/contact", label: "Contact" },
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
  ];
  if (!region) {
    return [
      { title: "Regions", links: [...REGION_LIST.map((r) => ({ href: `/${r.region}`, label: r.name })), { href: COUNTRY_GUIDE.path, label: "Prices by country" }] },
      { title: "DexCompare", links: site },
    ];
  }
  const s = (key: SectionKey, label: string) => ({ href: sectionHref(region, key), label });
  return [
    {
      title: "Shop",
      links: [s("boosterBoxes", "Booster boxes"), s("etbs", "Elite Trainer Boxes"), s("bundles", "Booster bundles"), s("upcs", "Ultra-Premium Collections"), s("tins", "Tins"), s("perPack", "Cheapest per pack")],
    },
    { title: "Latest sets", links: SETS.slice(0, 6).map((set) => ({ href: `/${region}/sets/${set.slug}`, label: set.name })) },
    {
      title: "Explore",
      links: [s("deals", "Deals"), s("thisWeek", "This week"), s("releases", "Releases"), s("guides", "Guides"), s("stores", "Where to buy"), s("sealed", "All sealed"), { href: COUNTRY_GUIDE.path, label: "Prices by country" }],
    },
    { title: "DexCompare", links: site },
  ];
}

/**
 * The site footer: where to go next (by region when the page has one), what the site is, and how it is paid for, in two lines.
 * Static: no database read, so it costs nothing on the pages it closes. Rendered by the [region] and (site) layouts, the 404 and
 * the error page (each after its <main>).
 *
 * No mailto here: "Contact" goes to /contact, which has the address. A branded address (NEXT_PUBLIC_CONTACT_EMAIL) is shown as text
 * when one is set; the legacy fallback never is.
 */
export function Footer({ region }: { region: Region | null }) {
  const r = region ? REGIONS[region] : null;
  const cols = footerColumns(region);
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className={`page grid gap-x-6 gap-y-10 py-12 ${r ? "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,3fr)]" : "md:grid-cols-[minmax(0,1.35fr)_minmax(0,1.5fr)]"}`}>
        <div className="max-w-sm">
          <Link href={r ? `/${r.region}` : "/"} className="inline-flex min-h-10 items-center gap-2 font-display text-lg font-extrabold tracking-tight">
            <LogoMark className="h-7 w-7" />
            <span>
              Dex<span className="text-brand">Compare</span>
            </span>
            {r && (
              <span className="ml-1 rounded-full border border-line px-2 py-0.5 font-sans text-xs font-semibold text-muted">
                <span aria-hidden="true">{r.flag}</span> {r.short}
              </span>
            )}
          </Link>
          <p className="mt-3 text-sm leading-6 text-muted">
            Pokémon sealed — booster boxes, Elite Trainer Boxes, bundles, collections and tins — compared across independent stores, in stock and
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
          {CONTACT_EMAIL_SET && <p className="mt-3 select-all text-xs text-muted">{CONTACT_EMAIL_SET}</p>}
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
              </ul>
            </nav>
          ))}
        </div>
        {/* The owner's sister sites, one row across the footer. */}
        <nav aria-label="Also from us" className={r ? "lg:col-span-2" : "md:col-span-2"}>
          <h2 className="eyebrow mb-2">Also from us</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {SISTER_SITES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener" className="font-semibold text-muted hover:text-ink">
                  {s.name}
                </a>
                <span className="text-xs text-faint"> — {s.what}</span>
              </li>
            ))}
          </ul>
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
                <span aria-hidden="true">{x.flag}</span> {x.name}
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
          <p>Not affiliated with Nintendo, Creatures, GAME FREAK or The Pokémon Company.</p>
        </div>
      </div>
    </footer>
  );
}
