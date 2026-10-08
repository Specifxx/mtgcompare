import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";
import { StaticPage } from "@/components/StaticPage";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import { pageOg } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: "Contact & Feedback",
  description: `Get in touch with ${SITE_NAME}.`,
  alternates: { canonical: "/contact" },
  openGraph: pageOg("/contact"),
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
        Online stores that sell Magic singles and name the set and collector number
        in the product title or SKU can usually be added within a day.{" "}
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
