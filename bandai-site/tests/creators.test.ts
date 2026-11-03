import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CREATORS } from "@/content/creators";
import { creatorsOn, featuredCreators, initials, type Creator } from "@/lib/creators";

const c = (slug: string, since: string): Creator => ({ slug, name: slug, blurb: "", about: "", links: [{ platform: "Website", url: "https://example.com" }], tags: [], since });

test("the newest creator is the spotlight; an empty list turns the page off", () => {
  assert.deepEqual(featuredCreators([c("old", "2026-10-01"), c("new", "2026-10-31")]).map((x) => x.slug), ["new", "old"]);
  assert.equal(creatorsOn([]), false);
  assert.equal(creatorsOn([c("a", "2026-10-31")]), true);
  assert.equal(initials("Kevin Lepage"), "KL");
});

test("every listed creator is well formed, with a real avatar file", () => {
  const slugs = new Set<string>();
  for (const cr of CREATORS) {
    assert.match(cr.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, cr.slug);
    assert.ok(!slugs.has(cr.slug), `duplicate ${cr.slug}`);
    slugs.add(cr.slug);
    assert.match(cr.since, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(cr.links.length > 0, `${cr.slug} has a link`);
    for (const l of cr.links) {
      assert.match(l.url, /^https:\/\//, l.url);
      assert.ok(!/[?&]si=/.test(l.url), `${l.url}: no share-tracking parameter`);
    }
    if (cr.avatar) {
      assert.match(cr.avatar, /^\/img\/creators\//, "avatars live in public/img/creators/");
      assert.ok(fs.existsSync(`public${cr.avatar}`), `${cr.avatar} exists`);
    }
  }
});
