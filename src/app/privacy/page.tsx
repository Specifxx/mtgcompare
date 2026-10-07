import type { Metadata } from "next";
import { StaticPage } from "@/components/StaticPage";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return (
    <StaticPage title="Privacy policy" crumb="Privacy">
      <p>
        You can use {SITE_NAME} without an account. Browsing without an account
        collects no personal details. If you send us something (a contact
        message, a wrong-price report, feedback or a store suggestion), we keep
        what you typed. An account is optional; this page lists everything the
        site stores or shares, with and without one.
      </p>
      <h2>If you create an account</h2>
      <p>
        You sign in with Google or Discord. We receive and keep your name, email
        address, profile picture and that provider&apos;s account id, plus the
        date you joined and last signed in. We never see your password. We use
        them to sign you in and to run your plan, and we don&apos;t sell or
        share them.
      </p>
      <h2>Payments</h2>
      <p>
        Plus and Premium are paid through Stripe. Stripe handles your card
        details; we never see or store them. We keep your Stripe customer id and
        the date your plan runs to.
      </p>
      <h2>Messages, reports and feedback</h2>
      <ul>
        <li>
          <strong>Contact form</strong> — we keep your name, email address and
          message so we can reply.
        </li>
        <li>
          <strong>Wrong-price reports, feedback and store suggestions</strong> —
          we keep only what you typed, plus your account id if you are signed
          in.
        </li>
        <li>
          We do not store your IP address. A one-way hash of it is held briefly
          in memory to stop spam, and is never written down.
        </li>
        <li>
          Feedback is shown publicly only if you tick the box that allows it,
          and only after review.
        </li>
        <li>Email us (below) to delete anything you sent.</li>
      </ul>
      <h2>Deleting your account</h2>
      <p>
        Email us from your account&apos;s address (below) and we will delete it
        and your stored details. Cancel any subscription first; Stripe keeps its
        own payment records as the law requires.
      </p>
      <h2>Stored in your browser</h2>
      <ul>
        <li>
          <strong>country</strong> cookie — the market you chose, so prices show
          in your currency (1 year).
        </li>
        <li>
          <strong>oc_session</strong> (signed in only) — keeps you signed in (30
          days, not readable by scripts); <strong>oc_auth</strong> — tells the
          page that you are signed in; <strong>oc_adfree</strong> (members only)
          — hides ads before the page draws; <strong>oauth_state_*</strong> and{" "}
          <strong>oauth_next_*</strong> — protect a sign-in in progress and
          remember where to return (10 minutes).
        </li>
        <li>
          <strong>Local storage</strong> — your theme, the side menu&apos;s open
          sections and your watchlist. It never leaves your device except as the
          list of cards your watchlist page asks prices for.
        </li>
      </ul>
      <h2>Analytics</h2>
      <p>
        Vercel Web Analytics counts page views without cookies. Google Analytics
        4 measures visits and which store links are clicked; in the EEA, the UK
        and Switzerland it runs in Google&apos;s consent mode with analytics
        cookies off, sending only cookieless, aggregated signals. Advertising
        storage is off everywhere: no ad network runs here, and the boxes marked
        &ldquo;Ad&rdquo; are plain affiliate links.
      </p>
      <h2>Your location</h2>
      <p>
        On a first visit, your country is read from the request&apos;s IP-based
        location header to pick a market. It is not stored.
      </p>
      <h2>Links to stores</h2>
      <p>
        When you follow a link to a store, eBay or TCGplayer, that site&apos;s
        own privacy policy applies. eBay and TCGplayer links carry an affiliate
        tag identifying {SITE_NAME}, not you.
      </p>
      <p>
        Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </StaticPage>
  );
}
