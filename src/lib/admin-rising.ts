// The Hot 40 snapshots' admin reads and writes (RiftCompare's
// /api/admin/rising-snapshot, its database half). Uncached by design: owner-
// only traffic. Called only from /api/admin/rising-snapshot, behind
// requireAdminApi; the public page reads a snapshot through the cached
// lib/data.ts getRisingSnapshot, which a delete revalidates.
import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import type { RisingSnapshotData } from "./rising-snapshot";

export interface AdminSnapshotRow {
  id: string;
  token: string;
  scope: string;
  title: string;
  createdAt: Date;
}

/** Newest first, capped — a management list, not an archive browser. */
export function listRisingSnapshots(): Promise<AdminSnapshotRow[]> {
  return prisma.risingSnapshot.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, token: true, scope: true, title: true, createdAt: true },
  });
}

/** Freezes a payload under a fresh, unguessable token (a capability URL). */
export function createRisingSnapshot(scope: string, title: string, data: RisingSnapshotData): Promise<{ token: string; title: string }> {
  return prisma.risingSnapshot.create({
    data: { token: randomBytes(24).toString("base64url"), scope, title, data: data as unknown as object },
    select: { token: true, title: true },
  });
}

/** Deletes one snapshot; its token when it existed (so the caller can revalidate its page), else null. */
export async function deleteRisingSnapshot(id: string): Promise<string | null> {
  const row = await prisma.risingSnapshot.findUnique({ where: { id }, select: { token: true } });
  if (!row) return null;
  await prisma.risingSnapshot.delete({ where: { id } });
  return row.token;
}
