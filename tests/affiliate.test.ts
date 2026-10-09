import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as affiliate from "../src/lib/affiliate";
import { TCGPLAYER_MAGIC_SEARCH, affiliateUrl, cardEbayQuery, ebaySearchUrl, isPaidLink, magicEbayQuery, tcgplayerCreativeUrl } from "../src/lib/affiliate";
import { tcgplayerUrl } from "../src/lib/constants";
import { ROOT, stripComments, walk } from "./helpers/ratchet";

// Placeholder partner ids: the builder reads NEXT_PUBLIC_* at call time and has no default.
const EBAY = "1000000001";
const IMPACT = "https://partner.tcgplayer.com/c/1000001/2000002/3000003";
function withIds<T>(fn: () => T): T {
  const saved = [process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID, process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK];
  process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID = EBAY;
  process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK = IMPACT;
  try {
    return fn();
  } finally {
    for (const [i, k] of ["NEXT_PUBLIC_EBAY_CAMPAIGN_ID", "NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK"].entries()) {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    }
  }
}

test("eBay searches are tagged with our campaign and an mc- custom id", () =>
  withIds(() => {
    const u = new URL(ebaySearchUrl("AU", "MTG Sol Ring 270", "card-board"));
    assert.equal(u.hostname, "www.ebay.com.au");
    assert.equal(u.searchParams.get("mkevt"), "1");
    assert.equal(u.searchParams.get("campid"), EBAY);
    assert.match(u.searchParams.get("customid") ?? "", /^mc-au-card-board-search$/);
  }));

test("Singapore reroutes to ebay.com and still reports as mc-sg", () =>
  withIds(() => {
    const u = new URL(ebaySearchUrl("SG", "MTG Lightning Bolt"));
    assert.equal(u.hostname, "www.ebay.com");
    assert.match(u.searchParams.get("customid") ?? "", /^mc-sg/);
  }));

test("Magic appears in an eBay query exactly once", () => {
  assert.equal(magicEbayQuery("Lightning Bolt, Magic 2011"), "MTG Lightning Bolt Magic 2011");
  assert.equal(magicEbayQuery("MTG The One Ring Borderless"), "MTG The One Ring Borderless");
  assert.equal(magicEbayQuery("Magic The Gathering Counterspell"), "Magic The Gathering Counterspell");
  assert.equal(cardEbayQuery({ name: "Sol Ring", setName: "Commander Masters", number: "270", variant: "Borderless · Extended Art" }), "MTG Sol Ring Commander Masters 270 Borderless Extended Art");
  assert.equal(cardEbayQuery({ name: "Counterspell", foil: true }), "MTG Counterspell foil");
});

test("TCGplayer links go through Impact with an mc- shared id; store links are untouched", () =>
  withIds(() => {
    const t = affiliateUrl("https://www.tcgplayer.com/product/535325", "tcgplayer", "/card/x");
    assert.ok(t.startsWith(`${IMPACT}?u=`));
    assert.match(t, /sharedid=mc-tcgplayer-card/);
    assert.equal(affiliateUrl("https://store.example/products/x", "store"), "https://store.example/products/x");
    assert.equal(isPaidLink("https://store.example/products/x"), false);
    assert.equal(isPaidLink("https://www.ebay.com/sch/i.html?_nkw=x"), true);
  }));

test("with neither id set every link is plain: no campaign, no custom id, never another site's account", () => {
  const saved = [process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID, process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK];
  delete process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID;
  delete process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK;
  try {
    const e = new URL(ebaySearchUrl("US", "sol ring"));
    assert.equal(e.searchParams.get("campid"), null);
    assert.equal(e.searchParams.get("customid"), null);
    assert.equal(affiliateUrl("https://www.tcgplayer.com/product/1"), "https://www.tcgplayer.com/product/1");
    assert.equal(isPaidLink("https://www.ebay.com/sch/i.html?_nkw=x"), false);
    assert.equal(isPaidLink("https://www.tcgplayer.com/product/1"), false);
  } finally {
    if (saved[0] !== undefined) process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID = saved[0];
    if (saved[1] !== undefined) process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK = saved[1];
  }
});

// ── The store-wide TCGplayer banners and ads ("Shop Magic singles & sealed") ──
// Until 2026-10-09 the card page's house banner and the footer box linked TCGplayer's One Piece Card Game search. They now land on the
// Magic product line, through the same affiliateUrl as a card's own TCGplayer link (The One Ring, LTR, product 487805: tests/fixtures/titles/rows.json).
const BANNER_FILES = ["src/components/TcgplayerBanner.tsx", "src/components/AffiliateAds.tsx", "src/components/home/PartnersStrip.tsx", "src/components/TcgplayerAd.tsx"];
const codeOf = (f: string): string => stripComments(fs.readFileSync(path.join(ROOT, f), "utf8"));

test("the store-wide TCGplayer search is the Magic: The Gathering product line", () => {
  const u = new URL(TCGPLAYER_MAGIC_SEARCH);
  assert.equal(u.hostname, "www.tcgplayer.com");
  assert.equal(u.pathname, "/search/magic/product");
  assert.equal(u.searchParams.get("productLineName"), "magic");
});

test("the banners go through Impact like a card's own TCGplayer link, with the banner's mc- shared id, and land on the Magic search", () =>
  withIds(() => {
    const card = affiliateUrl(tcgplayerUrl(487805, "F"), "tcgplayer", "/card");
    for (const [subId, loc, sharedid] of [["tcgplayer_banner", "/card", "mc-tcgplayer_banner-card"], ["tcgplayer_footer", "/footer", "mc-tcgplayer_footer-footer"], ["partners_strip", "/", "mc-partners_strip-home"]] as const) {
      const href = affiliateUrl(TCGPLAYER_MAGIC_SEARCH, subId, loc);
      assert.equal(href.split("?")[0], card.split("?")[0], "the same Impact link as the card page's");
      const q = new URL(href).searchParams;
      assert.equal(q.get("u"), TCGPLAYER_MAGIC_SEARCH);
      assert.equal(q.get("sharedid"), sharedid);
    }
    assert.equal(isPaidLink(TCGPLAYER_MAGIC_SEARCH), true, "the banner carries the per-row 'Paid link' rule of any TCGplayer link");
    assert.equal(new URL(card).searchParams.get("u"), "https://www.tcgplayer.com/product/487805?Printing=Foil");
  }));

test("an Impact creative keeps our account and program, swaps in the owner's ad id and deep-links the Magic search; anything else renders nothing", () => {
  withIds(() => {
    const href = tcgplayerCreativeUrl("3841228", TCGPLAYER_MAGIC_SEARCH, "tcg-ad", "/card");
    assert.ok(href?.startsWith("https://partner.tcgplayer.com/c/1000001/3841228/3000003?"), href ?? "null");
    const q = new URL(href!).searchParams;
    assert.equal(q.get("u"), TCGPLAYER_MAGIC_SEARCH);
    assert.equal(q.get("sharedid"), "mc-tcg-ad-card");
    assert.equal(tcgplayerCreativeUrl("38412x8", TCGPLAYER_MAGIC_SEARCH, "tcg-ad", "/card"), null, "a malformed ad id is never guessed");
  });
  const saved = process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK;
  try {
    delete process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK;
    assert.equal(tcgplayerCreativeUrl("3841228", TCGPLAYER_MAGIC_SEARCH, "tcg-ad", "/card"), null, "no Impact link of our own: no creative link");
    process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK = "https://tcgplayer.example/short-link";
    assert.equal(tcgplayerCreativeUrl("3841228", TCGPLAYER_MAGIC_SEARCH, "tcg-ad", "/card"), null, "an Impact link not in the /c/<account>/<ad>/<program> shape");
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK;
    else process.env.NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK = saved;
  }
});

test("every TCGplayer banner and ad reads TCGPLAYER_MAGIC_SEARCH, and no file in src/ names another product line or a sister site's helper", () => {
  for (const f of BANNER_FILES) {
    const code = codeOf(f);
    assert.match(code, /\bTCGPLAYER_MAGIC_SEARCH\b/, `${f} does not land on the Magic search`);
    assert.doesNotMatch(code, /tcgplayer\.com\/search/, `${f} spells a TCGplayer search URL of its own`);
  }
  const files = walk("src", (f) => /\.(tsx?|js|mjs|cjs)$/.test(f));
  assert.ok(files.length > 100, "the walk found the source tree");
  for (const f of files) {
    const code = codeOf(f);
    for (const m of code.matchAll(/tcgplayer\.com\/search\/([\w-]+)/g)) assert.equal(m[1], "magic", `${f}: TCGplayer search of product line ${m[1]}`);
    for (const m of code.matchAll(/productLineName=([\w-]+)/g)) assert.equal(m[1], "magic", `${f}: productLineName=${m[1]}`);
    assert.doesNotMatch(code, /one-piece-card-game|riftbound-league-of-legends|ONE_PIECE|onePiece/, f);
  }
  assert.equal("onePieceEbayQuery" in affiliate, false, "the One Piece alias of magicEbayQuery is gone");
});
