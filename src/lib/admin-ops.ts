// What the admin pages know about the ops watch (src/lib/ops-health.ts has the rules, scripts/ops-watch.ts writes the snapshot hourly). Uncached, admin-only, one Meta read and five counts: the pages never run the
// checks themselves (they would call GitHub and the Neon console from Vercel). Nothing here sends mail or imports a sender.
import { prisma } from "./db";
import { loadInboxCounts } from "./ops-collect";
import { inboxTotal, parseSnapshot, snapshotLevel, type InboxCounts, type Snapshot } from "./ops-health";
import type { Level } from "./admin-alarms";

export interface OpsView { snapshot: Snapshot | null; watch: Level; inbox: InboxCounts | null; inboxOpen: number | null; notifyTo: boolean }
export async function loadOpsView(now = new Date()): Promise<OpsView> {
  const [row, inbox] = await Promise.all([
    prisma.meta.findUnique({ where: { key: "ops.health" }, select: { value: true } }).catch(() => null),
    loadInboxCounts().catch(() => null),
  ]);
  const snapshot = parseSnapshot(row?.value);
  return { snapshot, watch: snapshotLevel(snapshot, now), inbox, inboxOpen: inboxTotal(inbox), notifyTo: false };
}
/** The number on the admin bar and home: items waiting in any queue (reports, store suggestions, feedback, messages, support tickets). null when the count could not be read. */
export async function openInboxCount(): Promise<number | null> {
  return loadInboxCounts().then(inboxTotal, () => null);
}
