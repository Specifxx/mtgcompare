// scripts/audit-publication.ts (owner WP19, parity P02 and addendum 9): the audit of the PUBLISHED DATA as an operator would read it: how big is it, how fast is the repository growing, how old is it, are the
// hosts answering, how much API quota is left. The Neon half of the egress question is scripts/audit-egress.ts; this is the other half (the data repository is what public pages cost us now).
//
//   npx tsx scripts/audit-publication.ts --remote            pointer, status.json, repository size and the host probes over HTTPS (a few KB; needs PLANE_REPO and PLANE_TOKEN, the read token)
//   npx tsx scripts/audit-publication.ts --dir .data         a CHECKOUT of the pointed commit (scripts/plane-checkout.sh .data): every file against its family budget, the manifest, the validator, history freshness
//   PLANE_DIR=.data npx tsx scripts/audit-publication.ts     the same as --dir
//   --json                                                   findings as JSON after the report
// With neither a directory nor a repository configured it prints that and exits 0 (a green no-op without the secrets). Exit 1 = at least one `error` finding.
//
// WHAT IT CHECKS, in the order of the contract: SIZES (12.5: every family against FILE_BUDGETS and the global 1,000,000-byte cap, the total, the 1.5 GB alarm and 3 GB stop line of the repository), GROWTH (the 14-day
// trend of status.json repo.trend: KB a day, the day the alarm line is reached, the size in a year; the squash policy of 6.7 must keep it flat), RATE LIMITS (the GitHub API quota of the token, the raw host answering), and
// FRESHNESS (the pointer's age: amber at 26 h, red at 36 h like the admin panel; the TCGCSV price day; the watchdog's own heartbeat; the history index ending on the price day).
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NEXT_ENTRY_CEILING, budgetFor, fetchEntryBytes } from "../src/lib/data/plane/budgets";
import { PLANE_FILE_MAX_BYTES, type IndexSeriesFile, type ManifestFile, type PointerFile } from "../src/lib/data/plane/formats";
import { familyOf } from "../src/lib/data/plane/shards";
import { POINTER_STALE_HOURS, REPO_CRIT_KB, REPO_WARN_KB, ROTATION_HORIZON_DAYS, daysToLimit, type StatusFile } from "../src/lib/data/plane/status";
import { fsTree, type TreeView } from "../src/lib/data/plane/tree";
import { validateTree, type Phase } from "../src/lib/data/plane/validate";

export type Level = "error" | "warn";
export interface Finding { level: Level; code: string; message: string }
export const PRICE_DAY_WARN_DAYS = 2, PRICE_DAY_ERROR_DAYS = 3;
/** The amber light of the admin panel (Annex C check 27: "the freshness light goes amber at 26 h"); red is POINTER_STALE_HOURS. */
export const POINTER_AMBER_HOURS = 26;
/** status.json is rewritten at least once a day by the watchdog (when the day changes); a record older than this means the hourly job itself has stopped. */
export const WATCHDOG_SILENT_HOURS = 30;
export const RATE_WARN_FRACTION = 0.2, RATE_ERROR_FRACTION = 0.05;

const hoursBetween = (a: string | null | undefined, now: Date): number | null => (a && Number.isFinite(Date.parse(a)) ? (now.getTime() - Date.parse(a)) / 3_600_000 : null);
const daysSinceDay = (day: string | null | undefined, now: Date): number | null => (day && /^\d{4}-\d{2}-\d{2}/.test(day) ? Math.floor((now.getTime() - Date.parse(`${day.slice(0, 10)}T00:00:00Z`)) / 86_400_000) : null);
const mbOf = (kb: number): string => `${(kb / 1024).toFixed(0)} MB`;

/** Freshness, size and growth from the pointer and status.json alone (no tree needed): the remote half. Pure. */
export function evaluateStatus(status: StatusFile | null, pointer: PointerFile | null, now: Date): Finding[] {
  const out: Finding[] = [];
  const add = (level: Level, code: string, message: string) => out.push({ level, code, message });
  if (!pointer) { add("error", "NO_POINTER", "latest.json could not be read: the site would serve its last good pointer and then answer 503"); return out; }
  if (pointer.format !== "v1") add("error", "FORMAT", `the pointer names format "${pointer.format}"; this deployment reads v1`);
  const age = hoursBetween(pointer.publishedAt, now);
  if (age != null && age >= POINTER_STALE_HOURS) add("error", "POINTER_STALE", `the pointer is ${age.toFixed(1)} hours old (red at ${POINTER_STALE_HOURS}): the daily publish has not landed`);
  else if (age != null && age >= POINTER_AMBER_HOURS) add("warn", "POINTER_AGING", `the pointer is ${age.toFixed(1)} hours old (amber at ${POINTER_AMBER_HOURS})`);
  const lag = daysSinceDay(pointer.priceDay, now);
  if (lag != null && lag >= PRICE_DAY_ERROR_DAYS) add("error", "PRICE_DAY_LAG", `the published prices are from ${pointer.priceDay}, ${lag} days ago (TCGCSV stopped updating, or the gate keeps skipping)`);
  else if (lag != null && lag >= PRICE_DAY_WARN_DAYS) add("warn", "PRICE_DAY_LAG", `the published prices are from ${pointer.priceDay}, ${lag} days ago`);
  if (pointer.phase === "catalog") add("warn", "PHASE_CATALOG", "the pointer is a catalogue-only publish: store offers are carried from the previous publish until the store stage lands");
  if (!status) { add("warn", "NO_STATUS", "status.json could not be read: no size trend, no run record, no alarms"); return out; }
  const beat = hoursBetween(status.at, now);
  if (beat != null && beat >= WATCHDOG_SILENT_HOURS) add("warn", "WATCHDOG_SILENT", `status.json was last written ${beat.toFixed(0)} hours ago: the hourly watchdog writes at least once a day, so it has stopped`);
  const run = status.runs?.[0];
  if (run && !run.ok) add("error", "RUN_FAILED", `the newest run (${run.kind}) failed: ${run.note}${run.errors?.length ? ` (${run.errors.slice(0, 2).join("; ")})` : ""}`);
  if (status.refusals?.[0] && hoursBetween(status.refusals[0].at, now)! < 48) add("warn", "REFUSED_RECENTLY", `a publish was refused ${status.refusals[0].code}: ${status.refusals[0].message}`);
  const prev = status.previous;
  if (prev && status.counts.files < prev.files * 0.9) add("error", "FILES_DROP_10", `the file count fell from ${prev.files} to ${status.counts.files}`);
  const kb = status.repo?.kb ?? null;
  if (kb == null) add("warn", "NO_REPO_SIZE", "the repository size has never been read (the watchdog needs a token with Administration: read)");
  else {
    if (kb >= REPO_CRIT_KB) add("error", "REPO_SIZE_CRIT", `the data repository is ${mbOf(kb)}: past the 3 GB stop line`);
    else if (kb >= REPO_WARN_KB) add("warn", "REPO_SIZE_WARN", `the data repository is ${mbOf(kb)}: past the 1.5 GB alarm line (squash now and judge by the 14-day trend)`);
    const t = (status.repo.trend ?? []).slice(-14);
    if (t.length >= 5) {
      const slope = (t[t.length - 1]![1] - t[0]![1]) / (t.length - 1);
      const days = daysToLimit(t, REPO_CRIT_KB);
      if (days != null && days <= ROTATION_HORIZON_DAYS) add("warn", "ROTATION_DUE", `growing ${slope.toFixed(0)} KB a day; the 3 GB line is ${days} days away (rotate the data to a new repository, 12.5.7)`);
      else if (slope > 0) add("warn", "GROWTH_SEEN", `growing ${slope.toFixed(0)} KB a day (${mbOf(slope * 365)} a year); the orphan squash is expected to hold it flat`);
    }
  }
  const sq = hoursBetween(status.repo?.lastSquashAt, now);
  if (sq != null && sq >= 10 * 24) add("warn", "SQUASH_OVERDUE", `no squash for ${Math.floor(sq / 24)} days`);
  if (status.repo?.isPrivate === false) add("error", "REPO_PUBLIC", "the data repository is PUBLIC: licensed and premium input data would be world-readable (12.3.3)");
  if (status.token?.daysLeft != null && status.token.daysLeft <= 7) add("error", "TOKEN_EXPIRING", `the read token expires in ${status.token.daysLeft} days`);
  else if (status.token?.daysLeft != null && status.token.daysLeft <= 30) add("warn", "TOKEN_EXPIRING", `the read token expires in ${status.token.daysLeft} days`);
  for (const a of status.alarms ?? []) if (a.level === "error" && !out.some((f) => f.code === a.code)) add("error", `ALARM_${a.code}`, `${a.message} (raised ${a.since.slice(0, 16)})`);
  return out;
}

/** The GitHub API quota (GET /rate_limit does not spend it) and the raw host's answer. Pure over the parsed values. */
export function evaluateRate(core: { limit: number; remaining: number; reset: number } | null, rawOk: boolean | null, now: Date): Finding[] {
  const out: Finding[] = [];
  if (rawOk === false) out.push({ level: "error", code: "RAW_DOWN", message: "raw.githubusercontent.com did not answer the pointer probe (the site falls back to the contents API, which is metered)" });
  if (core && core.limit > 0) {
    const f = core.remaining / core.limit, resetMin = Math.max(0, Math.round((core.reset * 1000 - now.getTime()) / 60_000));
    if (f < RATE_ERROR_FRACTION) out.push({ level: "error", code: "API_QUOTA", message: `${core.remaining} of ${core.limit} API calls left (resets in ${resetMin} min)` });
    else if (f < RATE_WARN_FRACTION) out.push({ level: "warn", code: "API_QUOTA", message: `${core.remaining} of ${core.limit} API calls left (resets in ${resetMin} min)` });
  }
  return out;
}

export interface FamilyRow { family: string; files: number; bytes: number; largest: number; cap: number | null; maxFiles: number | null }
export interface TreeReport { families: FamilyRow[]; files: number; bytes: number; findings: Finding[] }
const sha16 = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Every file against its family budget, the manifest against the bytes, the validator, and the history index against the price day. `hashAll` re-hashes every file (about 2 s per 100 MB). Pure over a TreeView. */
export function evaluateTree(t: TreeView, ptr: PointerFile | null, o: { hashAll?: boolean; phase?: Phase } = {}): TreeReport {
  const findings: Finding[] = []; const fam = new Map<string, FamilyRow>(); let bytes = 0;
  const add = (level: Level, code: string, message: string) => { if (findings.filter((f) => f.code === code).length < 12) findings.push({ level, code, message }); };
  const files = t.files();
  for (const f of files) {
    const size = t.size(f), name = familyOf(f), b = budgetFor(name);
    const e = fam.get(name) ?? { family: name, files: 0, bytes: 0, largest: 0, cap: b?.maxRawBytes ?? null, maxFiles: b?.maxFiles ?? null };
    e.files++; e.bytes += size; e.largest = Math.max(e.largest, size); fam.set(name, e); bytes += size;
    if (!b) add("error", "NO_BUDGET", `${f}: family "${name}" has no row in FILE_BUDGETS`);
    else if (size > Math.min(b.maxRawBytes, PLANE_FILE_MAX_BYTES)) add("error", "FILE_BUDGET", `${f}: ${size} bytes over the ${name} cap of ${Math.min(b.maxRawBytes, PLANE_FILE_MAX_BYTES)}`);
    if (size > PLANE_FILE_MAX_BYTES) add("error", "FILE_TOO_BIG", `${f}: ${size} bytes over the global cap ${PLANE_FILE_MAX_BYTES}`);
  }
  for (const e of fam.values()) {
    if (e.maxFiles != null && e.files > e.maxFiles) add("error", "FAMILY_FILES", `${e.family}: ${e.files} files over the budget of ${e.maxFiles}`);
    if (e.cap != null && e.largest > 0.9 * e.cap && e.largest <= e.cap) add("warn", "FAMILY_NEAR_CAP", `${e.family}: the largest file is ${((e.largest / e.cap) * 100).toFixed(0)}% of its cap (${e.largest} of ${e.cap})`);
    if (fetchEntryBytes(e.largest) >= NEXT_ENTRY_CEILING) add("error", "NEXT_ENTRY", `${e.family}: a ${e.largest}-byte file is ${fetchEntryBytes(e.largest)} bytes as Next caches it (ceiling ${NEXT_ENTRY_CEILING})`);
  }
  // manifest: listed files exist with their size (and, with hashAll, their hash prefix); nothing unlisted except manifest.json and status.json
  if (!t.has("manifest.json")) add("error", "NO_MANIFEST", "v1/manifest.json is missing");
  else {
    const man = JSON.parse(t.read("manifest.json")) as ManifestFile; const listed = new Set<string>();
    for (const [p, size, h] of man.files) {
      listed.add(p);
      if (!t.has(p)) { add("error", "MANIFEST_MISSING", `${p}: listed in the manifest but not in the tree`); continue; }
      if (t.size(p) !== size) add("error", "MANIFEST_SIZE", `${p}: ${t.size(p)} bytes, the manifest says ${size}`);
      else if (o.hashAll && sha16(t.read(p)) !== h) add("error", "MANIFEST_HASH", `${p}: content differs from the manifest hash`);
    }
    for (const f of files) if (!listed.has(f) && f !== "manifest.json" && f !== "status.json") add("error", "MANIFEST_UNLISTED", `${f}: in the tree but not in the manifest`);
    if (ptr && ptr.manifestSha256 && createHash("sha256").update(t.read("manifest.json")).digest("hex") !== ptr.manifestSha256) add("error", "MANIFEST_POINTER", "the manifest's sha-256 differs from the one the pointer names");
  }
  const dataFiles = files.filter((f) => f !== "manifest.json" && f !== "status.json").length;                // the pointer's count is the data files: manifest.json and status.json are bookkeeping (W1b-9)
  if (ptr && ptr.counts.files && ptr.counts.files !== dataFiles) add("warn", "POINTER_COUNT", `the pointer counts ${ptr.counts.files} files, the tree holds ${dataFiles} data files`);
  // the validator the publisher ran, again, on what is actually there
  const phase: Phase = o.phase ?? ptr?.phase ?? "full";
  try { for (const p of validateTree(t, { phase }).problems.slice(0, 25)) add("error", `VALIDATE_${p.code}`, p.message); } catch (e) { add("error", "VALIDATE_CRASH", `the validator threw: ${e instanceof Error ? e.message : String(e)}`); }
  // history: the market index ends on the price day (the series do too; check-history is audit-history.ts)
  if (ptr && t.has("hist/index.json")) {
    const days = (JSON.parse(t.read("hist/index.json")) as IndexSeriesFile).days; const last = days[days.length - 1]?.[0];
    if (!last) add("error", "HIST_INDEX_EMPTY", "hist/index.json has no day");
    else if (last < ptr.priceDay) add("warn", "HIST_INDEX_LAG", `hist/index.json ends on ${last}, the pointer's price day is ${ptr.priceDay}`);
  }
  return { families: [...fam.values()].sort((a, b) => b.bytes - a.bytes), files: files.length, bytes, findings };
}

// ── the I/O halves ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const UA = "MTGCompare-build/0.1 (+https://github.com/Specifxx/mtgcompare)";
async function getJson<T>(url: string, token: string | undefined, f: typeof fetch, accept = "application/json"): Promise<{ ok: boolean; status: number; body: T | null; headers: Headers }> {
  try {
    const res = await f(url, { headers: { "User-Agent": UA, Accept: accept, ...(token ? { Authorization: `token ${token}` } : {}) }, signal: AbortSignal.timeout(15_000), cache: "no-store" } as RequestInit);
    const text = await res.text(); let body: T | null = null; try { body = JSON.parse(text) as T; } catch { /* not JSON */ }
    return { ok: res.ok, status: res.status, body, headers: res.headers };
  } catch { return { ok: false, status: 0, body: null, headers: new Headers() }; }
}
export async function auditRemote(env: Record<string, string | undefined>, now: Date, f: typeof fetch = fetch): Promise<{ findings: Finding[]; lines: string[] } | null> {
  // the READ token (Contents: read) is enough: the pointer, status.json and the API quota are reads, and the repository size is also in status.json (the watchdog writes it). A job that holds the write token for another reason (a checkout) passes it too.
  const repo = env.PLANE_REPO, token = env.PLANE_TOKEN || env.DATA_REPO_TOKEN, branch = env.PLANE_BRANCH || "data";
  if (!repo || !token) return null;
  const lines: string[] = []; const raw = `https://raw.githubusercontent.com/${repo}/${branch}`;
  const t0 = Date.now(), ptr = await getJson<PointerFile>(`${raw}/latest.json`, token, f), rawMs = Date.now() - t0;
  const st = await getJson<StatusFile>(`${raw}/status.json`, token, f);
  const info = await getJson<{ size?: number; private?: boolean }>(`https://api.github.com/repos/${repo}`, token, f, "application/vnd.github+json");
  const rl = await getJson<{ resources?: { core?: { limit: number; remaining: number; reset: number } } }>("https://api.github.com/rate_limit", token, f, "application/vnd.github+json");
  const status = st.body; if (status && info.body) { status.repo = { ...status.repo, kb: typeof info.body.size === "number" ? info.body.size : status.repo?.kb ?? null, isPrivate: typeof info.body.private === "boolean" ? info.body.private : status.repo?.isPrivate ?? null }; }
  lines.push(`repository ${repo}@${branch}: pointer HTTP ${ptr.status} in ${rawMs} ms; status.json HTTP ${st.status}; API HTTP ${info.status}`);
  if (ptr.body) lines.push(`pointer seq ${ptr.body.seq} ${ptr.body.ref.slice(0, 7)} ${ptr.body.phase} published ${ptr.body.publishedAt} (price day ${ptr.body.priceDay}); ${ptr.body.counts.files} files, ${ptr.body.counts.cards} cards, ${ptr.body.counts.units} tracked units`);
  if (info.body?.size != null) lines.push(`repository size ${mbOf(info.body.size)} of the 1.5 GB alarm and 3 GB stop line (GitHub's recommendation is under 1 GB; hard limit unpublished)`);
  const core = rl.body?.resources?.core ?? null; if (core) lines.push(`API quota ${core.remaining}/${core.limit}, resets ${new Date(core.reset * 1000).toISOString().slice(11, 16)} UTC`);
  const findings = [...evaluateStatus(status, ptr.body, now), ...evaluateRate(core, ptr.ok, now)];
  if (!info.ok) findings.push({ level: "warn", code: "API_DOWN", message: `the repository record could not be read (HTTP ${info.status}): no size, no visibility check` });
  return { findings, lines };
}

export function renderReport(title: string, lines: readonly string[], rows: readonly FamilyRow[], findings: readonly Finding[]): string {
  const out = [`== ${title} ==`, ...lines];
  if (rows.length) {
    out.push("", "| family | files | MB | largest KB | cap KB | max files |", "|---|---:|---:|---:|---:|---:|");
    for (const r of rows) out.push(`| ${r.family} | ${r.files} | ${(r.bytes / 1e6).toFixed(2)} | ${(r.largest / 1e3).toFixed(1)} | ${r.cap != null ? (r.cap / 1e3).toFixed(0) : "?"} | ${r.maxFiles ?? "?"} |`);
  }
  out.push("", "Findings:");
  if (!findings.length) out.push("  none.");
  for (const f of findings) out.push(`  ${f.level === "error" ? "ERROR" : "warn "} [${f.code}] ${f.message}`);
  return out.join("\n");
}
const readJson = <T,>(file: string): T | null => (fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : null);

export async function main(argv: readonly string[], env: Record<string, string | undefined>): Promise<number> {
  const arg = (k: string): string | undefined => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const dir = arg("--dir") ?? (argv.includes("--remote") ? undefined : env.PLANE_DIR);
  const json = argv.includes("--json"); const now = new Date(); let findings: Finding[] = [];
  if (dir) {
    const root = path.resolve(dir), v1 = path.join(root, "v1");
    if (!fs.existsSync(v1)) { console.log(`${root} has no v1/ directory: nothing to audit.`); return 0; }
    const ptr = readJson<PointerFile>(path.join(root, "latest.json")), status = readJson<StatusFile>(path.join(root, "status.json"));
    const rep = evaluateTree(fsTree(v1), ptr, { hashAll: !argv.includes("--fast") });
    findings = [...evaluateStatus(status, ptr, now), ...rep.findings];
    console.log(renderReport(`published tree ${root}`, [`${rep.files} files, ${(rep.bytes / 1e6).toFixed(1)} MB raw`, ptr ? `pointer seq ${ptr.seq} ${ptr.ref.slice(0, 7)} ${ptr.phase}, price day ${ptr.priceDay}, published ${ptr.publishedAt}` : "no latest.json"], rep.families, findings));
  } else {
    const r = await auditRemote(env, now);
    if (!r) { console.log("PLANE_REPO and PLANE_TOKEN (or DATA_REPO_TOKEN) are not both set: no data repository to audit (a green no-op)."); return 0; }
    findings = r.findings; console.log(renderReport("data repository", r.lines, [], findings));
  }
  for (const f of findings) if (f.level === "error") console.log(`::error title=Data publication (${f.code})::${f.message}`);
  if (json) console.log(JSON.stringify(findings, null, 1));
  return findings.some((f) => f.level === "error") ? 1 : 0;
}
if (process.argv[1] && /scripts[\\/]audit-publication\.ts$/.test(process.argv[1])) main(process.argv.slice(2), process.env).then((c) => { process.exitCode = c; }).catch((e) => { console.error(e); process.exitCode = 1; });
