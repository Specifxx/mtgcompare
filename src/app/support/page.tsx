import type { Metadata } from "next";
import Link from "next/link";
import { SupportForm } from "@/components/SupportForm";
import { Breadcrumbs } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { pageOg } from "@/lib/og/meta";

// Reads the signed-in user to prefill the form: an account page, not a public
// loader (src/lib/auth.ts is one of the CLAUDE.md accounts exceptions).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with an OP Compare Plus or Premium payment, a subscription or your account: send a message and get a ticket number.",
  alternates: { canonical: "/support" },
  openGraph: pageOg("/support"),
};

export default async function SupportPage({ searchParams }: { searchParams: { category?: string; subject?: string } }) {
  const user = await getCurrentUser().catch(() => null);
  return (
    <div className="mx-auto max-w-xl">
      <Breadcrumbs trail={[{ name: "Support" }]} />
      <h1 className="mb-2 font-display text-2xl font-extrabold text-white">Support</h1>
      <div className="mb-4 space-y-2 text-sm leading-relaxed text-slate-400">
        <p>
          Use this page for a problem with a Plus or Premium payment or with your account: a charge you don&apos;t recognise, a plan that didn&apos;t switch on after you paid, or trouble signing in. Each message becomes a numbered ticket, shown on screen when you send it; the reply comes by email from the owner, with no response time promised.
        </p>
        <p>
          To update your card, see your invoices or cancel, use the Manage subscription button on your account page, which opens Stripe&apos;s billing page; how billing, trials and cancellation work is in the{" "}
          <Link href="/terms" className="text-brand-400 hover:underline">terms</Link>. For a wrong price, a missing store or an idea, the{" "}
          <Link href="/contact" className="text-brand-400 hover:underline">contact page</Link> is the better place.
        </p>
      </div>
      <SupportForm defaultName={user?.displayName} defaultEmail={user?.email} defaultCategory={searchParams.category} defaultSubject={searchParams.subject} />
    </div>
  );
}
