// More pieces for the data-driven guides (2026-10-23): the FAQ section (its questions shown on the page AND sent as FAQPage JSON-LD,
// in the same words), a product table by type label with lib/packs.ts's per-pack column, and the "Prices checked" byline note.
// Server components; no JSX runs at import (kit.tsx's rule).
import Link from "@/components/Link";
import type { ReactNode } from "react";
import type { ProductCardData } from "@/lib/data";
import { money } from "@/lib/format";
import { packsForLabel, perPackCents } from "@/lib/packs";
import type { RegionInfo } from "@/lib/regions";
import { faqJsonLd, jsonLd } from "@/lib/seo";
import { whereText } from "../families";
import { NoneYet, ProductTh, StackTable, type GuideSection } from "./kit";

export interface Faq {
  q: string;
  a: string;
}

/** The guide's FAQ: a visible list of questions and answers, and the same list as FAQPage JSON-LD. Answers are plain text. */
export function faqSection(faq: readonly Faq[], id = "faq", title = "Questions people ask"): GuideSection {
  return {
    id,
    title,
    body: (
      <>
        <dl className="my-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface" data-faq="">
          {faq.map((f) => (
            <div key={f.q} className="p-4">
              <dt className="font-semibold leading-6 text-ink">{f.q}</dt>
              <dd className="mt-1 text-[15px] leading-6 text-muted">{f.a}</dd>
            </div>
          ))}
        </dl>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqJsonLd(faq)) }} />
      </>
    ),
  };
}

/** Packs in a product by lib/packs.ts (its type label, set and name), or null where the count is not certain. */
export const packsOfCard = (p: Pick<ProductCardData, "productType" | "setCode" | "name">) => packsForLabel(p.productType, p.setCode, p.name);

/**
 * A live table of products: name (linked), price, price per pack (only where lib/packs.ts is sure of the count) and where it is
 * open. `label` names each row's kind (its type label by default).
 */
export function CardTable({ r, caption, products, label, empty, perPack = true }: { r: RegionInfo; caption: string; products: readonly ProductCardData[]; label?: (p: ProductCardData) => string; empty?: string; perPack?: boolean }) {
  if (!products.length) return <NoneYet>{empty}</NoneYet>;
  const head = perPack ? ["Product", "Price", "Per pack", "In stock at"] : ["Product", "Price", "In stock at"];
  return (
    <StackTable
      caption={caption}
      head={head}
      rows={products.map((p) => {
        const pp = perPackCents(p.lowestPriceCents, packsOfCard(p));
        const cells = [
          <span key="p" className="font-semibold">{money(p.lowestPriceCents, r.market)}</span>,
          ...(perPack ? [<span key="pp">{pp != null ? money(pp, r.market) : "—"}</span>] : []),
          <span key="w" className="text-muted">{whereText(p)}</span>,
        ];
        return { key: p.slug, th: <ProductTh r={r} label={label ? label(p) : p.productType} p={p} />, cells };
      })}
    />
  );
}

/** A set's page link. */
export function SetLink({ r, slug, children }: { r: RegionInfo; slug: string; children: ReactNode }) {
  return (
    <Link href={`/${r.region}/sets/${slug}`} prefetch={false} className="font-semibold text-brand underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}
