// /watching is the watchlist (RiftCompare's path); /watchlist and /account are
// non-permanent redirects; personal pages are noindex, never robots-disallowed;
// the header heart is a button opening the drawer; email-only copy is gated.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("no next.config.js redirect shadows /watching, /dashboard or /profile for a signed-in visitor", () => {
  const cfg = read("next.config.js");
  for (const p of ["/watching", "/dashboard", "/profile"]) {
    const lines = cfg.split("\n").filter((l) => l.includes(`source: "${p}"`));
    // The one allowed rule is the signed-out 307 to /login, which only matches
    // when there is NO session cookie (so the page still renders for a member).
    for (const l of lines) {
      assert.match(l, /missing: \[\{ type: "cookie", key: "mc_session" \}\]/, p);
      assert.match(l, /permanent: false/, p);
      assert.ok(l.includes(`destination: "/login?next=${p}"`), p);
    }
  }
});

test("signed-out visits to the streamed member pages are a real 307, decided before the loading shell", () => {
  const cfg = read("next.config.js");
  for (const p of ["/watching", "/portfolio", "/portfolio/sets", "/portfolio/sets/:set"]) {
    const l = cfg.split("\n").find((x) => x.includes(`source: "${p}"`));
    assert.ok(l, p);
    assert.match(l!, /missing: \[\{ type: "cookie", key: "mc_session" \}\]/);
    assert.ok(l!.includes(`destination: "/login?next=${p}"`));
  }
  // An expired or invalid cookie is not "missing": the segment's LAYOUT (outside
  // loading.tsx's Suspense boundary) makes that redirect a real 307 too.
  for (const dir of ["watching", "portfolio"]) {
    assert.ok(existsSync(join(process.cwd(), `src/app/${dir}/loading.tsx`)));
    const layout = code(`src/app/${dir}/layout.tsx`);
    assert.match(layout, /getCurrentUser\(\)/, dir);
    assert.match(layout, new RegExp(`redirect\\("/login\\?next=/${dir}"\\)`), dir);
  }
});

test("/watchlist and /account redirect with a 307 (never a cached 308) to /watching and /profile", () => {
  const wl = code("src/app/watchlist/page.tsx");
  assert.match(wl, /redirect\("\/watching"\)/);
  assert.doesNotMatch(wl, /permanentRedirect/);
  const acc = code("src/app/account/page.tsx");
  assert.match(acc, /redirect\("\/profile"\)/);
  assert.doesNotMatch(acc, /permanentRedirect/);
});

test("personal pages are noindex and sign-in only; robots.txt no longer disallows them", () => {
  for (const p of ["src/app/watching/page.tsx", "src/app/dashboard/page.tsx", "src/app/profile/page.tsx"]) {
    const src = code(p);
    assert.match(src, /robots: \{ index: false/, p);
    assert.match(src, /redirect\("\/login\?next=\//, p);
    assert.match(src, /force-dynamic/, p);
  }
  const robots = code("src/app/robots.ts");
  for (const p of ["/watching", "/watchlist", "/account", "/dashboard", "/profile"]) assert.ok(!robots.includes(`"${p}"`), p);
  assert.ok(existsSync(join(process.cwd(), "src/app/watching/loading.tsx")));
});

test("the header heart is a button that toggles the drawer, with RiftCompare's badge", () => {
  const src = code("src/components/HeaderWatchButton.tsx");
  assert.match(src, /<button/);
  assert.doesNotMatch(src, /<Link|href=/);
  assert.match(src, /aria-expanded=\{open\}/);
  assert.match(src, /Watchlist, \$\{count\} card/);
  assert.match(src, /count > 9 \? "9\+" : count/);
  assert.match(src, /num absolute right-0\.5 top-0\.5 grid h-3\.5 min-w-\[14px\] place-items-center rounded-full bg-accent px-0\.5 text-\[9px\] font-bold text-ink-950/);
  assert.match(src, /open \? "text-brand-400" : "text-slate-200"/);
  assert.match(code("src/components/Navbar.tsx"), /<HeaderWatchButton className="hidden sm:inline-flex" \/>/);
  assert.ok(!existsSync(join(process.cwd(), "src/components/WatchDrawer.tsx")), "wave 1's drawer is replaced");
});

test("the drawer: ui/Dialog on the right, md, sheet layer; autofocused close; the list layout", () => {
  const src = code("src/components/WatchlistDrawer.tsx");
  assert.match(src, /<Dialog open=\{open\} onClose=\{close\} placement="right" size="md" z="sheet"/);
  assert.match(src, /data-autofocus/);
  assert.match(src, /<Watchlist layout="list" onNavigate=\{close\} \/>/);
  assert.match(src, /\/login\?next=\/watching&src=watchlist_drawer/);
  assert.match(src, /me\.emailOn \?/, "the email sentence only once email is on");
});

test("the page and the list promise an email only while email is on", () => {
  const page = code("src/app/watching/page.tsx");
  assert.match(page, /const emailOn = \(await getEmailStatus\(\)\) === "on"/);
  const list = code("src/components/Watchlist.tsx");
  assert.match(list, /\{me\.emailOn \? <PauseBanner/);
  assert.match(list, /me\.emailOn \? <SnoozeNote/);
  assert.match(list, /Price my watchlist, delivered →/);
  assert.match(list, /\/tools\/best-basket\?source=watchlist/);
});

test("every card heart is PriceWatchButton; sealed hearts are SealedWatchButton", () => {
  for (const p of ["src/components/CardTileClient.tsx", "src/components/QuickView.tsx", "src/components/CardStickyBuyBar.tsx", "src/app/card/[slug]/page.tsx"]) {
    assert.match(code(p), /<PriceWatchButton/, p);
    assert.doesNotMatch(code(p), /<WatchButton\b/, p);
  }
  assert.match(code("src/components/SealedTile.tsx"), /<SealedWatchButton sealedId=\{s\.id\}/);
  assert.match(code("src/app/sealed/[slug]/page.tsx"), /<SealedWatchButton/);
});
