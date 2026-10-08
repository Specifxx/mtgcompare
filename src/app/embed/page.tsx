import type { Metadata } from "next";
import { CopyPostButton } from "@/components/CopyPostButton";
import { storeBadgeSnippet } from "@/lib/store-badge";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Embeds",
  description: `Free price badges, a market index widget and a release countdown you can put on your own site, from ${SITE_NAME}.`,
  alternates: { canonical: "/embed" },
};

const frame = (path: string, h: number) => `<iframe src="${SITE_URL}${path}" width="260" height="${h}" style="border:0" loading="lazy" title="${SITE_NAME}"></iframe>`;
const WIDGETS = [
  { name: "Card price badge", note: "Replace lightning-bolt with any card slug from its page URL.", code: frame("/embed/card/lightning-bolt", 130) },
  { name: "Market index", note: "The index value and its 7-day change.", code: frame("/embed/index", 110) },
  { name: "Release countdown", note: "Days until the next Magic release.", code: frame("/embed/release-countdown", 110) },
  { name: "Store badge", note: "For stores we list; replace the store key with yours.", code: storeBadgeSnippet("cardkingdom") },
];

export default function EmbedPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Embeds</h1>
      <p className="mt-2 text-sm">Copy a snippet onto your blog, forum signature or store. Each widget links back to {SITE_NAME}.</p>
      {WIDGETS.map((w) => (
        <section key={w.name} className="mt-6">
          <h2 className="text-lg font-semibold">{w.name}</h2>
          <p className="text-sm">{w.note}</p>
          <CopyPostButton text={w.code} label="Copy code" copiedHint="Paste it into your page's HTML." />
        </section>
      ))}
    </main>
  );
}
