// PUBLIC PAGES NEVER WAKE NEON (critique DP-03, verified: EbayPicks, EbayCardPanel, ReviewsSection, DecksUsingCard and EbayChase are server components on public pages that call Neon-backed loaders; with 35k crawlable card URLs a query lands
// every few minutes and Neon never suspends: 0.25 CU x 730 h = 182 CU-hours against the Free plan's 100). Owner WP19. A public route's server import closure (the data barrel is a leaf) must not CALL a Neon-backed loader; those panels are loaded
// by the browser from /api routes (cached for 6 hours at the CDN), skipped for crawlers, with a server-rendered plain eBay tile as the fallback. Ratchet: it reports the offenders of OP's source and passes at the baseline.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appRoutes, closure, routeOf } from "./helpers/import-graph";
import { ratchet, summary } from "./helpers/ratchet";

const ROOT = process.env.TEST_ROOT ?? path.resolve(__dirname, "..");
/** Loaders that read Neon. A public page must not call them from a server component. */
export const NEON_LOADERS = ["getEbayPanel", "getEbayPicks", "getChaseStrip", "getChaseBanner", "getDecksUsingCard", "getApprovedReviews", "getLaunchPromo", "getLibraryDecks", "getPublishedDeck", "getTopDemand", "getRisingSnapshot", "getCommanderDecks", "recordCardView", "getCurrentUser"];
/** Public routes that are ALLOWED a bounded Neon read: user-published decks (the list is one cached entry, refreshed at most hourly and purged on publish). */
const ALLOWED: { prefix: RegExp; loaders: string[] }[] = [{ prefix: /^\/decks(\/|$)/, loaders: ["getLibraryDecks", "getPublishedDeck"] }, { prefix: /^\/commanders\/[^/]+$/, loaders: ["getLibraryDecks"] }, { prefix: /^\/sitemaps?(\/|$)|^\/sitemap\.xml/, loaders: ["getLibraryDecks"] }];
/** Member, account, admin, token and API routes: their business is Neon. */
const MEMBER = /^\/(api|admin|account|dashboard|profile|watching|watchlist|portfolio|premium|login|c|unsubscribe|alerts\/(action|manage)|tools\/(best-basket|deal-finder|rising|demand)|rising|support)(\/|$)/;
export function scan(root: string): { route: string; file: string; loader: string; via: string }[] {
  const out: { route: string; file: string; loader: string; via: string }[] = [];
  for (const f of appRoutes(root)) {
    const route = routeOf(root, f); if (MEMBER.test(route) || /\/layout\.tsx?$/.test(f)) continue;
    const allowed = ALLOWED.filter((a) => a.prefix.test(route)).flatMap((a) => a.loaders);
    for (const g of closure(f, root).files) {
      const src = fs.readFileSync(g, "utf8"); if (/^\s*["']use client["']/.test(src)) continue;                                   // a client component loads from /api in the browser: not the server render
      for (const l of NEON_LOADERS) if (!allowed.includes(l) && new RegExp(`(?<![.\\w])${l}\\s*\\(`).test(src.replace(/\/\/.*$/gm, ""))) out.push({ route, file: path.relative(root, g).split(path.sep).join("/"), loader: l, via: path.relative(root, f).split(path.sep).join("/") });
    }
  }
  return out;
}
test("the rule can fail: a server component on a public page that calls a Neon-backed loader is an offender; a client component, a member route and the allowed deck reads are not", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pnn-")); const w = (f: string, s: string) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s); };
  w("src/app/card/[slug]/page.tsx", 'import Panel from "@/components/Panel";\nimport Beacon from "@/components/Beacon";\nexport default function P() { return <><Panel /><Beacon /></>; }');
  w("src/components/Panel.tsx", 'import { getEbayPanel } from "@/lib/data";\nexport default async function Panel() { await getEbayPanel(1); return null; }');
  w("src/components/Beacon.tsx", '"use client";\nimport { getEbayPanel } from "@/lib/data";\nexport default function B() { return null; }');
  w("src/app/dashboard/page.tsx", 'import { getCurrentUser } from "@/lib/data";\nexport default async function P() { await getCurrentUser(); return null; }');
  w("src/app/decks/page.tsx", 'import { getLibraryDecks, getEbayPanel } from "@/lib/data";\nexport default async function P() { await getLibraryDecks(); await getEbayPanel(1); return null; }');
  const found = scan(root).map((x) => `${x.route} ${x.loader} <- ${x.file}`).sort(); fs.rmSync(root, { recursive: true });
  assert.deepEqual(found, ["/card/[slug] getEbayPanel <- src/components/Panel.tsx", "/decks getEbayPanel <- src/app/decks/page.tsx"]);
});
test("RATCHET over src/app: no public server render calls a Neon-backed loader (against OP's source the five panels and the sitemap are the offenders to move to /api)", () => {
  const found = scan(ROOT); const r = ratchet("public-no-neon", [...new Set(found.map((x) => x.file))]);
  if (found.length) console.log(`public-no-neon offenders: ${summary(r)}: ${[...new Set(found.map((x) => `${x.loader}@${x.file}`))].slice(0, 8).join(", ")}`);
  assert.ok(r.ok, r.failures.join("\n"));
});
