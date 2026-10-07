// Inbox census: the OPEN rows of all four queues, for the terminal or CI.
//
//   npm run audit:inbox
//
// Read-only. Email addresses are reduced to their domain (***@gmail.com);
// WRONG_PRINTING listing titles are printed in full, ready to paste into
// tests/match.test.ts.
import { prisma } from "../src/lib/db";

const maskEmail = (e: string | null | undefined) => (e ? `***@${e.split("@")[1] ?? "?"}` : "–");
const day = (d: Date) => d.toISOString().slice(0, 10);
const oneLine = (s: string | null | undefined, max = 140) => (s ? s.replace(/\s+/g, " ").slice(0, max) : "");

async function main() {
  const [reports, suggestions, feedback, contact] = await Promise.all([
    prisma.priceReport.findMany({ where: { status: { in: ["NEW", "CONFIRMED"] } }, orderBy: { createdAt: "desc" } }),
    prisma.storeSuggestion.findMany({ where: { status: "pending" }, orderBy: { createdAt: "desc" } }),
    prisma.feedback.findMany({ where: { status: "NEW" }, orderBy: { createdAt: "desc" } }),
    prisma.contactMessage.findMany({ where: { status: "NEW" }, orderBy: { createdAt: "desc" } }),
  ]);

  console.log(`\nWrong-price reports (open): ${reports.length}`);
  for (const r of reports) {
    console.log(`  ${day(r.createdAt)} ${r.status} ${r.issue} #${r.productId} ${r.storeName} ${r.market} shown=${r.shownPriceCents ?? "–"} claimed=${r.claimedCents ?? "–"} ${oneLine(r.note)}`);
    if (r.issue === "WRONG_PRINTING" && r.listingTitle) console.log(`    title: ${r.listingTitle}`);
  }
  console.log(`\nStore suggestions (pending): ${suggestions.length}`);
  for (const s of suggestions) console.log(`  ${day(s.createdAt)} ${s.storeUrl} "${s.storeName}" ${s.country} ${oneLine(s.note)}`);
  console.log(`\nFeedback (new): ${feedback.length}`);
  for (const f of feedback) console.log(`  ${day(f.createdAt)} ${f.rating ?? "-"}★ ${f.consentPublic ? "public-ok" : "private"} ${oneLine(f.message)}`);
  console.log(`\nMessages (new): ${contact.length}`);
  for (const m of contact) console.log(`  ${day(m.createdAt)} ${m.category} ${maskEmail(m.email)} ${oneLine(m.subject, 60)} — ${oneLine(m.message)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
