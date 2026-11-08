import type { Metadata } from "next";
import { VaultView } from "@/components/vault/VaultView";
import { VAULT_SITE } from "@/components/vault/vault-config";

// MY COLLECTION (competitor scan, 2026-11-08; src/lib/vault.ts). The list lives in the visitor's browser, so this
// page is the same static shell for everyone: no session, no database, nothing cached per user.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "My collection",
  description: `What your ${VAULT_SITE.what} collection is worth at today's store prices, and how much it has moved.`,
  // Personal page: never indexed, never in the sitemap. Not disallowed in robots.txt, so Google can see the noindex.
  robots: { index: false, follow: false },
  alternates: { canonical: "/collection" },
};

export default function CollectionPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-bold sm:text-3xl">My collection</h1>
      <p className="mt-2 text-sm opacity-75">What everything you own is worth at today&apos;s store prices. Saved in this browser only.</p>
      <VaultView />
    </div>
  );
}
