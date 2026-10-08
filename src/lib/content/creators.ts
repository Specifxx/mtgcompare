// Content-creator partnerships: a hand-curated list, no database table and no
// admin form (partnerships are signed one at a time, by a person, over e-mail).
//
// DELIBERATELY NOT CALLED "partners" IN ANY URL, LABEL OR FILE PATH. That word
// already means the eBay and TCGplayer affiliate relationship the site
// discloses elsewhere; a creator partnership is a promotional one, and reusing
// the word would blur a distinction the site is careful about. "Creator(s)"
// throughout instead.
//
// HOW TO ADD ONE: append an entry once a partnership is actually confirmed.
// This list is what /creators renders directly, so anything here is live and
// public immediately. Only creators who agreed to be listed, and only content
// about Magic: The Gathering.
export interface CreatorPartner {
  name: string;
  /** What they are known for, one line, shown under their name. */
  blurb: string;
  platform: "YouTube" | "Twitch" | "TikTok" | "Twitter/X" | "Instagram" | "Discord";
  /** As displayed, e.g. "@handle"; platform convention varies, so no leading @ is assumed. */
  handle: string;
  url: string;
  /** ISO date the partnership went live; newest-first display, not editorial. */
  since: string;
}

// Empty at launch: nothing is listed until a creator has said yes.
export const CREATOR_PARTNERS: CreatorPartner[] = [];
