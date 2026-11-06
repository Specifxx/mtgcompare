import type { Metadata } from "next";
import { CartListView } from "@/components/cart/CartListView";

// THE CART LIST (owner, 2026-11-06; DECISIONS.md, "A cart list on every site"). The
// list lives in the visitor's browser (src/lib/cart-list.ts), so this page is the
// same static shell for everyone: no session, no database, nothing cached per user.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Your cart",
  description: "The store prices you saved, grouped by store, with one checkout button per store.",
  // Personal page: never indexed, never in the sitemap. Not disallowed in robots.txt,
  // so Google can see the noindex.
  robots: { index: false, follow: false },
  alternates: { canonical: "/cart" },
};

export default function CartPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-bold sm:text-3xl">Your cart</h1>
      <p className="mt-2 text-sm opacity-75">
        Add store prices from any product page, then check out store by store. Your cart stays in this browser.
      </p>
      <CartListView />
    </div>
  );
}
