import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import robots from "../src/app/robots";

// DECISIONS.md, "Vercel cost: no prefetch, a day per page, fewer bots".
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });

test("every link goes through the no-prefetch wrapper", () => {
  const offenders = files("src").filter((f) => f !== path.join("src", "components", "Link.tsx") && /from "next\/link"/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
  assert.match(fs.readFileSync("src/components/Link.tsx", "utf8"), /prefetch = false/);
});

test("pages with one URL per product or set cache a day, never less", () => {
  for (const f of ["src/app/card/[slug]/page.tsx", "src/app/sets/[slug]/page.tsx", "src/app/cards/rarity/[slug]/page.tsx", "src/app/sealed/[type]/page.tsx"]) {
    assert.match(fs.readFileSync(f, "utf8"), /export const revalidate = 86400;/, f);
  }
  for (const f of files("src/app")) {
    const m = fs.readFileSync(f, "utf8").match(/export const revalidate = (\d+)/);
    if (m) assert.ok(Number(m[1]) >= 21600, `${f} revalidates under six hours`);
  }
});

test("robots.txt blocks bulk scrapers and query-string URLs, not search engines", () => {
  const rules = [robots().rules].flat();
  const all = rules.find((r) => r.userAgent === "*")!;
  assert.ok([all.disallow].flat().includes("/*?"));
  assert.ok([all.allow].flat().includes("/_next/"));
  const blocked = rules.filter((r) => r.disallow === "/").flatMap((r) => [r.userAgent].flat());
  assert.ok(blocked.includes("Bytespider"));
  for (const ok of ["Googlebot", "Bingbot", "AhrefsBot", "SemrushBot", "GPTBot", "ClaudeBot", "PerplexityBot"]) assert.ok(!blocked.includes(ok), ok);
});
