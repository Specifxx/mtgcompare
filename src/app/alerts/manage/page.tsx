import type { Metadata } from "next";
import { getEmailStatus } from "@/lib/data";
import { UnsubscribeClient } from "@/components/UnsubscribeClient";

// "Manage your watchlist" for a watcher with NO account (an alert email's main
// button; account holders go to /watching). Addressed by the address's
// unsubToken: the cards on it, a per-card remove, pause/resume, and an
// explicit delete-everything. Same component as /unsubscribe. (RiftCompare's
// /alerts/manage, wave 2.)
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manage your price alerts",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ManageAlertsPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  const emailOn = (await getEmailStatus()) === "on";
  return (
    <div className="mx-auto max-w-md">
      <UnsubscribeClient token={token} focus="manage" emailOn={emailOn} />
    </div>
  );
}
