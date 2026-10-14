// The ops watch, mail half. SCRIPT-SIDE ONLY, like every sender (tests/no-email-api.test.ts): nothing under src/app or src/components imports this file or src/lib/email.ts. Two e-mails go to the owner:
// "needs attention" (a problem that is new, got worse, or has stayed red) and "new in the inbox". The owner's address is the Actions variable OPS_ALERT_EMAIL; without it, or while mail is off, nothing is sent
// and the admin dashboard still shows everything.
import { escapeHtml, layout } from "./email";
import { INBOX_LABEL, digestOf, type AlertItem, type HealthCheck, type InboxItem, type InboxKind } from "./ops-health";
import { SITE_NAME, SITE_URL } from "./site";

export interface OpsEmail { subject: string; html: string; text: string }
const COLOR = { bad: "#ef4444", warn: "#f59e0b", ok: "#22c55e", unknown: "#94a3b8" } as const;
const WHY = { new: "new", worse: "got worse", reminder: "still open" } as const;
const abs = (href?: string): string => (!href ? `${SITE_URL}/admin/health` : /^https?:/.test(href) ? href : `${SITE_URL}${href}`);

export function buildAlertEmail(send: readonly AlertItem[], recovered: readonly HealthCheck[], at: Date): OpsEmail {
  const bad = send.filter((s) => s.check.level === "bad").length;
  const subject = `[${SITE_NAME}] ${send.length ? `${send.length} thing${send.length === 1 ? "" : "s"} need${send.length === 1 ? "s" : ""} attention${bad ? ` (${bad} urgent)` : ""}` : "Back to normal"}`;
  const row = (c: HealthCheck, tag: string, color: string) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #2a2840"><span style="color:${color};font-weight:700">${escapeHtml(c.label)}</span> <span style="color:#a8a4c0;font-size:12px">${escapeHtml(tag)}</span><br>${escapeHtml(c.detail)} <a href="${escapeHtml(abs(c.href))}" style="color:#c394f4">Open</a></td></tr>`;
  const html = layout(
    send.length ? "Something needs a look" : "Back to normal",
    `<table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;color:#e8e6f4">${send.map((s) => row(s.check, WHY[s.reason], COLOR[s.check.level])).join("")}${recovered.map((c) => row(c, "recovered", COLOR.ok)).join("")}</table><p style="color:#a8a4c0;font-size:12px">Checked ${escapeHtml(at.toISOString().replace("T", " ").slice(0, 16))} UTC. The ops watch runs hourly; it only writes when something is new, worse, or still red after a day.</p>`,
    { label: "Open the health dashboard", url: `${SITE_URL}/admin/health` },
  );
  const text = [...send.map((s) => `${s.check.level === "bad" ? "URGENT" : "Watch"} (${WHY[s.reason]}): ${s.check.label}: ${s.check.detail}`), ...recovered.map((c) => `Recovered: ${c.label}`), "", `${SITE_URL}/admin/health`].join("\n");
  return { subject, html, text };
}

export function buildInboxEmail(items: readonly InboxItem[], openTotal: number | null): OpsEmail {
  const d = digestOf(items);
  const parts = (Object.entries(d.byKind) as [InboxKind, number][]).map(([k, n]) => `${n} ${INBOX_LABEL[k].toLowerCase()}${n === 1 ? "" : "s"}`).join(", ");
  const subject = `[${SITE_NAME}] ${d.total} new in the inbox`;
  const li = (i: InboxItem) => `<tr><td style="padding:8px 0;border-bottom:1px solid #2a2840"><b>${escapeHtml(INBOX_LABEL[i.kind])}</b> · ${escapeHtml(i.title)}<br><span style="color:#a8a4c0">${escapeHtml(i.snippet)}</span></td></tr>`;
  const more = d.total > d.shown.length ? `<p style="color:#a8a4c0;font-size:12px">…and ${d.total - d.shown.length} more in the inbox.</p>` : "";
  const html = layout(
    `${d.total} new: ${parts}`,
    `<table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;color:#e8e6f4">${d.shown.map(li).join("")}</table>${more}${openTotal != null ? `<p style="color:#a8a4c0;font-size:12px">${openTotal} item${openTotal === 1 ? " is" : "s are"} open in total.</p>` : ""}`,
    { label: "Open the inbox", url: `${SITE_URL}/admin/inbox` },
  );
  const text = [`${d.total} new: ${parts}`, "", ...d.shown.map((i) => `- ${INBOX_LABEL[i.kind]}: ${i.title}\n  ${i.snippet}`), "", `${SITE_URL}/admin/inbox`].join("\n");
  return { subject, html, text };
}
