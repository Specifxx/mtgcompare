import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { addItem, itemKey, lastLook, parseVault, recordDay, setItemQty, shareText, sinceAdded, totalsByMarket, valueItems, type PriceFile, type VaultItem } from "../src/lib/vault";

// My collection (competitor scan, 2026-11-08): kept in the browser, valued from /prices.json, never converted.
const base = { id: "p1", name: "Box", href: "/us/p/box", market: "US", currency: "USD", addedCents: 10000 };

test("adding twice raises the quantity; qty 0 removes", () => {
  let v: VaultItem[] = addItem([], base);
  v = addItem(v, base);
  assert.equal(v.length, 1);
  assert.equal(v[0].qty, 2);
  v = addItem(v, { ...base, market: "AU", currency: "AUD", href: "/au/p/box", addedCents: 15000 });
  assert.equal(v.length, 2, "the same product in another market is its own item");
  v = setItemQty(v, itemKey(base), 0);
  assert.deepEqual(v.map((i) => i.market), ["AU"]);
});

test("values each item in its own market and totals per market, never mixing currencies", () => {
  const v = addItem(addItem(addItem([], { ...base, qty: 2 }), { ...base, id: "p2", addedCents: 0 }), { ...base, id: "p3", market: "AU", currency: "AUD", addedCents: 5000 });
  const file: PriceFile = { products: [{ id: "p1", prices: { US: { cents: 12000 }, AU: { cents: 1 } } }, { id: "p3", prices: { AU: { cents: 4000 } } }] };
  const valued = valueItems(v, file);
  const totals = totalsByMarket(valued);
  const us = totals.find((t) => t.market === "US")!;
  assert.equal(us.nowCents, 24000);
  assert.equal(us.unpriced, 1, "p2 has no US price today");
  assert.deepEqual(sinceAdded(valued, "US"), { from: 20000, to: 24000 });
  assert.equal(totals.find((t) => t.market === "AU")!.nowCents, 4000);
  assert.match(shareText("DexCompare", "Pokémon sealed", us, sinceAdded(valued, "US")), /3 items worth .*240.* \(up 20% since I added them\)/);
});

test("the last look is the newest day before today, one entry per market and day", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  let d = recordDay([], "US", 100, new Date("2026-11-01T00:00:00Z"));
  d = recordDay(d, "US", 150, new Date("2026-11-05T00:00:00Z"));
  d = recordDay(d, "US", 170, now);
  d = recordDay(d, "US", 180, now);
  assert.equal(d.filter((x) => x.d === "2026-11-08").length, 1);
  assert.deepEqual(lastLook(d, "US", now), { d: "2026-11-05", m: "US", c: 150 });
  assert.equal(lastLook(d, "AU", now), null);
});

test("stored lists are untrusted: malformed rows are dropped", () => {
  assert.deepEqual(parseVault("not json"), []);
  assert.deepEqual(parseVault(JSON.stringify([{ id: 1 }, null])), []);
  assert.equal(parseVault(JSON.stringify([{ ...base, qty: 5000, addedAt: "" }]))[0].qty, 99);
});

test("the collection page is a static, noindex shell that reads only /prices.json", () => {
  const page = fs.readFileSync("src/app/(site)/collection/page.tsx", "utf8");
  assert.match(page, /export const dynamic = "force-static";/);
  assert.match(page, /index: false/);
  const view = fs.readFileSync("src/components/vault/VaultView.tsx", "utf8");
  assert.deepEqual(view.match(/fetch\("[^"]+"/g), ['fetch("/prices.json"']);
});

// "+ I own this" drew with its words against its border (found 2026-11-13). vault.css wrote the button as
// :where(.ce-vault-btn), which weighs nothing, and a site's reset (Tailwind's preflight) styles a bare <button> (no padding,
// its parent's size and weight) and a bare <a> (its parent's colour): one element out-weighs a rule of no weight. Read from
// the reset itself and from the components' own markup, so any class put on an element the reset styles is held to the same.
test("the collection's button and link carry their class's weight: a :where() rule loses its padding, size and colour to the site's reset", () => {
  const rules = (css: string) =>
    [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
      selector: selector.trim(),
      decls: new Map(body.split(";").map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()] as [string, string]).filter(([k, v]) => k && v)),
    }));
  const preflight = rules(fs.readFileSync(path.join(path.dirname(createRequire(import.meta.url).resolve("tailwindcss/package.json")), "src/css/preflight.css"), "utf8"));
  /** What the reset declares on a bare element of this kind. */
  const reset = (tag: string) => new Map(preflight.filter((r) => r.selector.split(/,(?![^()]*\))/).some((s) => s.trim() === tag)).flatMap((r) => [...r.decls]));
  assert.equal(reset("button").get("padding"), "0", "the reset is read");
  assert.equal(reset("button").get("font-weight"), "inherit");
  assert.equal(reset("a").get("color"), "inherit");

  // Which element each ce-vault-* class is put on, from the markup.
  const on = new Map<string, Set<string>>();
  for (const file of fs.readdirSync("src/components/vault").filter((f) => f.endsWith(".tsx"))) {
    const src = fs.readFileSync(`src/components/vault/${file}`, "utf8");
    for (const m of src.matchAll(/className=(?:"|\{`)([^"`]*)/g)) {
      const tag = /^<([a-z][a-z0-9]*)/.exec(src.slice(src.lastIndexOf("<", m.index)))?.[1];
      if (tag) for (const cls of m[1].split(/\s+/).filter((c) => c.startsWith("ce-vault-"))) on.set(cls, (on.get(cls) ?? new Set<string>()).add(tag));
    }
  }
  assert.ok(on.get("ce-vault-btn")?.has("button"), "the button is found in the markup");
  assert.ok(on.get("ce-vault-link")?.has("a"), "the link is found in the markup");

  const sheet = rules(fs.readFileSync("src/components/vault/vault.css", "utf8"));
  const lost: string[] = [];
  for (const rule of sheet) {
    const where = /^:where\(([^()]*)\)$/.exec(rule.selector);
    for (const cls of where ? where[1].split(",").map((s) => s.trim().replace(/^\./, "")) : []) {
      for (const tag of on.get(cls) ?? []) {
        for (const [prop, value] of rule.decls) {
          const theirs = reset(tag).get(prop);
          if (theirs !== undefined && theirs !== value) lost.push(`<${tag} class="${cls}"> ${prop}: ${value} loses to the reset's ${theirs}`);
        }
      }
    }
  }
  assert.deepEqual(lost, []);
  // And what the two are meant to be, as written.
  const button = sheet.find((r) => r.selector === ".ce-vault-btn");
  assert.deepEqual(button && [button.decls.get("padding"), button.decls.get("font-size"), button.decls.get("font-weight"), button.decls.get("min-height")], ["0 0.9rem", "0.875rem", "700", "2.5rem"]);
  assert.equal(sheet.find((r) => r.selector === ".ce-vault-link")?.decls.get("color"), "var(--cart-accent)");
});
