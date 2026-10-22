// The pre-order share card's art (app/og/preorders/[set]/route.tsx): the products drawn on its right, per set slug, back to front,
// each a file committed under public/preorders/<set slug>/ (TCGplayer's product photos, downloaded once and shrunk). A set without an
// entry gets the words alone.
// No Magic art is committed yet (the Pokémon port's files were not carried over): every set draws the words alone until a set's
// photos are committed and listed here.
export const PREORDER_OG_ART: Record<string, string[]> = {};

/** The pre-order page's og:image path. */
export const preorderOgPath = (slug: string) => `/og/preorders/${slug}`;
