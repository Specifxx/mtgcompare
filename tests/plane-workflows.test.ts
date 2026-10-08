// Concurrency and tokens of the workflows that touch the data repository (critique DP-10, DP-20; section 6.6). Owner WP01b. Reads .github/workflows as text, like tests/deploy-cadence.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DATA_GROUP, DATA_WRITER_WORKFLOWS, DEMAND_SNAPSHOT_CRON, IMPORT_CRONS, KEEPALIVE_AFTER_DAYS, SQUASH_CRON, WATCHDOG_CRON, parseDailyCron } from "../src/lib/schedule";
import { runWatchdog } from "../scripts/data-watchdog";
import { hook } from "../scripts/data-hook";
import { authenticateGit, isMissingModule, loadStoreStage, readRemotePointer, remoteOf, verifyThroughRaw } from "../scripts/import";
import { revalidateSite } from "../src/lib/import";
import { runRollback } from "../scripts/data-rollback";
import { apiSquash, runSquash } from "../scripts/data-squash";
import { rebuildFiles } from "../scripts/history-rebuild";
import { publish, gitIn, listTags } from "../src/lib/data/plane/publisher";
import { decodeDense } from "../src/lib/data/plane/history-codec";
import { historyDelta, seriesOf, type DeltaFile } from "../src/lib/data/plane/history-delta";
import { addDays } from "../src/lib/history";
import { dayOf, miniFull } from "./helpers/plane-tree";
import { T0, at, checkout, day, head, input, mk, sh, showAt, tmpRoot } from "./helpers/publish-harness";

const ROOT = process.env.TEST_ROOT ?? path.resolve(__dirname, "..");
const DIR = path.join(ROOT, ".github/workflows");
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)) : [];
const read = (f: string): string => fs.readFileSync(path.join(DIR, f), "utf8");
const crons = (t: string): string[] => [...t.matchAll(/^\s*- cron:\s*"([^"]+)"/gm)].map((m) => m[1]!);
const WRITER_SCRIPTS = /scripts\/(?:import|publish-data|publish-demand|data-squash|data-watchdog|data-rollback)\.ts/;

test("every writer of the data repository is in the group `data-publish` with `queue: max` and never `cancel-in-progress: true`", () => {
  for (const f of DATA_WRITER_WORKFLOWS) { assert.ok(files.includes(f), `${f} exists`); const t = read(f);
    assert.match(t, new RegExp(`group:\\s*${DATA_GROUP}\\b`), `${f}: group ${DATA_GROUP}`); assert.match(t, /^\s+queue:\s*max\s*$/m, `${f}: queue: max (the default single slot lets a newer pending run cancel an older one)`);
    assert.ok(!/cancel-in-progress:\s*true/.test(t), `${f}: queue: max and cancel-in-progress: true is a workflow validation error`); }
});
test("a workflow that runs a writer script, or names the data token, must be in the group; no other workflow joins it or pushes to the data repository", () => {
  for (const f of files) { const t = read(f); const writes = WRITER_SCRIPTS.test(t); const inGroup = new RegExp(`group:\\s*${DATA_GROUP}\\b`).test(t);
    if (writes) assert.ok(inGroup, `${f} runs a writer script outside the ${DATA_GROUP} group`);
    if (inGroup) assert.ok((DATA_WRITER_WORKFLOWS as readonly string[]).includes(f), `${f} joins the group but is not a declared writer`);
    if (/DATA_REPO_TOKEN/.test(t) && !writes && !/plane-checkout\.sh|data-hook|publish-demand/.test(t)) assert.ok(/plane-checkout\.sh|scripts\/data-hook\.ts/.test(t), `${f} names the data token without a reader or hook script`); }
  const ebay = files.find((f) => /^ebay/.test(f)); if (ebay) assert.ok(!new RegExp(`group:\\s*${DATA_GROUP}\\b`).test(read(ebay)), "the eBay workflow writes only Neon: it is NOT in the data group, so it can neither cancel nor delay an import");
});
test("the data repository is written with DATA_REPO_TOKEN (GITHUB_TOKEN covers only the workflow's own repository) and the workflows' default permission is read", () => {
  for (const f of DATA_WRITER_WORKFLOWS) { const t = read(f); assert.match(t, /DATA_REPO_TOKEN:\s*\$\{\{\s*secrets\.DATA_REPO_TOKEN\s*\}\}/, f); assert.match(t, /PLANE_REPO:\s*\$\{\{\s*vars\.PLANE_REPO\s*\}\}/, f); assert.match(t, /^permissions:\s*\n\s+contents:\s*read/m, `${f}: top-level permissions are read-only`); assert.ok(!/NEXT_PUBLIC_/.test(t.replace(/#.*$/gm, "")), `${f}: no NEXT_PUBLIC secret`); }
});
test("the crons are the constants of schedule.ts; the watchdog never runs at minute 0; the squash is weekly; the import follows the sources by at least 75 minutes", () => {
  assert.deepEqual(crons(read("import-prices.yml")), [...IMPORT_CRONS]); assert.deepEqual(crons(read("data-squash.yml")), [SQUASH_CRON]); assert.deepEqual(crons(read("data-watchdog.yml")), [WATCHDOG_CRON]); assert.deepEqual(crons(read("demand-snapshot.yml")), [DEMAND_SNAPSHOT_CRON]);
  assert.notEqual(parseDailyCron(WATCHDOG_CRON)!.minute, 0); assert.equal(parseDailyCron(SQUASH_CRON)!.weekday, 0);
  const first = parseDailyCron(IMPORT_CRONS[0])!; assert.ok(first.hour * 60 + first.minute >= 20 * 60 + 6 + 75, "TCGCSV rebuilds at about 20:06 and Scryfall at about 21:05"); const [a, b, c] = IMPORT_CRONS.map((x) => parseDailyCron(x)!); assert.equal(b!.hour * 60 + b!.minute - (a!.hour * 60 + a!.minute), 30); assert.equal(c!.hour * 60 + c!.minute - (b!.hour * 60 + b!.minute), 30);
  assert.ok(files.includes("data-rollback.yml") && files.includes("data-hook.yml")); assert.deepEqual(crons(read("data-rollback.yml")), []); assert.deepEqual(crons(read("data-hook.yml")), []);
});
test("DP-20: the watchdog carries a keepalive job that writes the CODE repository only, after 30 days, with no [deploy] in the subject", () => {
  const t = read("data-watchdog.yml"); assert.match(t, /keepalive:/); assert.match(t, /contents:\s*write/); assert.ok(t.includes(`-ge ${KEEPALIVE_AFTER_DAYS}`)); const subject = /git commit [^\n]*-m "([^"]+)"/.exec(t)![1]!; assert.ok(!/\[deploy\]/i.test(subject), subject);
  assert.match(t, /ref:\s*main/);
});
test("the pointed tree is read by `plane-checkout.sh`: the pointed commit, not the branch head, and the token never in the URL", () => {
  const sh = fs.readFileSync(path.join(ROOT, "scripts/plane-checkout.sh"), "utf8"); assert.match(sh, /latest\.json/); assert.match(sh, /extraheader/); assert.ok(!/https:\/\/[^"\s]*\$\{?DATA_REPO_TOKEN/.test(sh), "no https://TOKEN@github.com/ URL");
});
test("a step or job name is a valid YAML plain scalar: no `: ` and no ` #` inside an unquoted name (js-yaml rejected data-watchdog.yml for exactly this; verify-dp.sh parses every workflow for real)", () => {
  for (const f of files) for (const [i, line] of read(f).split("\n").entries()) {
    const m = /^\s*(?:-\s+)?name:\s+(.*)$/.exec(line); if (!m) continue; const v = m[1]!.trim();
    if (/^["'|>]/.test(v)) continue;
    assert.ok(!/:\s/.test(v) && !/\s#/.test(v) && !/^[\[{&*!%@`]/.test(v), `${f}:${i + 1}: quote this name: ${v}`);
  }
});

// ── the cores of the data-* scripts, run against a local bare repository with a fake fetch (owner WP01b) ─────────────────────────────────────────────────────────────────────
// What cannot be run here: the GitHub host probes (raw, the contents API, the token expiry header), the sampled manifest check and the API-created squash against the real API: they need github.com. Their request shapes are asserted below with a fake fetch.
const wenv = (m: ReturnType<typeof mk>, extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({ PLANE_REMOTE: m.remote, PLANE_REPO: "o/data", SITE_URL: "https://site.test", ...extra }) as unknown as NodeJS.ProcessEnv;
const siteServing = (ref: string): typeof fetch => (async (u: string) => { assert.equal(String(u), "https://site.test/api/data-status"); return new Response(JSON.stringify({ ref })); }) as unknown as typeof fetch;
/** git dates every commit by the environment: a publish made "on day n" is dated T0 + n days, so tag ages and commit ages are the test's, not the wall clock's. */
async function onDay<T>(n: number, fn: () => Promise<T>): Promise<T> {
  const was = [process.env.GIT_COMMITTER_DATE, process.env.GIT_AUTHOR_DATE]; const iso = at(n)().toISOString(); process.env.GIT_COMMITTER_DATE = iso; process.env.GIT_AUTHOR_DATE = iso;
  try { return await fn(); } finally { for (const [k, v] of [["GIT_COMMITTER_DATE", was[0]], ["GIT_AUTHOR_DATE", was[1]]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
const statusOf = (m: ReturnType<typeof mk>): { at: string; by: string; alarms: { code: string; level: string; since: string }[]; runs: { kind: string; note: string }[]; pointer: { seq: number; ref: string }; repo?: { lastSquashAt: string | null } } => JSON.parse(showAt(m, "data", "status.json"));

test("watchdog: a quiet hour writes nothing; an alarm that appears, changes or clears is written once; an ongoing alarm keeps its `since`; the pointer is never moved", async () => {
  const m = mk(); try {
    await onDay(0, () => publish(input(m, 0, "full"))); const ptr = head(m); const commits = (): string => sh(m.root, "--git-dir", m.remote, "rev-list", "--count", "data");
    const run = (now: Date, served: string) => runWatchdog({ fetch: siteServing(served), now: () => now, env: wenv(m), workdir: path.join(m.root, "watch") });
    const base = commits(); const quiet = await run(new Date(T0 + 3_600_000), ptr.ref); assert.deepEqual(quiet.alarms, []); assert.equal(quiet.wrote, false); assert.equal(commits(), base, "no commit");
    const behind = await run(new Date(T0 + 40 * 60_000), "0".repeat(40)); assert.deepEqual(behind.alarms.map((a) => a.code), ["POINTER_BEHIND"]); assert.equal(behind.wrote, true);
    const s1 = statusOf(m); assert.equal(s1.by, "watchdog"); assert.deepEqual(s1.alarms.map((a) => `${a.code}:${a.level}`), ["POINTER_BEHIND:warn"]); assert.equal(head(m).ref, ptr.ref, "the watchdog never moves the pointer"); assert.equal(head(m).seq, 1);
    const since = s1.alarms[0]!.since; const again = await run(new Date(T0 + 50 * 60_000), "0".repeat(40)); assert.equal(again.wrote, false, "the same alarm on the same day is not written again"); assert.equal(again.alarms[0]!.since, since, "the alarm keeps the time it was first raised");
    const cleared = await run(new Date(T0 + 60 * 60_000), ptr.ref); assert.deepEqual(cleared.alarms, []); assert.equal(cleared.wrote, true, "a cleared alarm is written"); assert.deepEqual(statusOf(m).alarms, []);
    const stale = await run(new Date(T0 + 40 * 3_600_000), ptr.ref); assert.ok(stale.alarms.some((a) => a.code === "STALE_36H" && a.level === "error")); assert.equal(stale.wrote, true);
    const nextDay = await run(new Date(T0 + 60 * 3_600_000), ptr.ref); assert.equal(nextDay.wrote, true, "a new day is written even when the alarms did not change (the admin panel's heartbeat)"); assert.equal(statusOf(m).alarms.find((a) => a.code === "STALE_36H")!.since, stale.alarms.find((a) => a.code === "STALE_36H")!.since);
    assert.match(sh(m.root, "--git-dir", m.remote, "log", "-1", "--format=%s", "data"), /^status 2026-01-0\dT\d\d:\d\d$/); assert.ok(!/\[deploy\]/i.test(sh(m.root, "--git-dir", m.remote, "log", "--format=%s", "data")));
  } finally { m.done(); }
});
test("watchdog: a data commit that no pointer names (a publish that died between commit A and the pointer) is reported after 30 minutes, not before", async () => {
  const m = mk(); try {
    await onDay(0, () => publish(input(m, 0, "full"))); await assert.rejects(onDay(1, () => publish(input(m, 1, "full", { hooks: { afterCommitA: () => { throw new Error("killed between A and B"); } } }))), /killed/);
    const run = (mins: number) => runWatchdog({ fetch: siteServing(head(m).ref), now: () => new Date(T0 + 86_400_000 + mins * 60_000), env: wenv(m), workdir: path.join(m.root, "watch") });
    assert.ok(!(await run(20)).alarms.some((a) => a.code === "UNPOINTED_DATA_COMMIT"), "20 minutes: the publisher may still be verifying");
    const late = await run(45); const a = late.alarms.find((x) => x.code === "UNPOINTED_DATA_COMMIT"); assert.ok(a && a.level === "warn", JSON.stringify(late.alarms)); assert.equal(head(m).seq, 1, "readers still see the previous seq");
  } finally { m.done(); }
});

test("rollback: ONE pointer commit to an older retained data commit (by seq or by sha), the root status shows it, the data branch gains no data commit", async () => {
  const m = mk(); try {
    await onDay(0, () => publish(input(m, 0, "full"))); const first = head(m); await onDay(1, () => publish(input(m, 1, "catalog"))); await onDay(1, () => publish(input(m, 1, "full"))); const third = head(m);
    const dataCommits = (): number => sh(m.root, "--git-dir", m.remote, "log", "--format=%s", "data").split("\n").filter((l) => /^data \d/.test(l)).length; const before = dataCommits(); assert.equal(before, 3);
    const r = await runRollback(1, wenv(m), { skipHook: true, now: at(2), workdir: path.join(m.root, "rb") }); assert.equal(r.seq, 4); assert.equal(r.ref, first.ref);
    const p = head(m); assert.equal(p.seq, 4); assert.equal(p.ref, first.ref); assert.equal(p.prev, third.ref); assert.equal(p.priceDay, day(0)); assert.equal(p.phase, "full", "the rolled-back pointer carries that commit's own phase and day");
    const st = statusOf(m); assert.equal(st.runs[0]!.kind, "rollback"); assert.equal(st.pointer.seq, 4); assert.equal(st.pointer.ref, first.ref); assert.equal(dataCommits(), before, "no new data commit");
    const forward = await runRollback(third.ref.slice(0, 9), wenv(m), { skipHook: true, now: at(2, 1), workdir: path.join(m.root, "rb2") }); assert.equal(forward.seq, 5); assert.equal(head(m).ref, third.ref, "a sha prefix names the target; rolling forward is the same one commit");
    await assert.rejects(runRollback(99, wenv(m), { skipHook: true, now: at(3), workdir: path.join(m.root, "rb3") }), /no retained data commit for 99/); assert.equal(head(m).seq, 5, "an unknown target changes nothing");
  } finally { m.done(); }
});

test("squash: the data branch becomes one parentless commit (plus the status commit), tags older than 7 days go, the tags of pointer.ref and pointer.prev stay, the pointer is untouched; a stuck pointer skips it", async () => {
  const m = mk(); try {
    await onDay(0, () => publish(input(m, 0, "full"))); await onDay(8, () => publish(input(m, 8, "full"))); await onDay(9, () => publish(input(m, 9, "full"))); const ptr = head(m);
    const tagNames = (): string[] => listTags(gitIn(m.remote)).map((t) => t.name).sort(); assert.equal(tagNames().length, 3);
    const r = await runSquash(wenv(m), { now: at(9, 2), workdir: path.join(m.root, "sq") }); assert.equal(r.skipped, null); assert.equal(r.mode, "push"); assert.deepEqual(r.deleted, [`d-${day(0)}-1`]);
    assert.deepEqual(tagNames(), [`d-${day(8)}-2`, `d-${day(9)}-3`].sort(), "the tags of the pointed commit and its predecessor stay"); assert.equal(sh(m.root, "--git-dir", m.remote, "rev-list", "--count", "data"), "2", "one parentless commit and the status commit on top");
    assert.deepEqual(head(m), ptr, "latest.json is byte for byte what it was"); for (const ref of [ptr.ref, ptr.prev!]) assert.equal(sh(m.root, "--git-dir", m.remote, "cat-file", "-t", ref), "commit");
    const st = statusOf(m); assert.equal(st.by, "squash"); assert.equal(st.runs[0]!.kind, "squash"); assert.equal(st.repo?.lastSquashAt, at(9, 2)().toISOString());
    // a publisher stuck for 10 days: the squash refuses to run at all
    const stuck = await runSquash(wenv(m), { now: at(20), workdir: path.join(m.root, "sq2") }); assert.equal(stuck.mode, "skipped"); assert.match(stuck.skipped ?? "", /the pointer is 1\d\.\d days old/); assert.deepEqual(stuck.deleted, []); assert.equal(sh(m.root, "--git-dir", m.remote, "rev-list", "--count", "data"), "2");
  } finally { m.done(); }
});
test("squash through the API: GET ref, GET commit, POST a parentless commit with the SAME tree, PATCH the ref; the token is in a header, never in a URL; any refusal falls back (null)", async () => {
  const calls: { method: string; url: string; body?: Record<string, unknown>; auth: string }[] = []; const SHA = (c: string): string => c.repeat(40);
  const json = (b: unknown, status = 200): Response => new Response(JSON.stringify(b), { status });
  const fake = (fail?: RegExp): typeof fetch => (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"; calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: String((init?.headers as Record<string, string>).Authorization) });
    if (fail?.test(`${method} ${url}`)) return json({ message: "no" }, 422);
    if (method === "GET" && /git\/ref\/heads\/data$/.test(String(url))) return json({ object: { sha: SHA("a") } });
    if (method === "GET" && new RegExp(`git/commits/${SHA("a")}$`).test(String(url))) return json({ tree: { sha: SHA("b") } });
    if (method === "POST" && /git\/commits$/.test(String(url))) return json({ sha: SHA("c") });
    if (method === "PATCH" && /git\/refs\/heads\/data$/.test(String(url))) return json({});
    return json({}, 404);
  }) as unknown as typeof fetch;
  const sha = await apiSquash("o/data", "data", "TOKEN123", fake(), "data squash 2026-01-14"); assert.equal(sha, SHA("c"));
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url.replace("https://api.github.com/repos/o/data/", "")}`), ["GET git/ref/heads/data", `GET git/commits/${SHA("a")}`, "POST git/commits", "PATCH git/refs/heads/data"]);
  assert.deepEqual(calls[2]!.body, { message: "data squash 2026-01-14", tree: SHA("b"), parents: [] }); assert.deepEqual(calls[3]!.body, { sha: SHA("c"), force: true });
  for (const c of calls) { assert.equal(c.auth, "Bearer TOKEN123"); assert.ok(!c.url.includes("TOKEN123")); }
  calls.length = 0; assert.equal(await apiSquash("o/data", "data", "t", fake(/^POST /), "m"), null); assert.equal(calls.length, 3, "a refused commit stops before the ref moves");
  calls.length = 0; assert.equal(await apiSquash("o/data", "data", "t", fake(/^PATCH /), "m"), null); assert.equal(await apiSquash("o/data", "data", "t", (async () => { throw new Error("network"); }) as unknown as typeof fetch, "m"), null);
});

test("history-rebuild: the daily delta files rebuild every series day for day into v4 base files, trimmed to the 730-day window", () => {
  const tree = miniFull({ day: 9 }); const live = seriesOf(tree); const deltas: DeltaFile[] = []; for (let d = 0; d <= 9; d++) deltas.push(historyDelta(tree, dayOf(d), d === 0, live));
  const files = rebuildFiles(deltas); assert.ok(files.size > 0); const back = new Map<number, number[]>();
  for (const [rel, text] of files) { assert.match(rel, /^hist\/p\/\d+\/\d+\.json$/); const j = JSON.parse(text) as { v: number; p: Record<string, number[]> }; assert.equal(j.v, 4); for (const [k, s] of Object.entries(j.p)) { const [id, f] = k.split("."); back.set(Number(id) * 2 + Number(f), s); } }
  let compared = 0; for (const [uid, s] of live) { const r = back.get(uid); if (!r) continue; compared++; const tail = (x: number[]): (number | null)[][] => decodeDense(x as never).filter((p) => p.day >= dayOf(0) && p.cents != null).map((p) => [p.day, p.cents]); assert.deepEqual(tail(r), tail(s as unknown as number[]), `uid ${uid}`); }
  assert.ok(compared > 100, `${compared} series rebuilt`);
  // the window: a series is cut to the 730 days that end on the last delta day; a unit that left tracking years before carries no price inside it
  const w: DeltaFile[] = [{ v: 1, day: 20240101, full: true, u: [[2, 500], [4, 900]] }, { v: 1, day: 20240102, u: [[2, 510], [4, null]] }, { v: 1, day: 20260401, u: [[2, 520]] }];
  const out = rebuildFiles(w); const all: Record<string, number[]> = {}; for (const text of out.values()) Object.assign(all, (JSON.parse(text) as { p: Record<string, number[]> }).p);
  const dense = decodeDense(all["1.0"] as never); assert.equal(dense.length, 730); assert.equal(dense[0]!.day, addDays(20260401, -729)); assert.equal(dense.at(-1)!.day, 20260401); assert.equal(dense.at(-1)!.cents, 520);
  assert.ok(!all["2.0"] || decodeDense(all["2.0"] as never).every((p) => p.cents == null), "the unit that left tracking in January 2024 has no price inside the 2025-2026 window");
  assert.equal(rebuildFiles([]).size, 0);
});

// ── S12 step 5 (verification through raw), S13 (the warm call), the git token ─────────────────────────────────────────────────────────────────────────────────────────
const rawServing = (tree: ReturnType<typeof checkout>, o: { corrupt?: RegExp; missing?: RegExp; failFirst?: number } = {}): { f: typeof fetch; urls: string[]; headers: string[] } => {
  const urls: string[] = [], headers: string[] = []; let failed = 0;
  const f = (async (url: string, init?: RequestInit) => {
    urls.push(String(url)); headers.push(String((init?.headers as Record<string, string> | undefined)?.Authorization));
    const m = /^https:\/\/raw\.githubusercontent\.com\/o\/data\/([0-9a-f]{40})\/v1\/(.+)$/.exec(String(url)); if (!m) return new Response("?", { status: 400 });
    if (failed < (o.failFirst ?? 0)) { failed++; return new Response("not yet", { status: 404 }); }
    if (o.missing?.test(m[2]!) || !tree.has(m[2]!)) return new Response("no", { status: 404 });
    return new Response(o.corrupt?.test(m[2]!) ? `${tree.read(m[2]!)} ` : tree.read(m[2]!));
  }) as unknown as typeof fetch;
  return { f, urls, headers };
};
test("verification through raw: every file of the manifest (status.json is not in it) matches its sha-256 prefix after a SECOND publish; a corrupt file, a missing manifest and propagation delay are told apart", async () => {
  const m = mk(); try {
    await publish(input(m, 0, "full")); await publish(input(m, 1, "catalog")); const ptr = head(m); const tree = checkout(m, ptr.ref);
    const env = { PLANE_REPO: "o/data", DATA_REPO_TOKEN: "ghp_SECRET_TOKEN" } as unknown as NodeJS.ProcessEnv; const man = JSON.parse(tree.read("manifest.json")) as { files: [string, number, string][] };
    assert.ok(!man.files.some(([rel]) => rel === "status.json" || rel === "manifest.json"), "the manifest lists data files only"); assert.ok(man.files.length > 100);
    const ok = rawServing(tree); await verifyThroughRaw(ptr.ref, env, ok.f, { sample: 100_000, sleepMs: 1, maxMs: 1000 }); assert.equal(ok.urls.length, man.files.length + 1, "the manifest and every file it lists");
    assert.ok(ok.headers.every((h) => h === "token ghp_SECRET_TOKEN") && ok.urls.every((u) => !u.includes("ghp_")), "the token is a header, never in the URL");
    await assert.rejects(verifyThroughRaw(ptr.ref, env, rawServing(tree, { corrupt: /^cat\// }).f, { sample: 100_000, sleepMs: 1, maxMs: 30 }), /cat\/.*sha-256 differs from the manifest/);
    await assert.rejects(verifyThroughRaw(ptr.ref, env, rawServing(tree, { missing: /^manifest\.json$/ }).f, { sleepMs: 1, maxMs: 30 }), /verification through raw failed: Error: manifest\.json: HTTP 404/);
    const slow = rawServing(tree, { failFirst: 3 }); await verifyThroughRaw(ptr.ref, env, slow.f, { sample: 20, sleepMs: 1, maxMs: 2000 }); assert.ok(slow.urls.length > 20, "three 404s while raw propagates, then the commit verifies");
  } finally { m.done(); }
});
test("the warm call: POST /api/data-warm with the cron secret and the ref, then poll /api/data-status until the site serves it; it never throws and says nothing without its two variables", async () => {
  const was = [process.env.REVALIDATE_URL, process.env.CRON_SECRET]; const logs: string[] = []; const log = (...a: unknown[]): void => { logs.push(a.join(" ")); };
  const pointer = { ref: "a".repeat(40), seq: 7 } as never; const calls: string[] = [];
  const served = ["b".repeat(40), "b".repeat(40), "a".repeat(40)];
  const f = (async (url: string, init?: RequestInit) => { calls.push(`${init?.method ?? "GET"} ${url} ${String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "")} ${String(init?.body ?? "")}`); return String(url).endsWith("/api/data-status") ? new Response(JSON.stringify({ ref: served.shift() })) : new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
  try {
    delete process.env.REVALIDATE_URL; delete process.env.CRON_SECRET; await revalidateSite(log, { pointer, fetch: f, pollMs: 1 }); assert.equal(calls.length, 0); assert.match(logs[0]!, /skipped/);
    process.env.REVALIDATE_URL = "https://site.test/anything/else"; process.env.CRON_SECRET = "cron-secret-value";
    await revalidateSite(log, { pointer, fetch: f, pollMs: 1, maxMs: 5000 });
    assert.deepEqual(calls, [`POST https://site.test/api/data-warm Bearer cron-secret-value {"ref":"${"a".repeat(40)}"}`, "GET https://site.test/api/data-status  ", "GET https://site.test/api/data-status  ", "GET https://site.test/api/data-status  "]);
    assert.ok(logs.some((l) => /the site serves aaaaaaa/.test(l)) && !logs.some((l) => l.includes("cron-secret-value")), "the secret is never logged");
    const dead = (async () => { throw new Error("down"); }) as unknown as typeof fetch; logs.length = 0; await revalidateSite(log, { pointer, fetch: dead, pollMs: 1, maxMs: 20 });
    assert.ok(logs.some((l) => /warm failed: down/.test(l)) && logs.some((l) => /did not report aaaaaaa/.test(l)), "an unreachable site is reported, not thrown");
    // the data-hook script: the pointer through raw with the token, then the same warm call
    calls.length = 0; served.push("a".repeat(40)); const ptrFetch = (async (url: string, init?: RequestInit) => String(url) === "https://raw.githubusercontent.com/o/data/data/latest.json" ? new Response(JSON.stringify({ ref: "a".repeat(40), seq: 7 })) : f(url, init)) as unknown as typeof fetch;
    assert.equal(await hook({ PLANE_REPO: "o/data", DATA_REPO_TOKEN: "t" } as unknown as NodeJS.ProcessEnv, ptrFetch), true); assert.ok(calls.some((c) => c.startsWith("POST https://site.test/api/data-warm")));
    assert.equal(await hook({ PLANE_REPO: "o/data" } as unknown as NodeJS.ProcessEnv, ptrFetch), false, "no token, no pointer, nothing to announce");
  } finally { for (const [k, v] of [["REVALIDATE_URL", was[0]], ["CRON_SECRET", was[1]]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
});
test("git access: the write token travels in an http.extraheader for github.com only, is masked in the log, and is never in the remote URL; a local remote needs none; the pointer is read through raw with the token", async () => {
  const keys = ["GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"] as const; const was = keys.map((k) => process.env[k]); const out: string[] = []; const orig = console.log; console.log = (...a: unknown[]): void => { out.push(a.join(" ")); };
  try {
    const env = { PLANE_REPO: "o/data", DATA_REPO_TOKEN: "ghp_SECRET_TOKEN" } as unknown as NodeJS.ProcessEnv; const r = remoteOf(env); assert.deepEqual(r, { remote: "https://github.com/o/data.git", repo: "o/data", github: true }); assert.ok(!r.remote.includes("ghp_"));
    for (const k of keys) delete process.env[k]; authenticateGit({ ...env, PLANE_REMOTE: "/tmp/some/bare.git" } as unknown as NodeJS.ProcessEnv); assert.equal(process.env.GIT_CONFIG_COUNT, undefined, "a local remote gets no header");
    authenticateGit({ PLANE_REPO: "o/data" } as unknown as NodeJS.ProcessEnv); assert.equal(process.env.GIT_CONFIG_COUNT, undefined, "no token, no header");
    authenticateGit(env); assert.equal(process.env.GIT_CONFIG_COUNT, "1"); assert.equal(process.env.GIT_CONFIG_KEY_0, "http.https://github.com/.extraheader");
    assert.equal(process.env.GIT_CONFIG_VALUE_0, `AUTHORIZATION: basic ${Buffer.from("x-access-token:ghp_SECRET_TOKEN").toString("base64")}`); assert.ok(!String(process.env.GIT_CONFIG_VALUE_0).includes("ghp_SECRET_TOKEN"), "base64, not the token itself");
    assert.ok(out.filter((l) => l.startsWith("::add-mask::")).length === 2 && out.every((l) => !l.includes("ghp_SECRET_TOKEN")), "both forms are masked and the plain token is never printed");
    const seen: string[] = []; const f = (async (u: string, init?: RequestInit) => { seen.push(`${u} ${String((init?.headers as Record<string, string>).Authorization)}`); return new Response(JSON.stringify({ seq: 3, ref: "c".repeat(40) })); }) as unknown as typeof fetch;
    assert.equal((await readRemotePointer(env, f))?.seq, 3); assert.deepEqual(seen, ["https://raw.githubusercontent.com/o/data/data/latest.json token ghp_SECRET_TOKEN"]);
    assert.equal(await readRemotePointer({ PLANE_REPO: "o/data" } as unknown as NodeJS.ProcessEnv, f), null, "no token: the gate decides from the checkout"); assert.equal(await readRemotePointer(env, (async () => new Response("", { status: 404 })) as unknown as typeof fetch), null);
  } finally { console.log = orig; keys.forEach((k, i) => { if (was[i] === undefined) delete process.env[k]; else process.env[k] = was[i]; }); }
});
test("the store stage is loaded by name: a module that is not there means no store stage (the day stays at phase catalog); one that is there and broken fails the run instead of being skipped every day behind a green workflow", async () => {
  const t = tmpRoot("store-stage-"); try {
    const w = (name: string, text: string): string => { const f = path.join(t.root, name); fs.writeFileSync(f, text); return f; };
    const good = w("good-store-import.ts", "export async function importStores() { return []; }\n"), reg = path.join(t.root, "no-registry");
    const needsMissing = w("needs-missing-store-import.ts", 'import "./not-there-at-all";\nexport async function importStores() { return []; }\n'), syntax = w("syntax-store-import.ts", "export const = ;\n"), throws = w("throws-store-import.ts", 'throw new Error("boom at load");\n');
    assert.deepEqual(await loadStoreStage({ stage: path.join(t.root, "missing-store-import"), registry: reg }), {}, "no module: no store stage");
    assert.deepEqual(await loadStoreStage({ stage: w("empty-store-import.ts", "export const x = 1;\n"), registry: reg }), {}, "a module without importStores (the OP baseline) is no store stage either");
    const ok = await loadStoreStage({ stage: good, registry: reg }); assert.equal(typeof ok?.importStores, "function"); assert.equal(ok?.storeId, undefined, "no registry yet: the F2c hold cannot map a store to its id, and the stage still runs");
    await assert.rejects(loadStoreStage({ stage: needsMissing, registry: reg }), /not-there-at-all/, "a module that is there but imports one that is not is broken, not absent");
    await assert.rejects(loadStoreStage({ stage: syntax, registry: reg }), "a syntax error is an error");
    await assert.rejects(loadStoreStage({ stage: throws, registry: reg }), /boom at load/, "a throw at load time is an error");
    const withReg = await loadStoreStage({ stage: good, registry: w("registry.ts", 'export const storeByKey = (k: string) => (k === "a" ? { id: 10 } : undefined);\n') }); assert.equal(withReg?.storeId?.("a", "US"), 10);
    await assert.rejects(loadStoreStage({ stage: good, registry: w("broken-registry.ts", "export const = ;\n") }), "a broken registry is an error too");
    assert.equal(isMissingModule(Object.assign(new Error("Cannot find module './x'\nRequire stack:\n- /a/store-import.ts"), { code: "MODULE_NOT_FOUND" }), "store-import"), false, "the require stack names the importer; only the first line names the missing module");
    assert.equal(isMissingModule(Object.assign(new Error("Cannot find module '/a/store-import' imported from /b.ts"), { code: "ERR_MODULE_NOT_FOUND" }), "store-import"), true);
    assert.equal(isMissingModule(new Error("Cannot find module 'store-import'"), "store-import"), false, "a plain error is not a missing module");
  } finally { t.done(); }
});
test("import-prices.yml: a cron run has no inputs, so the store phase and the alerts must not be conditioned on `inputs.x != false` (null is compared with false as 0 != 0, which skips them on every scheduled run); the alerts read a checkout of the pointed tree in .data", () => {
  const t = read("import-prices.yml"); const steps = [...t.matchAll(/^      - name: (.+)\n(?:        if: (.+)\n)?        run: (.+)$/gm)].map((m) => ({ name: m[1]!, cond: m[2] ?? null, run: m[3]! }));
  assert.ok(!/inputs\.\w+\s*(?:!=|==)\s*(?:false|true)/.test(t.replace(/^\s*#.*$/gm, "")), "no step compares a dispatch input with a boolean literal: on a schedule the input is null");
  const phase2 = steps.find((x) => /--phase full/.test(x.run)), checkout = steps.find((x) => /plane-checkout\.sh/.test(x.run)), alerts = steps.find((x) => /scripts\/alerts\.ts/.test(x.run));
  assert.ok(phase2 && checkout && alerts, "phase 2, the tree checkout and the alerts are steps of the job");
  assert.equal(phase2!.cond, "${{ github.event_name != 'workflow_dispatch' || inputs.stores }}", "a schedule runs phase 2; a manual run runs it unless the box is unticked");
  for (const x of [checkout!, alerts!]) assert.equal(x.cond, "${{ github.event_name != 'workflow_dispatch' || inputs.alerts }}", x.name);
  assert.equal(checkout!.run, "bash scripts/plane-checkout.sh .data", "the alert step reads .data/v1 (fsSource), the tree of the pointed commit");
  assert.ok(steps.indexOf(checkout!) < steps.indexOf(alerts!) && steps.indexOf(phase2!) < steps.indexOf(checkout!), "phase 2, then the checkout, then the alerts");
  assert.match(t, /PLANE_REPO: \$\{\{ vars\.PLANE_REPO \}\}\n\s+DATA_REPO_TOKEN: \$\{\{ secrets\.DATA_REPO_TOKEN \}\}/, "the checkout script gets the repository and the token from the job's environment");
});
