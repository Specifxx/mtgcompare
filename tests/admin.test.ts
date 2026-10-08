// The admin area (ported from RiftCompare): who is an admin, the one gate every
// /admin page and /api/admin route goes through, and the indexing rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { adminEmails, isAdminEmail } from "../src/lib/admin-emails";
import { bearerTokenOk, sameOrigin } from "../src/lib/admin-guard";
import { accountWhere, bucketSignups } from "../src/lib/admin-accounts";
import { grantedUntil, MAX_GRANT_DAYS, parseAdminEmail, parseGrantDays } from "../src/lib/admin-billing";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ── Phase 0: identity ───────────────────────────────────────────────────────
test("the owner is an admin by default", () => {
  withEnv({ ADMIN_EMAILS: undefined }, () => {
    assert.deepEqual(adminEmails(), ["mastermisclick@gmail.com"]);
    assert.equal(isAdminEmail("mastermisclick@gmail.com"), true);
    assert.equal(isAdminEmail("MasterMisclick@gmail.com "), true);
    assert.equal(isAdminEmail("someone@example.com"), false);
    assert.equal(isAdminEmail(null), false);
    assert.equal(isAdminEmail(undefined), false);
    assert.equal(isAdminEmail(""), false);
  });
});

test("ADMIN_EMAILS replaces the default, and an empty value removes every address", () => {
  withEnv({ ADMIN_EMAILS: "a@x.com, B@y.com" }, () => {
    assert.equal(isAdminEmail("b@y.com"), true);
    assert.equal(isAdminEmail("a@x.com"), true);
    assert.equal(isAdminEmail("mastermisclick@gmail.com"), false, "the env var replaces the default, it does not add to it");
  });
  withEnv({ ADMIN_EMAILS: "" }, () => {
    assert.equal(isAdminEmail("mastermisclick@gmail.com"), false);
    assert.deepEqual(adminEmails(), []);
  });
});

test("admin status is computed in one place: getCurrentUser", () => {
  const auth = read("src/lib/auth.ts");
  assert.match(auth, /isAdmin:\s*u\.isAdmin\s*\|\|\s*isAdminEmail\(u\.email\)/);
});

// ── Phase 1: the gate ───────────────────────────────────────────────────────
const SECRET = "x".repeat(40);

test("bearerTokenOk: header only, Bearer scheme, ≥ 32-character secret", () => {
  assert.equal(bearerTokenOk(`Bearer ${SECRET}`, undefined), false, "unset secret closes the token path");
  assert.equal(bearerTokenOk("Bearer short", "short"), false, "a short secret closes the token path");
  assert.equal(bearerTokenOk(`Bearer ${"y".repeat(40)}`, SECRET), false, "wrong token");
  assert.equal(bearerTokenOk(`Bearer ${SECRET}`, SECRET), true);
  assert.equal(bearerTokenOk(`bearer ${SECRET}`, SECRET), false, "the scheme is case-sensitive (pinned)");
  assert.equal(bearerTokenOk(SECRET, SECRET), false, "the bare secret without Bearer");
  assert.equal(bearerTokenOk(null, SECRET), false);
  assert.equal(bearerTokenOk("Bearer ", SECRET), false);
});

test("the token comparison is constant-time over digests", () => {
  const src = read("src/lib/admin-guard.ts");
  assert.match(src, /timingSafeEqual\(sha256\(given\), sha256\(secret\)\)/);
  assert.match(src, /MIN_ADMIN_TOKEN_LENGTH = 32/);
});

test("sameOrigin: our origin or Sec-Fetch-Site same-origin; nothing else", () => {
  const req = (h: Record<string, string>) => new Request("https://mtgcompare.app/api/admin/x", { method: "POST", headers: h });
  assert.equal(sameOrigin(req({ origin: "https://mtgcompare.app" })), true);
  assert.equal(sameOrigin(req({ origin: "https://evil.example" })), false);
  assert.equal(sameOrigin(req({})), false, "no Origin and no Sec-Fetch-Site");
  assert.equal(sameOrigin(req({ "sec-fetch-site": "same-origin" })), true);
  assert.equal(sameOrigin(req({ "sec-fetch-site": "cross-site", origin: "https://evil.example" })), false);
  const dev = { NODE_ENV: "development" };
  const prod = { NODE_ENV: "production" };
  assert.equal(sameOrigin(req({ origin: "https://preview.vercel.app", host: "preview.vercel.app" }), dev), true, "outside production, the request's own host");
  assert.equal(sameOrigin(req({ origin: "https://evil.example", host: "mtgcompare.app" }), dev), false);
  // Production trusts only SITE_URL (+ the explicit allowlist), never the client's Host header.
  assert.equal(sameOrigin(req({ origin: "https://evil.example", host: "evil.example" }), prod), false, "a forged Host is not an origin");
  assert.equal(sameOrigin(req({ origin: "http://localhost:3106", host: "localhost:3106" }), prod), false);
  assert.equal(sameOrigin(req({ origin: "https://mtgcompare.app", host: "evil.example" }), prod), true);
  assert.equal(sameOrigin(req({ origin: "https://preview.example", host: "preview.example" }), { ...prod, ADMIN_EXTRA_ORIGINS: "https://a.example, https://preview.example" }), true);
});

const ADMIN_PAGES = walk(path.join(ROOT, "src/app/admin")).filter((f) => f.endsWith("page.tsx"));
const ADMIN_ROUTES = walk(path.join(ROOT, "src/app/api/admin")).filter((f) => f.endsWith("route.ts"));

test("every admin page is gated, dynamic and noindex", () => {
  assert.ok(ADMIN_PAGES.length >= 5, "the admin pages exist");
  for (const f of ADMIN_PAGES) {
    const src = fs.readFileSync(f, "utf8");
    const rel = path.relative(ROOT, f);
    assert.match(src, /await requireAdminPage\(\)/, `${rel} must call requireAdminPage()`);
    assert.match(src, /dynamic = "force-dynamic"/, `${rel} must be force-dynamic`);
    assert.match(src, /generateMetadata = \(\): Promise<Metadata> => adminMetadata\(/, `${rel} takes its (noindex) metadata from adminMetadata()`);
    assert.doesNotMatch(src, /export const metadata/, `${rel}: static metadata would name the area in a non-admin's 404`);
  }
  const layout = read("src/app/admin/layout.tsx");
  assert.match(layout, /if \(!\(await isAdminViewer\(\)\)\) return <>\{children\}<\/>/, "the layout hides the admin bar from non-admins");
  assert.doesNotMatch(layout.replace(/^\s*\/\/.*$/gm, ""), /requireAdminPage|notFound\(/, "a notFound() thrown in the layout sends an empty error shell instead of the site's 404");
  assert.match(layout, /adminMetadata\(/);
  const lib = read("src/lib/admin.ts");
  assert.match(lib, /if \(!\(await isAdminViewer\(\)\)\) return \{\};/, "non-admins get no admin metadata at all");
  assert.match(lib, /robots: \{ index: false, follow: false \}/);
});

test("every admin API route is gated; every POST is a mutation", () => {
  assert.ok(ADMIN_ROUTES.length >= 7, "the admin routes exist");
  for (const f of ADMIN_ROUTES) {
    const src = fs.readFileSync(f, "utf8");
    const rel = path.relative(ROOT, f);
    assert.match(src, /requireAdminApi\(/, `${rel} must call requireAdminApi`);
    const posts = src.split(/export async function /).filter((s) => s.startsWith("POST"));
    for (const p of posts) assert.match(p, /requireAdminApi\(req, \{ mutation: true \}\)/, `${rel}: POST must pass mutation: true`);
    assert.doesNotMatch(src, /export (async )?function (GET|PUT|PATCH|DELETE)\b[\s\S]*?mutation: false[\s\S]*?(update|delete|create)\(/, `${rel}: no state change outside POST`);
  }
});

test("no admin file reads a token from the environment, a query string or a body", () => {
  for (const f of [...walk(path.join(ROOT, "src/app/admin")), ...walk(path.join(ROOT, "src/app/api/admin")), ...walk(path.join(ROOT, "src/components/admin"))]) {
    const src = fs.readFileSync(f, "utf8");
    const rel = path.relative(ROOT, f);
    assert.doesNotMatch(src, /process\.env\.ADMIN_TOKEN/, rel);
    assert.doesNotMatch(src, /searchParams\.key|searchParams\.get\("key"\)/, rel);
    assert.doesNotMatch(src, /body\.key|body\?\.key/, rel);
    assert.doesNotMatch(src, /unstable_cache/, rel);
  }
});

test("indexing: robots disallows /admin, the sitemap never lists it, headers say noindex", () => {
  assert.match(read("src/app/robots.ts"), /"\/admin"/);
  // Sitemaps are route handlers over src/lib/sitemap-sections.ts since WP15 deleted src/app/sitemap.ts.
  for (const f of ["src/app/sitemap.xml/route.ts", "src/app/sitemaps/[section]/route.ts", "src/lib/sitemap-sections.ts"]) assert.doesNotMatch(read(f), /"\/admin/, f);
  const cfg = read("next.config.js");
  assert.match(cfg, /source: "\/admin\/:path\*"[\s\S]*?X-Robots-Tag/);
  assert.match(cfg, /source: "\/admin"[\s\S]*?X-Robots-Tag/);
});

test("analytics never records an /admin page view", () => {
  const ga = read("src/components/GoogleAnalytics.tsx");
  // Page views come only from GAPageViewTracker (config has send_page_view:false),
  // which skips /admin; a hard load of /admin also sets the ga-disable flag.
  assert.match(ga, /location\.pathname\.indexOf\('\/admin'\)===0\)\{window\['ga-disable-/);
  assert.match(ga, /send_page_view:false/);
  assert.match(read("src/components/GAPageViewTracker.tsx"), /pathname === "\/admin" \|\| pathname\.startsWith\("\/admin\/"\)\) return;/);
  assert.match(read("src/components/admin/AdminNoAnalytics.tsx"), /ga-disable-/);
  assert.match(read("src/app/admin/layout.tsx"), /<AdminNoAnalytics \/>/);
});

test("the account menu learns only the caller's own admin flag, from /api/me", () => {
  assert.match(read("src/app/api/me/route.ts"), /admin: user\?\.isAdmin === true/);
  assert.match(read("src/components/UserMenu.tsx"), /me\.admin \?[\s\S]*?href="\/admin"/);
  assert.doesNotMatch(read("src/app/layout.tsx"), /getCurrentUser|cookies\(\)/, "the root layout never reads the session");
});

// ── Phase 3: accounts and billing ───────────────────────────────────────────
test("account filters mirror tierOf", () => {
  const now = new Date("2026-10-03T00:00:00Z");
  assert.deepEqual(accountWhere("all", undefined, now), {});
  assert.deepEqual(accountWhere("paid", "", now), { AND: [{ premiumUntil: { gt: now } }] });
  assert.deepEqual(accountWhere("plus", undefined, now), { AND: [{ premiumUntil: { gt: now }, premiumTier: "plus" }] });
  assert.deepEqual(accountWhere("premium", undefined, now), { AND: [{ premiumUntil: { gt: now }, premiumTier: { not: "plus" } }] });
  assert.deepEqual(accountWhere("verified", undefined, now), { AND: [{ emailVerified: { not: null } }] });
  const recent = accountWhere("recent", undefined, now) as { AND: { lastLoginAt: { gte: Date } }[] };
  assert.equal(recent.AND[0]!.lastLoginAt.gte.toISOString(), "2026-09-26T00:00:00.000Z");
  const q = accountWhere("all", `  ${"z".repeat(150)}  `, now) as { AND: { OR: { email: { contains: string } }[] }[] };
  assert.equal(q.AND[0]!.OR[0]!.email.contains.length, 100, "search is trimmed and capped at 100 characters");
});

test("sign-ups are bucketed into 30 zero-filled UTC days", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  const b = bucketSignups([new Date("2026-10-03T01:00:00Z"), new Date("2026-10-03T23:00:00Z"), new Date("2026-09-04T00:00:00Z"), new Date("2026-09-01T00:00:00Z")], now);
  assert.equal(b.length, 30);
  assert.equal(b[29]!.day, "2026-10-03");
  assert.equal(b[29]!.n, 2);
  assert.equal(b[0]!.day, "2026-09-04");
  assert.equal(b[0]!.n, 1);
  assert.equal(b.reduce((a, d) => a + d.n, 0), 3, "older sign-ups fall outside the strip");
});

test("grants stack on max(now, current); input is validated, never clamped", () => {
  const now = new Date("2026-10-03T00:00:00Z");
  const DAY = 86_400_000;
  assert.equal(grantedUntil(null, 30, now).getTime(), now.getTime() + 30 * DAY);
  assert.equal(grantedUntil(new Date(now.getTime() - 5 * DAY), 30, now).getTime(), now.getTime() + 30 * DAY, "a lapsed date starts from now");
  const future = new Date(now.getTime() + 10 * DAY);
  assert.equal(grantedUntil(future, 30, now).getTime(), future.getTime() + 30 * DAY, "an active date is extended");
  assert.equal(MAX_GRANT_DAYS, 1830);
  assert.equal(parseGrantDays(1), 1);
  assert.equal(parseGrantDays(1830), 1830);
  for (const bad of [0, 1831, 1.5, "30", null, -1]) assert.equal(parseGrantDays(bad), null, String(bad));
  assert.equal(parseAdminEmail("  Owner@Example.com "), "owner@example.com");
  assert.equal(parseAdminEmail("nope"), null);
  assert.equal(parseAdminEmail(`${"a".repeat(200)}@x.com`), null);
});

test("revoke writes only the date; grant only stamps a tier on a lapsed or free account", () => {
  const src = read("src/lib/admin-billing.ts");
  assert.match(src, /data: \{ premiumUntil: null \}/);
  assert.match(src, /\.\.\.\(active \? \{\} : \{ premiumTier: tier \}\)/);
  assert.doesNotMatch(src, /stripe\(\)|from "\.\/stripe"/, "grant and revoke never call Stripe");
  assert.match(read("src/lib/premium.ts"), /admin grant\/revoke routes/, "the entitlement-writer rule names the admin routes");
});

test("the admin Stripe sync reuses the daily reconcile unchanged", () => {
  const src = read("src/app/api/admin/stripe-reconcile/route.ts");
  assert.match(src, /runStripeReconcile\(\)/);
  assert.match(src, /stripeEnabled\(\)/);
});
