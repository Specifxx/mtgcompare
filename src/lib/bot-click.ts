// Bot rules for /go and /out (owner, 2026-11-22: "make sure that there are literally zero false negatives when you filter bots,
// and false positives are okay"). Hiding or untagging a real person costs a sale; letting a bot through costs nothing we can see.
// So the affiliate tag is taken off ONLY for a request that names itself a crawler or script (or sends no User-Agent at all,
// which no browser does): looksLikeBot. Missing Accept-Language or Sec-Fetch-Mode (iOS before 16.4, some in-app and privacy
// browsers) and a Sec-Fetch-Site of "none" or "cross-site" (a link pasted, opened from Discord, an email or a translate proxy)
// are real people too; since 2026-11-22 they keep a tagged link and only skip the SERVER-side click log (suspectClick). The
// browser's own buy_click event still counts them. History: a crawler opened ~28,000 links 10-13 Nov and came back with full
// browser headers on 14 Nov (DECISIONS.md, "Bot clicks on TCGplayer"); those clicks now reach the networks tagged, by design.
const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|scrape|headless|phantom|puppeteer|playwright|selenium|python|curl|wget|httpx|okhttp|axios|node-fetch|undici|go-http|java\/|libwww|aiohttp|scrapy|feedfetcher|facebookexternalhit|bytespider|gptbot|claudebot|ccbot|perplexity|amazonbot|petalbot|semrush|ahrefs|mj12|dotbot/i;

/** A self-declared crawler or script. The ONLY reason a link is sent untagged. Pure and edge-safe. */
export function looksLikeBot(headers: Headers): boolean {
  const ua = headers.get("user-agent") ?? "";
  return !ua || BOT_UA.test(ua);
}

/** Probably not a click on our page (or a declared bot). Used only to leave a click out of the server-side log, never to untag. */
export function suspectClick(headers: Headers): boolean {
  if (looksLikeBot(headers)) return true;
  if (!headers.get("accept-language") || !headers.get("sec-fetch-mode")) return true;
  const site = headers.get("sec-fetch-site");
  return !!site && site !== "same-origin" && site !== "same-site";
}

/** Where a bot is sent: TCGplayer's own page instead of our Impact link to it; any other destination as it is. */
export function untaggedDest(dest: string): string {
  try {
    const u = new URL(dest);
    if (u.hostname.toLowerCase() !== "partner.tcgplayer.com") return dest;
    const inner = new URL(u.searchParams.get("u") ?? "");
    return inner.protocol === "https:" && /(?:^|\.)tcgplayer\.com$/.test(inner.hostname.toLowerCase()) ? inner.toString() : dest;
  } catch {
    return dest;
  }
}
