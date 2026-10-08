// Google Search Console: submit the sitemap index AND each of its child sitemaps, and report indexing. Run daily by
// .github/workflows/search-console.yml. The children are submitted one by one on purpose: Search Console reports coverage per submitted sitemap, so
// "cards-0.xml" against "sets-0.xml" shows where indexing stands (contract 4.5, parity P01).
//
//   GSC_SA_KEY   — service-account JSON key (RiftCompare's works: add its
//                  client_email as a Full user on the MTG Compare property)
//   GSC_PROPERTY — "sc-domain:mtgcompare.app" (Domain property; the workflow's
//                  default) or "https://mtgcompare.app/" (URL-prefix property)
//   SITE_URL     — https://mtgcompare.app (the workflow's default)
//
// Submitting a sitemap needs the account to have Full or Owner permission on the
// property; the report itself needs only read access.
import crypto from "node:crypto";
import fs from "node:fs";

const UA = "MTGCompare-build/0.1 (+https://github.com/Specifxx/mtgcompare)";
const b64 = (b: string | Buffer) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const out: string[] = [];
const say = (s = "") => {
  console.log(s);
  out.push(s);
};

async function token(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/webmasters", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${head}.${claims}`);
  const jwt = `${head}.${claims}.${b64(signer.sign(sa.private_key))}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const j = (await r.json()) as { access_token?: string };
  if (!j.access_token) throw new Error(`auth failed: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function main() {
  const key = process.env.GSC_SA_KEY;
  const property = process.env.GSC_PROPERTY;
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  if (!key || !property || !site) {
    say("GSC_SA_KEY, GSC_PROPERTY or SITE_URL is not set — skipping Search Console.");
    return;
  }
  const sa = JSON.parse(key);
  const at = await token(sa);
  const api = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}`;
  const auth = { Authorization: `Bearer ${at}`, "User-Agent": UA };

  const sitemap = `${site}/sitemap.xml`;
  const put = await fetch(`${api}/sitemaps/${encodeURIComponent(sitemap)}`, { method: "PUT", headers: auth });
  say(`## Search Console — ${property}`);
  say(`Sitemap submit ${sitemap}: HTTP ${put.status}${put.status === 403 ? " (the service account needs Full permission on the property)" : ""}`);
  // the children of the index, one request each with a pause (about ten files)
  if (put.ok) {
    const index = await fetch(sitemap, { headers: { "User-Agent": UA } }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
    for (const m of index.matchAll(/<sitemap>\s*<loc>\s*(.*?)\s*<\/loc>/g)) {
      const child = m[1]!.replace(/&amp;/g, "&");
      const r = await fetch(`${api}/sitemaps/${encodeURIComponent(child)}`, { method: "PUT", headers: auth });
      say(`Sitemap submit ${child}: HTTP ${r.status}`);
      await new Promise((res) => setTimeout(res, 500));
    }
  }

  const maps = (await (await fetch(`${api}/sitemaps`, { headers: auth })).json()) as { sitemap?: { path: string; lastDownloaded?: string; errors?: string; warnings?: string; contents?: { submitted?: string; indexed?: string }[] }[] };
  for (const m of maps.sitemap ?? []) {
    const c = m.contents?.[0];
    say(`- ${m.path}: last read ${m.lastDownloaded ?? "never"}, ${c?.submitted ?? "?"} URLs submitted, errors ${m.errors ?? 0}, warnings ${m.warnings ?? 0}`);
  }

  const q = async (body: object) =>
    (await (await fetch(`${api}/searchAnalytics/query`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) })).json()) as {
      rows?: { keys: string[]; clicks: number; impressions: number; position: number }[];
      error?: unknown;
    };
  const pages = await q({ startDate: day(28), endDate: day(2), dimensions: ["page"], rowLimit: 25000 });
  if (pages.error) {
    say(`searchAnalytics error: ${JSON.stringify(pages.error)}`);
  } else {
    const rows = pages.rows ?? [];
    say("");
    say(`Pages with Google impressions (28 days): **${rows.length}**, clicks ${rows.reduce((a, r) => a + r.clicks, 0)}, impressions ${rows.reduce((a, r) => a + r.impressions, 0)}`);
    const queries = await q({ startDate: day(28), endDate: day(2), dimensions: ["query"], rowLimit: 15 });
    say("");
    say("| Query | Clicks | Impressions | Position |");
    say("|---|---|---|---|");
    for (const r of queries.rows ?? []) say(`| ${r.keys[0]} | ${r.clicks} | ${r.impressions} | ${r.position.toFixed(1)} |`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join("\n") + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
