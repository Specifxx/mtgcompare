import Link from "next/link";
import { getApprovedReviews, MIN_REVIEWS_TO_DISPLAY } from "@/lib/data";

// RiftCompare's ReviewsSection: real feedback that its author agreed to have
// shown (Feedback status APPROVED + consentPublic, moderated in /admin/inbox).
// Hidden below MIN_REVIEWS_TO_DISPLAY. No Review/AggregateRating markup, ever:
// self-collected reviews do not qualify for it.
export async function ReviewsSection() {
  const reviews = await getApprovedReviews(6);
  if (reviews.length < MIN_REVIEWS_TO_DISPLAY) return null;
  return (
    <section aria-labelledby="mc-reviews-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="mc-reviews-heading" className="text-xl font-extrabold text-white">
            What people say
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">Real feedback from people using MTG Compare, shared with their permission.</p>
        </div>
        <Link href="/feedback" className="btn-ghost hidden text-xs sm:inline-flex">
          Add yours →
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((r) => (
          <figure key={r.id} className="card-surface flex flex-col p-5">
            {r.rating != null && (
              <div className="text-sm text-gold" aria-label={`${r.rating} out of 5`}>
                {"★".repeat(r.rating)}
                <span className="text-ink-600">{"★".repeat(5 - r.rating)}</span>
              </div>
            )}
            <blockquote className="mt-2 flex-1 text-sm leading-relaxed text-slate-300">{r.message}</blockquote>
            <figcaption className="mt-3 text-xs text-slate-500">{r.displayName?.trim() ? r.displayName : "Verified visitor"}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
