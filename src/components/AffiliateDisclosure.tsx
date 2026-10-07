// The visible affiliate disclosure, shown IMMEDIATELY ADJACENT to affiliate
// links (RiftCompare's AffiliateDisclosure). The eBay Partner Network requires
// the disclosure to be "clear and prominent" and near the promotional content;
// the same FTC-derived rule covers TCGplayer's programme.
//
// Never hide it behind a hover, tooltip, sr-only or collapsed element, and
// never render it for only some visitors: if an affiliate link renders, its
// disclosure renders. The machine-readable half (rel="sponsored nofollow")
// is lib/affiliate.ts outboundRel().

type Partner = "ebay" | "tcgplayer" | "both";

const TEXT: Record<Partner, string> = {
  ebay: "Affiliate link: as an eBay Partner Network affiliate, OP Compare earns from qualifying purchases — at no extra cost to you.",
  tcgplayer: "Affiliate link: OP Compare earns a commission from qualifying TCGplayer purchases — at no extra cost to you.",
  both: "Affiliate links: as an eBay Partner Network affiliate and a TCGplayer affiliate, OP Compare earns from qualifying purchases — at no extra cost to you.",
};

export function AffiliateDisclosure({ partner = "ebay", tight, className }: { partner?: Partner; tight?: boolean; className?: string }) {
  return <p className={`${tight ? "mt-1" : "mt-2"} text-[11px] leading-snug text-slate-400 ${className ?? ""}`}>{TEXT[partner]}</p>;
}

export function PaidLinkTag({ className }: { className?: string }) {
  return (
    <span className={`chip bg-ink-800 text-[10px] text-slate-400 ${className ?? ""}`} title="We earn a commission on purchases through this link, at no extra cost to you.">
      Paid link
    </span>
  );
}
