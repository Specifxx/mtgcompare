import type { Metadata } from "next";
import { getEmailStatus } from "@/lib/data";
import { UnsubscribeClient } from "@/components/UnsubscribeClient";

// The footer of every price-alert email. Pauses by default (keeps the
// watchlist); ?mode=delete (the footer's "Delete all my watches") opens with
// the explicit delete confirmation shown. See UnsubscribeClient. (RiftCompare's
// /unsubscribe, wave 2.)
export const metadata: Metadata = {
  title: "Pause price-alert emails",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function UnsubscribePage({ searchParams }: { searchParams: { token?: string; mode?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  const emailOn = (await getEmailStatus()) === "on";
  return (
    <div className="mx-auto max-w-md">
      <UnsubscribeClient token={token} focus={searchParams.mode === "delete" ? "delete" : "pause"} emailOn={emailOn} />
    </div>
  );
}
