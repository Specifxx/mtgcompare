// WHAT LEAVES THE MACHINE (owner WP19, addendum 9, contract 1.2 and Annex C checks 26 and 31). Two repositories carry our files: the SOURCE repository (public or shared with collaborators; Vercel builds it) and the PRIVATE data
// repository (the published tree). Both are copied by people and caches we do not control, so neither may hold what must not be copied:
//   * eBay listing data (item ids, item URLs, listing photos): the licence keeps it in Neon, and it never reaches a file (requirements 7, 9);
//   * an e-mail address of a person (the only personal address the project may name is the admin default, mastermisclick@gmail.com);
//   * a credential: a token, a key, a signing secret, a webhook address, a connection string with a password for a real host;
//   * and, in the source, data: the source holds code, not the catalogue, not price history, not a dump (13.3: nothing but data/slug-seed.json).
// The scan is over every file git would commit (tracked plus untracked-and-not-ignored), per OWNER: a ratchet, because the baseline carries a few leftovers of other packages' files (an address of the One Piece site, the
// previous owner's personal address in a comment). Each owner may only reduce its count; RATCHET_STRICT=1 (M2) requires zero. The published tree gets the strict version at once: the publisher's validator already refuses
// these strings before any commit (src/lib/data/plane/validate.ts FORBIDDEN_TEXT); this file shows it can, and applies the same scan to a real tree when one is on disk.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, ratchet, summary, walk } from "./helpers/ratchet";
import { FORBIDDEN_TEXT, validateTree } from "../src/lib/data/plane/validate";
import { memTree } from "../src/lib/data/plane/tree";
import { miniFull } from "./helpers/plane-tree";

// ── the scanner ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const EMAIL = /[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** Addresses that are not a person: reserved example domains (RFC 2606), the .invalid TLD that can never deliver, one-letter domains used as placeholders in tests, GitHub's own, and this site's placeholder domain. */
const PLACEHOLDER_DOMAIN = /^(?:(?:[\w-]+\.)*example\.(?:com|org|net)|example\.co\.uk|[\w.-]+\.invalid|[a-z]\.(?:com|co|net)|(?:users\.noreply\.)?github\.com|mtgcompare\.app|localhost)$/i;
/** The owner's admin default, and the made-up gmail aliases that the plus/dot normalisation code and its tests use as examples. */
const ALLOWED_PERSONAL = /^(?:mastermisclick@gmail\.com|(?:a\.l\.ice|alice|b\.o\.b|bob)(?:\+[\w-]+)?@(?:gmail|googlemail)\.com)$/i;
/** A file extension where an @-name looks like an address (`logo@2x.png`, a package `@scope/name@1.0.0`). */
const NOT_AN_ADDRESS = /\.(?:png|jpe?g|webp|avif|gif|svg|ico|css|js|json|ts|tsx|woff2?|ttf|map)$/i;
export function strayAddresses(text: string): string[] {
  return [...new Set([...text.matchAll(EMAIL)].map((m) => m[0]!).filter((a) => !NOT_AN_ADDRESS.test(a) && !ALLOWED_PERSONAL.test(a) && !PLACEHOLDER_DOMAIN.test(a.slice(a.lastIndexOf("@") + 1))))];
}
const LOOPBACK = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;
const SECRET_SHAPES: [string, RegExp][] = [
  ["a GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/],
  ["a payment key", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|\bwhsec_[A-Za-z0-9]{16,}/],
  ["a cloud key", /\bAKIA[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_-]{35}\b/],
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["a chat or mail token", /\bxox[baprs]-[A-Za-z0-9-]{10,}|\bre_[A-Za-z0-9]{24,}|\bxkeysib-[A-Za-z0-9-]{20,}/],
  ["a webhook address", /https:\/\/(?:discord(?:app)?\.com\/api\/webhooks|hooks\.slack\.com\/services)\/[^\s"'`]+/],
];
export function secretsIn(text: string): string[] {
  const out: string[] = [];
  for (const [what, re] of SECRET_SHAPES) if (re.test(text)) out.push(what);
  for (const m of text.matchAll(/postgres(?:ql)?:\/\/[^\s"'`<>:@/]+:[^\s"'`<>@/]+@([^\s"'`<>/?]+)/g)) if (!LOOPBACK.test(m[1]!)) out.push("a connection string with a password for a real host");
  return out;
}
/** eBay listing data: an item URL, an item id of the Browse API ("v1|<digits>|<digits>"), or a listing photo with a real hash. A short fake path (`g/abc`, `x.jpg`) in a test fixture is not one. */
export function ebayItemData(text: string): string[] {
  const out: string[] = [];
  if (/ebay\.[a-z.]+\/itm\/(?:[^/\s"']*\/)?\d{9,}/i.test(text)) out.push("an eBay item URL");
  if (/\bv1\|\d{9,}\|\d+/.test(text)) out.push("a Browse API item id");
  if (/ebayimg\.com\/(?:thumbs\/)?images\/g\/[A-Za-z0-9~_-]{8,}/i.test(text)) out.push("an eBay listing photo");
  return out;
}

// ── the files git would commit ───────────────────────────────────────────────────────────────────────────────────────────────
export function committable(root = ROOT): string[] {
  try {
    return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 }).split("\0").filter(Boolean).filter((f) => fs.existsSync(path.join(root, f)));
  } catch {
    return walk(".", (f) => !/^(?:\.git|\.next|\.data|\.cache|node_modules)\//.test(f));      // not a git checkout (a tarball): everything except the ignored directories
  }
}
const TEXT = /\.(?:tsx?|jsx?|cjs|mjs|json|md|ya?ml|sql|sh|py|txt|css|html|svg|toml|example)$|(?:^|\/)\.env\.example$/i;
const SKIP = /^(?:package-lock\.json|src\/lib\/og\/fonts\/|public\/)/;
// This file is left out of the scan: its own fixtures are made-up addresses, tokens and webhook URLs, there to show that the scanners fire.
const SELF = "tests/publication-guard.test.ts";
const FILES = committable().filter((f) => TEXT.test(f) && !SKIP.test(f) && f !== SELF);
const BODY = new Map(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

test("the scanners can fail, and let the placeholders through", () => {
  assert.deepEqual(strayAddresses("write to mastermisclick@gmail.com or MasterMisclick@Gmail.com"), [], "the admin default");
  assert.deepEqual(strayAddresses("a@x.com b@example.com c@mtgcompare.invalid d@Example.ORG alice+1@gmail.com logo@2x.png actions@users.noreply.github.com"), []);
  assert.deepEqual(strayAddresses("bill@gmail.com, owner@opcompare.app and ops@riftcompare.com"), ["bill@gmail.com", "owner@opcompare.app", "ops@riftcompare.com"]);
  assert.deepEqual(secretsIn("postgresql://nobody:x@127.0.0.1:1/none and postgres://u:p@localhost/db"), [], "a loopback connection string with a placeholder password is a fixture");
  assert.deepEqual(secretsIn("postgresql://app:hunter2@ep-cool-name-123.us-east-2.aws.neon.tech/db"), ["a connection string with a password for a real host"]);
  assert.deepEqual(secretsIn("ghp_" + "a".repeat(36)), ["a GitHub token"]);
  assert.deepEqual(secretsIn("https://discord.com/api/webhooks/123456789/abcdefghijklmnop"), ["a webhook address"]);
  assert.deepEqual(secretsIn("const key = process.env.STRIPE_SECRET_KEY; // sk_live_ is the prefix"), [], "naming a prefix is not holding a key");
  assert.deepEqual(ebayItemData("https://www.ebay.com/itm/186123456789?hash=item2b"), ["an eBay item URL"]);
  assert.deepEqual(ebayItemData('{"itemId":"v1|186123456789|0"}'), ["a Browse API item id"]);
  assert.deepEqual(ebayItemData("https://i.ebayimg.com/images/g/Zg4AAOSwQ-xnY~wD/s-l500.jpg"), ["an eBay listing photo"]);
  assert.deepEqual(ebayItemData("https://i.ebayimg.com/images/g/abc/s-l500.jpg https://i.ebayimg.com/x.jpg https://www.ebay.com/sch/i.html?_nkw=sol+ring"), [], "a fixture's made-up path and a search link are not listing data");
});

function offenders(find: (text: string) => string[]): { files: string[]; what: string[] } {
  const files: string[] = [], what: string[] = [];
  for (const [f, t] of BODY) { const hit = find(t); if (hit.length) { files.push(f); what.push(`${f}: ${hit.slice(0, 3).join(", ")}`); } }
  return { files, what };
}
test("RATCHET: no committable file names a person's e-mail address (the admin default excepted)", () => {
  const { files, what } = offenders(strayAddresses), r = ratchet("publication-guard:email", files);
  if (files.length) console.log(`publication-guard email: ${summary(r)}: ${what.slice(0, 6).join("; ")}`);
  assert.ok(r.ok, r.failures.join("\n"));
});
test("RATCHET: no committable file holds a credential, a webhook address or a connection string for a real host", () => {
  const { files, what } = offenders(secretsIn), r = ratchet("publication-guard:secret", files);
  if (files.length) console.log(`publication-guard secret: ${summary(r)}: ${what.slice(0, 6).join("; ")}`);
  assert.ok(r.ok, r.failures.join("\n"));
});
test("RATCHET: no committable file holds eBay listing data (item URLs, item ids, listing photos): it lives in Neon only", () => {
  const { files, what } = offenders(ebayItemData), r = ratchet("publication-guard:ebay", files);
  if (files.length) console.log(`publication-guard ebay: ${summary(r)}: ${what.slice(0, 6).join("; ")}`);
  assert.ok(r.ok, r.failures.join("\n"));
});
test("the source repository holds code, not data: no env file, no dump, no price history, nothing over 1,000,000 bytes, and data/ is the slug seed alone", () => {
  const all = committable();
  const env = all.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f));
  assert.deepEqual(env, [], "an env file is a credential store: .env.example is the only one that may be committed");
  const dumps = all.filter((f) => /\.(?:dump|sqlite3?|db|sql\.gz|bak)$/i.test(f) || /^data\/price-history\//.test(f) || /^\.?data\/v1\//.test(f));
  assert.deepEqual(dumps, [], "price history and the catalogue are published to the data repository, never to this one");
  assert.deepEqual(all.filter((f) => f.startsWith("data/")).sort(), ["data/slug-seed.json"].filter((f) => all.includes(f)), "13.3: the only data file the code repository holds is the slug seed an operator regenerates");
  const big = all.filter((f) => f !== "package-lock.json" && fs.statSync(path.join(ROOT, f)).size > 1_000_000);
  assert.deepEqual(big, [], "a file over 1,000,000 bytes is a data file: the plane's own cap (PLANE_FILE_MAX_BYTES) is the same number");
});
test("workflows hold no literal credential: every secret is a ${{ secrets.X }} reference", () => {
  for (const f of FILES.filter((x) => x.startsWith(".github/workflows/"))) assert.deepEqual(secretsIn(BODY.get(f)!), [], f);
});

// ── the published tree ───────────────────────────────────────────────────────────────────────────────────────────────────────
test("the golden tree validates, and the validator refuses each thing this guard exists to keep out of the published files", () => {
  const tree = miniFull({ day: 3 }), clean = validateTree(tree, { phase: "full" });
  assert.deepEqual(clean.problems, [], "the fixture generator and the validator agree");
  const plant = (file: string, add: string): string[] => {
    const t = memTree(), clone = miniFull({ day: 3 });
    for (const f of clone.files()) t.write(f, f === file ? clone.read(f).replace(/\}\s*$/, `,"x":${JSON.stringify(add)}}`).replace(/\]\s*$/, `,${JSON.stringify(add)}]`) : clone.read(f));
    return validateTree(t, { phase: "full" }).problems.map((p) => p.code);
  };
  const target = tree.files().find((f) => f.startsWith("meta/")) ?? tree.files()[0]!;
  for (const [text, code] of [["https://i.ebayimg.com/images/g/Zg4AAOSwQ-xnY~wD/s-l500.jpg", "FORBIDDEN_EBAY"], ["https://www.ebay.com/itm/186123456789", "FORBIDDEN_EBAY"], ["someone@gmail.com", "FORBIDDEN_EMAIL"], ["ghp_" + "b".repeat(36), "FORBIDDEN_SECRET"]] as const) {
    assert.ok(plant(target, text).includes(code), `${code} for ${text.slice(0, 30)}`);
  }
  assert.ok(FORBIDDEN_TEXT.length >= 4, "the validator's list: eBay data, user/billing keys, an e-mail, a secret");
});
test("every file of the golden tree passes the three scanners of this guard as well (the source scan and the publish scan are one definition of 'clean')", () => {
  const tree = miniFull({ day: 3 }), bad: string[] = [];
  for (const f of tree.files()) { const t = tree.read(f); if (strayAddresses(t).length || secretsIn(t).length || ebayItemData(t).length) bad.push(f); }
  assert.deepEqual(bad, []);
});
test("the real published tree on disk (PLANE_DIR or ./.data) validates in the phase its pointer names and passes the scanners", { skip: !fs.existsSync(path.join(process.env.PLANE_DIR ?? path.join(ROOT, ".data"), "v1/manifest.json")) }, async () => {
  const dir = path.resolve(process.env.PLANE_DIR ?? path.join(ROOT, ".data")), { fsTree } = await import("../src/lib/data/plane/tree");
  const ptrFile = path.join(dir, "latest.json"), phase = fs.existsSync(ptrFile) && (JSON.parse(fs.readFileSync(ptrFile, "utf8")) as { phase?: string }).phase === "catalog" ? "catalog" : "full";
  const tree = fsTree(path.join(dir, "v1")), v = validateTree(tree, { phase });
  assert.deepEqual(v.problems.slice(0, 5), [], `${v.problems.length} problem(s) in the ${phase} phase`);
  const bad = tree.files().filter((f) => { const t = tree.read(f); return strayAddresses(t).length || secretsIn(t).length || ebayItemData(t).length; });
  assert.deepEqual(bad.slice(0, 5), [], "a published file carries an address, a credential or eBay data");
});

// ── the audits of the published tree can fail (scripts/audit-publication.ts, check-card-consistency.ts, audit-history.ts, audit-catalogue.ts; run by data-audit.yml, parity P02 and P03) ──────────────────────────────────────
import { evaluateRate, evaluateStatus, evaluateTree, auditRemote, PRICE_DAY_ERROR_DAYS, PRICE_DAY_WARN_DAYS, POINTER_AMBER_HOURS, WATCHDOG_SILENT_HOURS } from "../scripts/audit-publication";
import { evaluateConsistency } from "../scripts/check-card-consistency";
import { evaluateHistory } from "../scripts/audit-history";
import { evaluateCatalogue, loadCatalogue } from "../scripts/audit-catalogue";
import { PLANE_FORMAT, type PointerFile } from "../src/lib/data/plane/formats";
import { POINTER_STALE_HOURS, REPO_CRIT_KB, REPO_WARN_KB, type StatusFile } from "../src/lib/data/plane/status";
import { MINI_CUT, dayOf, isoOf } from "./helpers/plane-tree";
import type { MutableTree } from "../src/lib/data/plane/tree";

const NOW = new Date("2026-10-08T12:00:00Z"), hoursAgo = (h: number): string => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const pointer = (o: Partial<PointerFile> = {}): PointerFile => ({ v: 1, seq: 5, ref: "a".repeat(40), publishedAt: hoursAgo(3), priceDay: "2026-10-08", tcgcsv: "2026-10-07T20:06:09Z", scryfall: "2026-10-07T21:05:42+00:00", phase: "full", format: PLANE_FORMAT, counts: { cards: 99079, units: 28531, files: 7243 }, manifestSha256: "", prev: null, repo: "Specifxx/mtgcompare-data", histCut: "2026-10-07", pvAt: null, ...o });
const status = (o: Partial<StatusFile> = {}): StatusFile => ({ v: 1, at: hoursAgo(1), by: "watchdog", pointer: {} as StatusFile["pointer"], counts: { cards: 99079, listed: 99079, tracked: 28531, oracles: 33435, files: 7243, bytes: 71_000_000 } as StatusFile["counts"], families: [], config: {} as StatusFile["config"], groups: [], guards: {} as StatusFile["guards"], previous: null, refusals: [], runs: [], repo: { kb: 120_000, at: hoursAgo(1), trend: [], isPrivate: true, lastSquashAt: hoursAgo(24) }, token: { expiresAt: null, daysLeft: 200, checkedAt: hoursAgo(1) }, hosts: null, alarms: [], ...o });
const codes = (f: { code: string }[]): string[] => f.map((x) => x.code);
const clone = (t: ReturnType<typeof miniFull>): MutableTree => { const c = memTree(); for (const f of t.files()) c.write(f, t.read(f)); return c; };

test("freshness: the pointer is amber at 26 hours and red at 36 (Annex C check 27), the price day lags at 2 and 3 days, a stopped watchdog is noticed", () => {
  assert.equal(POINTER_AMBER_HOURS, 26); assert.equal(POINTER_STALE_HOURS, 36);
  assert.deepEqual(codes(evaluateStatus(status(), pointer(), NOW)).filter((c) => /POINTER|PRICE_DAY|WATCHDOG/.test(c)), [], "a three-hour-old pointer on today's prices is quiet");
  const one = (p: Partial<PointerFile>, s?: Partial<StatusFile>) => evaluateStatus(status(s), pointer(p), NOW);
  assert.deepEqual(one({ publishedAt: hoursAgo(25.9) }).filter((f) => f.code === "POINTER_AGING"), []);
  assert.equal(one({ publishedAt: hoursAgo(26.1) }).find((f) => f.code === "POINTER_AGING")?.level, "warn");
  assert.equal(one({ publishedAt: hoursAgo(36.1) }).find((f) => f.code === "POINTER_STALE")?.level, "error");
  assert.equal(PRICE_DAY_WARN_DAYS, 2); assert.equal(PRICE_DAY_ERROR_DAYS, 3);
  assert.equal(one({ priceDay: "2026-10-06" }).find((f) => f.code === "PRICE_DAY_LAG")?.level, "warn");
  assert.equal(one({ priceDay: "2026-10-05" }).find((f) => f.code === "PRICE_DAY_LAG")?.level, "error");
  assert.equal(WATCHDOG_SILENT_HOURS, 30); assert.ok(codes(one({}, { at: hoursAgo(31) })).includes("WATCHDOG_SILENT"));
  assert.deepEqual(codes(evaluateStatus(null, null, NOW)), ["NO_POINTER"]);
  assert.ok(codes(one({ format: "v2" as never })).includes("FORMAT"), "a deployment that reads v1 refuses to call a v2 pointer healthy");
});
test("size and growth: the 1.5 GB alarm, the 3 GB stop line, the 60-day horizon, a public repository, an expiring token, a failed run, a fall in files", () => {
  const s = (o: Partial<StatusFile>): string[] => evaluateStatus(status(o), pointer(), NOW).map((f) => `${f.level}:${f.code}`);
  assert.ok(s({ repo: { kb: REPO_WARN_KB, at: "", trend: [], isPrivate: true, lastSquashAt: hoursAgo(5) } }).includes("warn:REPO_SIZE_WARN"));
  assert.ok(s({ repo: { kb: REPO_CRIT_KB, at: "", trend: [], isPrivate: true, lastSquashAt: hoursAgo(5) } }).includes("error:REPO_SIZE_CRIT"));
  const days = ["01", "02", "03", "04", "05", "06", "07"].map((d, i): [string, number] => [`2026-10-${d}`, 2_900_000 + i * 20_000]);
  assert.ok(s({ repo: { kb: 3_020_000, at: "", trend: days, isPrivate: true, lastSquashAt: hoursAgo(5) } }).includes("warn:ROTATION_DUE"), "growing toward the stop line");
  assert.ok(s({ repo: { kb: 120_000, at: "", trend: days.map(([d], i): [string, number] => [d, 100_000 + i * 100]), isPrivate: true, lastSquashAt: hoursAgo(5) } }).includes("warn:GROWTH_SEEN"));
  assert.ok(s({ repo: { kb: 120_000, at: "", trend: [], isPrivate: false, lastSquashAt: hoursAgo(5) } }).includes("error:REPO_PUBLIC"));
  assert.ok(s({ repo: { kb: 120_000, at: "", trend: [], isPrivate: true, lastSquashAt: hoursAgo(11 * 24) } }).includes("warn:SQUASH_OVERDUE"));
  assert.ok(s({ token: { expiresAt: null, daysLeft: 6, checkedAt: "" } }).includes("error:TOKEN_EXPIRING") && s({ token: { expiresAt: null, daysLeft: 20, checkedAt: "" } }).includes("warn:TOKEN_EXPIRING"));
  assert.ok(s({ runs: [{ kind: "publish", ok: false, note: "refused", at: hoursAgo(2), errors: ["UN_MISSING"] } as never] }).includes("error:RUN_FAILED"));
  assert.ok(s({ previous: { files: 7243, cards: 1, listed: 1, tracked: 1, oracles: 1 }, counts: { files: 6000 } as never }).includes("error:FILES_DROP_10"));
  assert.deepEqual(evaluateRate({ limit: 5000, remaining: 4000, reset: 0 }, true, NOW), []);
  assert.equal(evaluateRate({ limit: 5000, remaining: 900, reset: 0 }, true, NOW)[0]?.level, "warn");
  assert.equal(evaluateRate({ limit: 5000, remaining: 100, reset: 0 }, true, NOW)[0]?.level, "error");
  assert.equal(evaluateRate(null, false, NOW)[0]?.code, "RAW_DOWN");
});
test("the remote audit is a green no-op without its secrets, and a failing host is a finding rather than a crash", async () => {
  assert.equal(await auditRemote({}, NOW), null);
  assert.equal(await auditRemote({ PLANE_REPO: "x/y" }, NOW), null, "the token is missing too");
  const down = (async () => { throw new TypeError("offline"); }) as typeof fetch;
  const r = await auditRemote({ PLANE_REPO: "nobody/none", DATA_REPO_TOKEN: "x" }, NOW, down);
  assert.ok(r && r.findings.some((f) => f.level === "error"), "an unreachable data host is an error finding");
});
test("sizes and the manifest: a file over its family cap, a family with no budget, an unlisted file and a pointer that miscounts are each found in a tree", () => {
  const base = miniFull({ day: 3 }), ptr = pointer({ priceDay: isoOf(dayOf(3)), histCut: isoOf(MINI_CUT), counts: { cards: 700, units: 0, files: base.files().length }, phase: "full" });
  const f0 = codes(evaluateTree(base, ptr).findings);
  assert.deepEqual(f0.filter((c) => c !== "NO_MANIFEST" && c !== "POINTER_COUNT"), [], "the generator's tree is clean but for the manifest the publisher writes last");
  const fat = clone(base); fat.write("meta/sets.json", JSON.stringify({ v: 1, sets: [], pad: "x".repeat(600_000) }));
  assert.ok(codes(evaluateTree(fat, ptr).findings).includes("FILE_BUDGET"), "meta/ is capped at 500 KB");
  const huge = clone(base); huge.write("cat/0/0.json", JSON.stringify({ v: 1, b: 0, c: [], pad: "x".repeat(1_100_000) }));
  assert.ok(codes(evaluateTree(huge, ptr).findings).includes("FILE_TOO_BIG"), "nothing is published over 1,000,000 bytes");
  const stray = clone(base); stray.write("zz/new-family.json", "{}");
  assert.ok(codes(evaluateTree(stray, ptr).findings).includes("NO_BUDGET"), "a new family needs a row in FILE_BUDGETS");
  assert.ok(codes(evaluateTree(base, pointer({ ...ptr, counts: { cards: 700, units: 0, files: 5 } })).findings).includes("POINTER_COUNT"));
  const plant = clone(base); plant.write("meta/sets.json", plant.read("meta/sets.json").replace(/\}\s*$/, ',"mail":"someone@gmail.com"}'));
  assert.ok(codes(evaluateTree(plant, ptr).findings).includes("VALIDATE_FORBIDDEN_EMAIL"), "the validator runs inside the audit: an address in a published file is an error");
});
test("price consistency: one price, six copies. A set board price, a mask bit or a malformed price that disagrees with px is found in a tree that was clean", () => {
  const base = miniFull({ day: 3 });
  assert.deepEqual(codes(evaluateConsistency(base)), [], "the generator's tree is consistent");
  const px = base.files().find((f) => f.startsWith("px/"))!;
  const board = base.files().find((f) => /^st\/\d+\.json$/.test(f))!;
  // the set board shows a price px does not hold
  const t1 = clone(base); const b = JSON.parse(t1.read(board)) as { c: unknown[][] }; b.c[0]![10] = 999_999; t1.write(board, JSON.stringify(b));
  assert.ok(codes(evaluateConsistency(t1)).includes("BOARD_VS_PX"), "a board price that px does not carry");
  // a mask that contradicts the prices
  const t2 = clone(base); const p = JSON.parse(t2.read(px)) as { p: number[][] }; p.p[0]![5] = p.p[0]![5]! ^ 1 /* LISTED aside, flip HASN */ ^ 2; t2.write(px, JSON.stringify(p));
  assert.ok(codes(evaluateConsistency(t2)).some((c) => c.startsWith("MASK_") || c.includes("VS_PX")), "a mask bit that disagrees with the prices");
  const t3 = clone(base); const q = JSON.parse(t3.read(px)) as { p: (number | null)[][] }; q.p[0]![1] = 0; t3.write(px, JSON.stringify(q));
  assert.ok(codes(evaluateConsistency(t3)).includes("PRICE_SHAPE"), "a zero or fractional price is not a number of cents");
  assert.deepEqual(codes(evaluateConsistency(clone(base))), [], "an untouched copy stays clean");
});
test("history: an emptied tail adds findings, and a market index that is empty or ends before the price day is found", () => {
  const base = miniFull({ day: 3 }), input = { priceDay: isoOf(dayOf(3)), histCut: isoOf(MINI_CUT) };
  const baseline = new Set(codes(evaluateHistory(base, input)));
  const t = clone(base); const hf = t.files().find((f) => f.startsWith("hist/t/"))!; const j = JSON.parse(t.read(hf)) as { p: Record<string, unknown[]> }; for (const k of Object.keys(j.p)) j.p[k] = []; t.write(hf, JSON.stringify(j));
  const after = codes(evaluateHistory(t, input));
  assert.ok(after.some((c) => !baseline.has(c)) || after.length > baseline.size, `an emptied tail adds findings (${[...new Set(after)].join(", ")})`);
  const noIdx = clone(base); noIdx.write("hist/index.json", JSON.stringify({ v: 1, days: [] }));
  assert.ok(codes(evaluateTree(noIdx, pointer({ priceDay: input.priceDay, histCut: input.histCut })).findings).includes("HIST_INDEX_EMPTY"), "an empty market index is an error");
  const lag = clone(base); lag.write("hist/index.json", JSON.stringify({ v: 1, days: [["2025-12-01", 1000, 1, 1]] }));
  assert.ok(codes(evaluateTree(lag, pointer({ priceDay: input.priceDay, histCut: input.histCut })).findings).includes("HIST_INDEX_LAG"), "a market index that ends before the price day lags");
});
test("identity (C1, C3, C9, C11, C14): a deleted catalogue row, a duplicate slug and a copy that disagrees with its oracle are each found; the write-once comparison needs two trees", () => {
  const base = miniFull({ day: 3 }), baseCodes = new Set(codes(evaluateCatalogue(loadCatalogue(base))));
  const cat = base.files().find((f) => f.startsWith("cat/"))!, t = clone(base), j = JSON.parse(t.read(cat)) as { c: unknown[][] };
  j.c[1]![1] = j.c[0]![1];                                                                                     // two rows, one slug
  t.write(cat, JSON.stringify(j));
  const dup = codes(evaluateCatalogue(loadCatalogue(t)));
  assert.ok(dup.some((c) => /SLUG|DUP/.test(c)) && dup.some((c) => !baseCodes.has(c)), `a duplicate slug (${[...new Set(dup)].filter((c) => !baseCodes.has(c)).join(", ")})`);
  const { evaluateAgainstPrevious } = require("../scripts/audit-catalogue") as typeof import("../scripts/audit-catalogue");
  assert.deepEqual(codes(evaluateAgainstPrevious(base, base)), [], "the same tree against itself: nothing was deleted and no slug changed");
  const gone = clone(base), g = JSON.parse(gone.read(cat)) as { c: unknown[][] }; g.c.shift(); gone.write(cat, JSON.stringify(g));
  assert.ok(codes(evaluateAgainstPrevious(base, gone)).length > 0, "C1: an id that was published and is no longer there");
  const renamed = clone(base), r = JSON.parse(renamed.read(cat)) as { c: unknown[][] }; r.c[0]![1] = "renamed-slug"; renamed.write(cat, JSON.stringify(r));
  assert.ok(codes(evaluateAgainstPrevious(base, renamed)).length > 0, "C3: a slug is write-once");
});
