import { test } from "node:test";
import assert from "node:assert/strict";
import { SITE } from "@/site.config";

// Every site links the whole Compare Empire family from its footer (owner,
// 2026-10-27): the other sites (eleven or more), each once (WargameCompare and FigureCompare joined 2026-10-28, Cyberpunk Compare 2026-11-01, BandaiCompare 2026-11-03), over https, never itself,
// with a descriptive anchor (the words a searcher types) rather than the brand.
test("sister sites: the eleven or more others, once each, with descriptive anchors", () => {
  const hosts = SITE.sisterSites.map((s) => new URL(s.url).host);
  assert.ok(SITE.sisterSites.length >= 11);
  assert.equal(new Set(hosts).size, hosts.length, "no site twice");
  for (const s of SITE.sisterSites) {
    assert.equal(new URL(s.url).protocol, "https:", s.name);
    assert.notEqual(s.name, SITE.name, "never this site itself");
    assert.match(s.anchor ?? "", /prices$/, `${s.name}: anchor says what it compares`);
    // Owner, 2026-11-02: never tie a sister site to one country ("Australian
    // tech prices" for a site that compares US and UK stores too).
    assert.doesNotMatch(`${s.anchor} ${s.game}`, /\b(Australian|Aussie|American|British|Canadian|Australia only|AU only)\b/i, `${s.name}: region-neutral`);
  }
});

// The footer (owner, 2026-11-03): the other card sites only (lib/family-network.ts), by brand name,
// never KaeYoung or a hobby/tech site, plus one "A Compare Empire site" link.
test("footer: other card sites from the family registry, plus the network page", async () => {
  const { footerSisters, NETWORK_PAGE } = await import("@/lib/family-network");
  const list = footerSisters(SITE.family.id);
  assert.ok(list.length >= 3);
  assert.ok(list.every((s) => s.clusters.includes("cards")));
  assert.ok(!list.some((s) => /kaeyoung/i.test(s.url)));
  assert.equal(new URL(NETWORK_PAGE).host, "compareempire.com");
  const src = (await import("node:fs")).readFileSync("src/components/Footer.tsx", "utf8");
  assert.match(src, /footerSisters\(SITE\.family\.id\)/);
  assert.match(src, /A Compare Empire site/);
  assert.match(src, />Other card games</);
});
