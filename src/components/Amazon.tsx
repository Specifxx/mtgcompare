import Link from "@/components/Link";
import { AMAZON_DISCLOSURE, amazonCta, amazonLabel, amazonRegion, amazonRetailer, amazonUrl, REL_AMAZON } from "@/lib/amazon";
import type { Placement } from "@/lib/affiliate";
import type { Region } from "@/lib/regions";
import { OutboundLink } from "./OutboundLink";

// Amazon links (lib/amazon.ts: Amazon AU in AU, NZ and SG; Amazon US in the US; UK, CA and EU once their tag is set). Server
// components: the tag is read here, and OutboundLink gets the built URL. A marketplace link only: no price, rating or stock, never
// ranked with the stores, never "best price". Nothing renders in a region without an Amazon tag.

const NOTE = "text-xs leading-5 text-muted";

/** The inline disclosure beside Amazon links, with a link to the full page. */
export function AmazonNote({ className = "" }: { className?: string }) {
  return (
    <p className={`${NOTE} ${className}`}>
      {AMAZON_DISCLOSURE}{" "}
      <Link href="/affiliate-disclosure" prefetch={false} className="font-semibold text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
        Affiliate disclosure
      </Link>
    </p>
  );
}

/** One "Check price on Amazon AU / US" link. `page` is the GA4 amazon_click page (a path). */
export function AmazonLink({
  region,
  name,
  slug,
  placement,
  page,
  className = "font-semibold text-brand-strong underline-offset-2 hover:underline",
  children,
}: {
  region: Region;
  name: string;
  slug?: string | null;
  placement: Placement;
  page: string;
  className?: string;
  children?: React.ReactNode;
}) {
  if (!amazonRegion(region)) return null;
  return (
    <OutboundLink href={amazonUrl(name, { slug, region, placement })} rel={REL_AMAZON} retailer={amazonRetailer(region)} placement={placement} className={className} amazon={{ product: slug || name, region, page }}>
      {children ?? (
        <>
          {amazonCta(region)} <span aria-hidden="true">↗</span>
        </>
      )}
    </OutboundLink>
  );
}

/** Product page, sold out: the Amazon row, its own card under the sold-out callout, with its disclosure (in stock, it is a row of the table). */
export function AmazonProductRow({ region, name, slug }: { region: Region; name: string; slug: string }) {
  if (!amazonRegion(region)) return null;
  const l = amazonLabel(region);
  return (
    <div data-ad="amazon-product" className="card mt-3 overflow-hidden">
      <h2 className="eyebrow border-b border-line bg-raised px-5 py-2.5">Also on Amazon</h2>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5 text-sm">
        <span className="min-w-0">
          <b>{l.name}</b> <span className="text-muted">— marketplace, not one of the stores compared above</span>
        </span>
        <AmazonLink region={region} name={name} slug={slug} placement="amazon-product" page={`/${region}/p/${slug}`} className="btn-ghost ml-auto min-h-11 shrink-0 whitespace-nowrap px-4 sm:min-h-10" />
      </div>
      <div className="border-t border-line px-5 py-2.5">
        <p className={NOTE}>{l.note}</p>
        <AmazonNote />
      </div>
    </div>
  );
}

/** Listing pages (type, set, deals): ONE light line per page, "Also check Amazon AU / US" for the page's subject. */
export function AmazonAlso({ region, name, placement, page }: { region: Region; name: string; placement: Placement; page: string }) {
  if (!amazonRegion(region)) return null;
  const l = amazonLabel(region);
  return (
    <div data-ad={placement} className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <AmazonLink region={region} name={name} placement={placement} page={page}>
        Also check {l.name} <span aria-hidden="true">↗</span>
      </AmazonLink>
      <span className={NOTE}>
        {region === "nz" || region === "sg" ? `${l.note} ` : ""}
        {AMAZON_DISCLOSURE}
      </span>
    </div>
  );
}
