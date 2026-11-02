import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { REGION_BOOT_SCRIPT, X_DEFAULT_REGION } from "../src/lib/regions";

// Owner, 2026-11-01: the visitor's own region by default, the US when we can't tell; crawlers are never moved.

function boot(path: string, tz: string, opts: { saved?: string; ua?: string; alternates?: Record<string, string> } = {}) {
  const attrs: Record<string, string> = {};
  let moved: string | null = null;
  vm.runInNewContext(REGION_BOOT_SCRIPT, {
    URL,
    navigator: { userAgent: opts.ua ?? "Mozilla/5.0 (iPhone) Safari/604.1" },
    location: { pathname: path, search: "", hash: "", href: `https://mtgcompare.app${path}`, replace: (u: string) => (moved = u) },
    localStorage: { getItem: () => opts.saved ?? null, setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: tz }) }) },
    setTimeout: () => 0,
    document: {
      readyState: "complete",
      addEventListener() {},
      documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v), removeAttribute: (k: string) => delete attrs[k] },
      querySelector: (sel: string) => {
        const lang = /hreflang="([^"]+)"/.exec(sel)?.[1] ?? "";
        const href = opts.alternates?.[lang];
        return href ? { href: `https://mtgcompare.app${href}` } : null;
      },
    },
  });
  return { moved, attrs };
}

const alts = { "en-GB": "/uk/deals", "en-US": "/us/deals", "en-AU": "/au/deals", "en-CA": "/ca/deals", "en-NZ": "/nz/deals", "en-IE": "/eu/deals", "en-SG": "/sg/deals" };

test("the US is the default region", () => assert.equal(X_DEFAULT_REGION, "us"));

test("a visitor who picked a region is moved to its copy; crawlers and region-less pages never are", () => {
  assert.equal(boot("/uk/deals", "America/Chicago", { saved: "us", alternates: alts }).moved, "/us/deals");
  assert.equal(boot("/uk/deals", "Asia/Tokyo", { saved: "us", alternates: alts }).moved, "/us/deals", "unknown → US");
  assert.equal(boot("/us/deals", "Europe/Berlin", { saved: "eu", alternates: alts }).moved, "/eu/deals");
  assert.equal(boot("/us/deals", "Asia/Singapore", { saved: "sg", alternates: alts }).moved, "/sg/deals");
  assert.equal(boot("/uk/deals", "America/Toronto", { saved: "ca", alternates: alts }).moved, "/ca/deals");
  assert.equal(boot("/us/deals", "Pacific/Auckland", { saved: "nz", alternates: alts }).moved, "/nz/deals");
  assert.equal(boot("/us/deals", "Europe/London", { saved: "uk", alternates: alts }).moved, "/uk/deals");
  assert.equal(boot("/uk/deals", "America/Chicago", { saved: "uk", alternates: alts }).moved, null, "a picked region wins");
  assert.equal(boot("/uk/deals", "America/Chicago", { ua: "Mozilla/5.0 (compatible; Googlebot/2.1)", alternates: alts }).moved, null);
  assert.equal(boot("/about", "Australia/Sydney", { alternates: alts }).moved, null);
  const miss = boot("/uk/p/x", "America/Chicago");
  assert.equal(miss.moved, null);
  assert.equal(miss.attrs["data-geo"], undefined);
  assert.doesNotThrow(() => vm.runInNewContext(REGION_BOOT_SCRIPT, {}));
});

test("the layout runs it before paint", () => {
  assert.match(readFileSync("src/app/layout.tsx", "utf8"), /__html: REGION_BOOT_SCRIPT/);
  assert.match(readFileSync("src/app/globals.css", "utf8"), /html\[data-geo="pending"\] main \{ visibility: hidden; \}/);
});

test("a visitor who never picked is not moved, but offered their region's copy in one line (2026-11-02)", () => {
  const made: any[] = [];
  const body = { firstChild: null, insertBefore: (el: any) => made.push(el) };
  const el = () => { const e: any = { style: {}, kids: [] as any[], setAttribute(k: string, v: string) { e[k] = v; }, appendChild(c: any) { e.kids.push(c); } }; return e; };
  let moved: string | null = null;
  const run = (ua: string) => vm.runInNewContext(REGION_BOOT_SCRIPT, {
    URL,
    navigator: { userAgent: ua },
    location: { pathname: "/us/deals", search: "", hash: "", href: "https://mtgcompare.app/us/deals", replace: (u: string) => (moved = u) },
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: "Australia/Sydney" }) }) },
    setTimeout: () => 0,
    document: {
      readyState: "complete",
      body,
      addEventListener() {},
      getElementById: () => null,
      createElement: el,
      documentElement: { setAttribute() {}, removeAttribute() {} },
      querySelector: (sel: string) => (/hreflang=/.test(sel) ? { href: "https://mtgcompare.app/au/deals" } : null),
    },
  });
  run("Mozilla/5.0 (iPhone) Safari/604.1");
  assert.equal(moved, null, "not moved on a guess");
  assert.equal(made.length, 1, "one line offered");
  const link = made[0].kids[1];
  assert.equal(link.href, "/au/deals");
  assert.equal(link.textContent, "Switch to Australian prices");
  made.length = 0;
  run("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
  assert.equal(made.length, 0, "never for crawlers");
});
