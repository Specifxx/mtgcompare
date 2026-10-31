// The visitor report store (src/lib/reports-github.ts), the same file and test in
// every Compare Empire site: reports go to the private reports repo, one new
// file each, and nothing that identifies the visitor is kept.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { cleanReport, cleanHost, cleanPage, redact, reportPath, saveReport, handleReportPost, overLimit, PER_VISITOR_PER_HOUR } from "../src/lib/reports-github";

const now = new Date("2026-10-31T03:04:05.678Z");

test("a wrong-price report keeps the product, store and prices, and only the page's path", () => {
  const c = cleanReport({ kind: "wrong-price", product: "Booster Box", store: "Good Games", shown: "A$199.95", actual: "229.95", issue: "wrong-price", page: "https://site.com/p/box?utm=x#y", region: "AU" }, "testsite", now);
  assert.ok(c.ok);
  assert.equal(c.report.page, "/p/box");
  assert.equal(c.report.store, "Good Games");
  assert.equal(c.report.at, "2026-10-31T03:04:05Z");
  assert.equal(c.report.site, "testsite");
});

test("emails, IPs and phone numbers in a note are blanked; a product's barcode is kept", () => {
  const c = cleanReport({ kind: "wrong-price", product: "4580590123456 Nendoroid", store: "x", note: "mail me at jo.bloggs@gmail.com or 0412 345 678, from 203.0.113.9; price $54.95" }, "t", now);
  assert.ok(c.ok);
  assert.equal(c.report.product, "4580590123456 Nendoroid");
  assert.ok(!/gmail|0412|203\.0/.test(c.report.note!), c.report.note!);
  assert.match(c.report.note!, /\$54\.95/);
  assert.equal(redact("a@b.co"), "[email removed]");
});

test("the stored report has no email or IP field at all", () => {
  const c = cleanReport({ kind: "suggest-store", store: "Shop", storeUrl: "https://www.Shop.example.com/collections/x", email: "a@b.com", ip: "1.2.3.4" }, "t", now);
  assert.ok(c.ok);
  assert.equal(c.report.storeUrl, "shop.example.com");
  const keys = Object.keys(c.report).join(",");
  assert.ok(!/email|ip\b/.test(keys), keys);
});

test("incomplete reports are refused with a reason", () => {
  assert.equal(cleanReport({ kind: "nope" }, "t").ok, false);
  assert.equal(cleanReport({ kind: "suggest-store" }, "t").ok, false);
  assert.equal(cleanReport({ kind: "suggest-store", store: "X", storeUrl: "not a url" }, "t").ok, false);
  assert.equal(cleanReport({ kind: "wrong-price", page: "/p/1" }, "t").ok, false);
  assert.equal(cleanReport({ kind: "other" }, "t").ok, false);
});

test("pages and hosts are cleaned", () => {
  assert.equal(cleanPage("javascript:alert(1)"), null);
  assert.equal(cleanPage("/a?b=c"), "/a");
  assert.equal(cleanHost("example"), null);
  assert.equal(cleanHost("WWW.Example.co.uk/path"), "example.co.uk");
});

test("each report is a new file under inbox/<site>/<day>/", () => {
  const c = cleanReport({ kind: "suggest-store", store: "S" }, "My Site", now);
  assert.ok(c.ok);
  assert.equal(reportPath(c.report, "abc123"), "inbox/mysite/2026-10-31/030405-suggest-store-abc123.json");
});

test("saveReport creates the file on the site's own reports branch and never throws", async () => {
  const c = cleanReport({ kind: "suggest-store", store: "S" }, "riftcompare", now);
  assert.ok(c.ok);
  delete process.env.REPORTS_GITHUB_TOKEN;
  assert.equal(await saveReport(c.report, (async () => { throw new Error("no call"); }) as typeof fetch), "off");
  process.env.REPORTS_GITHUB_TOKEN = "tok";
  let seen: { url: string; init: RequestInit } | null = null;
  const ok = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response("{}", { status: 201 }); }) as unknown as typeof fetch;
  assert.equal(await saveReport(c.report, ok), "saved");
  assert.match(seen!.url, /^https:\/\/api\.github\.com\/repos\/Specifxx\/TCGEmpire\/contents\/inbox\/riftcompare\/2026-10-31\//);
  assert.equal(seen!.init.method, "PUT");
  const body = JSON.parse(String(seen!.init.body));
  assert.equal(body.branch, "reports", "never main: the branch that deploys");
  assert.ok(!/\[deploy\]|\[preview\]/i.test(body.message));
  assert.equal(await saveReport(c.report, (async () => new Response("", { status: 403 })) as unknown as typeof fetch), "failed");
  assert.equal(await saveReport(c.report, (async () => { throw new Error("down"); }) as unknown as typeof fetch), "failed");
  const unknown = cleanReport({ kind: "suggest-store", store: "S" }, "nosuchsite", now);
  assert.ok(unknown.ok);
  assert.equal(await saveReport(unknown.report, ok), "off");
  delete process.env.REPORTS_GITHUB_TOKEN;
});

test("the route refuses other origins, swallows the honeypot and says to email when GitHub is off", async () => {
  const req = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("https://site.test/api/report", { method: "POST", headers: { host: "site.test", "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200)}`, ...headers }, body: JSON.stringify(body) });
  assert.equal((await handleReportPost(req({ kind: "other", note: "x" }, { origin: "https://evil.test" }), "t")).status, 403);
  assert.equal((await handleReportPost(req({ kind: "other", website: "spam" }), "t")).status, 200);
  const off = await handleReportPost(req({ kind: "other", note: "hello" }), "t", { email: "hi@site.test" });
  assert.equal(off.status, 503);
  assert.match((await off.json()).error, /hi@site\.test/);
  const also = await handleReportPost(req({ kind: "other", note: "hello" }), "t", { also: async () => true });
  assert.equal(also.status, 200);
});

test("the per-visitor limit is in memory and bounded", () => {
  const t = Date.now();
  for (let i = 0; i < PER_VISITOR_PER_HOUR; i++) assert.equal(overLimit("v-limit", t), false);
  assert.equal(overLimit("v-limit", t), true);
  assert.equal(overLimit("v-limit", t + 3_700_000), false);
});

// RiftCompare and OP Compare keep their own report forms and routes (database and
// email), which also call saveReport; every other site uses the shared forms.
const shared = existsSync("src/components/ReportForms.tsx");
test("the report route exists and the forms never ask for an email", { skip: !shared && "this site files reports from its own forms" }, () => {
  const route = ["src/app/api/report/route.ts", "src/app/(site)/api/report/route.ts"].find((p) => existsSync(p));
  assert.ok(route, "POST /api/report");
  assert.match(readFileSync(route!, "utf8"), /handleReportPost/);
  const forms = readFileSync("src/components/ReportForms.tsx", "utf8");
  assert.ok(!/type="email"|name="email"/.test(forms));
  assert.ok(!/position:\s*"fixed"|<dialog/i.test(forms), "inline, never a pop-up");
});

test("the reports branch never deploys from this repo's own config", () => {
  const v = JSON.parse(readFileSync("vercel.json", "utf8")) as { git?: { deploymentEnabled?: Record<string, boolean> | boolean } };
  const d = v.git?.deploymentEnabled;
  assert.ok(d === false || (typeof d === "object" && d.reports === false), "vercel.json: git.deploymentEnabled.reports = false");
});
