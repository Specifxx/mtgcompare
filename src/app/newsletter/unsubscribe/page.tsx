import type { Metadata } from "next";
import { getEmailStatus } from "@/lib/data";
import { NewsletterUnsubscribeClient } from "@/components/NewsletterUnsubscribeClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe from the weekly Index summary",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function NewsletterUnsubscribePage({ searchParams }: { searchParams: { token?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  const emailOn = (await getEmailStatus()) === "on";
  return (
    <div className="mx-auto max-w-md py-10">
      <NewsletterUnsubscribeClient token={token} emailOn={emailOn} />
    </div>
  );
}
