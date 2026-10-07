// Submit every sitemap URL to IndexNow (Bing, Yandex, Seznam, Naver) so they
// recrawl now. Run daily by .github/workflows/indexnow.yml. Needs SITE_URL and
// INDEXNOW_KEY; waits for /indexnow.txt to serve the key (so it works right
// after a deploy) and exits quietly if it never does.
async function get(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": "opcompare-indexnow" } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
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
  const xml = await get(`${site}/sitemap.xml`);
  const urls = [...xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map((m) => m[1]);
  const host = new URL(site).host;
  let sent = 0;
  for (let i = 0; i < urls.length; i += 10000) {
    const batch = urls.slice(i, i + 10000);
    const r = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `${site}/indexnow.txt`, urlList: batch }),
    });
    console.log(`batch ${i / 10000 + 1}: ${batch.length} URLs → HTTP ${r.status}`);
    if (r.ok) sent += batch.length;
  }
  console.log(`IndexNow: ${sent} of ${urls.length} URLs submitted.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
