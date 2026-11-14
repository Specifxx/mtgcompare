import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FAMILY_SITES, NETWORK_PAGE } from "@/lib/family-network";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// The one page that links the owner's other sites (2026-11-08). The footer used to carry eight keyword-titled links to them on
// every page, ~9,000 site-wide links between our own sites: the pattern Google's link-spam policy warns about, and no
// authority in it. Now every page's footer links here once, and this page links each site once, by its plain name.
export const metadata: Metadata = {
  title: "Our other sites",
  description: `${SITE_NAME} is one of the Compare Empire price comparison sites. The others compare card games, hobby and tech prices the same way.`,
  alternates: { canonical: `${SITE_URL}/our-sites` },
};

export default function OurSites() {
  const sites = FAMILY_SITES.filter((s) => s.id !== "mtg");
  return (
    <div className="page max-w-3xl py-12">
      <Breadcrumbs items={[{ href: "/", label: SITE_NAME }, { label: "Our other sites" }]} />
      <h1 className="page-title mt-6">Our other sites</h1>
      <p className="page-lead mt-3">
        {SITE_NAME} is one of the Compare Empire sites: independent price comparison, the same rules on every site, no paid ranking.
      </p>
      <ul className="mt-8 divide-y divide-line rounded-xl border border-line">
        {sites.map((s) => (
          <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
            <a href={s.url} rel="noopener" className="font-semibold text-ink hover:underline">
              {s.name}
            </a>
            <span className="text-sm text-muted">{s.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted">
        <a href={NETWORK_PAGE} rel="noopener" className="hover:text-ink">
          Every Compare Empire site →
        </a>
      </p>
    </div>
  );
}
