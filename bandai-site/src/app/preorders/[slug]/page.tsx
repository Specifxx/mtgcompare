import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound, permanentRedirect } from "next/navigation";
import { SITE } from "@/site.config";
import { canon, abs } from "@/lib/site";
import { byValue, meta, priceOf, productsInSet, refCents, setBySlug } from "@/lib/data";
import { preorderSetList, sealedInSet } from "@/lib/hubs";
import { daysUntil, isPreorder, longDate, preorderPath, preorderTitleCandidates } from "@/lib/preorders";
import { fitTitle } from "@/lib/seo-title";
import { postsAbout } from "@/lib/posts";
import { PREORDER_COPY } from "@/content/preorders";
import { PriceTable } from "@/components/PriceTable";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { TileGrid } from "@/components/ProductTile";
import { money } from "@/lib/format";
import { shortName } from "@/lib/names";
import { imageAt } from "@/lib/image";
import type { QA, SetInfo } from "@/lib/site-types";
import { FamilyCluster } from "@/components/FamilyCluster";

// /preorders/<set slug>: one release's landing page (lib/preorders.ts). Six
// hours like every page buyers act on; nothing prerendered at build.
export const revalidate = 21600;
export const generateStaticParams = () => [];

/** The set, if it has a page today; a set past its window goes to its card list. */
function release(slug: string): SetInfo {
  const s = setBySlug(slug);
  if (!s) notFound();
  if (!preorderSetList().some((x) => x.id === s.id)) {
    if (s.productCount > 0) permanentRedirect(`/sets/${s.slug}`);
    notFound();
  }
  return s;
}

/** The FAQ: the release's own copy, else questions answered from its data. */
function faqFor(s: SetInfo, pre: boolean): QA[] {
  const own = PREORDER_COPY.sets[s.slug]?.faq ?? [];
  const asked = new Set(own.map((f) => f.q.toLowerCase()));
  const auto: QA[] = [
    pre
      ? { q: `When does ${s.name} release?`, a: s.releasedOn ? `${longDate(s.releasedOn)}, the date TCGplayer lists for the set. Stores sometimes ship a few days either side; each store's listing has its own date.` : "No date is confirmed yet. This page adds each store as soon as its listing appears." }
      : { q: `When did ${s.name} release?`, a: `${longDate(s.releasedOn)}. Its full card list with prices is on the ${s.name} set page.` },
    { q: `Where is the cheapest ${s.name} booster box?`, a: `It depends on your market and changes daily. The table on this page lists every store we track with a ${s.name} listing in your currency, cheapest in-stock first, next to TCGplayer and eBay. Prices are item prices before shipping.` },
    { q: "Are these prices final?", a: "No. A store can change a pre-order price before release as allocations firm up, and we refresh every store once a day. Check the price and the store's pre-order terms at checkout." },
  ];
  return [...own, ...auto.filter((f) => !asked.has(f.q.toLowerCase()))];
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const s = setBySlug(params.slug);
  if (!s) return {};
  const pre = isPreorder(s);
  const title = fitTitle(preorderTitleCandidates(s.name, pre));
  const description = pre
    ? `${s.name} pre-order prices: booster boxes, packs and sealed from every ${SITE.gameShort} store we track, cheapest first, in your currency. Out ${longDate(s.releasedOn)}.`
    : `${s.name} booster box and sealed prices from every ${SITE.gameShort} store we track, in-stock first, in your currency, updated daily. Released ${longDate(s.releasedOn)}.`;
  const path = preorderPath(s);
  return { title, description, ...canon(path), openGraph: { ...canon(path).openGraph, title: title.absolute, description } };
}

export default function PreorderRelease({ params }: { params: { slug: string } }) {
  const s = release(params.slug);
  const pre = isPreorder(s);
  const copy = PREORDER_COPY.sets[s.slug];
  const fx = meta()?.fx ?? { USD: 1 };
  const sealed = sealedInSet(s.id);
  const chase = byValue(productsInSet(s.id).filter((p) => p.kind === "card")).filter((p) => refCents(p.id)).slice(0, 12);
  const days = daysUntil(s.releasedOn);
  const others = preorderSetList().filter((x) => x.id !== s.id);
  const guides = postsAbout([s.name, s.code]).slice(0, 4);
  const faq = faqFor(s, pre);
  // How many stores list any of the set's sealed products, and the booster box's TCGplayer price: the summary line.
  const stores = new Set(sealed.flatMap((p) => priceOf(p.id).offers.filter((o) => o.source !== "tcgplayer" && o.source !== "ebay").map((o) => o.source))).size;
  const box = sealed.find((p) => p.sealedType === "Booster Box");
  const boxRef = box ? refCents(box.id) : null;
  const path = preorderPath(s);
  return (
    <div className="flex flex-col gap-10">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${s.name} ${pre ? "pre-orders" : "sealed products"}`,
          url: abs(path),
          numberOfItems: sealed.length,
          itemListElement: sealed.slice(0, 30).map((p, i) => ({ "@type": "ListItem", position: i + 1, name: shortName(p.name), url: abs(`/card/${p.slug}`) })),
        }}
      />
      <header>
        <Breadcrumbs items={[{ name: "Pre-orders", href: "/preorders" }, { name: s.name }]} />
        <p className="text-xs uppercase tracking-wide text-brand-400">
          {pre ? `Pre-order · releases ${longDate(s.releasedOn)}${days != null ? (days === 0 ? " · out today" : ` · ${days} day${days === 1 ? "" : "s"} to go`) : ""}` : `Out now · released ${longDate(s.releasedOn)}`}
        </p>
        <h1 className="font-display text-3xl font-black md:text-4xl">{pre ? `${s.name} pre-order prices` : `${s.name} booster box prices`}</h1>
        {copy?.intro ? (
          <p className="mt-3 max-w-3xl text-muted" dangerouslySetInnerHTML={{ __html: copy.intro }} />
        ) : (
          <p className="mt-3 max-w-3xl text-muted">
            Every {SITE.gameShort} store we track with a {s.name} listing, {pre ? "taking pre-orders" : "in stock"} in your currency, cheapest first, next to TCGplayer and eBay. Refreshed daily.
          </p>
        )}
        <p className="mt-3 text-sm text-muted">
          {sealed.length > 0 && <>{sealed.length} sealed product{sealed.length === 1 ? "" : "s"} · {stores} store{stores === 1 ? "" : "s"} listing {pre ? "pre-orders" : "it"}</>}
          {boxRef ? <> · booster box on TCGplayer {money(boxRef)}</> : null}
          {sealed.length > 0 ? " · " : null}
          <Link className="link" href={`/sets/${s.slug}`}>{s.name} card list →</Link>
        </p>
        {copy && copy.facts.length > 0 && (
          <dl className="mt-5 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
            {copy.facts.map((f) => (
              <div key={f.label} className="card-surface p-3"><dt className="text-xs text-muted">{f.label}</dt><dd className="font-semibold">{f.value}</dd></div>
            ))}
          </dl>
        )}
      </header>

      <section className="flex flex-col gap-6">
        <h2 className="text-2xl font-bold">{pre ? `Where to pre-order ${s.name}` : `Where to buy ${s.name}`}</h2>
        {sealed.length === 0 && (
          <div className="card-surface p-5 text-sm text-muted">
            No store we track lists {s.name} yet. Stores usually open pre-orders six to ten weeks before release; this page adds each one, and TCGplayer and eBay, as soon as its listing appears, refreshed daily. Nothing here is ever an estimate.
          </div>
        )}
        {sealed.map((p) => {
          const e = priceOf(p.id);
          return (
            <div key={p.id} className="card-surface grid gap-4 p-4 md:grid-cols-[120px_1fr]">
              {p.image ? <img src={imageAt(p.image, "200w")!} alt={shortName(p.name)} className="mx-auto h-32 object-contain" loading="lazy" /> : <div />}
              <div className="min-w-0">
                <h3 className="font-semibold">
                  <Link className="hover:underline" href={`/card/${p.slug}`}>{shortName(p.name)}</Link>{" "}
                  {refCents(p.id) ? <span className="text-sm font-normal text-muted">TCGplayer {money(refCents(p.id))}</span> : null}
                </h3>
                <div className="mt-2"><PriceTable offers={e.offers} fx={fx} productId={p.id} page="preorders" compact /></div>
                <Link className="mt-2 inline-block text-sm link" href={`/card/${p.slug}`}>Every price and the price history →</Link>
              </div>
            </div>
          );
        })}
      </section>

      {chase.length > 0 && (
        <section>
          <h2 className="mb-1 text-2xl font-bold">{s.name} chase cards</h2>
          <p className="mb-3 text-sm text-muted">{pre ? "The most valuable cards so far, at TCGplayer market. Pre-release prices move fast." : "The most valuable cards at TCGplayer market."} <Link className="link" href={`/sets/${s.slug}`}>Full card list →</Link></p>
          <TileGrid items={chase} />
        </section>
      )}

      {(guides.length > 0 || others.length > 0) && (
        <section className="grid gap-6 md:grid-cols-2">
          {guides.length > 0 && (
            <div>
              <h2 className="mb-2 text-lg font-bold">{s.name} guides</h2>
              <ul className="list-disc pl-5 text-sm">{guides.map((g) => <li key={g.slug}><Link className="link" href={`/blog/${g.slug}`}>{g.title}</Link></li>)}</ul>
            </div>
          )}
          {others.length > 0 && (
            <div>
              <h2 className="mb-2 text-lg font-bold">Other {SITE.gameShort} releases</h2>
              <ul className="list-disc pl-5 text-sm">
                {others.map((x) => <li key={x.id}><Link className="link" href={preorderPath(x)}>{x.name}</Link> <span className="text-muted">· {isPreorder(x) ? "out" : "released"} {longDate(x.releasedOn)}</span></li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      <FamilyCluster cluster="cards" kind="preorder" />

      <section className="max-w-3xl">
        <h2 className="mb-3 text-xl font-bold">{s.name} {pre ? "pre-order" : "price"} FAQ</h2>
        {faq.map((f) => (
          <div key={f.q} className="border-b border-ink-800 py-3"><h3 className="font-medium">{f.q}</h3><p className="mt-1 text-sm text-muted">{f.a}</p></div>
        ))}
      </section>
    </div>
  );
}
