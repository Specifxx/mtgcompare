// The beta forum's rules (src/lib/forum/core.ts) and this site's settings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  applyPost,
  checkPost,
  foreignLinks,
  hasHoldWord,
  idFromSegment,
  nameProblem,
  parseForum,
  rateProblem,
  RATE,
  redact,
  removeFromForum,
  resetRates,
  threadIndexable,
  threadPath,
  visibleThreads,
  EMPTY_FORUM,
  type ForumSite,
} from "../src/lib/forum/core";
import { serialiseForum } from "../src/lib/forum/store";
import { FORUM_SITE } from "../src/lib/forum/site";

const site: ForumSite = { ...FORUM_SITE, hosts: ["example.com"] };
const cat = site.categories[0]!.key;
const ok = (body: Record<string, unknown>) => {
  const c = checkPost(body, site);
  assert.ok(c.ok, c.ok ? "" : c.error);
  return c;
};

test("this site's forum settings are complete", () => {
  assert.ok(FORUM_SITE.categories.length >= 3, "an empty forum shows its topics, so it needs a few");
  assert.equal(new Set(FORUM_SITE.categories.map((c) => c.key)).size, FORUM_SITE.categories.length);
  for (const c of FORUM_SITE.categories) assert.match(c.key, /^[a-z0-9-]+$/);
  assert.match(FORUM_SITE.repo, /^Specifxx\/[A-Za-z0-9-]+$/);
  assert.ok(FORUM_SITE.hosts.length > 0);
  assert.equal(FORUM_SITE.base, "/forum");
});

test("a thread needs a name, a topic, a title and a body", () => {
  assert.equal(checkPost({ kind: "thread", name: "", category: cat, title: "Best booster box?", body: "Which one?" }, site).ok, false);
  assert.equal(checkPost({ kind: "thread", name: "Sam", category: "nope", title: "Best booster box?", body: "Which one?" }, site).ok, false);
  assert.equal(checkPost({ kind: "thread", name: "Sam", category: cat, title: "Hi", body: "Which one?" }, site).ok, false);
  assert.equal(checkPost({ kind: "thread", name: "Sam", category: cat, title: "Best booster box?", body: "" }, site).ok, false);
  const c = ok({ kind: "thread", name: "  Sam  ", category: cat, title: "Best booster box?", body: "Which one?\n\n\n\nThanks" });
  assert.equal(c.ok && c.input.name, "Sam");
  assert.equal(c.ok && c.input.body, "Which one?\n\nThanks");
  assert.equal(c.ok && c.hold, null);
});

test("names: no web addresses, no staff names, no site name", () => {
  assert.ok(nameProblem("www.spam.com", site));
  assert.ok(nameProblem("Admin", site));
  assert.ok(nameProblem("Moderator", site));
  assert.ok(nameProblem(site.siteName, site));
  assert.ok(nameProblem("x", site));
  assert.equal(nameProblem("Riley_99", site), null);
  assert.equal(nameProblem("José", site), null);
});

test("emails, IPs and phone numbers are blanked before anything is written", () => {
  const s = redact("mail me at sam@example.com or call 0412 345 678 from 10.0.0.1, set 24 costs $120");
  assert.doesNotMatch(s, /sam@example\.com|0412|10\.0\.0\.1/);
  assert.match(s, /set 24 costs \$120/);
});

test("slurs, strong profanity and links to other sites are held, never published", () => {
  assert.equal(hasHoldWord("what the f*ck is this price"), true);
  assert.equal(hasHoldWord("F U C K"), true);
  assert.equal(hasHoldWord("damn, that's a crap deal"), false);
  assert.equal(hasHoldWord("Scunthorpe store has stock"), false);
  assert.equal(hasHoldWord("grape and therapist"), false);
  const held = ok({ kind: "reply", name: "Sam", thread: "abcdefgh", body: "great deal at https://spam.example.net/x" });
  assert.equal(held.ok && held.hold, "link");
  const own = ok({ kind: "reply", name: "Sam", thread: "abcdefgh", body: "see https://example.com/sets/x" });
  assert.equal(own.ok && own.hold, null);
  assert.deepEqual(foreignLinks("www.other.org and https://sub.example.com/a", ["example.com"]), ["www.other.org"]);
  const words = ok({ kind: "reply", name: "Sam", thread: "abcdefgh", body: "you fucking idiot" });
  assert.equal(words.ok && words.hold, "language");
});

test("shouting and keyboard mashing are refused", () => {
  assert.equal(checkPost({ kind: "reply", name: "Sam", thread: "abcdefgh", body: "THIS IS THE BEST PRICE EVER SEEN ON ANY WEBSITE ANYWHERE TODAY" }, site).ok, false);
  assert.equal(checkPost({ kind: "reply", name: "Sam", thread: "abcdefgh", body: "aaaaaaaaaaaaaaaaaaaaaaa" }, site).ok, false);
});

test("posting, replying, duplicates and moderation", () => {
  let n = 0;
  const rand = () => ((n = (n * 7 + 3) % 32), n / 32);
  const c = ok({ kind: "thread", name: "Sam", category: cat, title: "Best booster box?", body: "Which one?" });
  assert.ok(c.ok);
  const a = applyPost(EMPTY_FORUM, c.input, new Date("2026-11-01T00:00:00Z"), rand);
  assert.ok(a.ok);
  const t = a.thread;
  assert.match(t.id, /^[a-z0-9]{8}$/);
  assert.equal(threadIndexable(t), false, "a thread with no replies is noindex");
  assert.equal(applyPost(a.file, c.input, new Date("2026-11-01T01:00:00Z"), rand).ok, false, "same title the same day");
  const r = ok({ kind: "reply", name: "Alex", thread: t.id, body: "The second one" });
  assert.ok(r.ok);
  const b = applyPost(a.file, r.input, new Date("2026-11-01T02:00:00Z"), rand);
  assert.ok(b.ok);
  assert.equal(threadIndexable(b.thread), true);
  assert.equal(b.thread.last, "2026-11-01T02:00:00Z");
  assert.equal(applyPost(b.file, r.input, new Date(), rand).ok, false, "duplicate reply");
  const reread = parseForum(JSON.parse(serialiseForum(b.file)));
  assert.deepEqual(reread, b.file);
  const removed = removeFromForum(b.file, b.post.id)!;
  assert.equal(removed.threads[0]!.posts[1]!.body, "");
  assert.equal(threadIndexable(removed.threads[0]!), false);
  const gone = removeFromForum(b.file, t.id)!;
  assert.equal(visibleThreads(gone).length, 0);
  assert.equal(removeFromForum(b.file, "zzzzzzzz"), null);
  assert.equal(idFromSegment(threadPath(site, t).split("/").pop()!), t.id);
  assert.equal(idFromSegment("nope"), null);
});

test("rate limits: a burst, then wait", () => {
  resetRates();
  const now = Date.parse("2026-11-01T00:00:00Z");
  for (let i = 0; i < RATE.burst; i++) assert.equal(rateProblem("1.2.3.4", false, now + i), null);
  assert.ok(rateProblem("1.2.3.4", false, now + 10));
  assert.equal(rateProblem("5.6.7.8", false, now + 10), null, "another visitor is not limited");
  assert.equal(rateProblem("1.2.3.4", false, now + 11 * 60_000), null);
  resetRates();
});

test("parseForum drops anything malformed instead of throwing", () => {
  assert.deepEqual(parseForum(null).threads, []);
  assert.deepEqual(parseForum({ threads: [{ id: 1 }, { id: "a", title: "t", category: "c", posts: [] }] }).threads, []);
});

test("the forum branch never deploys, and nothing private is stored", () => {
  const v = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.equal(v.git?.deploymentEnabled?.forum, false, "vercel.json must turn off deploys of the forum branch");
  const store = readFileSync("src/lib/forum/store.ts", "utf8");
  assert.doesNotMatch(store, /x-forwarded-for[^\n]*JSON\.stringify|ip:\s/i);
  assert.ok(existsSync("src/app/api/forum/route.ts"));
  assert.doesNotMatch(readFileSync("src/app/api/forum/route.ts", "utf8"), /export (async )?function GET/, "POST only");
});
