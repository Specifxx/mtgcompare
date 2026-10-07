import { withLinks } from "./HubIntro";

/**
 * The answer-first summary block ("In short"), RiftCompare's AnswerBox: one
 * visually distinct, self-contained block under the H1 that answers the page's
 * question in two or three sentences before any UI, with a stable `.answer-box`
 * class. Bullets may carry `[label](/path)` internal links (single-slash paths
 * only, via HubIntro's withLinks).
 */
export function AnswerBox({ children, points, heading = "In short", className }: { children?: React.ReactNode; points?: string[]; heading?: string; className?: string }) {
  return (
    <section className={`answer-box card-surface border-l-2 border-l-brand-500 p-4 sm:p-5 ${className ?? "my-5"}`} aria-label={heading}>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-brand-400">{heading}</h2>
      {children ? <div className="max-w-2xl text-[15px] leading-relaxed text-slate-300">{children}</div> : null}
      {points && points.length > 0 ? (
        <ul className="mt-2 max-w-2xl list-disc space-y-1 pl-5 text-sm text-slate-300">
          {points.map((p, i) => (
            <li key={i}>{withLinks(p)}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
