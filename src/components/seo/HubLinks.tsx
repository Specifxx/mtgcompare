// Internal links for crawlers and readers (SEO, 2026-10-23): a product page's way up to its set, its type, the region's deals and
// price-per-pack pages, and the footer's top product types and guides. Plain server components with no data reads: each takes what
// its page already has. Mount: <ProductHubLinks …/> under the product page's related grid; <FooterSeoLinks region=…/> in Footer.
import Link from "@/components/Link";
import { guidesFor } from "@/content/guides";
import type { RegionInfo, Region } from "@/lib/regions";
import { TYPE_BY_LABEL, TYPE_BY_KEY } from "@/lib/sealed-title";
import { SET_BY_CODE } from "@/lib/sets";

const chip = "chip min-h-10";

/** The product's set, its product type, and the region's deals and cheapest-per-pack pages, as a row of chips. */
export function ProductHubLinks({ r, productType, setCode }: { r: Pick<RegionInfo, "region" | "inName">; productType: string; setCode: string | null }) {
  const set = setCode ? SET_BY_CODE.get(setCode) : null;
  const type = TYPE_BY_LABEL.get(productType);
  const links = [
    ...(set ? [{ href: `/${r.region}/sets/${set.slug}`, label: `All ${set.name} sealed` }] : []),
    ...(type ? [{ href: `/${r.region}/type/${type.slug}`, label: `${type.plural} in ${r.inName}` }] : []),
    { href: `/${r.region}/deals`, label: `Deals in ${r.inName}` },
    { href: `/${r.region}/cheapest-packs`, label: "Cheapest per pack" },
  ];
  return (
    <nav aria-label="More like this" className="mt-8">
      <ul role="list" className="flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} prefetch={false} className={chip}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The footer's top product types and every guide offered in the region (all regions are already in the footer). */
export const FOOTER_TYPES = ["play-booster-box", "collector-booster-box", "bundle", "commander-deck", "play-booster", "secret-lair"] as const;

export function footerSeoSections(region: Region): { title: string; links: { href: string; label: string }[] }[] {
  const types = FOOTER_TYPES.map((k) => TYPE_BY_KEY.get(k)).filter((t): t is NonNullable<typeof t> => !!t);
  return [
    { title: "Top products", links: types.map((t) => ({ href: `/${region}/type/${t.slug}`, label: t.plural })) },
    { title: "Guides", links: guidesFor(region).map((g) => ({ href: `/${region}/guides/${g.slug}`, label: g.title })) },
  ];
}
