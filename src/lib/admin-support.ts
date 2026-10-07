// /admin/support reads and mutations. Uncached (owner-only traffic).
import { prisma } from "./db";
import { SUPPORT_STATUSES, isIn, type SupportStatus } from "./inbox-rules";

export const SUPPORT_CAP = 500;

export async function loadTickets() {
  return prisma.supportTicket.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: SUPPORT_CAP });
}

export interface TicketPatch {
  status?: SupportStatus;
  adminNote?: string;
}

/** Validate an admin patch body: a known status and/or an internal note (4,000 characters at most). */
export function parseTicketPatch(body: Record<string, unknown> | null): { ok: true; id: string; patch: TicketPatch } | { ok: false; error: string } {
  const id = typeof body?.id === "string" && body.id.length > 0 && body.id.length <= 64 ? body.id : null;
  if (!id) return { ok: false, error: "Bad id" };
  const patch: TicketPatch = {};
  if (body?.status !== undefined) {
    if (!isIn(SUPPORT_STATUSES, body.status)) return { ok: false, error: "Bad status" };
    patch.status = body.status;
  }
  if (body?.adminNote !== undefined) {
    if (typeof body.adminNote !== "string" || body.adminNote.length > 4000) return { ok: false, error: "Bad note" };
    patch.adminNote = body.adminNote;
  }
  if (patch.status === undefined && patch.adminNote === undefined) return { ok: false, error: "Nothing to change" };
  return { ok: true, id, patch };
}

export async function updateTicket(id: string, patch: TicketPatch): Promise<{ ok: true; before: { status: string }; after: { status: string } } | { ok: false; status: number; error: string }> {
  const cur = await prisma.supportTicket.findUnique({ where: { id }, select: { status: true } });
  if (!cur) return { ok: false, status: 404, error: "No such ticket" };
  const next = await prisma.supportTicket.update({ where: { id }, data: patch, select: { status: true } });
  return { ok: true, before: { status: cur.status }, after: { status: next.status } };
}
