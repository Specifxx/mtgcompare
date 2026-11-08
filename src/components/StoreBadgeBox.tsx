// "Add this badge to <store>'s site" (competitor scan, 2026-11-08): on a store's own page, the plain-HTML badge
// (lib/embed.ts storeBadge) pointing at that page. Plain HTML, not an iframe, so the link sits on the store's site.
// Shown, never sent: nobody is emailed about it.
export function StoreBadgeBox({ html, storeName, className = "card mt-8 p-5" }: { html: string; storeName: string; className?: string }) {
  return (
    <section aria-labelledby="store-badge-h" className={className}>
      <h2 id="store-badge-h" className="text-base font-bold">Add this badge to {storeName}&apos;s site</h2>
      <p className="mt-1 text-sm text-muted">
        Run this store? Show your customers that your prices are compared in the open. Paste this into your footer or product pages: plain HTML,
        no script, no image to load and no tracking.
      </p>
      <div className="mt-3" dangerouslySetInnerHTML={{ __html: html }} />
      <pre className="mt-3 select-all overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-line p-3 text-xs">
        <code>{html}</code>
      </pre>
    </section>
  );
}
