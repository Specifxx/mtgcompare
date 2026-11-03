import type { Metadata } from "next";
import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { priceOf, refCents } from "@/lib/data";
import { preorderSetList, sealedInSet } from "@/lib/hubs";
import { daysUntil, isPreorder, longDate, preorderPath } from "@/lib/preorders";
import { fitTitle } from "@/lib/seo-title";
import { PREORDER_COPY } from "@/content/preorders";
import { JsonLd } from "@/components/JsonLd";
import { money } from "@/lib/format";
import { shortName } from "@/lib/names";
import { imageAt } from "@/lib/image";
import { FamilyCluster } from "@/components/FamilyCluster";

export const revalidate = 21600;

// The hub: every release with its own page (/preorders/<set>), soonest first.
// It names no single set in its title, so it never competes with a release's
// own page for "<set> pre-order".
export function generateMetadata(): Metadata {
  const title = fitTitle([`${SITE.gameShort} Pre-Orders: Every Upcoming Release Compared`, `${SITE.gameShort} Pre-Orders: Upcoming Releases`, `${SITE.gameShort} Pre-Orders`]);
  return {
    title,
    description: `Every upcoming ${SITE.game} release with its release date and a page comparing every store's booster box and sealed pre-order prices, cheapest first. Updated daily.`,
    ...canon("/preorders"),
  };
}

export default function Preorders() {
  const list = preorderSetList();
  const upcoming = list.filter((s) => isPreorder(s));
  const recent = list.filter((s) => !isPreorder(s));
  const card = (s: (typeof list)[number]) => {
    const sealed = sealedInSet(s.id);
    const box = sealed.find((p) => p.sealedType === "Booster Box") ?? sealed[0];
    const stores = new Set(sealed.flatMap((p) => priceOf(p.id).offers.filter((o) => o.source !== "tcgplayer" && o.source !== "ebay").map((o) => o.source))).size;
    const days = daysUntil(s.releasedOn);
    return (
      <Link key={s.id} href={preorderPath(s)} className="card-surface flex min-w-0 gap-4 p-4 hover:border-brand/60">
        {box?.image ? <img src={imageAt(box.image, "200w")!} alt={box.name} className="h-24 w-20 shrink-0 object-contain" loading="lazy" /> : null}
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-brand-400">{isPreorder(s) ? `Out ${longDate(s.releasedOn)}${days != null && days > 0 ? ` · ${days} days` : ""}` : `Released ${longDate(s.releasedOn)}`}</p>
          <h2 className="text-lg font-bold">{s.name} {isPreorder(s) ? "pre-orders" : "prices"}</h2>
          <p className="text-sm text-muted">
            {sealed.length ? <>{sealed.length} sealed product{sealed.length === 1 ? "" : "s"} · {stores} store{stores === 1 ? "" : "s"}</> : "No store listings yet"}
            {box && refCents(box.id) ? <> · {shortName(box.name)} {money(refCents(box.id))} on TCGplayer</> : null}
          </p>
          <p className="mt-1 text-sm link">Compare every store →</p>
        </div>
      </Link>
    );
  };
  return (
    <div className="flex flex-col gap-10">
      {PREORDER_COPY.faq.length > 0 && <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: PREORDER_COPY.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />}
      <header>
        <p className="text-xs uppercase tracking-wide text-brand-400">Pre-order tracker · updated daily</p>
        <h1 className="font-display text-3xl font-black md:text-4xl">{SITE.gameShort} pre-orders</h1>
        {PREORDER_COPY.intro && <p className="mt-3 max-w-3xl text-muted" dangerouslySetInnerHTML={{ __html: PREORDER_COPY.intro }} />}
      </header>
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">Coming soon</h2>
          <div className="grid gap-3 md:grid-cols-2">{upcoming.map(card)}</div>
        </section>
      )}
      {recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">Just released</h2>
          <div className="grid gap-3 md:grid-cols-2">{recent.map(card)}</div>
        </section>
      )}
      {!list.length && <p className="text-muted">No set is in pre-order right now. <Link className="link" href="/sealed">Compare sealed prices →</Link></p>}
      <FamilyCluster cluster="cards" kind="preorder" />
      {PREORDER_COPY.faq.length > 0 && (
        <section className="max-w-3xl">
          <h2 className="mb-3 text-xl font-bold">Pre-order FAQ</h2>
          {PREORDER_COPY.faq.map((f) => (
            <div key={f.q} className="border-b border-ink-800 py-3"><h3 className="font-medium">{f.q}</h3><p className="mt-1 text-sm text-muted">{f.a}</p></div>
          ))}
        </section>
      )}
    </div>
  );
}
