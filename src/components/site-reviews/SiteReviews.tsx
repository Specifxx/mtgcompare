"use client";

import { useEffect, useState } from "react";
import { SITE_REVIEWS } from "@/lib/site-reviews-config";
import { loadFeed, openRateCard, scoreLine, type SiteReviewsFeed } from "@/lib/site-reviews";

// "What people say": this site's star score and its approved reviews, from
// RiftCompare's shared review service (lib/site-reviews.ts). Real ratings and
// reviews only, or nothing at all: no placeholder, no seeded example. Plain
// HTML, never review markup (a site's rating of itself is self-serving under
// Google's review-snippet rules).

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="srv-stars-static" aria-hidden>
      {"★".repeat(full)}
      <span>{"★".repeat(5 - full)}</span>
    </span>
  );
}

export function SiteReviews({ limit = 6, className = "" }: { limit?: number; className?: string }) {
  const [feed, setFeed] = useState<SiteReviewsFeed | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    loadFeed().then((f) => {
      if (live) setFeed(f);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!feed?.rating) return null;
  const { rating } = feed;
  const reviews = all ? feed.reviews : feed.reviews.slice(0, limit);

  return (
    <section className={`srv-section ${className}`} aria-labelledby="srv-heading" data-site-reviews>
      <div className="srv-head">
        <div>
          <h2 id="srv-heading">What people say</h2>
          <p className="srv-score">
            <Stars value={rating.average} />
            <strong>{scoreLine(rating)}</strong>
          </p>
          <p className="srv-muted">Real ratings from people using {SITE_REVIEWS.name}. Written reviews are read by a person before they appear.</p>
        </div>
        <button type="button" className="srv-btn srv-btn-ghost" onClick={openRateCard}>
          Rate &amp; review
        </button>
      </div>
      {reviews.length > 0 && (
        <div className="srv-grid">
          {reviews.map((r) => (
            <figure key={r.id} className="srv-review">
              {r.rating != null && <Stars value={r.rating} />}
              <blockquote>{r.message}</blockquote>
              <figcaption>{r.name}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {!all && feed.reviews.length > limit && (
        <button type="button" className="srv-more" onClick={() => setAll(true)}>
          Show all {feed.reviews.length} reviews
        </button>
      )}
    </section>
  );
}

/** The footer's "Rate us": opens the rating card. */
export function RateUsLink({ className = "", children = "Rate us" }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={openRateCard} className={className} data-rate-us>
      {children}
    </button>
  );
}
