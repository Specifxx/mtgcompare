import Link from "next/link";

// The /alerts page's primary CTA (RiftCompare's AlertsSignupCta, wave 2). That
// page is the explainer for the exact feature a free account unlocks, so its
// main exit is the signup, attributed with ?src= (the member track's signup
// source reads it). Renders identically for everyone.
export function AlertsSignupCta() {
  return (
    <Link href="/login?next=/watchlist&src=alerts_page" rel="nofollow" className="btn-primary shrink-0 whitespace-nowrap">
      Start your watchlist — free
    </Link>
  );
}
