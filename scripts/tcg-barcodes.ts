// TCGplayer's barcodes for sealed Magic product (owner, 2026-11-18: identifier searches are easy search results). TCGCSV
// (TCGplayer's catalogue as daily JSON, public, no key): the group list, then one product list per group, 300 ms apart. A
// product with a card number is a single and is skipped; a sealed product's `extendedData` "UPC" is kept only when its check
// digit is right and no other product carries it (src/lib/gtin.ts). Writes data/barcodes/tcgplayer.json, TCGplayer product
// id -> barcode, which the product page joins through its TCGplayer offer's URL (src/lib/barcodes.ts). Never fails the import:
// on any error the file is kept as it is.
import fs from "node:fs";
import path from "node:path";
import { normaliseGtin, uniqueGtins } from "../src/lib/gtin";

const FILE = path.join(process.cwd(), "data/barcodes/tcgplayer.json");
const API = `https://tcgcsv.com/tcgplayer/${process.env.TCG_CATEGORY ?? "1"}`;
const HEADERS = { "User-Agent": "MTGCompare/1.0 (+https://mtgcompare.app)", Accept: "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = { productId: number; extendedData?: { name: string; value: string }[] };

async function results<T>(url: string): Promise<T[] | null> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (res.status !== 200) return null;
  const body = (await res.json()) as { results?: T[] };
  return Array.isArray(body.results) ? body.results : null;
}

async function main(): Promise<void> {
  const groups = await results<{ groupId: number }>(`${API}/groups`);
  if (!groups || groups.length < 20) return console.log("[barcodes] TCGplayer's group list could not be read; file kept.");
  const found: { id: number; upc?: string }[] = [];
  let failed = 0;
  for (const g of groups) {
    await sleep(300);
    try {
      const rows = await results<Row>(`${API}/${g.groupId}/products`);
      if (!rows) {
        failed++;
        continue;
      }
      for (const r of rows) {
        const ext = new Map((r.extendedData ?? []).map((e) => [e.name, e.value]));
        if (ext.get("Number")) continue;
        const upc = normaliseGtin(ext.get("UPC"));
        if (upc) found.push({ id: r.productId, upc });
      }
    } catch {
      failed++;
    }
  }
  // A group that failed today keeps yesterday's barcodes rather than losing them.
  if (failed > groups.length / 4) return console.log(`[barcodes] ${failed} of ${groups.length} groups failed; file kept.`);
  const old = fs.existsSync(FILE) ? (JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, string>) : {};
  const seen = new Set(found.map((f) => f.id));
  for (const [id, upc] of Object.entries(old)) if (failed && !seen.has(Number(id))) found.push({ id: Number(id), upc });
  uniqueGtins(found);
  const out: Record<string, string> = {};
  for (const f of found.sort((a, b) => a.id - b.id)) if (f.upc) out[f.id] = f.upc;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(out) + "\n");
  console.log(`[barcodes] ${Object.keys(out).length} sealed products with a barcode from ${groups.length} groups (${failed} failed).`);
}

main().catch((e) => console.log(`[barcodes] ${e instanceof Error ? e.message : e}; file kept.`));
