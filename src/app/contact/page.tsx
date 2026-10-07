import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";
import { StaticPage } from "@/components/StaticPage";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact & Feedback",
  description: "Get in touch with OP Compare.",
  alternates: { canonical: "/contact" },
};

export default function Contact() {
  return (
    <StaticPage title="Contact & feedback" crumb="Contact">
      <p>
        Spotted a wrong price, a card matched to the wrong printing, or a store
        we should add? Send a message below or email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> — include the
        card&apos;s page link and what you expected to see. On any card page,
        the &ldquo;Report it&rdquo; link under the prices sends the exact
        listing to us.
      </p>
      <ContactForm />
      <h2>Payment or account problems</h2>
      <p>
        A charge you don&apos;t recognise, or a plan that didn&apos;t switch on? <Link href="/support">Open a support ticket</Link>: it gets a number you can quote.
      </p>
      <h2>Stores</h2>
      <p>
        Stores on Shopify or ShadowPOS whose One Piece singles carry the card number in the
        title (for example “OP01-120”) can usually be added within a day.{" "}
        <Link href="/stores/suggest">Suggest a store</Link> with its address and
        the market it ships to.
      </p>
      <h2>Feedback</h2>
      <p>
        Tell us what to keep, fix or add on the{" "}
        <Link href="/feedback">feedback page</Link>.
      </p>
    </StaticPage>
  );
}
