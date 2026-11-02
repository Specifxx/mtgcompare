// The Compare Empire network: which site is in which cluster, the public "family feed" each site
// publishes, and how a page picks what it shows from its sisters (owner, 2026-11-02: "each site
// helps each other grow as a team effort"; plan "Sites that grow each other").
//
// SAME FILE IN EVERY REPO (TCGEmpire, OpCompare, CompareEmpire/apps/dexcompare-sealed, mtgcompare,
// the four card-engine repos, wargamecompare, figurecompare, compareempiretake2, Camcompare).
// Change it in one, copy it to all; tests/family-network.test.ts is the same everywhere too.
// KaeYoung stands alone (owner, 2026-10-30) and is never listed.
//
// HOW IT FLOWS. Each site's own daily data job writes `family-feed.json` (its best deals and
// pre-orders today, per region, real store prices only) next to the data it already commits to
// GitHub. A sister reads those files from raw.githubusercontent.com: either its own data job
// copies its cluster's feeds into `family-cluster.json` (file-based sites), or a cached server
// read fetches them (RiftCompare, OP Compare: six hours at least). Nothing reads another site's
// database, nothing is fetched from a visitor's browser, and no new Vercel function exists.
//
// RULES. One block per page. Labels never name a country (the price carries its currency). A feed
// older than FEED_MAX_AGE_DAYS, or an item that fails validation, is dropped: the block shows less,
// never a guess. Links between sites in one cluster are plain followed links.

export type ClusterId = "cards" | "hobby" | "tech";
export type FamilyRegion = "US" | "UK" | "AU" | "CA" | "NZ" | "EU" | "SG";
export type FamilySiteId =
  | "rift"
  | "op"
  | "dex"
  | "mtg"
  | "gundam"
  | "lorcana"
  | "ygo"
  | "cyberpunk"
  | "wargame"
  | "figure"
  | "empire"
  | "cam";

export const FAMILY_REGIONS: readonly FamilyRegion[] = ["US", "UK", "AU", "CA", "NZ", "EU", "SG"];

export interface FamilySite {
  id: FamilySiteId;
  name: string;
  url: string;
  /** Region-neutral: what a reader gets there ("One Piece card prices"). Never a country. */
  label: string;
  /** The game or category in a tile's kicker ("One Piece"). */
  topic: string;
  clusters: readonly ClusterId[];
  /** The public feed, on GitHub (raw), written by the site's own data job (family-feed.json beside its other public data). */
  feed: string;
  /** The site's self-updating price report, when it has one (a path on `url`). */
  report?: string;
}

const RAW = "https://raw.githubusercontent.com/Specifxx";

export const FAMILY_SITES: readonly FamilySite[] = [
  { id: "rift", name: "RiftCompare", url: "https://riftcompare.com", label: "Riftbound card prices", topic: "Riftbound", clusters: ["cards"], feed: `${RAW}/TCGEmpire/main/data/public/family/family-feed.json`, report: "/market/report" },
  { id: "op", name: "OP Compare", url: "https://opcompare.app", label: "One Piece card prices", topic: "One Piece", clusters: ["cards"], feed: `${RAW}/OpCompare/snapshot/family-feed.json`, report: "/market" },
  { id: "dex", name: "DexCompare", url: "https://dexcompare.app", label: "Pokémon TCG sealed prices", topic: "Pokémon", clusters: ["cards"], feed: `${RAW}/CompareEmpire/main/apps/dexcompare-sealed/data/public/family/family-feed.json` },
  { id: "mtg", name: "MTG Compare", url: "https://mtgcompare.app", label: "Magic: The Gathering sealed prices", topic: "Magic", clusters: ["cards"], feed: `${RAW}/mtgcompare/main/data/public/family/family-feed.json` },
  { id: "gundam", name: "Gundam Compare", url: "https://gundamcompare.com", label: "Gundam card and Gunpla prices", topic: "Gundam", clusters: ["cards", "hobby"], feed: `${RAW}/GundamCompare/main/data/public/family/family-feed.json`, report: "/price-report" },
  { id: "lorcana", name: "Lorcana Compare", url: "https://lorcanacompare.com", label: "Disney Lorcana card prices", topic: "Lorcana", clusters: ["cards"], feed: `${RAW}/lorcanacompare/main/data/public/family/family-feed.json`, report: "/price-report" },
  { id: "ygo", name: "YGO Compare", url: "https://ygocompare.com", label: "Yu-Gi-Oh! card prices", topic: "Yu-Gi-Oh!", clusters: ["cards"], feed: `${RAW}/ygocompare/main/data/public/family/family-feed.json`, report: "/price-report" },
  { id: "cyberpunk", name: "Cyberpunk Compare", url: "https://cyberpunkcompare.com", label: "Cyberpunk TCG prices", topic: "Cyberpunk TCG", clusters: ["cards"], feed: `${RAW}/cyberpunkcompare/main/data/public/family/family-feed.json`, report: "/price-report" },
  { id: "wargame", name: "WargameCompare", url: "https://wargamecompare.com", label: "Miniature wargame prices", topic: "Wargames", clusters: ["hobby"], feed: `${RAW}/wargamecompare/main/data/family/family-feed.json`, report: "/price-report" },
  { id: "figure", name: "FigureCompare", url: "https://figurecompare.com", label: "Anime figure prices", topic: "Anime figures", clusters: ["hobby"], feed: `${RAW}/figurecompare/main/data/family/family-feed.json` },
  { id: "empire", name: "Compare Empire", url: "https://compareempire.com", label: "Tech and appliance prices", topic: "Tech", clusters: ["tech"], feed: `${RAW}/compareempiretake2/claude/admiring-newton-5xtu2p/data/family/family-feed.json` },
  { id: "cam", name: "CamCompare", url: "https://www.camcompare.app", label: "Camera and lens prices", topic: "Cameras", clusters: ["tech"], feed: `${RAW}/Camcompare/main/data/family/family-feed.json` },
];

export const CLUSTER_NAMES: Record<ClusterId, string> = { cards: "Card games", hobby: "Hobby", tech: "Tech" };

/** The network page every footer links once ("A Compare Empire site"). */
export const NETWORK_PAGE = "https://compareempire.com/network";

export const FEED_FILE = "family-feed.json";
export const CLUSTER_FILE = "family-cluster.json";
export const FEED_MAX_AGE_DAYS = 4;
/** Per cluster, kind, region (and category, when items name one): the most items a feed carries. */
export const FEED_ITEMS_PER_GROUP = 6;

export function familySite(id: FamilySiteId): FamilySite {
  const s = FAMILY_SITES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown family site ${id}`);
  return s;
}

/** The other sites in a cluster, in registry order. */
export function clusterSisters(self: FamilySiteId, cluster: ClusterId): FamilySite[] {
  return FAMILY_SITES.filter((s) => s.id !== self && s.clusters.includes(cluster));
}

/** Every site sharing any cluster with `self` (its footer list), in registry order. */
export function footerSisters(self: FamilySiteId): FamilySite[] {
  const mine = familySite(self).clusters;
  return FAMILY_SITES.filter((s) => s.id !== self && s.clusters.some((c) => mine.includes(c)));
}

// ── The feed ────────────────────────────────────────────────────────────────

export type RefLabel = "median store price" | "TCGplayer market price" | "RRP" | "MSRP" | "dearest store";

export interface FamilyItem {
  kind: "deal" | "preorder";
  cluster: ClusterId;
  region: FamilyRegion;
  title: string;
  /** Absolute, on the publishing site. */
  url: string;
  image?: string | null;
  /** The cheapest in-stock (or open pre-order) store price, minor units, in `currency`. */
  cents: number;
  currency: string;
  store: string;
  /** What the price is under, same currency (deals). */
  refCents?: number | null;
  refLabel?: RefLabel | null;
  savingPct?: number | null;
  /** YYYY-MM-DD (pre-orders). */
  releaseDate?: string | null;
  /** The publishing site's own category key ("cameras", "laptops"), so a sister can prefer what its readers buy. */
  category?: string | null;
}

export interface FamilyFeed {
  v: 1;
  site: FamilySiteId;
  generatedAt: string;
  /** Where "more deals" / "more pre-orders" goes, per region (absolute URLs on the site). */
  links: Partial<Record<FamilyRegion, { deals?: string; preorders?: string }>>;
  items: FamilyItem[];
  /** Hand-offs (tech cluster): every product page the site has, by name, so a sister can link the same product. */
  products?: FamilyProduct[];
}

export interface FamilyProduct {
  name: string;
  /** Absolute, on the publishing site. */
  url: string;
}

export const FEED_MAX_PRODUCTS = 4000;

const REF_LABELS: readonly RefLabel[] = ["median store price", "TCGplayer market price", "RRP", "MSRP", "dearest store"];
const CURRENCY_OF: Record<FamilyRegion, string> = { US: "USD", UK: "GBP", AU: "AUD", CA: "CAD", NZ: "NZD", EU: "EUR", SG: "SGD" };

function onSite(url: unknown, site: FamilySite): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    const home = new URL(site.url);
    return u.protocol === "https:" && u.hostname.replace(/^www\./, "") === home.hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

const isText = (v: unknown, max = 160): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** A feed item is kept only when every fact checks out; anything else is dropped, never repaired. */
export function validItem(x: unknown, site: FamilySite): FamilyItem | null {
  if (!x || typeof x !== "object") return null;
  const i = x as Record<string, unknown>;
  if (i.kind !== "deal" && i.kind !== "preorder") return null;
  if (typeof i.cluster !== "string" || !site.clusters.includes(i.cluster as ClusterId)) return null;
  if (typeof i.region !== "string" || !FAMILY_REGIONS.includes(i.region as FamilyRegion)) return null;
  const region = i.region as FamilyRegion;
  if (!isText(i.title) || !isText(i.store, 80) || !onSite(i.url, site)) return null;
  if (typeof i.cents !== "number" || !Number.isInteger(i.cents) || i.cents <= 0 || i.cents > 10_000_000) return null;
  if (i.currency !== CURRENCY_OF[region]) return null;
  const item: FamilyItem = { kind: i.kind, cluster: i.cluster as ClusterId, region, title: i.title.trim(), url: i.url, cents: i.cents, currency: i.currency, store: i.store.trim() };
  if (typeof i.image === "string" && /^https:\/\//.test(i.image)) item.image = i.image;
  if (typeof i.category === "string" && /^[a-z0-9-]{1,40}$/.test(i.category)) item.category = i.category;
  if (i.kind === "deal") {
    // A deal states what it is under, and the saving must be the arithmetic of the two prices.
    if (typeof i.refCents !== "number" || !Number.isInteger(i.refCents) || i.refCents <= i.cents) return null;
    if (typeof i.refLabel !== "string" || !REF_LABELS.includes(i.refLabel as RefLabel)) return null;
    const pct = Math.round((1 - i.cents / i.refCents) * 100);
    if (pct < 5 || pct > 60) return null;
    item.refCents = i.refCents;
    item.refLabel = i.refLabel as RefLabel;
    item.savingPct = pct;
  } else {
    if (i.releaseDate != null) {
      if (typeof i.releaseDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(i.releaseDate)) return null;
      item.releaseDate = i.releaseDate;
    }
  }
  return item;
}

/** A feed as read from GitHub: null unless it is v1, from the site it claims, and fresh enough. */
export function validFeed(x: unknown, expect: FamilySiteId, now = Date.now()): FamilyFeed | null {
  if (!x || typeof x !== "object") return null;
  const f = x as Record<string, unknown>;
  if (f.v !== 1 || f.site !== expect || typeof f.generatedAt !== "string") return null;
  const at = Date.parse(f.generatedAt);
  if (!Number.isFinite(at) || at > now + 3_600_000 || now - at > FEED_MAX_AGE_DAYS * 86_400_000) return null;
  const site = familySite(expect);
  const items = Array.isArray(f.items) ? f.items.map((i) => validItem(i, site)).filter((i): i is FamilyItem => i !== null) : [];
  const links: FamilyFeed["links"] = {};
  if (f.links && typeof f.links === "object") {
    for (const [r, l] of Object.entries(f.links as Record<string, unknown>)) {
      if (!FAMILY_REGIONS.includes(r as FamilyRegion) || !l || typeof l !== "object") continue;
      const { deals, preorders } = l as Record<string, unknown>;
      const out: { deals?: string; preorders?: string } = {};
      if (onSite(deals, site)) out.deals = deals;
      if (onSite(preorders, site)) out.preorders = preorders;
      if (out.deals || out.preorders) links[r as FamilyRegion] = out;
    }
  }
  const out: FamilyFeed = { v: 1, site: expect, generatedAt: f.generatedAt, links, items };
  if (Array.isArray(f.products)) {
    out.products = (f.products as unknown[])
      .slice(0, FEED_MAX_PRODUCTS)
      .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
      .filter((p) => isText(p.name) && onSite(p.url, site))
      .map((p) => ({ name: String(p.name).trim(), url: String(p.url) }));
  }
  return out;
}

/** What a site's data job writes: the items capped per (cluster, kind, region, category), deals biggest saving first, pre-orders soonest first. */
export function buildFeed(site: FamilySiteId, items: readonly FamilyItem[], links: FamilyFeed["links"], now = new Date(), products?: readonly FamilyProduct[]): FamilyFeed {
  const me = familySite(site);
  const groups = new Map<string, FamilyItem[]>();
  for (const raw of items) {
    const i = validItem(raw, me);
    if (!i) continue;
    const k = `${i.cluster}|${i.kind}|${i.region}|${i.category ?? ""}`;
    const g = groups.get(k) ?? [];
    if (g.some((x) => x.url === i.url)) continue;
    g.push(i);
    groups.set(k, g);
  }
  const out: FamilyItem[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) =>
      a.kind === "deal" ? (b.savingPct ?? 0) - (a.savingPct ?? 0) || a.cents - b.cents : (a.releaseDate ?? "9999").localeCompare(b.releaseDate ?? "9999") || a.cents - b.cents,
    );
    out.push(...g.slice(0, FEED_ITEMS_PER_GROUP));
  }
  const feed: FamilyFeed = { v: 1, site, generatedAt: now.toISOString(), links, items: out };
  if (products?.length) feed.products = products.filter((p) => isText(p.name) && onSite(p.url, me)).slice(0, FEED_MAX_PRODUCTS).map((p) => ({ name: p.name.trim(), url: p.url }));
  return feed;
}

/** Reads sister feeds from GitHub. A feed that fails to load or validate is left out, never retried in a loop. */
export async function fetchFamilyFeeds(
  ids: readonly FamilySiteId[],
  fetcher: (url: string) => Promise<unknown> = defaultFetch,
  now = Date.now(),
): Promise<FamilyFeed[]> {
  const got = await Promise.all(
    ids.map(async (id) => {
      try {
        return validFeed(await fetcher(familySite(id).feed), id, now);
      } catch {
        return null;
      }
    }),
  );
  return got.filter((f): f is FamilyFeed => f !== null);
}

async function defaultFetch(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** The cluster file a file-based site commits: its cluster sisters' feeds as read today. */
export interface FamilyCluster {
  v: 1;
  site: FamilySiteId;
  fetchedAt: string;
  feeds: FamilyFeed[];
}

/** Re-validates a committed cluster file at read time (so an old file ages out on its own). */
export function validCluster(x: unknown, self: FamilySiteId, now = Date.now()): FamilyFeed[] {
  if (!x || typeof x !== "object") return [];
  const c = x as Record<string, unknown>;
  if (c.v !== 1 || c.site !== self || !Array.isArray(c.feeds)) return [];
  const out: FamilyFeed[] = [];
  for (const f of c.feeds) {
    const id = f && typeof f === "object" ? (f as Record<string, unknown>).site : null;
    if (typeof id !== "string" || id === self || !FAMILY_SITES.some((s) => s.id === id)) continue;
    const v = validFeed(f, id as FamilySiteId, now);
    if (v) out.push(v);
  }
  return out;
}

// ── Picking tiles ───────────────────────────────────────────────────────────

export interface FamilyTile {
  site: FamilySite;
  item: FamilyItem;
  /** The sister's own deals or pre-orders page for this region, when its feed names one. */
  more: string | null;
}

/**
 * One tile per sister in the cluster: its best item of `kind` in the visitor's region, else in the
 * US (the price shows its own currency), else its best item of the other kind. Deals rank by saving,
 * pre-orders by release date. At most `max` tiles.
 */
export function pickTiles(
  feeds: readonly FamilyFeed[],
  opts: { self: FamilySiteId; cluster: ClusterId; kind: "deal" | "preorder"; region: FamilyRegion; max?: number; perSite?: number; prefer?: string },
): FamilyTile[] {
  const max = opts.max ?? 6;
  const perSite = opts.perSite ?? 1;
  const tiles: FamilyTile[] = [];
  for (const site of clusterSisters(opts.self, opts.cluster)) {
    const feed = feeds.find((f) => f.site === site.id);
    if (!feed) continue;
    const mine = feed.items.filter((i) => i.cluster === opts.cluster);
    const other = opts.kind === "deal" ? "preorder" : "deal";
    const tries: [FamilyItem["kind"], FamilyRegion][] = [
      [opts.kind, opts.region],
      [opts.kind, "US"],
      [other, opts.region],
      [other, "US"],
    ];
    // The first rung with anything wins; a preferred category goes first inside it (Compare Empire's cameras on CamCompare).
    let got: FamilyItem[] = [];
    for (const [k, r] of tries) {
      got = mine.filter((i) => i.kind === k && i.region === r);
      if (got.length) break;
    }
    if (opts.prefer) got = [...got.filter((i) => i.category === opts.prefer), ...got.filter((i) => i.category !== opts.prefer)];
    for (const item of got.slice(0, perSite)) {
      // A feed's links are its main section's (a Gunpla tile has no "more deals" page on Gundam Compare's card side).
      const l = item.cluster === site.clusters[0] ? feed.links[item.region] : undefined;
      tiles.push({ site, item, more: (item.kind === "deal" ? l?.deals : l?.preorders) ?? null });
    }
  }
  tiles.sort((a, b) => {
    if (a.item.kind !== b.item.kind) return a.item.kind === opts.kind ? -1 : 1;
    if (opts.prefer && (a.item.category === opts.prefer) !== (b.item.category === opts.prefer)) return a.item.category === opts.prefer ? -1 : 1;
    if (a.item.kind === "deal") return (b.item.savingPct ?? 0) - (a.item.savingPct ?? 0);
    return (a.item.releaseDate ?? "9999").localeCompare(b.item.releaseDate ?? "9999");
  });
  return tiles.slice(0, max);
}

const SYMBOL: Record<string, string> = { USD: "US$", AUD: "A$", CAD: "C$", NZD: "NZ$", SGD: "S$", GBP: "£", EUR: "€" };

/** "US$129.99", "£84.50", "A$219": the currency is always visible, since tiles mix sites. */
export function familyMoney(cents: number, currency: string): string {
  const whole = cents % 100 === 0;
  const n = (cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  return `${SYMBOL[currency] ?? `${currency} `}${n}`;
}

/** The block's heading: says what the tiles are, never a country. */
export function blockHeading(cluster: ClusterId, kind: "deal" | "preorder"): string {
  const what = { cards: "card games", hobby: "hobby", tech: "tech" }[cluster];
  if (kind === "preorder") return cluster === "cards" ? "Pre-orders for other card games" : `More ${what} pre-orders from our sister sites`;
  return cluster === "cards" ? "Other card games on sale" : `More ${what} deals from our sister sites`;
}

/** The line under a tile's price: "18% under the median store price" or "Out 14 Nov". */
export function tileNote(i: FamilyItem): string {
  if (i.kind === "deal" && i.savingPct && i.refLabel) return `${i.savingPct}% under the ${i.refLabel}`;
  if (i.kind === "preorder" && i.releaseDate) {
    const d = new Date(`${i.releaseDate}T00:00:00Z`);
    return `Pre-order · out ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
  }
  return i.kind === "preorder" ? "Pre-order" : "Today's best price";
}

/** Maps a site's own region code ("us", "GB", "uk"…) to the feed's. */
export function toFamilyRegion(code: string | null | undefined): FamilyRegion {
  const c = (code ?? "").toUpperCase();
  if (c === "GB") return "UK";
  return (FAMILY_REGIONS as readonly string[]).includes(c) ? (c as FamilyRegion) : "US";
}

/** Shared by every data job: write own feed, then copy the cluster's feeds. */
export function clusterIds(self: FamilySiteId): FamilySiteId[] {
  return footerSisters(self).map((s) => s.id);
}

// ── Hand-offs: the same product on a sister site ────────────────────────────

/** Words that describe the box, not the model ("Canon EOS R6 Mark III Body" is the "Canon EOS R6 Mark III"). */
const PACKAGING = /\b(body( only)?|only|mirrorless|interchangeable[- ]lens|digital|compact|medium[- ]format|full[- ]frame|camera|cameras|black|silver)\b/g;

/** A name reduced to its model, or null when it names more than one thing (a kit, a combo, a bundle). */
export function modelKey(name: string): string | null {
  const n = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  if (/\b(kit|combo|bundle|with|w\/|pack|set|case|cage|battery|charger|strap|bag|filter|adapter|refurb\w*|used|renewed)\b|\+|&/.test(n)) return null;
  const k = n.replace(/[()\[\],]/g, " ").replace(PACKAGING, " ").replace(/[^a-z0-9.\/ -]/g, " ").replace(/\s+/g, " ").trim();
  return k.split(" ").length >= 2 ? k : null;
}

/**
 * The sister's page for this product: the one product whose model key equals ours, else null.
 * Exact only, and two candidates are no match (CLAUDE.md: a wrong match is worse than none).
 */
export function sameProduct(name: string, products: readonly FamilyProduct[] | undefined, aliases: readonly string[] = []): FamilyProduct | null {
  if (!products?.length) return null;
  const keys = new Set([name, ...aliases].map(modelKey).filter((k): k is string => !!k));
  if (!keys.size) return null;
  const hits = new Map<string, FamilyProduct>();
  for (const p of products) {
    const k = modelKey(p.name);
    if (k && keys.has(k)) hits.set(p.url, p);
  }
  return hits.size === 1 ? [...hits.values()][0] : null;
}
