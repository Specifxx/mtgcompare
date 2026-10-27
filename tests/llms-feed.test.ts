import { test } from "node:test";
import assert from "node:assert/strict";
import { GET as llms } from "../src/app/llms.txt/route";
import { GET as feed } from "../src/app/feed.xml/route";
import { GUIDES } from "../src/content/guides";

test("llms.txt names the site and links every guide", async () => {
  const body = await llms().text();
  assert.match(body, /^# MTG Compare\n/);
  for (const g of GUIDES) assert.ok(body.includes(`/guides/${g.slug})`), g.slug);
});

test("feed.xml is RSS with one item per guide", async () => {
  const body = await feed().text();
  assert.match(body, /^<\?xml/);
  assert.equal((body.match(/<item>/g) ?? []).length, GUIDES.length);
  assert.ok(!/&(?!amp;|lt;|gt;|quot;)/.test(body), "unescaped ampersand");
});
