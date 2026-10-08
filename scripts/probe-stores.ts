// Check whether a store can be admitted to src/lib/stores.ts, or how a registered one reads today:
//
//   npx tsx scripts/probe-stores.ts https://store.example AU [https://other.example UK ...]
//   npx tsx scripts/probe-stores.ts --platform=shadowpos https://shop.example US
//   npx tsx scripts/probe-stores.ts --platform=bigcommerce --collections=/tcgs/magic/singles/ https://shop.example AU
//   npx tsx scripts/probe-stores.ts --platform=ecwid --ecwid-store=14194057 --collections=147798763 https://shop.example AU
//   npx tsx scripts/probe-stores.ts --key=goodgames,lotusgamesct       # registered stores, any platform
//   npx tsx scripts/probe-stores.ts --pages=5 --data=.data/v1 --key=goodgames
//
// Platforms: shopify (the default), shadowpos, ecwid, woocommerce, bigcommerce, nopcommerce: the same readers the import uses (lib/store-import.ts fetchStoreListings). For Shopify it discovers the
// Magic collections (sitemap + the handles the importer would read) and reads the first `--pages` pages of each (default 2) with the market's Shopify Markets country. Every title then goes through the
// real matcher against the catalogue of a PUBLISHED TREE (--data, default .data/v1: a checkout of the data branch; the probe reads no database and no data host), so the numbers it prints are what the
// import would match. The admission rule of 10.26 is applied to the result: at least 20 matched in-stock listings of tracked units and a currency that matches the market. Read-only: it writes nothing;
// a store that passes is marked `status: "verified", verifiedAt: <date>` in src/lib/store-registry-seed.ts by hand.
import { normalizeCountry, currencyOf } from "../src/lib/country";
import { matchRowsFromTree, snapshotFromTree } from "../src/lib/import";
import { ADMIT_MIN_MATCHED_IN_STOCK, buildStageIndex, fetchStoreListings, matchListing, newTally, shopifyCurrency } from "../src/lib/store-import";
import { fsTree } from "../src/lib/data/plane/tree";
import { STORE_BY_KEY, platformOf, type StoreInfo, type StorePlatform } from "../src/lib/stores";

const PLATFORMS: StorePlatform[] = ["shopify", "shadowpos", "ecwid", "woocommerce", "bigcommerce", "nopcommerce"];
const FOIL_WORDS = /foil|etched/i;
const PLAIN_WORDS = /\b(normal|non-?foil|regular)\b/i;

interface Args { stores: StoreInfo[]; pages: number; data: string }
function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  const rest: string[] = [];
  for (const a of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(a);
    if (m) flags.set(m[1], m[2]);
    else rest.push(a);
  }
  const pages = Math.max(1, Number(flags.get("pages") ?? 2) || 2);
  const data = flags.get("data") ?? ".data/v1";
  if (flags.has("key")) {
    return {
      pages, data,
      stores: flags.get("key")!.split(",").map((k) => {
        const s = STORE_BY_KEY[k.trim()];
        if (!s) throw new Error(`no registered store "${k}"`);
        return s;
      }),
    };
  }
  const platform = (flags.get("platform") ?? "shopify") as StorePlatform;
  if (!PLATFORMS.includes(platform)) throw new Error(`unknown platform "${platform}" (${PLATFORMS.join(", ")})`);
  if (rest.length < 2 || rest.length % 2) throw new Error("usage: probe-stores.ts [--pages=N] [--data=DIR] [--platform=...] [--collections=a,b] [--ecwid-store=N] <base-url> <market> [<base-url> <market> ...] | --key=a,b");
  const collections = (flags.get("collections") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const stores: StoreInfo[] = [];
  for (let i = 0; i < rest.length; i += 2) {
    const base = rest[i].replace(/\/+$/, "");
    stores.push({
      id: 32000 + i / 2, key: "probe", name: base, base, country: normalizeCountry(rest[i + 1]), collections, platform, status: "unverified",
      ...(flags.has("ecwid-store") ? { ecwidStoreId: Number(flags.get("ecwid-store")) } : {}),
    });
  }
  return { stores, pages, data };
}

async function main() {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
  }
  const tree = fsTree(args.data);
  if (!tree.has("status.json")) {
    console.error(`${args.data} is not a published data tree (no status.json): check out the data branch there`);
    process.exit(2);
  }
  const snapshot = snapshotFromTree(tree, new Date().toISOString().slice(0, 10));
  const tracked = new Set<number>(snapshot.units.map((u) => u.id * 2 + (u.finish === "F" ? 1 : 0)));
  const si = buildStageIndex({ match: matchRowsFromTree(tree), work: tree, tracked });
  for (const store of args.stores) {
    const probe: StoreInfo = { ...store, maxPages: Math.min(store.maxPages ?? args.pages, args.pages) };
    const tally = newTally();
    const foilVariants = { foilStores: 0, plainMarked: 0, plainUnmarked: 0 };
    const read = await fetchStoreListings(probe, {
      sink: (page) => {
        for (const p of page) {
          matchListing(store, p, si, tally);
          if (p.variants.some((v) => FOIL_WORDS.test(v.title))) {
            foilVariants.foilStores++;
            const plain = p.variants.filter((v) => !FOIL_WORDS.test(v.title));
            if (plain.length) (plain.some((v) => PLAIN_WORDS.test(`${v.title} ${(v.options ?? []).join(" ")}`)) ? foilVariants.plainMarked++ : foilVariants.plainUnmarked++);
          }
        }
      },
      stopBelowCents: 100,
    });
    for (const p of read.products) matchListing(store, p, si, tally);
    const inStock = tally.drafts.filter((d) => d.inStock).length;
    const stated = platformOf(store) === "shopify" ? await shopifyCurrency(store) : null;
    const currencyOk = !store.currency && (!stated || stated === currencyOf(store.country));
    const admitted = !read.failed && currencyOk && inStock >= ADMIT_MIN_MATCHED_IN_STOCK;
    console.log(
      `${store.base} (${store.country}, ${platformOf(store)}): ${read.handles.length} collections, ${tally.products} products, ${tally.matched} matched, ${inStock} matched in stock of tracked units${read.failed ? " - THE READ FAILED" : ""}${read.note ? ` (${read.note})` : ""}`,
    );
    console.log(`  currency: store states ${stated ?? "nothing"}, market ${currencyOf(store.country)}${store.currency ? `, registry says ${store.currency}` : ""}`);
    console.log(`  admission (>= ${ADMIT_MIN_MATCHED_IN_STOCK} matched in stock, currency matches): ${admitted ? "ADMIT" : "NOT ADMITTED"}`);
    console.log(`  handles: ${read.handles.join(", ") || "none"}`);
    console.log(`  misses: ${JSON.stringify(tally.misses)}`);
    const seen = foilVariants.plainMarked + foilVariants.plainUnmarked;
    if (seen >= 10) console.log(`  explicitFoil candidate: ${foilVariants.plainUnmarked / seen > 0.9 ? "true (the store marks only its foil variants)" : "leave unset (it marks its non-foil variants too)"} - ${seen} products with foil and non-foil variants`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
