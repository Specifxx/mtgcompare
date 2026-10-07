// Store data health report: the same rules as /admin/store-health, printed for
// the import log. Run by .github/workflows/import-prices.yml after each import
// (continue-on-error), or by hand:
//
//   npm run health:stores
//
// Prints a summary, appends a Markdown table to $GITHUB_STEP_SUMMARY when set,
// and emits up to 20 `::warning` annotations. Read-only, and it ALWAYS exits 0:
// a broken scraper is something to look at, not a failed import.
import fs from "node:fs";
import { prisma } from "../src/lib/db";
import { loadStoreHealthInputs } from "../src/lib/admin-health";
import { computeStoreHealth } from "../src/lib/store-health";
import { STORES } from "../src/lib/stores";

const MAX_WARNINGS = 20;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not set — no store-health report.");
    return;
  }
  const { history, offers } = await loadStoreHealthInputs();
  const health = computeStoreHealth(STORES, history, offers);
  const alerting = health.filter((h) => h.alerts.length).sort((a, b) => b.alerts.length - a.alerts.length || a.name.localeCompare(b.name));
  const total = alerting.reduce((a, h) => a + h.alerts.length, 0);
  console.log(`Store health: ${STORES.length} stores, ${alerting.length} alerting, ${total} alerts.`);
  for (const h of alerting) console.log(`  ${h.country} ${h.name} (${h.key}, ${h.platform}): ${h.alerts.map((a) => a.text).join("; ")}`);

  let n = 0;
  outer: for (const h of alerting) {
    for (const a of h.alerts) {
      if (n++ >= MAX_WARNINGS) break outer;
      console.log(`::warning title=Store health::${h.name}: ${a.text}`);
    }
  }

  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    const lines = [`## Store health`, ``, `${STORES.length} stores · ${alerting.length} alerting · ${total} alerts`, ``];
    if (alerting.length) {
      lines.push(`| Store | Market | Platform | Latest products / matched | Alerts |`, `|---|---|---|---|---|`);
      for (const h of alerting) {
        const l = h.latest ? `${h.latest.products} / ${h.latest.cards + h.latest.sealed}` : "–";
        lines.push(`| ${cell(h.name)} | ${h.country} | ${h.platform} | ${l} | ${cell(h.alerts.map((a) => a.text).join("<br>"))} |`);
      }
    } else {
      lines.push("Every store looks healthy.");
    }
    fs.appendFileSync(summaryFile, lines.join("\n") + "\n");
  }
}

main()
  .catch((e) => console.log(`::warning title=Store health::report failed: ${e instanceof Error ? e.message : String(e)}`))
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  });
