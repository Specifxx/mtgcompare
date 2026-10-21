// The eBay wordmark every eBay unit starts with: the multicolour "ebay" lettering as small inline text
// (e #e53238, b #0064d2, a #f5af02, y #86b817). ONE swappable component: to use eBay's official logo
// artwork instead, replace the body of this file (keep the aria-label) and every unit follows.
//
// The owner chose a wordmark style; eBay's Partner Network brand guidelines apply to how eBay's marks
// are shown (clear space, no recolouring, no implied endorsement): check them in EPN Campaign Manager
// before changing its size or colours. The letters are a logo, not copy: they keep eBay's own colours
// in light and dark (DEPLOY.md, "The eBay wordmark").
export function EbayMark({ className = "" }: { className?: string }) {
  return (
    <span role="img" aria-label="eBay" className={`inline-block shrink-0 select-none font-display font-extrabold leading-none tracking-tight ${className}`}>
      <span aria-hidden="true" className="text-[#e53238]">e</span>
      <span aria-hidden="true" className="text-[#0064d2]">b</span>
      <span aria-hidden="true" className="text-[#f5af02]">a</span>
      <span aria-hidden="true" className="text-[#86b817]">y</span>
    </span>
  );
}
