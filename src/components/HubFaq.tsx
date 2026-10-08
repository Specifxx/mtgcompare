/**
 * The visible FAQ block for a hub page (/tools, /movers, /sets …; RiftCompare's HubFaq),
 * paired with faqPage() from lib/jsonld in the page's JSON-LD array.
 *
 * WHY HUBS NEED ONE: these are the highest-intent pages on the site for the
 * questions people actually type into an answer engine — "which Magic cards
 * are going up in price", "how many Magic sets are there". Each already had
 * good explanatory prose, but prose is not eligible for FAQPage markup and is
 * harder to quote verbatim. Same facts, in a shape an answer engine can lift.
 *
 * The answers live in the server-rendered DOM regardless of the <details> state,
 * which is what a crawler reads.
 *
 * The padding lives on the <summary>, not the <details>, so the whole row is the
 * toggle (2026-09-23): with p-4 on <details> the summary was only the text line
 * (324x24 inside a 356x56 row at 390), and a tap in the padding band hit the
 * details box and did nothing. The chevron is a flex item with self-start, so it
 * stays one line tall and rotate-90 pivots beside the first line rather than
 * swinging onto a wrapped question; pl-9 lines the answer up with the question.
 * The same pattern is copied on /alerts, /stores/consulting and ArticleFaq.
 */
const DEFAULT_HEADING = "Frequently asked questions";

export function HubFaq({
  faqs,
  heading = DEFAULT_HEADING,
  className,
}: {
  faqs: { q: string; a: string }[];
  heading?: string;
  className?: string;
}) {
  if (!faqs.length) return null;
  return (
    <section className={className ?? "mt-10"}>
      <h2 className="mb-3 text-xl font-extrabold text-white">{heading}</h2>
      <div className="divide-y divide-ink-800 rounded-xl border border-ink-700">
        {faqs.map((f) => (
          <details key={f.q} className="group">
            <summary className="flex cursor-pointer list-none gap-2 p-4 font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="flex-none self-start text-brand-400 transition-transform group-open:rotate-90" aria-hidden>
                ›
              </span>
              {f.q}
            </summary>
            <p className="px-4 pb-4 pl-9 text-sm leading-relaxed text-slate-300">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
