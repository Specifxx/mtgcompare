import { withLinks } from "./HubIntro";

/**
 * The article's FAQ, rendered VISIBLY from the same `faq` array that feeds the
 * FAQPage JSON-LD in ArticleView (RiftCompare's ArticleFaq). One array drives
 * both: Google cross-checks FAQPage markup against visible content and drops the
 * rich result when they disagree. <details> keeps a long FAQ from being a wall;
 * the answers stay in the server-rendered DOM either way. The padding is on the
 * <summary> so the whole row is the toggle.
 */
export function ArticleFaq({ faq, heading = "Frequently asked questions" }: { faq: { q: string; a: string }[]; heading?: string }) {
  if (!faq.length) return null;
  return (
    <section className="mt-10 scroll-mt-24" id="faq">
      <h2 className="mb-3 text-xl font-extrabold text-white">{heading}</h2>
      <div className="divide-y divide-ink-800 rounded-xl border border-ink-700">
        {faq.map((f, i) => (
          <details key={i} className="group">
            <summary className="flex cursor-pointer list-none gap-2 p-4 font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="flex-none self-start text-brand-400 transition-transform group-open:rotate-90" aria-hidden>
                ›
              </span>
              {f.q}
            </summary>
            <p className="px-4 pb-4 pl-9 text-sm leading-relaxed text-slate-300">{withLinks(f.a)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
