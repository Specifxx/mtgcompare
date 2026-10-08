// The new admin panels (contract section 15): the pure parts are run, the wiring is pinned. Owner WP21. Fixtures are real Magic data: the status sample carries the policy counts of the
// 2026-10-07 snapshot (98,796 rows, 33,640 thin, 28,538 units, 33,429 oracles) and the click retailers are the ones the buy buttons write.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { publicationStatusOf, type StatusFile } from "../src/lib/data/plane/status";
import { dailyGrowthKb, publicationView } from "../src/lib/admin-publication";
import { foldKinds, kindOfRetailer } from "../src/lib/admin-outbound";
import { bannerLevel, parseFootprintTrend } from "../src/lib/admin-db-footprint";
import { memberDays } from "../src/lib/admin-loyalty";
import { lastSix, parseLookup } from "../src/lib/admin-lookup";
import { WORKFLOWS, dispatchConfigured, dispatchWorkflow, inImportWindow, repoSlug, workflowUrl } from "../src/lib/admin-dispatch";
import { currentDeploy, foldReleases } from "../src/lib/deploy-facts";
import { RELEASE_CRON } from "../src/lib/release-schedule";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const SAMPLE = JSON.parse(read("tests/fixtures/status.sample.json")) as StatusFile;
const NOW = new Date("2026-10-08T23:00:00Z");

test("a full status maps to green rows, with the held store shown as a failsafe", () => {
  const v = publicationView(publicationStatusOf(SAMPLE), NOW);
  assert.equal(v.rows.find((r) => r.label === "Published")!.level, "ok");
  assert.equal(v.rows.find((r) => r.label === "Catalogue")!.level, "ok");
  assert.match(v.rows.find((r) => r.label === "Catalogue")!.value, /98,796 rows/);
  assert.equal(v.rows.find((r) => r.label === "Files")!.level, "ok");
  assert.deepEqual(v.guards, ["1 store(s) held: cardkingdom-us"]);
  assert.equal(v.rows.find((r) => r.label === "Last run")!.level, "warn", "a fired failsafe is amber");
  assert.equal(v.dailyGrowthKb, 7500);
  assert.equal(v.trend.length, 5);
});

test("a status with every field absent is grey, never green, and never throws", () => {
  const v = publicationView(publicationStatusOf(null), NOW);
  assert.equal(v.level, "unknown");
  for (const r of v.rows.filter((x) => x.label !== "Alarms")) assert.equal(r.level, "unknown", r.label);
  assert.deepEqual(v.guards, []);
});

test("stale data goes amber at 26 h and red at 36 h; a shrinking file set goes red at 10 percent", () => {
  const at = (h: number) => new Date(Date.parse(SAMPLE.pointer.publishedAt) + h * 3_600_000);
  assert.equal(publicationView(publicationStatusOf(SAMPLE), at(27)).rows.find((r) => r.label === "Published")!.level, "warn");
  assert.equal(publicationView(publicationStatusOf(SAMPLE), at(37)).rows.find((r) => r.label === "Published")!.level, "bad");
  const shrunk: StatusFile = { ...SAMPLE, counts: { ...SAMPLE.counts, files: 8500 } };
  assert.equal(publicationView(publicationStatusOf(shrunk), NOW).rows.find((r) => r.label === "Files")!.level, "bad");
});

test("a failed run and an error alarm are red", () => {
  const bad: StatusFile = { ...SAMPLE, runs: [{ ...SAMPLE.runs[0]!, ok: false, note: "refused" }], alarms: [{ code: "REFUSED", level: "error", since: "2026-10-08T22:00:00Z", message: "the validator refused the tree" }] };
  const v = publicationView(publicationStatusOf(bad), NOW);
  assert.equal(v.rows.find((r) => r.label === "Last run")!.level, "bad");
  assert.equal(v.rows.find((r) => r.label === "Alarms")!.level, "bad");
  assert.equal(v.level, "bad");
});

test("daily growth needs two points", () => {
  assert.equal(dailyGrowthKb([["2026-10-08", 410000]]), null);
  assert.equal(dailyGrowthKb([["2026-10-07", 402000], ["2026-10-08", 410000]]), 8000);
});

test("outbound clicks fold by the retailer prefix", () => {
  assert.equal(kindOfRetailer("store:tcgplayer-direct"), "store");
  assert.equal(kindOfRetailer("tcgplayer"), "tcgplayer");
  assert.equal(kindOfRetailer("ebay_search"), "ebay");
  assert.equal(kindOfRetailer("ebay_chase"), "ebay");
  assert.equal(kindOfRetailer("buy_list"), "other");
  assert.deepEqual(foldKinds([{ k: "store:a", n: 3 }, { k: "store:b", n: 2 }, { k: "tcgplayer", n: 7 }, { k: "ebay", n: 1 }, { k: "buy_list", n: 4 }]), { store: 5, tcgplayer: 7, ebay: 1, other: 4 });
});

test("the footprint trend reads weekly Meta samples and ignores anything else", () => {
  const t = parseFootprintTrend([{ key: "db.footprint.2026-W41", value: "31457280" }, { key: "db.footprint.2026-W40", value: "30000000" }, { key: "db.footprint.junk", value: "5" }, { key: "db.footprint.2026-W39", value: "x" }]);
  assert.deepEqual(t, [{ week: "2026-W40", bytes: 30000000 }, { week: "2026-W41", bytes: 31457280 }]);
});

test("the chase banner is amber at 48 h, red at the 72 h licence limit, grey when absent", () => {
  assert.equal(bannerLevel(null), "unknown");
  assert.equal(bannerLevel(12), "ok");
  assert.equal(bannerLevel(49), "warn");
  assert.equal(bannerLevel(72), "bad");
});

test("lookup accepts an e-mail or an id, trims and caps, and shows six characters of a Stripe customer", () => {
  assert.deepEqual(parseLookup("  Jace@Example.COM "), { by: "email", value: "jace@example.com" });
  assert.deepEqual(parseLookup("clx1abcdefghijklmnopqrstu"), { by: "id", value: "clx1abcdefghijklmnopqrstu" });
  assert.equal(parseLookup("jace"), null);
  assert.equal(parseLookup(""), null);
  assert.equal(parseLookup(null), null);
  assert.equal(lastSix("cus_Qx7aBcDeF"), "aBcDeF");
  assert.equal(lastSix(null), null);
  assert.equal(memberDays(new Date("2026-09-28T00:00:00Z"), NOW), 10);
});

test("the eBay window is 21:05 to 23:30 UTC; the dispatch needs a token and says so without one", async () => {
  assert.equal(inImportWindow(new Date("2026-10-08T21:04:00Z")), false);
  assert.equal(inImportWindow(new Date("2026-10-08T21:05:00Z")), true);
  assert.equal(inImportWindow(new Date("2026-10-08T23:29:00Z")), true);
  assert.equal(inImportWindow(new Date("2026-10-08T23:30:00Z")), false);
  assert.equal(dispatchConfigured({}), false);
  const none = await dispatchWorkflow("ebay", {}, { env: {} });
  assert.equal(none.ok, false);
  assert.equal(none.status, 501);
  const token = "ghp_" + "x".repeat(30);
  let seen: { url: string; body: string; auth: string } | null = null;
  const ok = await dispatchWorkflow("deploy", { reason: "hotfix" }, { env: { GITHUB_DISPATCH_TOKEN: token }, fetchFn: async (url, init) => { seen = { url, body: init.body, auth: init.headers.Authorization! }; return { status: 204, ok: true }; } });
  assert.equal(ok.ok, true);
  assert.equal(seen!.url, "https://api.github.com/repos/Specifxx/mtgcompare/actions/workflows/production-deploy.yml/dispatches");
  assert.deepEqual(JSON.parse(seen!.body), { ref: "main", inputs: { reason: "hotfix" } });
  const refused = await dispatchWorkflow("deploy", {}, { env: { GITHUB_DISPATCH_TOKEN: token }, fetchFn: async () => ({ status: 403, ok: false }) });
  assert.doesNotMatch(refused.message, new RegExp(token), "the token never appears in a message");
  assert.equal(repoSlug({ NEXT_PUBLIC_GITHUB_REPO: "../evil" }), "Specifxx/mtgcompare", "a malformed repo falls back");
  assert.equal(workflowUrl(WORKFLOWS.ebay), "https://github.com/Specifxx/mtgcompare/actions/workflows/ebay-prices.yml");
});

test("release history counts only [deploy] subjects, never a body that mentions the marker", () => {
  const rows = [
    { sha: "a".repeat(40), commit: { message: "release: weekly production deploy [deploy]", committer: { date: "2026-10-06T08:00:12Z" } } },
    { sha: "b".repeat(40), commit: { message: "Add The One Ring to the fixtures\n\nThe gate: subjects with [deploy] build", committer: { date: "2026-10-07T10:00:00Z" } } },
    { sha: "c".repeat(40), commit: { message: "release: manual production deploy [Deploy]", committer: { date: "2026-09-20T08:00:00Z" } } },
  ];
  const h = foldReleases(rows, NOW);
  assert.equal(h.commits.length, 2);
  assert.equal(h.last7, 1);
  assert.equal(h.last30, 2);
  assert.deepEqual(currentDeploy({}), { sha: null, subject: null, builtAt: null });
  assert.equal(currentDeploy({ VERCEL_GIT_COMMIT_SHA: "abc", VERCEL_GIT_COMMIT_MESSAGE: "x [deploy]\nbody" }).subject, "x [deploy]");
});

test("the three dispatch routes are mutations, log, and none reads the token itself", () => {
  for (const r of ["ebay-run", "deploy-run", "publish-run"]) {
    const src = read(`src/app/api/admin/${r}/route.ts`);
    assert.match(src, /requireAdminApi\(req, \{ mutation: true \}\)/, r);
    assert.match(src, /adminLog\(/, r);
    assert.doesNotMatch(src, /GITHUB_DISPATCH_TOKEN/, `${r}: only src/lib/admin-dispatch.ts reads the token`);
  }
  assert.match(read("src/app/api/admin/deploy-run/route.ts"), /reason/);
  for (const f of ["src/components/admin/RunWorkflow.tsx", "src/components/admin/AdminPanel.tsx"]) assert.doesNotMatch(read(f).replace(/^\s*\/\/.*$/gm, ""), /process\.env|\btoken\b/i, `${f}: nothing client-side reads or receives the token`);
});

test("/admin/ebay imports no eBay module, /admin/data imports no database client, the status part of the library neither", () => {
  assert.doesNotMatch(read("src/app/admin/ebay/page.tsx"), /from "@\/lib\/ebay[^"]*"/);
  assert.doesNotMatch(read("src/lib/admin-db-footprint.ts").replace(/^\s*\/\/.*$/gm, ""), /from "\.\/ebay[^"]*"/);
  for (const f of ["src/app/admin/data/page.tsx", "src/app/admin/deploys/page.tsx", "src/lib/admin-publication.ts", "src/lib/deploy-facts.ts"]) assert.doesNotMatch(read(f).replace(/^\s*\/\/.*$/gm, ""), /from "(@\/lib|\.)\/db"/, `${f} must not need Neon for its status`);
  for (const p of ["clicks", "loyalty", "mail", "lookup", "database", "ebay", "data", "deploys"]) assert.ok(fs.existsSync(path.join(ROOT, `src/app/admin/${p}/page.tsx`)), p);
});

test("the release cron the deploys panel shows is the one the workflow runs", () => {
  assert.match(read(".github/workflows/production-deploy.yml"), new RegExp(`cron: "${RELEASE_CRON.replace(/\*/g, "\\*")}"`));
});
