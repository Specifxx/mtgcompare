// The tag lint (2026-11-19, boardroom: "fail the build if an affiliate tag or customid is missing on a paid row"). A paid row whose
// link lost its eBay campaign, its customid or TCGplayer's Impact wrap earns nothing and nobody notices: the click still works.
// So the build runs this first (scripts/tag-lint.ts, `npm run build`) and stops on any problem, and tests/tag-lint.test.ts runs it in
// the test suite. It checks the link BUILDERS every paid row goes through, in every region and placement, that an untagged eBay
// listing is refused (listingHref drops the tile), and that no component hard-codes an eBay or TCGplayer link that skips them.
// Listing links themselves are used exactly as eBay returned them (their custom id rides the import's affiliateReferenceId header),
// so a listing needs our campaign here, not a customid.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  EBAY_CAMPAIGN_ID,
  PLACEMENTS,
  ebayCardSearchUrl,
  ebaySearchUrl,
  epnTagUrl,
  listingHref,
  tcgplayerAffiliateUrl,
  tcgplayerSearchUrl,
} from "./affiliate";
import { REGIONS, type Region } from "./regions";

/** null, or what is missing from an outbound paid link. */
export function paidLinkProblem(url: string, opts: { customid?: boolean } = {}): string | null {
  let u: URL;
  try {
    u = new URL(url, "https://example.invalid");
  } catch {
    return "not a URL";
  }
  const h = u.hostname.replace(/^www\./, "");
  if (/(^|\.)ebay\.[a-z.]+$/.test(h)) {
    if (u.searchParams.get("campid") !== EBAY_CAMPAIGN_ID) return "eBay link without our campaign";
    if (opts.customid !== false && !u.searchParams.get("customid")) return "eBay link without a customid";
    return null;
  }
  if (u.pathname === "/out/tcgplayer") return u.searchParams.get("sharedid") ? null : "TCGplayer link without a sharedid";
  if (/(^|\.)partner\.tcgplayer\.com$/.test(h)) return null;
  if (/(^|\.)tcgplayer\.com$/.test(h)) return "TCGplayer link not through Impact";
  return "not an eBay or TCGplayer link";
}

export function tagLintProblems(root = process.cwd()): string[] {
  const out: string[] = [];
  const check = (what: string, url: string | null, opts?: { customid?: boolean }) => {
    const p = url ? paidLinkProblem(url, opts) : "no link";
    if (p) out.push(`${what}: ${p}: ${url}`);
  };
  for (const region of Object.keys(REGIONS) as Region[]) {
    for (const placement of PLACEMENTS) {
      check(`eBay search ${region}/${placement}`, ebaySearchUrl("Booster Box", region, placement));
      check(`eBay card search ${region}/${placement}`, ebayCardSearchUrl("Booster Box", region, placement));
      check(`TCGplayer product ${region}/${placement}`, tcgplayerAffiliateUrl("https://www.tcgplayer.com/product/123456", region, placement));
      check(`TCGplayer search ${region}/${placement}`, tcgplayerSearchUrl("Booster Box", region, placement));
    }
    check(`eBay listing tag ${region}`, epnTagUrl("https://www.ebay.com/itm/123456789012", region, "lint"));
  }
  if (listingHref("https://www.ebay.com/itm/123456789012") !== null) out.push("an eBay listing without our campaign is not refused");
  const raw = /href=["'`]https:\/\/(?:www\.)?(?:ebay\.[a-z.]+|tcgplayer\.com)\//;
  for (const dir of ["src/components", "src/app"]) {
    for (const f of walk(join(root, dir))) if (raw.test(readFileSync(f, "utf8"))) out.push(`bare eBay/TCGplayer href in ${f.slice(root.length + 1)}`);
  }
  return out;
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else if (/\.tsx?$/.test(name)) files.push(p);
  }
  return files;
}
