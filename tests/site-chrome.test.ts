import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTEXT_LINES, SET_TRACKER_LINE, contextLineFor } from "../src/lib/login-context";
import { FREE_PORTFOLIO_LIMIT } from "../src/lib/free-limits";

// ─────────────────────────────────────────────────────────────────────────────
// The site chrome ported from RiftCompare (wave 2, design track): the footer's
// always-visible row and site map (RiftCompare's tests/site-chrome.test.ts,
// footer half), the static root layout, and /login's context lines.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("the footer's always-visible row links every page the brief names, in order, outside the site map", () => {
  const src = codeOnly(read("src/components/Footer.tsx"));
  const footer = src.slice(src.indexOf("<footer"), src.indexOf("</footer>"));
  assert.ok(footer.length > 0, "expected the <footer>");
  // The row sits AFTER <FooterNav />: the site map is a <details> closed on "/"
  // and on phones, so a link that lives only inside it is invisible there.
  const row = footer.slice(footer.indexOf("<FooterNav />"));
  const links = [...row.matchAll(/<Link href="([^"]+)" className="tap-link text-slate-300 hover:text-brand-400">([^<]+)<\/Link>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(links, [
    ["/", "Home"],
    ["/blog", "Blog"],
    ["/guides", "Guides"],
    ["/tools", "Tools"],
    ["/about", "About us"],
    ["/editorial-policy", "Editorial policy"],
    ["/methodology", "Methodology"],
    ["/authors", "Who writes this"],
    ["/contact", "Contact &amp; feedback"],
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms of service"],
  ]);
  assert.doesNotMatch(row.slice(0, row.indexOf("DISCORD_URL")), /·/, "no middle-dot separators in the link row");
});

test("the site map's <details> behaviour is untouched: closed on the homepage, one copy", () => {
  const toggle = codeOnly(read("src/components/HomeFooterToggle.tsx"));
  assert.match(toggle, /open=\{!isHome\}/, "the homepage keeps its site map one click away");
  assert.equal(codeOnly(read("src/components/Footer.tsx")).match(/<FooterNav \/>/g)?.length, 1, "FOOTER_GROUPS renders once");
  assert.equal(codeOnly(read("src/app/layout.tsx")).match(/<Footer\b/g)?.length, 1, "one footer");
});

test("the footer carries the share band, the sister site, the affiliate line and the trademark notice", () => {
  const src = read("src/components/Footer.tsx");
  assert.match(src, /Find OP Compare useful\? Send it to someone who plays One Piece\./);
  assert.match(src, /<ShareRow source="footer" size="sm"/);
  assert.match(src, /SISTER_SITE\.url/);
  assert.match(src, /eBay Partner Network affiliate and a TCGplayer affiliate/);
  assert.match(src, /Bandai, Eiichiro Oda, Shueisha or Toei Animation/);
  // No email capture in the footer while nothing sends: the newsletter is a
  // slot the collection-alerts track fills only when getEmailStatus() is "on".
  assert.doesNotMatch(src, /type="email"/);
});

test("the share row reports to GA only, never Vercel custom events", () => {
  const src = codeOnly(read("src/components/ShareRow.tsx"));
  assert.match(src, /trackEvent\("share_click"/);
  assert.doesNotMatch(src, /@vercel\/analytics/);
});

test("the root layout reads no cookie, header or session, and mounts RiftCompare's providers in order", () => {
  const layout = codeOnly(read("src/app/layout.tsx"));
  assert.doesNotMatch(layout, /getCountry|cookies\(\)|headers\(\)|getCurrentUser/);
  assert.match(layout, /<CountryProvider initial=\{DEFAULT_COUNTRY\}>/);
  const order = ["<PlanProvider", "<CountryProvider", "<QuickViewProvider", "<CommandLauncherProvider", "<MegaMenuProvider", "<Navbar />", "<SideNav />"];
  let at = -1;
  for (const tag of order) {
    const i = layout.indexOf(tag);
    assert.ok(i > at, `${tag} must come after the one before it`);
    at = i;
  }
  assert.match(layout, /<NextTopLoader color="#ff6b6b" height=\{2\} showSpinner=\{false\} shadow=\{false\} zIndex=\{200\} \/>/);
  assert.match(layout, /<ConsentGatedAnalytics \/>/, "Vercel Analytics is consent-gated");
  assert.doesNotMatch(layout, /<Analytics \/>/, "never the ungated tag");
});

test("GA4 sends page views from the tracker only, and never on /admin", () => {
  const ga = read("src/components/GoogleAnalytics.tsx");
  assert.match(ga, /send_page_view:false/);
  const tracker = codeOnly(read("src/components/GAPageViewTracker.tsx"));
  assert.match(tracker, /pathname === "\/admin" \|\| pathname\.startsWith\("\/admin\/"\)/);
  assert.match(tracker, /"page_view"/);
});

test("the market resolves on the client: cookie, then its localStorage mirror, then /api/geo", () => {
  const provider = codeOnly(read("src/components/CountryProvider.tsx"));
  assert.match(provider, /readCookie\(COUNTRY_COOKIE\)/);
  assert.match(provider, /readLocalStorage\(COUNTRY_COOKIE\)/);
  assert.match(provider, /fetch\("\/api\/geo"\)/);
  const geo = codeOnly(read("src/app/api/geo/route.ts"));
  assert.match(geo, /x-vercel-ip-country/);
  assert.match(geo, /private, max-age=3600/);
});

test("/login says what signing in opens for each gated page, and nothing for the rest", () => {
  assert.equal(contextLineFor("/watching"), CONTEXT_LINES["/watching"]);
  assert.equal(contextLineFor("/tools/deal-finder?market=AU"), CONTEXT_LINES["/tools/deal-finder"], "the query string is ignored");
  assert.equal(contextLineFor("/portfolio/sets/op-01"), SET_TRACKER_LINE);
  assert.match(SET_TRACKER_LINE, new RegExp(`first ${FREE_PORTFOLIO_LIMIT} cards`));
  assert.match(contextLineFor("/premium?go=plus-month") ?? "", /plan is tied to your account/);
  assert.equal(contextLineFor("/sets/op-01"), undefined);
  assert.equal(contextLineFor("/blog"), undefined);
  for (const line of Object.values(CONTEXT_LINES)) assert.doesNotMatch(line, /email/i, "no line promises an email");
});

test("the account menu: dashboard first, Pricing for non-members, Admin for admins, sign-out clears both stores", () => {
  const menu = codeOnly(read("src/components/UserMenu.tsx"));
  const order = ['href="/dashboard"', "Pricing", 'href="/profile"', 'href="/portfolio"', 'href="/watching"', 'href="/feedback"', 'href="/admin"'];
  let at = -1;
  for (const t of order) {
    const i = menu.indexOf(t);
    assert.ok(i > at, `${t} out of order`);
    at = i;
  }
  assert.match(menu, /\{!premium && \(\s*<PremiumNavLink/);
  assert.match(menu, /me\.admin \?/);
  assert.match(menu, /invalidateMe\(\);\s*invalidateWatchlist\(\);/);
  assert.match(menu, /Sign up<span className="hidden min-\[420px\]:inline">&nbsp;free<\/span>/);
});

test("the root layout carries one Organization + WebSite node, and the WebSite searches /browse", () => {
  const src = read("src/app/layout.tsx");
  assert.equal((src.match(/"@type": "Organization"/g) ?? []).length, 1);
  assert.match(src, /"@type": "WebSite"/);
  assert.match(src, /urlTemplate: `\$\{SITE_URL\}\/browse\?q=\{search_term_string\}`/);
  // No Discord sameAs unless the owner has configured a Discord URL.
  assert.match(src, /DISCORD_URL \? \{ sameAs: \[DISCORD_URL\] \} : \{\}/);
});
