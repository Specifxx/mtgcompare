// Magic creators featured on /creators (owner, 2026-10-30: "a section on MTG Compare, just like on RiftCompare"), modelled on
// RiftCompare's lib/content/creators.ts. A hand-curated list a commit edits: no database, no form, no account. A creator mentions or
// links MTG Compare in their content; in return they get a card here and a face in the homepage strip. Use the creator's own
// spelling and handles, and only links they show publicly. Not called "partners" anywhere: that word means the affiliate links.

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
  /** Their channels, most important first. The first is the card's main button. */
  links: CreatorLink[];
  /** Short content tags. At most four show. */
  tags: string[];
  /** Where they're based, as they say it. */
  based?: string;
  /** A square photo in public/img/creators/ (not public/creators/: next.config.js redirects /creators/* to the hub), already cropped to a circle. Initials without one. */
  avatar?: string;
  /** One headline number they show publicly, with the month it was read ("15.9K Instagram followers, Oct 2026"). */
  reach?: string;
  /** ISO date the listing went live. The newest is the spotlight. */
  since: string;
}

export const CREATORS: Creator[] = [
  {
    slug: "kevin-lepage",
    name: "Kevin Lepage",
    blurb: "Illustrator who paints custom altered Magic cards, plus custom game cards and comics.",
    about:
      "Kevin paints over real Magic cards by hand, turning classics such as Lightning Bolt and Black Lotus into one-off pieces of art. He works between Paris and Abidjan and shares his new alters on Instagram.",
    links: [
      { platform: "Instagram", url: "https://www.instagram.com/kevin_altered_mtg/", handle: "@kevin_altered_mtg" },
      { platform: "YouTube", url: "https://www.youtube.com/watch?v=cCU7n896iTQ&t=220s", label: "Watch his video" },
      { platform: "Threads", url: "https://www.threads.net/@kevin_altered_mtg", handle: "@kevin_altered_mtg" },
    ],
    tags: ["Altered cards", "Illustration", "Custom game cards", "Comics"],
    based: "Paris, France · Abidjan, Côte d’Ivoire",
    avatar: "/img/creators/kevin-lepage.webp",
    reach: "15.9K Instagram followers (Oct 2026)",
    since: "2026-10-30",
  },
];

/** Newest first. Pure. */
export function featuredCreators(list: Creator[] = CREATORS): Creator[] {
  return [...list].sort((a, b) => b.since.localeCompare(a.since) || a.name.localeCompare(b.name));
}

/** "Kevin Lepage" → "KL". Pure. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
