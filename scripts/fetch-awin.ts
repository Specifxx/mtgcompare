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
