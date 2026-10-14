// The ops watch (2026-10-14): the rules that decide what the owner is e-mailed, the limit arithmetic, the job and Neon readers, the e-mails, and the boundaries (no page sends mail, the job never fails itself).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DIGEST_MAX_ITEMS, REMIND_HOURS, clip, digestOf, inboxTotal, limitCheck, overall, parseNotifyState, parseSnapshot, planNotifications, snapshotLevel, type HealthCheck, type InboxItem, type NotifyState } from "../src/lib/ops-health";
import { WATCHED_JOBS, jobCheck, readJobRuns } from "../src/lib/ops-jobs";
import { neonUsageChecks, neonUsageOf, readNeonUsage } from "../src/lib/neon-usage";
import { buildAlertEmail, buildInboxEmail } from "../src/lib/ops-mail";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const T0 = new Date("2026-10-14T12:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * 3_600_000);
const chk = (key: string, level: HealthCheck["level"]): HealthCheck => ({ key, group: "g", label: key, level, detail: `${key} is ${level}` });

test("limitCheck: amber from 70%, red from 90%, grey (never green) when unreadable", () => {
  const f = (used: number | null) => limitCheck({ key: "k", group: "g", label: "L", used, limit: 512, unit: "MB" });
  assert.equal(f(100).level, "ok"); assert.equal(f(358.4).level, "warn"); assert.equal(f(460.8).level, "bad"); assert.equal(f(600).level, "bad");
  assert.equal(f(null).level, "unknown"); assert.equal(f(Number.NaN).level, "unknown");
  assert.equal(f(256).detail, "256 of 512 MB used (50%)."); assert.equal(f(12.34).detail, "12.3 of 512 MB used (2.4%).");
  assert.equal(limitCheck({ key: "k", group: "g", label: "L", used: 4, limit: 5, unit: "GB", warnPct: 50, badPct: 95 }).level, "warn");
});

test("planNotifications: new, worse and reminder send; an unchanged problem and a grey check do not; recovery is announced once", () => {
  let state: NotifyState = {};
  let p = planNotifications([chk("a", "warn"), chk("b", "bad"), chk("c", "ok"), chk("d", "unknown")], state, T0);
  assert.deepEqual(p.send.map((s) => [s.check.key, s.reason]), [["a", "new"], ["b", "new"]], "grey and green never alert");
  state = p.next;
  p = planNotifications([chk("a", "warn"), chk("b", "bad")], state, at(1));
  assert.equal(p.send.length, 0, "the same problem an hour later is silent");
  p = planNotifications([chk("a", "bad"), chk("b", "bad")], state, at(2));
  assert.deepEqual(p.send.map((s) => [s.check.key, s.reason]), [["a", "worse"]], "amber to red is news"); state = p.next;
  p = planNotifications([chk("a", "bad"), chk("b", "bad")], state, at(2 + REMIND_HOURS.bad));
  assert.deepEqual(p.send.map((s) => s.reason).sort(), ["reminder", "reminder"], "red repeats after a day");
  p = planNotifications([chk("a", "unknown"), chk("b", "ok")], p.next, at(100));
  assert.deepEqual(p.recovered.map((c) => c.key), ["b"], "recovered is announced");
  assert.ok("a" in p.next && !("b" in p.next), "a failed read keeps the state; a recovered check leaves it");
  p = planNotifications([chk("a", "ok")], p.next, at(101));
  assert.deepEqual(p.recovered.map((c) => c.key), ["a"]);
  assert.deepEqual(planNotifications([chk("a", "ok")], p.next, at(102)).recovered, [], "and only once");
});

test("planNotifications: amber reminds every 72 h; red easing to amber is quiet and keeps its clock", () => {
  let p = planNotifications([chk("a", "warn")], {}, T0);
  assert.equal(planNotifications([chk("a", "warn")], p.next, at(71)).send.length, 0);
  assert.equal(planNotifications([chk("a", "warn")], p.next, at(72)).send[0]!.reason, "reminder");
  p = planNotifications([chk("b", "bad")], {}, T0);
  const eased = planNotifications([chk("b", "warn")], p.next, at(5));
  assert.equal(eased.send.length, 0); assert.equal(eased.next.b!.level, "warn"); assert.equal(eased.next.b!.at, p.next.b!.at);
});

test("parseNotifyState and parseSnapshot take garbage as empty, never throw", () => {
  assert.deepEqual(parseNotifyState("not json"), {}); assert.deepEqual(parseNotifyState(null), {}); assert.deepEqual(parseNotifyState('{"a":{"level":"warn","at":"x"},"b":{"level":"ok","at":"x"},"c":3}'), { a: { level: "warn", at: "x" } });
  assert.equal(parseSnapshot("{"), null); assert.equal(parseSnapshot('{"v":2}'), null); assert.equal(parseSnapshot(undefined), null);
  const s = { v: 1, at: T0.toISOString(), checks: [chk("a", "ok")], inbox: null };
  assert.deepEqual(parseSnapshot(JSON.stringify(s)), s);
});

test("the watch's own staleness is red after 3 hours; overall is the worst level; inbox totals add every queue", () => {
  const s = { v: 1 as const, at: T0.toISOString(), checks: [], inbox: null };
  assert.equal(snapshotLevel(s, at(2.9)), "ok"); assert.equal(snapshotLevel(s, at(3)), "bad"); assert.equal(snapshotLevel(null), "unknown");
  assert.equal(overall([chk("a", "ok"), chk("b", "warn"), chk("c", "unknown")]), "warn"); assert.equal(overall([chk("a", "ok"), chk("b", "unknown")]), "unknown");
  assert.equal(inboxTotal({ reports: 1, suggestions: 2, feedback: 3, contact: 4, support: 5 }), 15); assert.equal(inboxTotal(null), null);
});

test("jobCheck: two failed runs are red, one is amber, a stale schedule is amber, cancelled runs are ignored, no data is grey", () => {
  const spec = WATCHED_JOBS.find((j) => j.file === "import-prices.yml")!;
  const run = (c: string | null, hAgo: number) => ({ conclusion: c, at: at(-hAgo).toISOString() });
  assert.equal(jobCheck(spec, [run("success", 3), run("failure", 27)], T0).level, "ok");
  assert.equal(jobCheck(spec, [run("failure", 3), run("success", 27)], T0).level, "warn");
  assert.equal(jobCheck(spec, [run("failure", 3), run("timed_out", 27)], T0).level, "bad");
  assert.equal(jobCheck(spec, [run("cancelled", 1), run("success", 5)], T0).level, "ok", "a cancelled run says nothing");
  assert.equal(jobCheck(spec, [run("success", 40)], T0).level, "warn"); assert.match(jobCheck(spec, [run("success", 40)], T0).detail, /schedule may be off/);
  assert.equal(jobCheck(spec, [], T0).level, "unknown"); assert.equal(jobCheck(spec, null, T0).level, "unknown");
  assert.ok(WATCHED_JOBS.every((j) => fs.existsSync(path.join(ROOT, ".github/workflows", j.file))), "every watched workflow exists");
});

test("readJobRuns asks GitHub for finished runs with the run's token and degrades to null", async () => {
  let seen = ""; let auth = "";
  const ok = await readJobRuns("import-prices.yml", { env: { GITHUB_TOKEN: "tok", GITHUB_REPOSITORY: "o/r" }, fetchFn: async (u, i) => { seen = u; auth = i.headers.Authorization ?? ""; return { ok: true, json: async () => ({ workflow_runs: [{ conclusion: "success", updated_at: "2026-10-14T01:00:00Z" }, { conclusion: "failure", updated_at: "bad" }] }) }; } });
  assert.match(seen, /repos\/o\/r\/actions\/workflows\/import-prices\.yml\/runs\?status=completed/); assert.equal(auth, "Bearer tok"); assert.equal(ok!.length, 1, "an unparseable time is dropped");
  assert.equal(await readJobRuns("x.yml", { env: {}, fetchFn: async () => ({ ok: false, json: async () => ({}) }) }), null);
  assert.equal(await readJobRuns("x.yml", { env: {}, fetchFn: async () => { throw new Error("net"); } }), null);
});

test("Neon usage: parsed when present, grey when absent or unconfigured, never green on a guess", async () => {
  assert.deepEqual(neonUsageOf({ project: { data_transfer_bytes: 2.5e9, compute_time_seconds: 36000 } }), { transferBytes: 2.5e9, computeSeconds: 36000 });
  assert.deepEqual(neonUsageOf({ project: { name: "x" } }), { transferBytes: null, computeSeconds: null }); assert.deepEqual(neonUsageOf(null), { transferBytes: null, computeSeconds: null });
  const [tr, co] = neonUsageChecks({ transferBytes: 4.2e9, computeSeconds: 40 * 3600 });
  assert.equal(tr!.level, "warn"); assert.equal(tr!.detail, "4.2 of 5 GB used (84%)."); assert.equal(co!.level, "ok");
  assert.ok(neonUsageChecks("not-configured").every((c) => c.level === "unknown" && /NEON_API_KEY/.test(c.detail)));
  assert.ok(neonUsageChecks({ transferBytes: null, computeSeconds: null }).every((c) => c.level === "unknown"));
  assert.equal(await readNeonUsage({ env: {} }), "not-configured");
  let url = ""; const r = await readNeonUsage({ env: { NEON_API_KEY: "k", NEON_PROJECT_ID: "p1" }, fetchFn: async (u) => { url = u; return { ok: true, json: async () => ({ project: { data_transfer_bytes: 1 } }) }; } });
  assert.equal(url, "https://console.neon.tech/api/v2/projects/p1"); assert.deepEqual(r, { transferBytes: 1, computeSeconds: null });
  assert.equal(await readNeonUsage({ env: { NEON_API_KEY: "k", NEON_PROJECT_ID: "p" }, fetchFn: async () => ({ ok: false, json: async () => ({}) }) }), null);
});

test("the inbox digest counts everything, quotes a capped newest-first list, and clips long messages", () => {
  const mk = (n: number, kind: InboxItem["kind"] = "feedback"): InboxItem => ({ kind, at: at(n), title: `t${n}`, snippet: "s" });
  const items = [...Array.from({ length: 20 }, (_, i) => mk(i)), mk(99, "support")];
  const d = digestOf(items);
  assert.equal(d.total, 21); assert.equal(d.shown.length, DIGEST_MAX_ITEMS); assert.equal(d.shown[0]!.title, "t99"); assert.deepEqual(d.byKind, { feedback: 20, support: 1 });
  assert.equal(clip("a  b\n c"), "a b c"); assert.equal(clip("x".repeat(400)).length, 280); assert.equal(clip(null), "");
});

test("the e-mails escape visitor text, name the count, and link the admin", () => {
  const evil: InboxItem = { kind: "message", at: T0, title: "<script>x</script>", snippet: "a & b <img src=x onerror=1>" };
  const m = buildInboxEmail([evil], 4);
  assert.match(m.subject, /^\[MTG Compare\] 1 new in the inbox$/); assert.ok(!m.html.includes("<script>") && !m.html.includes("<img"), "escaped"); assert.match(m.html, /&lt;script&gt;/);
  assert.match(m.html, /\/admin\/inbox/); assert.match(m.text, /Contact message: <script>/, "the plain text is not HTML");
  const a = buildAlertEmail([{ check: { ...chk("a", "bad"), label: "Neon storage", detail: "470 of 512 MB used (91.8%).", href: "/admin/database" }, reason: "new" }], [chk("b", "ok")], T0);
  assert.match(a.subject, /1 thing needs attention \(1 urgent\)/); assert.match(a.html, /Neon storage/); assert.match(a.html, /\/admin\/database/); assert.match(a.html, /recovered/);
  assert.match(buildAlertEmail([], [chk("b", "ok")], T0).subject, /Back to normal/);
});

test("boundaries: no page or component can send mail; the watch job is a green no-op without secrets and always exits 0", () => {
  const walk = (d: string): string[] => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
  const bad = [...walk("src/app"), ...walk("src/components")].filter((f) => /ops-mail|ops-collect|ops-jobs|neon-usage|lib\/email"/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  assert.deepEqual(bad, [], "pages read the snapshot through admin-ops.ts only");
  assert.doesNotMatch(read("src/lib/admin-ops.ts"), /ops-mail|from "\.\/email"|sendEmail/, "the admin reader sends nothing");
  const yml = read(".github/workflows/ops-watch.yml");
  assert.match(yml, /cron: "23 \* \* \* \*"/); assert.match(yml, /Nothing configured/); assert.match(yml, /actions: read/); assert.match(yml, /OPS_ALERT_EMAIL: \$\{\{ vars\.OPS_ALERT_EMAIL \}\}/);
  assert.doesNotMatch(yml, /dispatches|--force|cancel-in-progress: true/);
  const src = read("scripts/ops-watch.ts");
  assert.match(src, /\.catch\(\(e\) => \{ warn\(/, "a failing watch is a warning"); assert.ok(src.indexOf("put(KEYS.health") < src.indexOf("sendEmail("), "the snapshot is written before any mail");
  assert.match(src, /if \(!to\)/); assert.doesNotMatch(src, /process\.exit|exitCode/, "it never fails the job");
});
