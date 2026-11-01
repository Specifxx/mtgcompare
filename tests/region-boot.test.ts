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

test("a visitor is moved to their own region's copy; crawlers and region-less pages never are", () => {
  assert.equal(boot("/uk/deals", "America/Chicago", { alternates: alts }).moved, "/us/deals");
  assert.equal(boot("/uk/deals", "Asia/Tokyo", { alternates: alts }).moved, "/us/deals", "unknown → US");
  assert.equal(boot("/us/deals", "Europe/Berlin", { alternates: alts }).moved, "/eu/deals");
  assert.equal(boot("/us/deals", "Asia/Singapore", { alternates: alts }).moved, "/sg/deals");
  assert.equal(boot("/uk/deals", "America/Toronto", { alternates: alts }).moved, "/ca/deals");
  assert.equal(boot("/us/deals", "Pacific/Auckland", { alternates: alts }).moved, "/nz/deals");
  assert.equal(boot("/us/deals", "Europe/London", { alternates: alts }).moved, "/uk/deals");
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
