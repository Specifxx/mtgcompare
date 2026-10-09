import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FOOTER_GROUPS, NAV_GROUPS, PRIMARY_NAV } from "../src/components/nav-groups";

// Every internal href the chrome links (the rail, the phone menu, ⌘K and the
// footer site map all read NAV_GROUPS) must be a real route in src/app.
//
// IN_FLIGHT lists the routes other wave-2 tracks create (tools, member,
// collection-alerts, catalogue). They are linked now so the nav is complete on
// merge; until their track lands they may be missing here. Once a route
// exists, the second test fails until it is removed from the list — the
// integrator empties IN_FLIGHT after the merges.
// At the MTG port the chrome (WP15, wave 3) links four pages that later waves build: the Commander hub (WP11, wave 5), the creators page (WP17, wave 6), the pre-order page and the embed gallery (WP20, wave 5).
// The second test below fails the day each route lands, so this list can only shrink; at M2 it is empty.
const IN_FLIGHT = new Set<string>([]);

const APP = join(process.cwd(), "src/app");

/** Does a page (page.tsx) or a redirect-only route exist for this path? Dynamic segments match any value. */
function routeExists(href: string): boolean {
  const parts = href.split(/[?#]/)[0].split("/").filter(Boolean);
  const walk = (dir: string, i: number): boolean => {
    if (i === parts.length) return existsSync(join(dir, "page.tsx")) || existsSync(join(dir, "route.ts"));
    const entries = readdirSync(dir).filter((e) => statSync(join(dir, e)).isDirectory());
    const exact = entries.find((e) => e === parts[i]);
    if (exact && walk(join(dir, exact), i + 1)) return true;
    // Route groups "(x)" are transparent; "[param]" matches one segment.
    for (const e of entries) {
      if (e.startsWith("(") && walk(join(dir, e), i)) return true;
      if (/^\[[^.]+\]$/.test(e) && walk(join(dir, e), i + 1)) return true;
    }
    return false;
  };
  return parts.length === 0 ? existsSync(join(APP, "page.tsx")) : walk(APP, 0);
}

const internal = [...NAV_GROUPS.flatMap((g) => g.links), ...FOOTER_GROUPS.flatMap((g) => g.links), ...PRIMARY_NAV]
  .filter((l) => !("external" in l && l.external) && l.href.startsWith("/"))
  .map((l) => l.href);

test("every internal nav href resolves to a src/app route (or is a route another wave-2 track is building)", () => {
  const missing = [...new Set(internal)].filter((h) => !routeExists(h) && !IN_FLIGHT.has(h));
  assert.deepEqual(missing, [], `nav links with no route: ${missing.join(", ")}`);
});

test("IN_FLIGHT only names routes that do not exist yet", () => {
  const landed = [...IN_FLIGHT].filter(routeExists);
  assert.deepEqual(landed, [], `these routes exist now; remove them from IN_FLIGHT: ${landed.join(", ")}`);
});

test("the nav names no game and no Riftbound-only page", () => {
  for (const h of internal) assert.doesNotMatch(h, /^\/(games|riftle|champions|domains|pokemon|radiance|stores\/consulting|learn)\b/, h);
  const titles = NAV_GROUPS.map((g) => g.title);
  assert.ok(!titles.includes("Games") && !titles.includes("For stores"));
});

test("the deck pricer answers 'bulk pricer'", () => {
  const deck = NAV_GROUPS.flatMap((g) => g.links).find((l) => l.href === "/deck");
  assert.ok(deck?.keywords?.includes("bulk pricer"));
});
