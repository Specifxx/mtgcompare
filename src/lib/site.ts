// Site-wide constants. SITE_URL is the canonical origin (no trailing slash):
// every canonical, hreflang, JSON-LD, robots and sitemap URL is built on it, so
// a wrong value here is a wrong value in every one of them. NEXT_PUBLIC_SITE_URL
// in Vercel overrides the default; DEPLOY.md, "Domains" says what to set.
export const SITE_NAME = "MTG Compare";
export const SITE_URL = normaliseOrigin(process.env.NEXT_PUBLIC_SITE_URL) ?? "https://mtgcompare.app";
// The mailbox the contact, terms and privacy pages (and the scrapers' From header) give. The fallback is a legacy
// address from another brand that still reaches the owner: it stays only so those pages keep a working address until
// NEXT_PUBLIC_CONTACT_EMAIL is set. Site chrome never prints it: the footer links to /contact, and shows an address only
// when one has been set on purpose (CONTACT_EMAIL_SET).
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "riftcompare@gmail.com";
export const CONTACT_EMAIL_SET: string | null = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;
export const SITE_TAGLINE = "Magic: The Gathering sealed prices and stock, compared across independent stores.";

// Who runs the site, for the Terms and the footer. Set NEXT_PUBLIC_OPERATOR in
// Vercel to the trading name (a person or a company); until then the site name
// stands in. Nothing here invents a legal entity or an address.
// Wizards of the Coast's Fan Content Policy wording, shown in the footer and on /about.
export const FAN_CONTENT_DISCLAIMER = `${SITE_NAME} is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.`;

export const OPERATOR = process.env.NEXT_PUBLIC_OPERATOR?.trim() || SITE_NAME;

// The owner's other price-comparison sites, linked from the footer (owner's
// call, 2026-10-14: the four sites cross-link in every footer). Plain followed
// links — our own sites, not affiliates — so no nofollow or sponsored. The other
// three games only (2026-10-23): the old list linked this site to itself and had
// no Pokémon site. `anchor` is the link text, the words each site is found by.
export const SISTER_SITES = [
  { name: "RiftCompare", url: "https://riftcompare.com", game: "Riftbound", anchor: "Riftbound card prices", what: "RiftCompare" },
  { name: "OP Compare", url: "https://opcompare.app", game: "One Piece", anchor: "One Piece Card Game prices", what: "OP Compare" },
  { name: "DexCompare", url: "https://www.dexcompare.app", game: "Pokémon", anchor: "Pokémon TCG sealed prices", what: "DexCompare" },
  // The whole Compare Empire family (2026-10-26, DECISIONS.md "One family of sites").
  { name: "Gundam Compare", url: "https://gundamcompare.com", game: "Gundam", anchor: "Gundam Card Game prices", what: "Gundam Compare" },
  { name: "Lorcana Compare", url: "https://lorcanacompare.com", game: "Lorcana", anchor: "Lorcana card prices", what: "Lorcana Compare" },
  // Every site links the whole family (2026-10-27, DECISIONS.md "Every site links the whole family").
  { name: "YGO Compare", url: "https://ygocompare.com", game: "Yu-Gi-Oh", anchor: "Yu-Gi-Oh! card prices", what: "YGO Compare" },
  { name: "WargameCompare", url: "https://wargamecompare.com", game: "Miniature wargame", anchor: "Miniature wargame prices", what: "WargameCompare" },
  { name: "FigureCompare", url: "https://figurecompare.com", game: "Anime figure", anchor: "Anime figure prices", what: "FigureCompare" },
  { name: "CamCompare", url: "https://www.camcompare.app", game: "Camera", anchor: "Camera and lens prices", what: "CamCompare" },
  { name: "Compare Empire", url: "https://www.compareempire.com", game: "Australian", anchor: "Australian tech prices", what: "Compare Empire" },
] as const;

// Public profiles for Organization.sameAs (an X account, a Bluesky handle…).
// Empty until there are any: an empty list is left out of the JSON-LD.
export const SOCIAL_LINKS: string[] = [];

// The site's sections under /<region>, as the header's nav, the phone menu and the footer link to them: one list of paths,
// so the three never disagree. Labels differ by place ("Stores" in the nav, "Where to buy" in the menu) and live there.
export const SECTION_PATHS = {
  deals: "/deals",
  blackFriday: "/black-friday",
  thisWeek: "/this-week",
  backInStock: "/back-in-stock",
  priceMoves: "/price-moves",
  outOfPrint: "/out-of-print",
  sealed: "/sealed",
  boosterBoxes: "/type/play-booster-boxes",
  collectorBoxes: "/type/collector-booster-boxes",
  bundles: "/type/bundles",
  commanderDecks: "/type/commander-decks",
  secretLair: "/type/secret-lair",
  perPack: "/cheapest-packs",
  sets: "/sets",
  releases: "/releases",
  guides: "/guides",
  tools: "/tools",
  stores: "/stores",
} as const;
export type SectionKey = keyof typeof SECTION_PATHS;

/** "/au" + a section's path: `sectionHref("au", "deals")` → "/au/deals". */
export function sectionHref(region: string, key: SectionKey): string {
  return `/${region}${SECTION_PATHS[key]}`;
}

/** "https://mtgcompare.app/" → "https://mtgcompare.app"; garbage → null. */
function normaliseOrigin(v: string | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

// A production build whose canonical host is not the host it deploys to
// tells every crawler to index some other site. Say so in the build log, loudly,
// but never throw: a mis-set variable must not take the site down.
if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  const deployed = process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, "").toLowerCase();
  const canonical = new URL(SITE_URL).host.toLowerCase();
  if (deployed !== canonical) {
    console.error(
      `\n[site] NEXT_PUBLIC_SITE_URL is ${SITE_URL} but this production deployment serves ${deployed}.\n` +
        `[site] Every canonical/hreflang/sitemap URL will point at ${canonical}. Fix NEXT_PUBLIC_SITE_URL in Vercel (DEPLOY.md, "Domains").\n`,
    );
  }
}
