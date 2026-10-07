// Fixes from the admin security/parity review: exact email lookups for manual
// grants, contact addresses that can't smuggle mailto: parameters, formula-safe
// CSV, client IPs a visitor can't choose, size-capped JSON bodies, and store
// health that agrees with the /admin home.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { exactEmailMatches, parseAdminEmail } from "../src/lib/admin-billing";
import { csvCell, csvRow } from "../src/lib/admin-csv";
import { MAX_JSON_BYTES, readJsonBody } from "../src/lib/admin-guard";
import { parseContactMessage, replyMailto } from "../src/lib/inbox-rules";
import { clientIp } from "../src/lib/rate-limit";
import { storeAlerts, isMildAlert, type StoreAppearance } from "../src/lib/store-health";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("grant/revoke find the account by exact email, never by pattern", () => {
  const rows = [{ email: "axb@x.com" }, { email: "a.b@x.com" }, { email: "A_B@x.com" }];
  assert.deepEqual(exactEmailMatches(rows, "a_b@x.com"), [{ email: "A_B@x.com" }], "case-insensitive, but `_` is a literal");
  assert.deepEqual(exactEmailMatches([{ email: "axb@x.com" }], "a_b@x.com"), [], "a_b@x.com never matches axb@x.com");
  assert.deepEqual(exactEmailMatches([{ email: "qa-free@example.com" }], "qa-%@example.com"), []);
  const src = read("src/lib/admin-billing.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /mode: "insensitive"/, "Prisma's insensitive mode is ILIKE: `%` and `_` are wildcards");
  assert.doesNotMatch(src, /\bILIKE\b|\bLIKE\b/i);
  assert.match(src, /WHERE lower\(email\) = \$\{email\.toLowerCase\(\)\}/);
  assert.match(src, /if \(exact\.length !== 1\) return null/, "two accounts differing only in case: refuse, don't guess");
});

test("parseAdminEmail refuses wildcard and header characters", () => {
  assert.equal(parseAdminEmail("John_Doe@X.com"), "john_doe@x.com", "`_` is legal in real addresses");
  assert.equal(parseAdminEmail("o'neil@x.com"), "o'neil@x.com");
  for (const bad of ["qa-%@example.com", "%@example.com", "a*b@x.com", "a\\b@x.com", "a b@x.com", "a@b@x.com", "a@x", "a?cc=b@x.com", "a@x.com,b@y.com", "a<b>@x.com"]) {
    assert.equal(parseAdminEmail(bad), null, bad);
  }
});

const contact = (email: string) => ({ name: "Nami", email, message: "My payment failed twice." });

test("contact email: no mailto: parameter smuggling", () => {
  assert.ok(parseContactMessage(contact("nami.o'neil+op@example.co.uk")).ok);
  for (const bad of ["qa-sec@example.com?cc=attacker%40evil.example&body=PHISH", "a@x.com&bcc=b@y.com", "a%40b@x.com", "a@x.com/evil", "a,b@x.com", "a;b@x.com", "a:b@x.com", "<a@x.com>", "a=b@x.com"]) {
    assert.equal(parseContactMessage(contact(bad)).ok, false, bad);
  }
});

test("the inbox Reply link encodes the address and refuses a bad one", () => {
  assert.equal(replyMailto("nami@example.com", "Billing"), "mailto:nami@example.com?subject=Re%3A%20Billing");
  assert.equal(replyMailto("nami+op@example.com", null), "mailto:nami%2Bop@example.com?subject=Re%3A%20your%20message%20to%20OP%20Compare");
  // A row stored before the tighter rule gets no link at all.
  assert.equal(replyMailto("qa-sec@example.com?cc=attacker%40evil.example&body=PHISH", "Hi"), null);
  const page = read("src/app/admin/inbox/page.tsx");
  assert.doesNotMatch(page, /mailto:\$\{/, "the page never builds a mailto: by hand");
  assert.match(page, /replyMailto\(m\.email, m\.subject\)/);
});

test("CSV export: formula characters are neutralised, quotes doubled", () => {
  assert.equal(csvCell('=HYPERLINK("https://evil","x")'), `"'=HYPERLINK(""https://evil"",""x"")"`);
  for (const lead of ["=", "+", "-", "@", "\t", "\r"]) assert.ok(csvCell(`${lead}1`).startsWith(`"'`), JSON.stringify(lead));
  assert.equal(csvCell("Nami"), '"Nami"');
  assert.equal(csvCell("a-b"), '"a-b"', "only a LEADING formula character is touched");
  assert.equal(csvRow(["x", 1, true]), '"x","1","true"');
  assert.match(read("src/components/admin/AccountsExport.tsx"), /csvRow\(/);
});

test("clientIp never trusts the first X-Forwarded-For entry", () => {
  const req = (h: Record<string, string>) => new Request("https://opcompare.app/api/feedback", { method: "POST", headers: h });
  // Off Vercel: a proxy appends what it saw, so the LAST hop is the real one.
  assert.equal(clientIp(req({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" }), {}), "9.9.9.9");
  assert.equal(clientIp(req({ "x-forwarded-for": "6.6.6.6" }), {}), "6.6.6.6");
  assert.equal(clientIp(req({ "x-real-ip": "8.8.8.8" }), {}), "8.8.8.8");
  assert.equal(clientIp(req({}), {}), "unknown");
  // On Vercel: the platform-set headers win over anything a client sent.
  assert.equal(clientIp(req({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "7.7.7.7" }), { VERCEL: "1" }), "7.7.7.7");
  assert.equal(clientIp(req({ "x-forwarded-for": "1.1.1.1", "x-vercel-forwarded-for": "5.5.5.5" }), { VERCEL: "1" }), "5.5.5.5");
});

test("public forms refund a rejected (400) submission's rate-limit slots", () => {
  const gate = read("src/lib/public-form.ts");
  assert.match(gate, /taken\.forEach\(refundRateLimit\)/);
  for (const r of ["price-report", "stores/suggest", "feedback", "contact"]) {
    const src = read(`src/app/api/${r}/route.ts`);
    assert.match(src, /gate\.reject\(/, r);
    assert.doesNotMatch(src, /badRequest\(/, `${r}: a plain 400 would keep the slot`);
  }
});

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("https://opcompare.app/api/x", { method: "POST", body, headers: { "content-type": "application/json", ...headers }, ...(body ? { duplex: "half" } : {}) } as RequestInit);

test("readJsonBody caps the body before parsing", async () => {
  assert.deepEqual(await readJsonBody(post(JSON.stringify({ a: 1 }))), { ok: true, body: { a: 1 } });
  assert.deepEqual(await readJsonBody(post("{not json")), { ok: true, body: null });
  assert.deepEqual(await readJsonBody(post(null)), { ok: true, body: null });
  assert.deepEqual(await readJsonBody(post("x".repeat(MAX_JSON_BYTES + 1))), { ok: false, status: 413 }, "declared length over the cap");
  // A streamed body with no Content-Length is cut off once it passes the cap.
  const chunk = new TextEncoder().encode("x".repeat(8192));
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (sent++ > 100) c.close();
      else c.enqueue(chunk);
    },
  });
  assert.deepEqual(await readJsonBody(post(stream)), { ok: false, status: 413 });
  assert.ok(sent < 10, "stopped reading early");
  assert.match(read("src/lib/public-form.ts"), /readJsonBody\(req\)/);
  assert.doesNotMatch(read("src/lib/public-form.ts"), /req\.json\(/);
  const routes = fs.readdirSync(path.join(ROOT, "src/app/api/admin")).map((d) => `src/app/api/admin/${d}/route.ts`);
  for (const f of routes) assert.doesNotMatch(read(f), /req\.json\(/, `${f} must read through adminJsonBody`);
});

let run = 100;
const app = (p: Partial<StoreAppearance> = {}): StoreAppearance => ({ runId: run--, at: new Date(), products: 100, cards: 80, sealed: 0, inStock: 60, failed: false, ...p });
const offers = { listings: 50, inStock: 20, newest: new Date() };

test("store health: a single failed latest read is listed (mildly), two in a row is `failing`", () => {
  const one = storeAlerts([app({ failed: true }), app(), app()], offers).map((a) => a.kind);
  assert.deepEqual(one, ["last-read-failed"]);
  assert.ok(isMildAlert("last-read-failed"));
  const two = storeAlerts([app({ failed: true }), app({ failed: true }), app()], offers).map((a) => a.kind);
  assert.ok(two.includes("failing") && !two.includes("last-read-failed"));
  assert.deepEqual(storeAlerts([app(), app({ failed: true })], offers), []);
});

test("store health SQL: misses per store's own newest read; home tile per store too", () => {
  const sql = read("src/lib/admin-health.ts");
  assert.match(sql, /row_number\(\) OVER \(PARTITION BY s->>'key' ORDER BY r\.id DESC\)/);
  assert.match(sql, /CASE WHEN rn = 1 THEN misses END/);
  assert.doesNotMatch(sql, /SELECT max\(id\) FROM "ImportRun"/, "never 'the newest run' (it may be a partial one)");
  const home = read("src/lib/admin-accounts.ts");
  assert.match(home, /DISTINCT ON \(s->>'key'\)/);
  assert.doesNotMatch(home, /kind = 'full'/, "a partial IMPORT_ONLY_* rerun is also kind 'full'");
});
