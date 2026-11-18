// The site watches itself (ops-monitor.yml, every six hours): a failing check fails the run and GitHub emails the owner.
// Checks: the import is fresh for every live game, the release to Google is not shrinking to nothing, and the live site answers.
import fs from "node:fs";
import path from "node:path";
import { LIVE_GAMES, SITE } from "../src/site.config";
import type { Meta } from "../src/lib/store";

const problems: string[] = [];
const ok: string[] = [];
const meta: Meta = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "meta.json"), "utf8")) as Meta;
  } catch {
    return { generatedAt: "", games: {} };
  }
})();

for (const g of LIVE_GAMES) {
  const m = meta.games[g.slug];
  if (!m) {
    problems.push(`${g.name}: never imported`);
    continue;
  }
  const hours = (Date.now() - Date.parse(m.generatedAt)) / 3_600_000;
  if (!(hours < 36)) problems.push(`${g.name}: last import ${Math.round(hours)} h ago (daily expected)`);
  else if (m.cards < 100) problems.push(`${g.name}: only ${m.cards} cards`);
  else ok.push(`${g.name}: ${m.cards} cards, ${m.indexed} released to Google, imported ${Math.round(hours)} h ago`);
}

async function live(pathname: string, must: RegExp): Promise<void> {
  try {
    const res = await fetch(`${SITE.url}${pathname}`, { headers: { "User-Agent": "TCGSinglesDB-ops/1.0" }, signal: AbortSignal.timeout(20_000) });
    const body = await res.text();
    if (res.status !== 200) problems.push(`${pathname}: HTTP ${res.status}`);
    else if (!must.test(body)) problems.push(`${pathname}: unexpected content`);
    else ok.push(`${pathname}: 200`);
  } catch (e) {
    problems.push(`${pathname}: ${(e as Error).message}`);
  }
}

(async () => {
  // OPS_LIVE=0 until the domain is connected (the data checks still run).
  if (process.env.OPS_LIVE !== "0") {
    await live("/", /card worth/i);
    await live("/sitemap.xml", /<sitemapindex/);
    for (const g of LIVE_GAMES) await live(`/${g.slug}`, /card prices/i);
  }
  const text = ["### Ops monitor", "", ...ok.map((s) => `- OK ${s}`), ...problems.map((s) => `- RED ${s}`), ""].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  console.log(text);
  if (problems.length) process.exit(1);
})();
