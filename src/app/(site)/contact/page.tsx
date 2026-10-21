import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact & report a listing",
  description: `How to reach ${SITE_NAME}: report a wrong price or a mismatched listing, ask to list or remove a store, or press questions.`,
  alternates: { canonical: `${SITE_URL}/contact` },
};

const SUBJECT = (s: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(s)}`;

export default function Contact() {
  return (
    <div className="page max-w-3xl py-12">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Contact</h1>
      <div className="prose-dex mt-6">
        <p>
          One address for everything: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. It is read by a person, usually within two
          working days; a wrong listing or a removal request is dealt with within a day. There is no phone line and no form — email keeps a
          record for both of us.
        </p>

        <h2 id="report">Report a listing</h2>
        <p>
          The most useful email you can send. Listings are matched to products by their titles, so the mistakes are of a few kinds: a product
          on the wrong page (a Japanese box filed as English, a single pack filed as a bundle), a price that is not what the store shows, a
          store listing showing &ldquo;in stock&rdquo; when it isn&rsquo;t, or a product page that is really two products. Please include:
        </p>
        <ul>
          <li>
            <b>The {SITE_NAME} page</b> — its full address, e.g. <code>{SITE_URL}/au/p/…</code>.
          </li>
          <li>
            <b>The store</b> and, if you have it, the link to the store&rsquo;s own product page.
          </li>
          <li>What is wrong, in a sentence. A screenshot helps when the store&rsquo;s price has since changed.</li>
        </ul>
        <p>
          <a href={SUBJECT("Wrong listing")} className="btn-ghost no-underline">
            Email a wrong listing →
          </a>
        </p>

        <h2 id="stores">Stores: get listed, or removed</h2>
        <p>
          If you sell English Pokémon TCG sealed product online on Shopify or WooCommerce, we can list you for free — email your store&rsquo;s
          address and we run the same check as for every other store (<Link href="/about#which-stores">which stores and why</Link>). If you
          would rather not be listed, say so and you are removed within a day, no questions asked. Nothing about being listed can be bought, and
          nothing a store pays or offers changes where it ranks.
        </p>
        <p>
          <a href={SUBJECT("List my store")} className="btn-ghost no-underline">
            List my store →
          </a>{" "}
          <a href={SUBJECT("Remove my store")} className="btn-ghost no-underline">
            Remove my store →
          </a>
        </p>

        <h2 id="press">Press and data questions</h2>
        <p>
          Happy to explain how the counts on the site are produced, or what a region&rsquo;s stores are asking for a product today. We keep no
          price history and no stock history — every figure is about now (<Link href="/about#freshness">freshness</Link>) — so we cannot answer
          &ldquo;what was it last month&rdquo;.
        </p>

        <h2 id="privacy">Privacy requests</h2>
        <p>
          We hold no accounts and no personal data to look up (<Link href="/privacy">privacy</Link>). If you believe otherwise, email and we will
          check.
        </p>
      </div>
    </div>
  );
}
