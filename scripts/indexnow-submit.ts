// Submit the sitemap's URLs to IndexNow (Bing, Yandex, Seznam, Naver) so they recrawl now. Run daily by
// .github/workflows/indexnow.yml, after the daily data publish (23:15 UTC; the sitemap changes daily because the catalogue does).
// Needs SITE_URL (where to read the sitemap) and INDEXNOW_KEY; without the key IndexNow is simply off and the run skips quietly.
//
// THE HOST IS THE SITEMAP'S, NOT SITE_URL'S (2026-10-16). IndexNow answers 422 when a URL is not on the `host` the request names. The
// repository variable SITE_URL still said https://mtgcompare.vercel.app, so every run posted `host: mtgcompare.vercel.app` with the sitemap's
// https://mtgcompare.app URLs: "8479 URLs → HTTP 422 … 0 of 8479 submitted", daily, on a green run (OP Compare, same key, got 200 for 8408).
// submissionPlan() now takes the origin the sitemap's own <loc>s carry (the canonical one the pages declare), sends only URLs on it, and
// checks the key file there; a SITE_URL on another host only earns a warning. And the run FAILS when IndexNow refuses anything, with the
// answer's text in the log, or when the key file never serves the key: a silent 0-of-N on a green run is how this went unnoticed for a week.
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

/** Where a submission goes: the origin of the sitemap's own URLs and only the URLs on it (IndexNow refuses a batch with any other host, 422). Null without URLs. */
export function submissionPlan(urls: readonly string[]): { origin: string; host: string; keyLocation: string; urls: string[]; dropped: number } | null {
  const first = urls.find((u) => /^https?:\/\//.test(u));
  if (!first) return null;
  const { origin, host } = new URL(first);
  const same = urls.filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });
  return { origin, host, keyLocation: `${origin}/indexnow.txt`, urls: same, dropped: urls.length - same.length };
}

async function main() {
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.INDEXNOW_KEY ?? "";
  if (!site || !key) {
    console.log("SITE_URL or INDEXNOW_KEY not set — skipping IndexNow.");
    return;
  }
  const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const max = Math.max(1, Number(arg("max")) || 10_000);
  const plan = submissionPlan(await urlsToSubmit(site, arg("sections")?.trim() || SECTIONS_DEFAULT.join(","), max));
  if (!plan || !plan.urls.length) {
    console.error(`IndexNow: ${site}/sitemap.xml listed no page URLs — nothing submitted.`);
    process.exitCode = 1;
    return;
  }
  if (plan.origin !== new URL(site).origin) {
    console.warn(`IndexNow: SITE_URL is ${site} but the sitemap's URLs are on ${plan.origin}; submitting for ${plan.host}. Set the SITE_URL repository variable to ${plan.origin}.`);
  }
  if (plan.dropped) console.warn(`IndexNow: ${plan.dropped} URL(s) not on ${plan.host} left out.`);
  let live = false;
  for (let i = 0; i < 20 && !live; i++) {
    try {
      live = (await get(plan.keyLocation)).trim() === key;
    } catch {
      /* not deployed yet */
    }
    if (!live) await new Promise((r) => setTimeout(r, 10000));
  }
  if (!live) {
    console.error(`IndexNow: ${plan.keyLocation} never served INDEXNOW_KEY — set the same key in Vercel and redeploy. Nothing submitted.`);
    process.exitCode = 1;
    return;
  }
  let sent = 0;
  for (let i = 0; i < plan.urls.length; i += 10000) {
    const batch = plan.urls.slice(i, i + 10000);
    const r = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": UA },
      body: JSON.stringify({ host: plan.host, key, keyLocation: plan.keyLocation, urlList: batch }),
    });
    const said = r.ok ? "" : ` — ${(await r.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 500) || "(no body)"}`;
    console.log(`batch ${i / 10000 + 1}: ${batch.length} URLs → HTTP ${r.status}${said}`);
    if (r.ok) sent += batch.length;
  }
  console.log(`IndexNow: ${sent} of ${plan.urls.length} URLs submitted for ${plan.host}.`);
  if (sent < plan.urls.length) {
    console.error("IndexNow refused part of the submission (above): failing the run so the ops watch sees it.");
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("indexnow-submit.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
