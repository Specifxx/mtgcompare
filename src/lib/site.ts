// Site identity. Everything brand-shaped reads from here, so a rename or a new
// domain is a one-file change.
//
// The production domain is NOT DECIDED. mtgcompare.app is a PLACEHOLDER (a .app
// domain is HTTPS-only and on the HSTS preload list, which is why it was picked):
// on 2026-10-08 it resolved to Vercel and answered DEPLOYMENT_PAUSED, so it may
// already belong to someone, and the .com of the same name is a live, unrelated
// "MTG Compare UK" site. Confirm the domain before launch. It is the default so a missing env
// var can never publish canonical URLs, the sitemap, Open Graph or JSON-LD on
// another host; NEXT_PUBLIC_SITE_URL overrides it (the real domain, local
// development, a preview domain). tests/domain.test.ts pins this default.
export const SITE_NAME = "MTG Compare";
export const SITE_SHORT = "MTGCompare";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://mtgcompare.app").replace(/\/+$/, "");
export const SITE_TAGLINE = "Magic: The Gathering card prices, compared";
export const SITE_DESCRIPTION =
  "Compare Magic: The Gathering card prices across stores in the US, Australia, the UK, Singapore, Canada and the EU. Every printing and sealed product, priced daily.";
// The public contact address. PLACEHOLDER: the .invalid TLD can never deliver,
// so nothing is ever sent to a stranger's inbox. Set NEXT_PUBLIC_CONTACT_EMAIL
// (Vercel and GitHub Actions) to the owner's real MTG Compare address.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "riftcompare@gmail.com";
// The owner's sister sites, linked from About and the footer. The one place the other two brands are named.
export const SISTER_SITES = [
  { name: "RiftCompare", url: "https://riftcompare.com", game: "Riftbound" },
  { name: "OP Compare", url: "https://opcompare.app", game: "the One Piece Card Game" },
] as const;
// The first sister site, kept under the name the footer and About already read.
export const SISTER_SITE = SISTER_SITES[0];
// MTG Compare's Discord invite. Unset by default: the header icon, the footer
// link and the nav entry render only when NEXT_PUBLIC_DISCORD_URL is set, so
// there is never a dead invite on the page.
export const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL || "";

// ── Wizards of the Coast, Scryfall and the data sources: the legal strings ─────
// Every surface that carries them (the footer on every page, About, Terms) imports
// these, so the wording exists once: change a sentence here and nowhere else.
export const FAN_CONTENT_POLICY_URL = "https://company.wizards.com/en/legal/fancontentpolicy";
// The Fan Content Policy's own sentence, verbatim, with the site's name in the
// slot the policy leaves for it. "Permitted under the Fan Content Policy" is the
// policy's wording; whether a site with a paid tier may say it is the owner's open
// question with Wizards (DECISIONS), not something this constant decides.
export const FAN_CONTENT_DISCLAIMER = `${SITE_NAME} is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.`;
export const UNOFFICIAL_FAN_SITE_NOTICE = `${SITE_NAME} is an independent, unofficial fan site. It is not endorsed, sponsored or approved by Wizards of the Coast, Hasbro or Scryfall. TCGplayer and eBay are retailers we link to as an affiliate and do not endorse this site. Magic: The Gathering and its card names, artwork, symbols and set names are trademarks or property of Wizards of the Coast LLC.`;
export const SCRYFALL_URL = "https://scryfall.com";
// Scryfall's terms ask for attribution and for no implied endorsement.
export const DATA_ATTRIBUTION = `Card data and images: Scryfall. Prices: TCGplayer market data and public store listings. For information only; Scryfall does not endorse ${SITE_NAME}.`;
