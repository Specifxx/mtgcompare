import type { Metadata } from "next";
import { ReleaseAlertStop } from "@/components/ReleaseAlertSignup";

// Where the release-alert email's footer link lands (releaseStopUrl): a
// confirm card, and only the button's POST stops anything (RiftCompare's
// /alerts/release, wave 2).
export const metadata: Metadata = {
  title: "Stop release alerts",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ReleaseAlertStopPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  return (
    <div className="mx-auto max-w-md py-10">
      <ReleaseAlertStop token={token} />
    </div>
  );
}
