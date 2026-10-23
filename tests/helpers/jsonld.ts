// A small JSON-LD checker for the types the site emits, against schema.org's definitions and Google's structured-data rules for
// product snippets, breadcrumbs and item lists. Returns the problems found (empty = valid). Used by tests/jsonld.test.ts and by the
// deploy check (scripts are free to import it).

const SCHEMA = "https://schema.org";
const AVAILABILITY = new Set(["InStock", "PreOrder", "OutOfStock", "SoldOut", "LimitedAvailability", "BackOrder", "Discontinued", "InStoreOnly", "OnlineOnly", "PreSale"].map((a) => `${SCHEMA}/${a}`));
const CONDITION = new Set(["NewCondition", "UsedCondition", "RefurbishedCondition", "DamagedCondition"].map((c) => `${SCHEMA}/${c}`));
const ISO4217 = /^[A-Z]{3}$/;
const PRICE = /^\d+(?:\.\d{1,2})?$/;
const absolute = (u: unknown) => typeof u === "string" && /^https:\/\/[^\s]+$/.test(u);

type Node = Record<string, unknown>;

/** Every node of a JSON-LD document: a top-level object, the members of an @graph, or an array of either. */
export function nodesOf(doc: unknown): Node[] {
  if (Array.isArray(doc)) return doc.flatMap(nodesOf);
  if (!doc || typeof doc !== "object") return [];
  const d = doc as Node;
  return Array.isArray(d["@graph"]) ? (d["@graph"] as unknown[]).flatMap(nodesOf) : [d];
}

/** Every <script type="application/ld+json"> block of an HTML page, parsed (a block that does not parse is reported). */
export function jsonLdBlocks(html: string): { docs: unknown[]; errors: string[] } {
  const docs: unknown[] = [];
  const errors: string[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      docs.push(JSON.parse(m[1]));
    } catch (e) {
      errors.push(`unparseable JSON-LD: ${(e as Error).message}`);
    }
  }
  return { docs, errors };
}

function checkOffer(o: Node, where: string, out: string[]) {
  const t = o["@type"];
  if (t === "AggregateOffer") {
    if (typeof o.lowPrice !== "string" || !PRICE.test(o.lowPrice)) out.push(`${where}: lowPrice "${o.lowPrice}" is not a plain number`);
    if (o.highPrice != null && (typeof o.highPrice !== "string" || !PRICE.test(o.highPrice))) out.push(`${where}: highPrice "${o.highPrice}" is not a plain number`);
    if (o.highPrice != null && Number(o.highPrice) < Number(o.lowPrice)) out.push(`${where}: highPrice under lowPrice`);
    if (!Number.isInteger(o.offerCount) || (o.offerCount as number) < 1) out.push(`${where}: offerCount must be a positive integer`);
  } else if (t === "Offer") {
    if (typeof o.price !== "string" || !PRICE.test(o.price)) out.push(`${where}: price "${o.price}" is not a plain number`);
  } else {
    out.push(`${where}: offers is a ${String(t)}, not an Offer or AggregateOffer`);
    return;
  }
  if (typeof o.priceCurrency !== "string" || !ISO4217.test(o.priceCurrency)) out.push(`${where}: priceCurrency "${o.priceCurrency}" is not ISO 4217`);
  if (o.availability != null && !AVAILABILITY.has(o.availability as string)) out.push(`${where}: availability "${o.availability}" is not a schema.org ItemAvailability`);
  if (o.itemCondition != null && !CONDITION.has(o.itemCondition as string)) out.push(`${where}: itemCondition "${o.itemCondition}"`);
  if (o.url != null && !absolute(o.url)) out.push(`${where}: url must be absolute https`);
}

function checkNode(n: Node, out: string[], top: boolean) {
  const t = n["@type"];
  if (top && n["@context"] !== SCHEMA && n["@context"] !== `${SCHEMA}/`) out.push(`${String(t)}: @context must be ${SCHEMA}`);
  if (typeof t !== "string") {
    out.push("a node without @type");
    return;
  }
  switch (t) {
    case "Product": {
      if (typeof n.name !== "string" || !n.name.trim()) out.push("Product: name required");
      // Google: a product snippet needs offers, review or aggregateRating; the site only ever has offers.
      if (!n.offers) out.push("Product: offers required (the site has no reviews or ratings)");
      else checkOffer(n.offers as Node, "Product.offers", out);
      if (n.image != null && !absolute(n.image) && !(Array.isArray(n.image) && n.image.every(absolute))) out.push("Product: image must be absolute URLs");
      if (n.url != null && !absolute(n.url)) out.push("Product: url must be absolute https");
      if ("aggregateRating" in n || "review" in n) out.push("Product: no ratings or reviews exist; none may be emitted");
      break;
    }
    case "BreadcrumbList":
    case "ItemList": {
      const items = n.itemListElement;
      if (!Array.isArray(items) || !items.length) {
        out.push(`${t}: itemListElement must be a non-empty list`);
        break;
      }
      items.forEach((it: Node, i: number) => {
        if (it["@type"] !== "ListItem") out.push(`${t}[${i}]: must be a ListItem`);
        if (it.position !== i + 1) out.push(`${t}[${i}]: position ${String(it.position)}, expected ${i + 1}`);
        const hasItem = typeof it.item === "string" || (it.item && typeof it.item === "object");
        if (t === "BreadcrumbList") {
          if (typeof it.name !== "string" || !it.name) out.push(`BreadcrumbList[${i}]: name required`);
          // every crumb but the last (the page itself) needs its URL
          if (i < items.length - 1 && !(typeof it.item === "string" && absolute(it.item))) out.push(`BreadcrumbList[${i}]: item must be an absolute URL`);
        } else if (!(absolute(it.url) || hasItem)) out.push(`ItemList[${i}]: url (absolute) or item required`);
      });
      if (n.numberOfItems != null && (!Number.isInteger(n.numberOfItems) || (n.numberOfItems as number) < items.length)) out.push(`${t}: numberOfItems under the list's length`);
      break;
    }
    case "FAQPage": {
      const q = n.mainEntity;
      if (!Array.isArray(q) || !q.length) out.push("FAQPage: mainEntity questions required");
      else for (const x of q as Node[]) if (x["@type"] !== "Question" || !x.name || !(x.acceptedAnswer as Node)?.text) out.push("FAQPage: each Question needs a name and an acceptedAnswer text");
      break;
    }
    default:
      break;
  }
}

/** The problems with one parsed JSON-LD document (empty = valid). */
export function validateJsonLd(doc: unknown): string[] {
  const out: string[] = [];
  const nodes = nodesOf(doc);
  const graph = !!doc && typeof doc === "object" && !Array.isArray(doc) && Array.isArray((doc as Node)["@graph"]);
  if (graph && (doc as Node)["@context"] !== SCHEMA) out.push("@graph: @context must be https://schema.org");
  for (const n of nodes) checkNode(n, out, !graph);
  return out;
}
