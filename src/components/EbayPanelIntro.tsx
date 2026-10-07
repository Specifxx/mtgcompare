// The line under "Also available on eBay" on a card page (RiftCompare's
// EbayPanelIntro). For ad-free members the Listings tab is a plain eBay link
// rather than the live carousel, so the second sentence only describes the tabs
// that exist.
export function EbayPanelIntro({ graded = true }: { graded?: boolean }) {
  return (
    <p className="mt-1 text-xs text-slate-500">
      Live listings, including used and international sellers: a useful cross-check on the store prices above, and often the only
      source for older printings.{graded ? " Graded slabs get their own tab, so they never distort the raw price." : ""} eBay prices are sellers&apos; asking prices and are never ranked with the stores.
    </p>
  );
}
