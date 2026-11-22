import { GIVEAWAY, GIVEAWAY_DISCORD, giveawayState } from "./giveaway";

// The one per-site file of the account pages and sign-in slides (src/components/account/*, owner 2026-11-22: "nice profile pages and
// sign in slides to encourage signing in"). Everything else in those components is the same on every card site that has accounts.
export const ACCOUNT_SITE = {
  /** RiftCompare's sister key: the account's signupSource is "sister:<key>:<surface>". */
  key: "mtg",
  name: "MTG Compare",
  /** What a collection here holds, and what an alert can be set on. */
  things: "booster boxes, bundles and Commander decks",
  /** Pages the corner slide never covers (account pages, and pages that are themselves a sign-in pitch). */
  quietPaths: [/^\/account/, /^\/premium/, /^\/watches/, /^\/collection/, /^\/giveaway/],
  /** Product pages: a phone there has the sticky buy bar, so the corner slide shows on them from 1024px only. */
  productPath: /\/p\//,
  discord: GIVEAWAY_DISCORD as string | null,
  giveaway: {
    title: GIVEAWAY.title,
    image: GIVEAWAY.imageUrl,
    closesShort: "closes 14 Dec",
    open: () => giveawayState() === "open",
  } as { title: string; image: string; closesShort: string; open: () => boolean } | null,
};
