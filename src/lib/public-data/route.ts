// The one decision point between Neon and the public data files, called from lib/db.ts's query extension for every operation on
// every model, and by routeRaw() for the hand-written SQL reads. See mode.ts for what each PUBLIC_DATA_MODE does. (Ported from
// RiftCompare's src/lib/public-data/route.ts.)
import { isPublicModel, type ModelName } from "./models";
import { runPublicQuery } from "./engine";
import { publicDataSource } from "./store";
import { isNeonUnavailable, markNeonDown, neonMarkedDown, publicDataMode } from "./mode";

const READS = new Set(["findMany", "findFirst", "findUnique", "count", "aggregate", "groupBy"]);

const logged = new Set<string>();
function logOnce(key: string, message: string) {
  if (logged.has(key) || logged.size > 500) return;
  logged.add(key);
  console.warn(message);
}

const NOT_SERVED = Symbol("not-served");

function refusal(err: unknown): string | null {
  const e = err as { publicDataUnsupported?: boolean; publicDataUnavailable?: boolean; message?: string };
  return e && (e.publicDataUnsupported || e.publicDataUnavailable) ? e.message ?? "refused" : null;
}

function fromFiles(model: ModelName, operation: string, args: unknown): unknown {
  try {
    return runPublicQuery(publicDataSource(), model, operation, args as Record<string, unknown> | undefined);
  } catch (err) {
    const why = refusal(err);
    if (why === null) throw err;
    logOnce(`${model}.${operation}:${why}`, `[public-data:unsupported] ${model}.${operation} → Neon. ${why}`);
    return NOT_SERVED;
  }
}

export async function routeQuery<T>(model: string | undefined, operation: string, args: unknown, query: (args: unknown) => Promise<T>): Promise<T> {
  const mode = publicDataMode();
  if (mode === "db" || !model || !isPublicModel(model) || !READS.has(operation)) return query(args);
  if (mode === "files" || neonMarkedDown()) {
    const served = fromFiles(model, operation, args);
    if (served !== NOT_SERVED) return served as T;
    return query(args);
  }
  try {
    return await query(args);
  } catch (err) {
    if (!isNeonUnavailable(err)) throw err;
    markNeonDown();
    const served = fromFiles(model, operation, args);
    if (served === NOT_SERVED) throw err;
    return served as T;
  }
}

/**
 * A read the engine cannot intercept (a `$queryRaw`), given both ways: `fromFilesImpl` computes it from the files (lib/public-data/
 * raw.ts), `fromNeon` is the original SQL. Routed exactly like a Prisma read.
 */
export async function routeRaw<T>(fromFilesImpl: () => T, fromNeon: () => Promise<T>): Promise<T> {
  const mode = publicDataMode();
  if (mode === "db") return fromNeon();
  const viaFiles = (): T | typeof NOT_SERVED => {
    try {
      return fromFilesImpl();
    } catch (err) {
      const why = refusal(err);
      if (why === null) throw err;
      logOnce(`raw:${why}`, `[public-data:unsupported] raw read → Neon. ${why}`);
      return NOT_SERVED;
    }
  };
  if (mode === "files" || neonMarkedDown()) {
    const served = viaFiles();
    if (served !== NOT_SERVED) return served;
    return fromNeon();
  }
  try {
    return await fromNeon();
  } catch (err) {
    if (!isNeonUnavailable(err)) throw err;
    markNeonDown();
    const served = viaFiles();
    if (served === NOT_SERVED) throw err;
    return served;
  }
}
