import type { Metadata } from "next";
import { StaticPage } from "@/components/StaticPage";
import { DATA_ATTRIBUTION, FAN_CONTENT_DISCLAIMER, FAN_CONTENT_POLICY_URL, SITE_NAME, UNOFFICIAL_FAN_SITE_NOTICE } from "@/lib/site";
import { pageOg } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: "Terms of Service",
  alternates: { canonical: "/terms" },
  openGraph: pageOg("/terms"),
};

export default function Terms() {
  return (
    <StaticPage title="Terms of service" crumb="Terms">
      <p>
        {SITE_NAME} is an information service. Prices come from public store
        listings and TCGplayer data, are published once a day and may have changed
        since: always confirm the price, condition, stock and postage on the
        retailer&apos;s own site before you buy. Purchases are made with the
        retailer, not with {SITE_NAME}.
      </p>
      <p>
        Reference prices marked “≈” are conversions for comparison only and are
        not offers. {SITE_NAME} accepts no liability for a purchase made on the
        strength of a price shown here.
      </p>
      <h2>Accounts</h2>
      <p>
        You can sign in with Google or Discord. Keep that account secure: anyone
        who can sign in to it can use your {SITE_NAME} account. We may suspend
        an account used to scrape the site, abuse the service or get around the
        plan limits.
      </p>
      <h2>Plus and Premium subscriptions</h2>
      <ul>
        <li>
          Plus and Premium are billed monthly or yearly, in US dollars, through
          Stripe, at the price shown on the pricing page when you subscribe.
        </li>
        <li>
          A subscription renews automatically at the end of each period until
          you cancel it.
        </li>
        <li>
          You can cancel at any time from your account page (Manage
          subscription). You keep access until the end of the period you have
          paid for, and you are not charged again.
        </li>
        <li>
          Switching between Plus and Premium, or between monthly and yearly, is
          prorated by Stripe: the unused part of your current period is
          credited.
        </li>
        <li>
          Your price does not change during a period you have paid for. If we
          change a plan&apos;s price, we will tell you before it applies to your
          next renewal, and you can cancel before then.
        </li>
        <li>
          Fees already paid are non-refundable except where the law requires
          otherwise.
        </li>
        <li>
          Plan features are described on the pricing page. We may improve or
          change them; if we remove something central to a plan you pay for, you
          may cancel and we will refund the unused part of the period.
        </li>
      </ul>
      <h2>Data, trademarks and fan content</h2>
      <p>{UNOFFICIAL_FAN_SITE_NOTICE}</p>
      <p>
        {FAN_CONTENT_DISCLAIMER}{" "}
        <a href={FAN_CONTENT_POLICY_URL} rel="noopener noreferrer">
          Fan Content Policy
        </a>
        .
      </p>
      <p>{DATA_ATTRIBUTION} Trademarks, card names and artwork belong to their owners.</p>
    </StaticPage>
  );
}
