import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { StaticPage } from "@/components/StaticPage";

export const revalidate = 86400;
export const metadata: Metadata = { title: "Privacy policy", ...canon("/privacy") };

export default function Privacy() {
  return (
    <StaticPage title="Privacy policy">
      <p>Last updated 2 November 2026.</p>
      <p>{SITE.name} has no accounts and stores nothing about you. We use Vercel Web Analytics, which counts page views and clicks on buy buttons without cookies and without identifying you. Your choice of market and theme is kept in your own browser.</p>
      {SITE.priceAlerts && (
        <p>
          Price alerts are the one exception. If you ask to be emailed when a price drops, the form sends your email address, the product, your market and your price to our sister site RiftCompare&rsquo;s alert service, which keeps them only for that alert, emails you once to confirm, and deletes them when you stop the alert or after six months. {SITE.name} itself never stores them. Details: <a href="https://riftcompare.com/privacy#sister-alerts">RiftCompare&rsquo;s privacy policy</a>.
        </p>
      )}
      <p>Buy links are affiliate links: eBay, TCGplayer and Amazon may set their own cookies when you follow one, under their own privacy policies.</p>
      <p>Questions: <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.</p>
    </StaticPage>
  );
}
