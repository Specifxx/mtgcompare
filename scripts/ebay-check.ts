// Confirms DexCompare's own eBay Browse API keyset works, with the same code the importer runs
// (src/lib/ebay-api.ts, ebay-normalise.ts). Needs EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in the environment
// (DEXCOMPARE_EBAY_CLIENT_ID / _SECRET win when set); tsx does not read .env, so export them or:
//
//   EBAY_CLIENT_ID=… EBAY_CLIENT_SECRET=… npx tsx scripts/ebay-check.ts [marketplace …]
//
// It prints the token status and, per marketplace, how many listings two searches (a chase-card one and a
// sealed one) would store: counts only, never titles, prices, the id, the secret, a token or an Authorization
// header. No database. Exit code 1 when the token cannot be fetched or nothing came back anywhere.
//
// Cost: 1 token + 2 Browse calls per marketplace (5 marketplaces: 10 of the day's calls). These calls are NOT
// recorded in the importer's daily counter (EbayCallDay): run it sparingly.
import { createTokenManager, EbayError, getRateLimits, keysPresent, realDeps, searchOnce, type EbayEnv } from "../src/lib/ebay-api";
import { MARKETPLACES, MARKETPLACE_IDS, type MarketplaceId } from "../src/lib/ebay-context";
import { normaliseChase, normaliseSealed, usdToMarketplace } from "../src/lib/ebay-normalise";

async function main() {
  const deps = realDeps();
  if (!keysPresent(deps.env as EbayEnv)) {
    console.error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are not both set. Nothing to check.");
    process.exit(1);
  }
  const wanted = process.argv.slice(2).filter((a): a is MarketplaceId => (MARKETPLACE_IDS as string[]).includes(a));
  const marketplaces = wanted.length ? wanted : MARKETPLACE_IDS;

  const tokens = createTokenManager(deps);
  try {
    await tokens.get();
    console.log("token: OK (client-credentials grant, scope api_scope)");
  } catch (e) {
    console.error(`token: FAILED (${e instanceof EbayError ? e.describe() : "error"}). Check the keyset is a PRODUCTION one (not Sandbox) and belongs to DexCompare's own application.`);
    process.exit(1);
  }

  // eBay's own counter for this application (shared with the owner's other site): the importer's budget day is assumed to be the Pacific one
  // (midnight Pacific = 07:00 UTC in summer, 08:00 in winter); the reset time printed here is what eBay says. Numbers only.
  const windows = await getRateLimits(deps, tokens);
  if (windows?.length) {
    for (const w of windows) console.log(`call counter: ${w.count} used, ${w.remaining} left of ${w.limit}${w.timeWindow ? ` per ${Math.round(w.timeWindow / 3600)} h` : ""}${w.reset ? `; resets ${w.reset}` : ""}`);
    console.log("  (compare the reset time with the 07:00/08:00 UTC the importer assumes: DEPLOY.md, \"The budget day\")");
  } else console.log("call counter: not available (eBay's Analytics call did not answer; the importer's own counter is unaffected)");

  let total = 0;
  for (const mp of marketplaces) {
    console.log(`\n${mp}  (${MARKETPLACES[mp].currency})`);
    const now = Date.now();
    const runs: [string, string, (raw: unknown) => unknown][] = [
      ["chase", "Pokemon Charizard ex special illustration rare", (raw) => normaliseChase(raw, mp, now)],
      ["sealed", "Pokemon elite trainer box sealed", (raw) => normaliseSealed(raw, mp, now)],
    ];
    for (const [name, q, norm] of runs) {
      try {
        const raw = await searchOnce(deps, tokens, { q, marketplace: mp, limit: 30, minPrice: name === "chase" ? 15 : usdToMarketplace(30, mp) });
        const kept = raw.map(norm).filter(Boolean).length;
        total += kept;
        console.log(`  ${name.padEnd(8)} ${String(raw.length).padStart(3)} returned, ${String(kept).padStart(3)} kept`);
      } catch (e) {
        const why = e instanceof EbayError ? e.describe() : "error";
        console.log(`  ${name.padEnd(8)} failed (${why})${why === "search-http-403" ? ": the keyset has no Buy API access yet" : ""}`);
      }
    }
  }
  if (!total) {
    console.error("\nNo listings came back for any marketplace. The token works, so look at the failures above (403: Buy API access not granted).");
    process.exit(1);
  }
}

main().catch(() => {
  console.error("ebay-check failed unexpectedly (no detail is printed, to keep the credentials out of logs).");
  process.exit(1);
});
