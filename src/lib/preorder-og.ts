// The pre-order share card's art (app/og/preorders/[set]/route.tsx): the products drawn on its right, per set slug, back to front,
// each a file committed under public/preorders/<set slug>/ (TCGplayer's product photos, downloaded once and shrunk). A set without an
// entry gets the words alone.
export const PREORDER_OG_ART: Record<string, string[]> = {
  "delta-reign": ["elite-trainer-box.jpg", "booster-bundle.jpg", "booster-box.jpg", "booster-pack.jpg"],
};

/** The pre-order page's og:image path. */
export const preorderOgPath = (slug: string) => `/og/preorders/${slug}`;
