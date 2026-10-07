import Link from "next/link";
import { FOOTER_GROUPS, type NavGroupLink } from "./nav-groups";
import { FooterSiteMapDetails } from "./HomeFooterToggle";

// A link that leaves the site (currently just Discord) can't go through
// next/link's client-side router the way an internal path can — it needs a
// plain <a target="_blank"> instead. Shared so every layout below (both the
// homepage's collapsed accordion and every other route's full grid) branches
// identically rather than drifting.
function FooterLink({ l, className }: { l: NavGroupLink; className: string }) {
  if (l.external) {
    return (
      <a href={l.href} target="_blank" rel="noopener noreferrer" className={className}>
        {l.label}
      </a>
    );
  }
  return (
    <Link href={l.href} className={className}>
      {l.label}
    </Link>
  );
}

// The footer's site-map nav: 4 columns on desktop, collapsible accordions on
// mobile (same chevron/<details> pattern as the homepage FAQ) — EXCEPT on the
// homepage itself, which uses a single "Full site map" accordion at every
// width instead (see the homepage-only block below). Every link from
// FOOTER_GROUPS renders as a real, server-rendered anchor (Link, or a plain
// <a> for the handful flagged `external`) in BOTH layouts, unconditionally —
// `tests/internal-linking.test.ts` pins exactly this ("FooterNav renders
// FOOTER_GROUPS as real anchors, not JS-only navigation") because these links
// are the only remaining path back to over a dozen sections the homepage-
// redesign brief moved out of the homepage body (see DECISIONS.md's "what
// moved, and where" table) — losing that guarantee would silently re-orphan
// every one of them on the one route that most needs them reachable.
//
// THIS FILE STAYS A PLAIN SERVER COMPONENT ON PURPOSE. Picking "home" vs
// "every other route" needs to know the current pathname, which only a
// client component can read (usePathname()) — but making FooterNav itself
// "use client" would fail that exact pinned test (it checks the file's own
// first line) and, more importantly, would be solving a real problem the
// wrong way: the FIX isn't "know less at build time", it's "keep both real,
// crawlable layouts server-rendered and let a small client-only wrapper
// (HomeFooterToggle) choose which one is VISIBLE" — the same pattern
// HeaderSearchSlot/HomeHeaderReveal already established for the header's own
// homepage-only behaviour. See that component's own doc comment for the full
// reasoning on why "both rendered, one hidden via CSS" beats "only one ever
// mounted" here.
//
// WHY THE HOMEPAGE GETS ITS OWN LAYOUT AT ALL: this rebuild moved roughly a
// dozen sections off the homepage body on the promise that every one of them
// stays reachable — mostly true for free via the site-wide nav/footer system
// this component already was, but the promise is what makes the fully-
// expanded 4-column grid load-bearing on "/" specifically: it's the visible
// proof that nothing was actually deleted. That proof used to cost roughly
// 300-400px of page height on every single load, which was most of the gap
// between the homepage's measured height and the redesign's own ≤2.6-screen
// hard target — a target that exists BECAUSE the brief's whole thesis is
// that a returning visitor doesn't need the entire site map re-presented to
// them every time, they need the search box. Collapsing it to one "Full site
// map" accordion on the homepage keeps the proof (one click away, not
// deleted, not requiring the visitor to already know a page exists) without
// permanently spending the height on visitors who came here to search, not
// to browse a directory. Every other route keeps the original, always-
// expanded desktop grid unchanged.
// ONE copy of the links (2026-09-25). This used to render FOOTER_GROUPS three
// times — a homepage accordion, a mobile accordion set and a desktop grid, two
// hidden by CSS — which put ~177 anchors (~26 KB of HTML, plus the same again in
// the RSC payload) on every page, and every ISR write and origin transfer paid
// for it. Now a single grid sits in one <details>; FooterSiteMapDetails opens it
// on every route except "/", which keeps the homepage's collapsed "Full site map"
// described above. Closed or open, every link is in the server HTML.
export function FooterNav() {
  return (
    <nav aria-label="Site map" className="mb-6 border-b border-ink-800 pb-2 text-left">
      <FooterSiteMapDetails>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {FOOTER_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{group.title}</div>
              <ul className="tap-list space-y-1">
                {group.links.map((l) => (
                  <li key={l.href}>
                    <FooterLink l={l} className="tap-link text-xs text-slate-400 hover:text-brand-400" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </FooterSiteMapDetails>
    </nav>
  );
}
