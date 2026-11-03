import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { StaticPage } from "@/components/StaticPage";

export const revalidate = 86400;
export const metadata: Metadata = { title: "Contact", description: `Contact ${SITE.name}, report a price or list your store.`, ...canon("/contact") };

export default function Contact() {
  return (
    <StaticPage title="Contact us">
      <p>Wrong price, missing card, or a store that should be listed? Email <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a> and we&apos;ll take a look.</p>
      <p>Seen a wrong price? Open the card or product and use <b>Report a wrong price</b> under its price table: it reaches us straight away, no email needed.</p>
      <p>Store owners: listing is free. <a href="/stores#suggest">Suggest your store</a> or email its address and we&apos;ll add it to the comparison.</p>
    </StaticPage>
  );
}
