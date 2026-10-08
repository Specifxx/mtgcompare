// Submit the sitemap's URLs to IndexNow (Bing, Yandex, Seznam, Naver) so they recrawl now. Run daily by
// .github/workflows/indexnow.yml, after the daily data publish (23:15 UTC; the sitemap changes daily because the catalogue does).
// Needs SITE_URL and INDEXNOW_KEY; waits for /indexnow.txt to serve the key (so it works right after a deploy) and exits quietly if it never does.
//
// /sitemap.xml is an INDEX of sectioned sitemaps (contract 4.5): the script follows it, one child at a time. By default it submits the sections that
// hold the hubs and the releases (static, sets, sealed, commanders: a few thousand URLs); the 35,000-card and 15,000-hub sections change in price, not in
// kind, and a daily resubmission of every page is what IndexNow's guidance asks sites not to do. Pass --sections=all (or a list such as
// --sections=static,sets,cards) to widen it by hand; --max=N caps one run (default 10,000, IndexNow's batch size).
const UA = "MTGCompare-build/0.1 (+https://github.com/Specifxx/mtgcompare)";
const SECTIONS_DEFAULT = ["static", "sets", "sealed", "commanders"];

async function get(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}
const locs = (xml: string): string[] => [...xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
/** "https://x/sitemaps/cards-3.xml" -> "cards". */
const kindOf = (url: string): string => /\/sitemaps\/([a-z]+)-\d+\.xml$/.exec(url)?.[1] ?? "";

/** The page URLs to submit: the children of the index that `sections` names (a plain urlset is its own single child). */
export async function urlsToSubmit(site: string, sections: string, max: number, fetchText: (u: string) => Promise<string> = get): Promise<string[]> {
  const xml = await fetchText(`${site}/sitemap.xml`);
  if (!/<sitemapindex/.test(xml)) return locs(xml).slice(0, max);
  const want = sections === "all" ? null : new Set(sections.split(",").map((s) => s.trim()).filter(Boolean));
  const out: string[] = [];
  for (const child of locs(xml)) {
    if (want && !want.has(kindOf(child))) continue;
    out.push(...locs(await fetchText(child)));
    if (out.length >= max) break;
    await new Promise((r) => setTimeout(r, 250));                       // one child at a time, with a pause: our own host, but the habit costs nothing
  }
  return out.slice(0, max);
}

async function main() {
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.INDEXNOW_KEY ?? "";
  if (!site || !key) {
    console.log("SITE_URL or INDEXNOW_KEY not set — skipping IndexNow.");
    return;
  }
  let live = false;
  for (let i = 0; i < 20 && !live; i++) {
    try {
      live = (await get(`${site}/indexnow.txt`)).trim() === key;
    } catch {
      /* not deployed yet */
    }
    if (!live) await new Promise((r) => setTimeout(r, 10000));
  }
  if (!live) {
    console.log("indexnow.txt never served the key — set INDEXNOW_KEY in Vercel and redeploy. Skipping.");
    return;
  }
  const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const max = Math.max(1, Number(arg("max")) || 10_000);
  const urls = await urlsToSubmit(site, arg("sections")?.trim() || SECTIONS_DEFAULT.join(","), max);
  const host = new URL(site).host;
  let sent = 0;
  for (let i = 0; i < urls.length; i += 10000) {
    const batch = urls.slice(i, i + 10000);
    const r = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": UA },
      body: JSON.stringify({ host, key, keyLocation: `${site}/indexnow.txt`, urlList: batch }),
    });
    console.log(`batch ${i / 10000 + 1}: ${batch.length} URLs → HTTP ${r.status}`);
    if (r.ok) sent += batch.length;
  }
  console.log(`IndexNow: ${sent} of ${urls.length} URLs submitted.`);
}

if (process.argv[1]?.endsWith("indexnow-submit.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
