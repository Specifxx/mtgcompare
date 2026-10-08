import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTEXT_LINES, SET_TRACKER_LINE, contextLineFor } from "../src/lib/login-context";
import { FREE_PORTFOLIO_LIMIT } from "../src/lib/free-limits";
import vm from "node:vm";
import { CONSENT_REGIONS, CONSENT_WAIT_NO_CMP_MS, CONSENT_WAIT_WITH_CMP_MS, consentDefaultsScript } from "../src/lib/ga";
import { CMP_GRACE_MS } from "../src/lib/use-consent";

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

test("the footer carries the share band, the sister sites, the affiliate line, Wizards' Fan Content sentence, the data attribution and the unofficial-fan-site notice", () => {
  const src = read("src/components/Footer.tsx");
  assert.match(src, /Find \{SITE_NAME\} useful\? Send it to someone who plays Magic\./);
  assert.match(src, /<ShareRow source="footer" size="sm"/);
  assert.match(src, /SISTER_SITES\.map/);
  assert.match(src, /eBay Partner Network affiliate and a TCGplayer affiliate/);
  // The legal wording is imported from site.ts, never retyped: the Fan Content Policy asks for its sentence verbatim and About and Terms carry the same strings.
  for (const name of ["FAN_CONTENT_DISCLAIMER", "FAN_CONTENT_POLICY_URL", "UNOFFICIAL_FAN_SITE_NOTICE", "DATA_ATTRIBUTION", "SCRYFALL_URL", "SISTER_SITES"]) assert.match(src, new RegExp(`\\b${name}\\b`), name);
  assert.doesNotMatch(codeOnly(src), /Wizards of the Coast|Hasbro|Scryfall does not endorse|Portions of the materials|is unofficial Fan Content/, "no legal sentence is typed in the footer");
  assert.match(src, /linkFirst\(FAN_CONTENT_DISCLAIMER, "Fan Content Policy", FAN_CONTENT_POLICY_URL\)/, "'Fan Content Policy' links to the policy");
  assert.match(src, /linkFirst\(DATA_ATTRIBUTION, "Scryfall", SCRYFALL_URL\)/);
  assert.match(src, /<PrivacySettingsLink \/>/, "the privacy-settings control sits in the always-visible row");
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
  assert.match(layout, /<NextTopLoader color="#c394f4" height=\{2\} showSpinner=\{false\} shadow=\{false\} zIndex=\{200\} \/>/);
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
  assert.equal(contextLineFor("/portfolio/sets/mh3-modern-horizons-3"), SET_TRACKER_LINE);
  assert.match(SET_TRACKER_LINE, new RegExp(`first ${FREE_PORTFOLIO_LIMIT} cards`));
  assert.match(contextLineFor("/premium?go=plus-month") ?? "", /plan is tied to your account/);
  assert.equal(contextLineFor("/sets/mh3-modern-horizons-3"), undefined);
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

test("Consent Mode v2 defaults (P32): set once, before any tag, region-scoped, and held long enough for a consent platform only when one can exist", () => {
  // The defaults run as a plain script in <head>; execute them and read what the dataLayer received.
  const run = (adsense: boolean): unknown[][] => {
    const w: { dataLayer?: unknown[]; gtag?: unknown } = {};
    vm.runInNewContext(consentDefaultsScript(adsense), { window: w, get dataLayer() { return w.dataLayer; }, set dataLayer(v) { w.dataLayer = v as unknown[]; } });
    return (w.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>));
  };
  for (const adsense of [false, true]) {
    const calls = run(adsense);
    const defaults = calls.filter((c) => c[0] === "consent" && c[1] === "default").map((c) => c[2] as Record<string, unknown>);
    assert.equal(defaults.length, 2, "one regional default and one for everywhere else");
    const regional = defaults[0]!, rest = defaults[1]!;
    for (const d of defaults) { assert.equal(d.ad_storage, "denied"); assert.equal(d.ad_user_data, "denied"); assert.equal(d.ad_personalization, "denied"); }
    assert.equal(regional.analytics_storage, "denied"); assert.deepEqual(Array.from(regional.region as string[]), CONSENT_REGIONS); assert.ok((regional.region as string[]).includes("DE") && (regional.region as string[]).includes("GB") && (regional.region as string[]).includes("CH"));
    assert.equal(rest.analytics_storage, "granted"); assert.equal(rest.region, undefined);
    assert.ok(calls.some((c) => c[0] === "set" && c[1] === "ads_data_redaction" && c[2] === true));
  }
  assert.equal(CONSENT_WAIT_WITH_CMP_MS >= CMP_GRACE_MS, true, "Google's tags wait at least as long as useConsent() waits before it decides no platform is present");
  assert.ok(consentDefaultsScript(true).includes(`wait_for_update:${CONSENT_WAIT_WITH_CMP_MS}`) && consentDefaultsScript(false).includes(`wait_for_update:${CONSENT_WAIT_NO_CMP_MS}`));
  // the one place: GoogleAnalytics no longer repeats the defaults, and the layout renders them before GA4
  const ga = codeOnly(read("src/components/GoogleAnalytics.tsx"));
  assert.doesNotMatch(ga, /'consent','default'/);
  const layout = codeOnly(read("src/app/layout.tsx"));
  assert.ok(layout.indexOf("<ConsentDefaults />") > layout.indexOf("<head>") && layout.indexOf("<ConsentDefaults />") < layout.indexOf("<GoogleAnalytics />"), "ConsentDefaults first in <head>, GA after it");
  const cd = codeOnly(read("src/components/ConsentDefaults.tsx"));
  assert.match(cd, /if \(!GA_ENABLED && !ADSENSE_CONFIGURED\) return null;/, "no tag to consent for, no script");
});

test("the privacy-settings control exists in every region: a re-open button where Google's message applies, else a link to the policy's advertising section", () => {
  const src = read("src/components/PrivacySettingsLink.tsx");
  assert.match(src, /showRevocationMessage/);
  assert.match(src, /<Link href="\/privacy#advertising"/);
  assert.match(src, /GIVE_UP_MS/, "the poll for googlefc ends");
  assert.doesNotMatch(codeOnly(src), /·/, "no middle-dot separator in the link row");
});
