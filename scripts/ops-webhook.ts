// scripts/ops-webhook.ts (owner WP19, parity P39): post ONE operational alert to the incoming webhook in OPS_WEBHOOK_URL (Discord or Slack; a webhook only, never a bot).
// Called by the workflows that watch the site (egress-audit, data-audit, db-audit, store-health, ci-build on main) as their last step. With the secret unset the script prints what it would have
// said and exits 0: every workflow that calls it is a green no-op without the secret, and an alert is never a failed job of its own.
//
//   npx tsx scripts/ops-webhook.ts --title "Egress audit" --level error --line "orders: 9,400 calls/day" --url "$RUN_URL"
//   npx tsx scripts/ops-webhook.ts --title "Data audit" --level warn --file audit.txt --tail 30     (the last 30 lines of a report file)
//   npx tsx scripts/ops-webhook.ts --if-failed --status "$JOB" ...                                (post only when the status is not "success"; a workflow passes its job status as the argument)
//
// Levels: info | warn | error (default error). Lines and files are redacted (src/lib/ops-webhook.ts redact) before they leave the runner.
import fs from "node:fs";
import { isOpsWebhookEnabled, postOps, redact, type OpsLevel, type OpsMessage } from "../src/lib/ops-webhook";

const LEVELS: readonly OpsLevel[] = ["info", "warn", "error"];
export interface OpsArgs { title: string; level: OpsLevel; lines: string[]; url?: string; ifFailed: boolean; status?: string; dryRun: boolean }
/** Parses argv; throws on a missing title or an unknown level so a typo in a workflow fails loudly instead of posting nothing. */
export function parseOpsArgs(argv: readonly string[], read: (file: string) => string = (f) => fs.readFileSync(f, "utf8")): OpsArgs {
  const out: OpsArgs = { title: "", level: "error", lines: [], ifFailed: false, dryRun: false };
  let tail = 40;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!, next = (): string => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === "--title") out.title = next();
    else if (a === "--level") { const v = next() as OpsLevel; if (!LEVELS.includes(v)) throw new Error(`--level must be one of ${LEVELS.join(", ")}`); out.level = v; }
    else if (a === "--line") out.lines.push(next());
    else if (a === "--file") files.push(next());
    else if (a === "--tail") tail = Math.max(1, Number(next()) || 40);
    else if (a === "--url") out.url = next();
    else if (a === "--status") out.status = next();
    else if (a === "--if-failed") out.ifFailed = true;
    else if (a === "--dry-run") out.dryRun = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!out.title) throw new Error("--title is required");
  for (const f of files) {
    let text = ""; try { text = read(f); } catch { out.lines.push(`(report ${f} was not written)`); continue; }
    out.lines.push(...text.split("\n").map((l) => l.trimEnd()).filter(Boolean).slice(-tail));
  }
  return out;
}
/** Whether the call posts at all: `--if-failed` stays quiet when the job succeeded. */
export const shouldPost = (a: OpsArgs): boolean => !a.ifFailed || (a.status !== undefined && a.status !== "success");

export async function runOps(argv: readonly string[], env: Record<string, string | undefined> = process.env, post: typeof postOps = postOps): Promise<{ posted: boolean; reason: string }> {
  const a = parseOpsArgs(argv);
  if (!shouldPost(a)) return { posted: false, reason: "the job succeeded" };
  const msg: OpsMessage = { title: a.title, level: a.level, lines: a.lines, ...(a.url ? { url: a.url } : {}) };
  if (a.dryRun || !isOpsWebhookEnabled(env)) {
    console.log(`ops-webhook: ${a.dryRun ? "dry run" : "OPS_WEBHOOK_URL is not set, nothing posted"}; the alert would read:\n[${a.level}] ${redact(a.title)}\n${a.lines.map((l) => redact(l)).join("\n")}`);
    return { posted: false, reason: a.dryRun ? "dry run" : "no webhook" };
  }
  const r = await post(msg, { env });
  console.log(r.ok ? `ops-webhook: posted (${r.status})` : `ops-webhook: not delivered (${r.skipped ?? "unknown"}${r.status ? `, HTTP ${r.status}` : ""}); the report stays in the job log`);
  return { posted: r.ok, reason: r.ok ? "posted" : r.skipped ?? "not delivered" };
}
if (process.argv[1] && /scripts[\\/]ops-webhook\.ts$/.test(process.argv[1])) {
  // an alert that cannot be delivered is a log line, never a red job: the exit code is 0 unless the arguments themselves are wrong
  runOps(process.argv.slice(2)).catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 2; });
}
