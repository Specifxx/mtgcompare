// Check whether a store can be added to src/lib/stores.ts, or how a registered
// one reads today:
//
//   npx tsx scripts/probe-stores.ts https://store.example AU [https://other.example UK …]
//   npx tsx scripts/probe-stores.ts --platform=shadowpos https://shop.example US
//   npx tsx scripts/probe-stores.ts --platform=bigcommerce --collections=/tcgs/one-piece/singles/ https://shop.example AU
//   npx tsx scripts/probe-stores.ts --platform=ecwid --ecwid-store=14194057 --collections=147798763 https://shop.example AU
//   npx tsx scripts/probe-stores.ts --key=mightytoys,lotusgamesct      # registered stores, any platform
//
// Platforms: shopify (the default), shadowpos, ecwid, woocommerce, bigcommerce,
// nopcommerce — the same readers lib/import.ts uses (lib/store-import.ts
// fetchStoreListings). For Shopify it discovers the One Piece collections
// (sitemap + the handles the importer would read) and fetches them with the
// market's Shopify Markets country. Every title then goes through the real
// matcher against the catalogue in DATABASE_URL, so the numbers it prints are
// what the import would match. Read-only: it writes nothing.
import { prisma } from "../src/lib/db";
import { normalizeCountry } from "../src/lib/country";
import { bestVariant, buildCardIndex, buildDonIndex, buildNameIndex, matchStoreProduct, type SealedRef, type StoreMatchIndexes } from "../src/lib/match";
import { fetchStoreListings } from "../src/lib/store-import";
import { STORE_BY_KEY, platformOf, type StoreInfo, type StorePlatform } from "../src/lib/stores";

const PLATFORMS: StorePlatform[] = ["shopify", "shadowpos", "ecwid", "woocommerce", "bigcommerce", "nopcommerce"];

function parseArgs(argv: string[]): StoreInfo[] {
  const flags = new Map<string, string>();
  const rest: string[] = [];
  for (const a of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(a);
    if (m) flags.set(m[1], m[2]);
    else rest.push(a);
  }
  if (flags.has("key")) {
    return flags
      .get("key")!
      .split(",")
      .map((k) => {
        const s = STORE_BY_KEY[k.trim()];
        if (!s) throw new Error(`no registered store "${k}"`);
        return s;
      });
  }
  const platform = (flags.get("platform") ?? "shopify") as StorePlatform;
  if (!PLATFORMS.includes(platform)) throw new Error(`unknown platform "${platform}" (${PLATFORMS.join(", ")})`);
  if (rest.length < 2 || rest.length % 2) throw new Error("usage: probe-stores.ts [--platform=…] [--collections=a,b] [--ecwid-store=N] <base-url> <market> [<base-url> <market> …] | --key=a,b");
  const collections = (flags.get("collections") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const out: StoreInfo[] = [];
  for (let i = 0; i < rest.length; i += 2) {
    const base = rest[i].replace(/\/+$/, "");
    out.push({
      key: "probe",
      name: base,
      base,
      country: normalizeCountry(rest[i + 1]),
      collections,
      platform,
      ...(flags.has("ecwid-store") ? { ecwidStoreId: Number(flags.get("ecwid-store")) } : {}),
    });
  }
  return out;
}

async function main() {
  let stores: StoreInfo[];
  try {
    stores = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
  }
  // The same indexes and paths as lib/import.ts importStores.
  const cards = await prisma.card.findMany({
    where: { number: { not: null } },
    select: { id: true, name: true, tcgName: true, number: true, variant: true, set: { select: { code: true, name: true, tcgName: true } } },
  });
  const dons = await prisma.card.findMany({ where: { number: null }, select: { id: true, tcgName: true, set: { select: { code: true, name: true, tcgName: true } } } });
  const sealed = await prisma.sealed.findMany({ select: { id: true, name: true, kind: true, set: { select: { code: true, name: true } } } });
  const ix: StoreMatchIndexes = {
    cards: buildCardIndex(cards.map((c) => ({ ...c, setCode: c.set.code, setName: c.set.name, setTcgName: c.set.tcgName }))),
    names: buildNameIndex([...cards, ...dons].map((c) => ({ id: c.id, tcgName: c.tcgName, setNames: [c.set.name, c.set.tcgName] }))),
    dons: buildDonIndex(dons.map((d) => ({ id: d.id, tcgName: d.tcgName, setCode: d.set.code, setName: d.set.name }))),
    sealed: sealed.map((s) => ({ id: s.id, name: s.name, kind: s.kind as SealedRef["kind"], setCode: s.set?.code ?? null, setName: s.set?.name ?? null })),
  };
  for (const store of stores) {
    const { products, failed, handles, note } = await fetchStoreListings(store);
    const misses: Record<string, number> = {};
    const unmatched: string[] = [];
    let matched = 0;
    let inStock = 0;
    for (const p of products) {
      const m = matchStoreProduct(p.title, (p.variants ?? []).map((v) => v.sku), ix);
      if ("id" in m) {
        matched++;
        if (bestVariant(p.variants ?? [])) inStock++;
      } else {
        misses[m.miss] = (misses[m.miss] ?? 0) + 1;
        if (unmatched.length < 8) unmatched.push(p.title.slice(0, 90));
      }
    }
    console.log(
      `${store.base} (${store.country}, ${platformOf(store)}): ${handles.length} collections, ${products.length} products, ${matched} matched, ${inStock} matched in stock${failed ? " — THE READ FAILED" : ""}${note ? ` (${note})` : ""}`,
    );
    console.log(`  handles: ${handles.join(", ") || "none"}`);
    console.log(`  misses: ${JSON.stringify(misses)}`);
    if (unmatched.length) console.log(`  unmatched e.g.: ${unmatched.map((t) => JSON.stringify(t)).join(" · ")}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
