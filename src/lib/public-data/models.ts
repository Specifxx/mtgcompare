// The public models and their shape, read from Prisma's own schema description (Prisma.dmmf), so the file store and its query
// engine can never drift from prisma/schema.prisma: a new column is picked up by the next export, and a renamed relation fails
// loudly instead of quietly matching nothing. (Ported from RiftCompare's src/lib/public-data/models.ts.)
//
// PUBLIC means: shown on public pages, holding no personal data, and written only by the importers, never by a request. That is
// every table DexCompare has but one: EbayCallDay, the eBay importer's own call counter, stays in Neon (an operational counter the
// site never reads). DexCompare keeps no accounts, emails or visitor data at all (README, "What this site does not store").
import { Prisma } from "@prisma/client";

export const PUBLIC_MODELS = ["Product", "Offer", "ProductStat", "StoreStat", "EbayListing"] as const;
export type ModelName = (typeof PUBLIC_MODELS)[number];

export function isPublicModel(name: string): name is ModelName {
  return (PUBLIC_MODELS as readonly string[]).includes(name);
}

/** Thrown when the engine cannot answer a query exactly; the caller asks Neon instead. */
export class PublicDataUnsupported extends Error {
  readonly publicDataUnsupported = true;
  constructor(message: string) {
    super(`[public-data] unsupported: ${message}`);
    this.name = "PublicDataUnsupported";
  }
}

export interface FieldInfo {
  name: string;
  kind: "scalar" | "object" | "enum" | "unsupported";
  type: string;
  isList: boolean;
  isRequired: boolean;
  /** For a relation whose foreign key is on THIS model. */
  fromFields: string[];
  toFields: string[];
  /** The other side of a relation (set for list/back relations). */
  opposite?: { fromFields: string[]; toFields: string[] };
}

export interface ModelInfo {
  name: ModelName;
  fields: Map<string, FieldInfo>;
  scalarFields: FieldInfo[];
  dateFields: string[];
  /** `a_b` selectors Prisma accepts in findUnique for @@id / @@unique. */
  compoundKeys: Set<string>;
  /** Fields the row source can look up without a full scan. */
  indexedFields: string[];
}

type DmmfField = {
  name: string;
  kind: FieldInfo["kind"];
  type: string;
  isList: boolean;
  isRequired: boolean;
  relationName?: string | null;
  relationFromFields?: readonly string[];
  relationToFields?: readonly string[];
};
type DmmfModel = {
  name: string;
  fields: readonly DmmfField[];
  primaryKey?: { fields: readonly string[] } | null;
  uniqueFields?: readonly (readonly string[])[];
};

// Looked up through an in-memory index (lib/public-data/store.ts) instead of a scan.
const INDEXED: Partial<Record<ModelName, string[]>> = {
  Product: ["id", "slug"],
  Offer: ["productId", "store"],
  ProductStat: ["productId", "market"],
  StoreStat: ["store", "market"],
  EbayListing: ["feed"],
};

const cache = new Map<string, ModelInfo>();

export function modelInfo(name: ModelName): ModelInfo {
  const hit = cache.get(name);
  if (hit) return hit;
  const models = Prisma.dmmf.datamodel.models as unknown as readonly DmmfModel[];
  const m = models.find((x) => x.name === name);
  if (!m) throw new Error(`[public-data] model ${name} is not in the Prisma schema`);
  const fields = new Map<string, FieldInfo>();
  for (const f of m.fields) {
    const info: FieldInfo = {
      name: f.name,
      kind: f.kind,
      type: f.type,
      isList: f.isList,
      isRequired: f.isRequired,
      fromFields: [...(f.relationFromFields ?? [])],
      toFields: [...(f.relationToFields ?? [])],
    };
    if (f.kind === "object" && f.relationName) {
      const other = models.find((x) => x.name === f.type);
      const back = other?.fields.find((x) => x.relationName === f.relationName && x !== f);
      if (back) info.opposite = { fromFields: [...(back.relationFromFields ?? [])], toFields: [...(back.relationToFields ?? [])] };
    }
    fields.set(f.name, info);
  }
  const compoundKeys = new Set<string>();
  for (const k of [m.primaryKey?.fields ?? [], ...(m.uniqueFields ?? [])]) if (k.length > 1) compoundKeys.add(k.join("_"));
  const scalarFields = [...fields.values()].filter((f) => f.kind !== "object");
  const info: ModelInfo = {
    name,
    fields,
    scalarFields,
    dateFields: scalarFields.filter((f) => f.type === "DateTime").map((f) => f.name),
    compoundKeys,
    indexedFields: INDEXED[name] ?? [],
  };
  cache.set(name, info);
  return info;
}
