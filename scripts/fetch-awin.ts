/**
 * First in every build: copy the Awin programmes that accepted the family (Compare Empire's public
 * data/awin/programmes.json, refreshed each morning from the Awin publisher API) into src/lib/awin-programmes.json,
 * which src/lib/awin.ts reads to turn those stores' links into tracked Awin deep links. Never fatal: on any error
 * the committed copy (an empty list) stays and links are simply untracked for that build.
 */
import { writeFileSync } from "node:fs";

const SRC = "https://raw.githubusercontent.com/Specifxx/compareempiretake2/HEAD/data/awin/programmes.json";
const OUT = "src/lib/awin-programmes.json";

async function main() {
  const res = await fetch(SRC, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const f = (await res.json()) as { publisherId?: unknown; updatedAt?: unknown; joined?: unknown };
  if (f.publisherId !== 3144410 || !Array.isArray(f.joined)) throw new Error("unexpected shape");
  const joined = f.joined
    .filter((p): p is { id: number; name: string; domains: string[]; region?: string; currency?: string } =>
      !!p && typeof p.id === "number" && typeof p.name === "string" && Array.isArray(p.domains) && p.domains.every((d: unknown) => typeof d === "string"))
    .map((p) => ({ id: p.id, name: p.name, domains: p.domains, ...(p.region ? { region: p.region } : {}), ...(p.currency ? { currency: p.currency } : {}) }));
  writeFileSync(OUT, JSON.stringify({ publisherId: 3144410, updatedAt: typeof f.updatedAt === "string" ? f.updatedAt : null, joined }, null, 2) + "\n");
  console.log(`Awin: ${joined.length} joined programmes copied.`);
}

main().catch((e) => console.warn(`Awin list not fetched (${(e as Error).message}); links stay untracked this build.`));

/** The Impact brands that accepted us (Compare Empire's hand-kept data/impact/programmes.json, 2026-11-10), into
 *  src/lib/impact-programmes.json for src/lib/awin.ts, which keeps only tracking links of our own Impact accounts.
 *  On any error the committed empty list stays and those brands' links are untracked for this build. */
const IMPACT_SRC = "https://raw.githubusercontent.com/Specifxx/compareempiretake2/HEAD/data/impact/programmes.json";
const IMPACT_OUT = "src/lib/impact-programmes.json";

async function impact() {
  const res = await fetch(IMPACT_SRC, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const f = (await res.json()) as { updatedAt?: unknown; joined?: unknown };
  if (!Array.isArray(f.joined)) throw new Error("unexpected shape");
  const joined = (f.joined as Record<string, unknown>[])
    .filter((p) => p && typeof p.id === "number" && typeof p.name === "string" && typeof p.link === "string" && /^https:\/\/[a-z0-9.-]+\/c\/\d+\/\d+\/\d+\/?$/i.test(p.link) && Array.isArray(p.domains) && (p.domains as unknown[]).every((d) => typeof d === "string"))
    .map((p) => ({ id: p.id, name: p.name, domains: p.domains, link: p.link, ...(typeof p.region === "string" ? { region: p.region } : {}), ...(typeof p.currency === "string" ? { currency: p.currency } : {}) }));
  writeFileSync(IMPACT_OUT, JSON.stringify({ updatedAt: typeof f.updatedAt === "string" ? f.updatedAt : null, joined }, null, 2) + "\n");
  console.log(`Impact: ${joined.length} joined brands copied.`);
}

impact().catch((e) => console.warn(`Impact list not fetched (${(e as Error).message}); those links stay untracked this build.`));
