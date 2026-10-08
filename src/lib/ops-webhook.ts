// src/lib/ops-webhook.ts (owner WP19, parity P39). One INCOMING WEBHOOK (Discord or Slack) for operational alerts: a stale pointer, a failed audit, a store that went dark, a budget breached.
// A webhook only, never a bot: no token, no gateway connection, no slash command, nothing that listens. OPS_WEBHOOK_URL is an OPTIONAL Actions secret (Annex B); unset, every call here is a quiet
// no-op and the alert stays where it already is, in the job log and the step summary. The job is never failed by its own notification.
//
// SCRIPT-SIDE ONLY, like the mail module: nothing under src/app or src/components imports this file (tests/no-email-api.test.ts), and the secret is named only here, in scripts/ops-webhook.ts and in
// workflows (tests/env-names.test.ts). A page never posts anywhere. Alert text is redacted before it leaves (webhook URLs, tokens, connection strings, e-mail addresses): a log line quoted into
// an alert must not become the place a secret is published.
import { SITE_NAME, SITE_URL } from "./site";

export type OpsLevel = "info" | "warn" | "error";
export interface OpsMessage { title: string; level: OpsLevel; lines: string[]; url?: string }
export type OpsKind = "discord" | "slack" | "generic";

export const OPS_COLORS: Record<OpsLevel, number> = { info: 0x6366f1, warn: 0xf59e0b, error: 0xef4444 };
export const OPS_ICONS: Record<OpsLevel, string> = { info: "Info", warn: "Warning", error: "Alert" };
/** Discord's embed description is capped at 4096 characters and the title at 256; Slack's text at about 40,000 but a channel is not a log file. */
export const OPS_MAX_DESCRIPTION = 3900, OPS_MAX_TITLE = 200, OPS_MAX_SLACK = 3500;

const SECRET_PATTERNS: [RegExp, string][] = [
  [/https?:\/\/(?:[\w-]+\.)?(?:discord(?:app)?\.com\/api\/webhooks|hooks\.slack\.com\/(?:services|workflows))\/[^\s)"'<>]+/gi, "[webhook url]"],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[github token]"],
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b|\bwhsec_[A-Za-z0-9]{8,}\b/g, "[payment key]"],
  [/\bpostgres(?:ql)?:\/\/[^\s)"'<>]+/gi, "[database url]"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, "$1 [redacted]"],
  [/\b(?:AUTHORIZATION|X-API-KEY)\s*[:=]\s*\S+/gi, "[header redacted]"],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]"],
];
/** Everything that looks like a credential or an address, replaced; applied to every line of every alert. Pure. */
export function redact(text: string): string {
  let out = text;
  for (const [re, to] of SECRET_PATTERNS) out = out.replace(re, to);
  return out;
}

/** The webhook address from the environment, or null: unset, blank or not https means "no webhook" (a typo never makes a request to an unintended scheme). */
export function opsWebhookUrl(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.OPS_WEBHOOK_URL ?? "").trim();
  if (!raw) return null;
  try { const u = new URL(raw); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}
export const isOpsWebhookEnabled = (env: Record<string, string | undefined> = process.env): boolean => opsWebhookUrl(env) !== null;
/** Which payload shape the address wants. Discord's and Slack's incoming webhooks are told apart by host; anything else gets the Slack-compatible `{ text }`, which most chat relays accept. */
export function opsWebhookKind(url: string): OpsKind {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h === "discord.com" || h.endsWith(".discord.com") || h === "discordapp.com" || h.endsWith(".discordapp.com")) return "discord";
    if (h === "hooks.slack.com") return "slack";
  } catch { /* falls through */ }
  return "generic";
}

const clip = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1)).trimEnd()}…`);
/** Lines joined into one body no longer than `max`: whole lines are kept, the rest is counted ("and 12 more") so a truncated alert says how much is missing. */
export function fitLines(lines: readonly string[], max: number): string {
  const kept: string[] = []; let used = 0;
  for (const l of lines) {
    const add = l.length + (kept.length ? 1 : 0);
    if (used + add > max - 24) break;
    kept.push(l); used += add;
  }
  const rest = lines.length - kept.length;
  return rest > 0 ? `${kept.join("\n")}\n…and ${rest} more` : kept.join("\n");
}
/** The JSON body for the kind of webhook. Pure; every string is redacted and clipped. */
export function formatOps(msg: OpsMessage, kind: OpsKind): Record<string, unknown> {
  const title = clip(redact(msg.title), OPS_MAX_TITLE);
  const lines = msg.lines.map((l) => redact(l));
  if (kind === "discord") {
    return { username: SITE_NAME, allowed_mentions: { parse: [] }, embeds: [{ title, ...(msg.url ? { url: msg.url } : {}), description: fitLines(lines, OPS_MAX_DESCRIPTION), color: OPS_COLORS[msg.level], footer: { text: `${SITE_NAME} ops · ${SITE_URL.replace(/^https?:\/\//, "")}` } }] };
  }
  const head = `*${OPS_ICONS[msg.level]}: ${title}*${msg.url ? ` <${msg.url}|open>` : ""}`;
  return { text: clip(`${head}\n${fitLines(lines, OPS_MAX_SLACK)}`, OPS_MAX_SLACK + 400) };
}

export interface OpsResult { ok: boolean; skipped?: string; status?: number }
export interface OpsDeps { env?: Record<string, string | undefined>; fetch?: typeof fetch; timeoutMs?: number; sleep?: (ms: number) => Promise<void> }
/**
 * Posts one alert. Never throws and never fails the caller: no webhook is `{ ok: false, skipped }`, a refusal or a network error is `{ ok: false, skipped: "post failed" }`. One retry, only on 429 and
 * only after the wait the host asked for (at most 5 seconds): an alert channel that rate-limits us is told once, not hammered.
 */
export async function postOps(msg: OpsMessage, d: OpsDeps = {}): Promise<OpsResult> {
  const url = opsWebhookUrl(d.env ?? process.env);
  if (!url) return { ok: false, skipped: "no OPS_WEBHOOK_URL" };
  if (!msg.lines.length && !msg.title) return { ok: false, skipped: "nothing to post" };
  const f = d.fetch ?? fetch, body = JSON.stringify(formatOps(msg, opsWebhookKind(url))), sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const send = (): Promise<Response> => f(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(d.timeoutMs ?? 8000) });
  try {
    let res = await send();
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") ?? "1");
      await sleep(Math.min(5000, Math.max(250, (Number.isFinite(wait) ? wait : 1) * 1000)));
      res = await send();
    }
    return res.ok ? { ok: true, status: res.status } : { ok: false, skipped: "post failed", status: res.status };
  } catch {
    return { ok: false, skipped: "post failed" };
  }
}
