// Featured creators (/creators; owner, 2026-10-31), the engine side of MTG
// Compare's /creators (mtgcompare src/lib/creators.ts). Each site's list is
// hand-curated in src/content/creators.ts: no database, no form, no account.
// A site with an empty list has no /creators page and no links to one.
// Use the creator's own spelling and handles, and only links they show
// publicly. Never called "partners": that word means the affiliate links.
import { CREATORS } from "@/content/creators";

export type CreatorPlatform = "Instagram" | "YouTube" | "Threads" | "TikTok" | "Facebook" | "X" | "Twitch" | "Website";

export interface CreatorLink {
  platform: CreatorPlatform;
  url: string;
  /** As displayed, e.g. "@handle". */
  handle?: string;
  /** The link's own words when it is not their profile (a single video, say). */
  label?: string;
}

export interface Creator {
  /** Stable id, lowercase with hyphens: the card's anchor (/creators#slug). */
  slug: string;
  name: string;
  /** What they make, one line. */
  blurb: string;
  /** A few sentences for their spotlight. */
  about: string;
  /** Their channels, most important first. The first is the main button. */
  links: CreatorLink[];
  /** Short content tags. At most four show. */
  tags: string[];
  /** Where they're based, as they say it. */
  based?: string;
  /** A square photo in public/img/creators/, already cut to a circle. Initials without one. */
  avatar?: string;
  /** One headline number they show publicly, with the month it was read. */
  reach?: string;
  /** ISO date the listing went live. The newest is the spotlight. */
  since: string;
}

/** Newest first. Pure. */
export function featuredCreators(list: Creator[] = CREATORS): Creator[] {
  return [...list].sort((a, b) => b.since.localeCompare(a.since) || a.name.localeCompare(b.name));
}

/** Whether this site shows /creators at all (a non-empty list). */
export const creatorsOn = (list: Creator[] = CREATORS) => list.length > 0;

/** "Kevin Lepage" → "KL". Pure. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
