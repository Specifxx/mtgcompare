// Runs in GitHub Actions every three hours (ops-monitor.yml). Each check
// returns ok / warn / fail. Every result is written to ops-status.json, which the
// workflow publishes on this repo's `ops-status` branch for Empire HQ
// (riftcompare.com/admin/hq) and the one Monday report (owner, 2026-11-02:
// "one Monday email", amber only on the dashboard). Only a FAIL fails the run,
// and a failed run is GitHub's email to the owner: red is the only thing that
// mails. Add a check here for every new scheduled job, API or limit.
import { FAMILY_DIR, FEED_FILE, familyFeeds } from "@/lib/family";
import fs from "node:fs";
import path from "node:path";
import { SITE } from "@/site.config";
import type { Meta } from "@/lib/site-types";
import { SITE_HOST } from "@/lib/site";
import { readKitFile } from "@/lib/kit-store";

type Result = { name: string; status: "ok" | "warn" | "fail"; detail: string };
const site = (process.env.NEXT_PUBLIC_SITE_URL || `https://${SITE_HOST}`).replace(/\/$/, "");
// Until the site is live (the SITE_URL repository variable is set at launch),
// the live checks warn instead of failing every three hours.
const live = !!process.env.NEXT_PUBLIC_SITE_URL;

async function check(name: string, fn: () => Promise<Omit<Result, "name">>): Promise<Result> {
  try {
    return { name, ...(await fn()) };
  } catch (e) {
    return { name, status: "fail", detail: (e as Error).message };
  }
}

async function main() {
  const meta = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/public/meta.json"), "utf8")) as Meta;
  const ageH = (Date.now() - new Date(meta.updatedAt).getTime()) / 3_600_000;
  const results = await Promise.all([
    check("Live site", async () => {
      if (!live) return { status: "warn", detail: "SITE_URL repository variable not set — live checks skipped" };
      const r = await fetch(site, { signal: AbortSignal.timeout(20000) });
      return r.ok ? { status: "ok", detail: `${r.status}` } : { status: "fail", detail: `HTTP ${r.status}` };
    }),
    check("A card page", async () => {
      if (!live) return { status: "warn", detail: "SITE_URL repository variable not set — live checks skipped" };
      const r = await fetch(`${site}/cards`, { signal: AbortSignal.timeout(20000) });
      return r.ok ? { status: "ok", detail: `${r.status}` } : { status: "fail", detail: `HTTP ${r.status}` };
    }),
    check("Daily price import", async () =>
      ageH < 30 ? { status: "ok", detail: `${ageH.toFixed(1)}h old` } : { status: ageH < 54 ? "warn" : "fail", detail: `data is ${ageH.toFixed(0)}h old — check the Refresh prices workflow` },
    ),
    check("Store imports", async () => {
      const bad = Object.entries(meta.stores).filter(([, s]) => !s.ok || s.matched === 0);
      return bad.length ? { status: bad.length > SITE.stores.length / 3 ? "fail" : "warn", detail: bad.map(([k, s]) => `${k}: ${s.error ?? "0 matched"}`).join("; ") } : { status: "ok", detail: `${SITE.stores.length} stores` };
    }),
    check("eBay budget", async () => {
      if (!process.env.EBAY_CLIENT_ID) return { status: "warn", detail: "EBAY_CLIENT_ID not set in GitHub secrets — no eBay prices" };
      if (!meta.ebay) return { status: "warn", detail: "no eBay run recorded yet" };
      const age = (Date.now() - new Date(meta.ebay.at).getTime()) / 3_600_000;
      if (age > 30) return { status: "warn", detail: `last eBay run ${age.toFixed(0)}h ago` };
      return { status: "ok", detail: `${meta.ebay.calls}/${meta.ebay.budget} calls on ${meta.ebay.day}, ${meta.ebay.eligible} eligible` };
    }),
    // The Compare Empire network feed (scripts/family-sync.ts): sisters' "Also in this cluster"
    // blocks read it from GitHub, so a stale one silently empties their tiles for this site.
    check("Family feed", async () => {
      try {
        const f = JSON.parse(fs.readFileSync(path.join(FAMILY_DIR, FEED_FILE), "utf8")) as { generatedAt: string; items: unknown[] };
        const age = (Date.now() - new Date(f.generatedAt).getTime()) / 3_600_000;
        const sisters = familyFeeds().map((x) => x.site);
        if (age > 54) return { status: "fail", detail: `family-feed.json is ${age.toFixed(0)}h old — check the Refresh prices workflow's family step` };
        return { status: age > 30 ? "warn" : "ok", detail: `${f.items.length} items, ${age.toFixed(1)}h old; ${sisters.length} sister feeds (${sisters.join(", ") || "none yet"})` };
      } catch {
        return { status: "fail", detail: "data/public/family/family-feed.json missing — check the Refresh prices workflow's family step" };
      }
    }),
    // The model-kit import (SITE.kits, scripts/import-kits.ts): its own file,
    // its own stores.
    ...(SITE.kits
      ? [
          check("Model kit import", async () => {
            const f = readKitFile();
            if (!f.generatedAt) return { status: "fail", detail: "data/public/kits.json missing — check the Refresh prices workflow's kit step" };
            const age = (Date.now() - new Date(f.generatedAt).getTime()) / 3_600_000;
            const bad = Object.entries(f.stores).filter(([, s]) => !s.ok || s.matched === 0);
            const total = SITE.kits!.stores.length;
            if (age > 54) return { status: "fail", detail: `kit data is ${age.toFixed(0)}h old` };
            if (f.kits.length < 100) return { status: "fail", detail: `only ${f.kits.length} kits` };
            if (bad.length) return { status: bad.length > total / 3 ? "fail" : "warn", detail: bad.map(([k, s]) => `${k}: ${s.error ?? "0 matched"}`).join("; ") };
            return { status: age > 30 ? "warn" : "ok", detail: `${f.kits.length} kits from ${total} stores, ${age.toFixed(1)}h old` };
          }),
        ]
      : []),
  ]);
  for (const r of results) console.log(`${r.status.toUpperCase().padEnd(4)} ${r.name}: ${r.detail}`);
  // Empire HQ's copy (status and our own sentences only: the branch is public, like this log).
  const overall = results.some((r) => r.status === "fail") ? "fail" : results.some((r) => r.status === "warn") ? "warn" : "ok";
  const status = { v: 1, site: SITE_HOST, at: new Date().toISOString(), overall, checks: results };
  fs.writeFileSync(process.env.OPS_STATUS_FILE || "ops-status.json", JSON.stringify(status, null, 1) + "\n");
  const bad = results.filter((r) => r.status === "fail");
  if (bad.length) {
    // A failed run makes GitHub email the repo owner (no email service needed). Warnings
    // wait for Empire HQ and the Monday report.
    console.error(`
${bad.length} check(s) failed: ${bad.map((r) => r.name).join(", ")}`);
    process.exit(1);
  }
}
main();
