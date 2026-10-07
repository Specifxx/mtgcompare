/**
 * The nine icons the collapsed desktop rail shows, one per nav group.
 *
 * WHY THESE EXIST. The rail used to render the group's emoji (💹 🗂️ 💎 …). Emoji
 * are the reason the nav was described as looking "AI generated" — they are a
 * different visual language from everything else on the site, they render as a
 * different typeface (and a different SHAPE) on every OS, they can't take the
 * brand colour, and they can't go semi-transparent when inactive. These are
 * drawn in the same idiom as the chrome already around them: 24px box, no fill,
 * `currentColor` stroke, 2px round caps — identical to SideNav's own collapse
 * chevron and the rest of the components' inline SVG.
 *
 * DRAWN IN-HOUSE, not imported. No icon library is a dependency here and none
 * was added for nine glyphs; nothing here carries a licence or an attribution
 * requirement, which a Flaticon free-tier icon would (a visible credit link on
 * every page the icon appears on — and the rail is on every page).
 *
 * SWAPPING ONE OUT is a single entry in ICONS below. The group data
 * (nav-groups.ts) names an icon by KEY, so it stays a plain data module and
 * nothing about the rail's markup changes when an icon's art does.
 *
 * READABLE AT 20px IS THE WHOLE CONSTRAINT. They render at 20px inside a 44px
 * button, so each one is a distinct SILHOUETTE rather than a detailed picture —
 * no two share an outline, because at that size the outline is all a reader
 * gets. That is also why "The card database" is a magnifier and "Decks" is a
 * pair of cards: both are card-ish concepts, and two card-shaped icons three
 * rows apart would be indistinguishable in the rail.
 */

export type NavIconName =
  | "prices"
  | "browse"
  | "deals"
  | "collection"
  | "decks"
  | "games"
  | "news"
  | "calendar"
  | "help"
  // Added 2026-09-16 (UI polish pass) for decorative-emoji removal OUTSIDE the
  // rail proper — headings, CTAs and chrome that used to lead with a picture
  // emoji (🔔, 🔒, 📈, 🏆, 🛠️, 📋…). Six, not a name-per-emoji: most of the
  // ~500 emoji found across the app are either game CONTENT (kept — see
  // Riftle/Pairs/etc.) or one-off tool-tile decoration that's simply dropped
  // (text-only tiles, same call FooterNav already made for every link it
  // renders). These six cover every REPEATED chrome concept.
  | "bell"
  // Heart — the watchlist / wishlist, everywhere it is represented
  // (2026-09-21, owner: "the wishlist icon should be a heart and not a bell").
  | "heart"
  | "lock"
  | "chart"
  | "trophy"
  | "wrench"
  | "import"
  | "gift"
  // Added for BottomTabBar.tsx (mobile bottom tab bar, P7). "Search" and
  // "Portfolio" reuse "browse" and "collection" above rather than drawing
  // near-duplicate glyphs — same concepts, same icons, everywhere on the site.
  | "home"
  | "menu"
  // Added for the "For stores" nav group (2026-09-21) — the B2B side of the
  // site (/stores, /stores/consulting). A shopfront, NOT another box: the
  // `collection` glyph above is already a lidded box, and at 4rem the rail
  // identifies a group by silhouette alone (tests/nav-icon.test.ts).
  | "store";

// A Record (not a partial index) so adding a NavIconName without drawing it is
// a TYPE ERROR here rather than an invisible blank square in the rail.
const ICONS: Record<NavIconName, React.ReactNode> = {
  // Prices — a price tag.
  prices: (
    <>
      <path d="M3 3h7.4l9.1 9.1a1.9 1.9 0 0 1 0 2.7l-4.7 4.7a1.9 1.9 0 0 1-2.7 0L3 10.4V3Z" />
      <circle cx="7.2" cy="7.2" r="1.3" />
    </>
  ),
  // Browse the database — a magnifier. Deliberately NOT cards: "Decks" below is
  // the card-shaped one, and browsing is the act of looking something up.
  browse: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  // Deals & value — a percent sign, which reads as "discount" instantly at any
  // size. (A gem, matching the old 💎, needs four interior facet lines to read
  // as a gem at all, and they turn to mush at 20px.)
  deals: (
    <>
      <path d="M18.5 5.5 5.5 18.5" />
      <circle cx="7.8" cy="7.8" r="2.3" />
      <circle cx="16.2" cy="16.2" r="2.3" />
    </>
  ),
  // Your collection — a storage box with a lid.
  collection: (
    <>
      <path d="M3 7.5h18V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z" />
      <path d="M3 7.5 4.5 4.2A2 2 0 0 1 6.3 3h11.4a2 2 0 0 1 1.8 1.2L21 7.5" />
      <path d="M10 12h4" />
    </>
  ),
  // Decks — one card in front, a second behind it.
  decks: (
    <>
      <path d="M3 9.5A2 2 0 0 1 5 7.5h7a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5Z" />
      <path d="M7 7.5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-2.5" />
    </>
  ),
  // Games — a controller. Body plus a D-pad only; a second button cluster is
  // one detail too many at this size.
  games: (
    <>
      <path d="M17.2 6.5H6.8A4.8 4.8 0 0 0 2 11.3v2.4a4.3 4.3 0 0 0 7.4 3l.7-.7h3.8l.7.7a4.3 4.3 0 0 0 7.4-3v-2.4a4.8 4.8 0 0 0-4.8-4.8Z" />
      <path d="M6.6 11.8h3.2M8.2 10.2v3.2" />
      <circle cx="16.4" cy="11.8" r="1.15" />
    </>
  ),
  // Guides & News — a page of text.
  news: (
    <>
      <path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5Z" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </>
  ),
  // Miscellaneous — release dates, so: a calendar.
  calendar: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M3 10.5h18M8 3v4M16 3v4" />
    </>
  ),
  // Help — a question mark.
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.55 2.55 0 0 1 4.96.85c0 1.7-2.46 2.25-2.46 3.6" />
      <path d="M12 17.1h.01" />
    </>
  ),
  // Bell — watchlist/alerts/notifications. Replaces 🔔 everywhere it was
  // leading a heading or CTA.
  bell: (
    <>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </>
  ),
  // Heart — the watchlist. One path, so `fill="currentColor"` gives a solid
  // heart and `fill="none"` an outline, which is the filled/empty convention
  // every watchlist control on this site already uses for "is there anything
  // in it".
  heart: (
    <path d="M12 20.5 4.2 12.9a4.8 4.8 0 0 1 0-6.8 4.8 4.8 0 0 1 6.8 0l1 1 1-1a4.8 4.8 0 0 1 6.8 0 4.8 4.8 0 0 1 0 6.8Z" />
  ),
  // Lock — Premium/locked content. Replaces 🔒.
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  // Chart — market/index/P&L concepts. Replaces 📈/📊/💰 in headings.
  chart: (
    <>
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M3 20h18" />
    </>
  ),
  // Trophy — leaderboards/scores. Replaces 🏆.
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5.5H4a1 1 0 0 0-1 1V8a3.5 3.5 0 0 0 3.5 3.5M17 5.5h3a1 1 0 0 1 1 1V8a3.5 3.5 0 0 1-3.5 3.5" />
      <path d="M12 14v3.5M9 20.5h6M9.5 17.5h5" />
    </>
  ),
  // Wrench — errors/tools/maintenance. Replaces 🛠️.
  wrench: (
    <>
      <path d="M14.5 6.5a4 4 0 0 0-5.4 4.9L3 17.5 6.5 21l6.1-6.1a4 4 0 0 0 4.9-5.4l-3 3-2.3-2.3 3-3Z" />
    </>
  ),
  // Import — bringing a list of your own cards in. Replaces 📋.
  import: (
    <>
      <path d="M12 3v11" />
      <path d="M7.5 9.5 12 14l4.5-4.5" />
      <path d="M4 16.5v2A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-2" />
    </>
  ),
  // Gift — pack opening / a reward to claim. Replaces 🎁.
  gift: (
    <>
      <rect x="3.5" y="9.5" width="17" height="4.5" rx="1" />
      <rect x="5" y="14" width="14" height="7" rx="1" />
      <path d="M12 9.5V21" />
      <path d="M12 9.5C9 9.5 7.5 8 7.5 6.3A2.3 2.3 0 0 1 12 6.3v3.2Z" />
      <path d="M12 9.5C15 9.5 16.5 8 16.5 6.3A2.3 2.3 0 0 0 12 6.3v3.2Z" />
    </>
  ),
  // Home — a roof over a base. The bottom bar's first tab.
  home: (
    <>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  // Menu — three lines, the bottom bar's own "everything else" tab (opens the
  // full-screen CinematicNavMenu overlay — the header no longer has its own
  // duplicate hamburger for this, see Navbar.tsx).
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  // For stores — a shopfront. The awning OVERHANGS the building on both sides
  // and the door is arched; both exist to pull the silhouette away from
  // `collection`'s lidded box, which is the nearest shape in the set.
  store: (
    <>
      <path d="M2 9.5h20l-1.8-5.1A2 2 0 0 0 18.3 3H5.7a2 2 0 0 0-1.9 1.4L2 9.5Z" />
      <path d="M4.6 9.5V19a2 2 0 0 0 2 2h10.8a2 2 0 0 0 2-2V9.5" />
      <path d="M9.4 21v-5.1a2.6 2.6 0 0 1 5.2 0V21" />
    </>
  ),
};

/**
 * `title` is intentionally NOT rendered: every call site already labels the
 * control it sits inside (the rail's button carries aria-label + title), so a
 * <title> here would make a screen reader announce the group name twice.
 */
export function NavIcon({
  name,
  className = "",
  // Almost always "none" — these are stroked glyphs. The exception is a control
  // whose STATE is legible only as fill: HeaderWatchButton fills the bell when
  // the watchlist has something in it, which is the same convention
  // PriceWatchButton uses on every card tile.
  fill = "none",
}: {
  name: NavIconName;
  className?: string;
  fill?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {ICONS[name]}
    </svg>
  );
}
