// src/lib/data/index.ts (owner WP02). The BARREL: no code, one `export *` per public module; `@/lib/data` resolves here, so the 60 files that import it keep their import path (and OP's `import { getCardDetail } from "@/lib/data"` keeps compiling).
// INTERNAL (imported by sibling modules and by plane/, never by pages, and not re-exported): lite.ts, plane/*, api.ts (the contract file, deleted from the repository once every module below exists).
// tests/nested-cache.test.ts RULE 6 asserts: only `export *` lines; every module under data/ is re-exported here or listed as internal; no two modules export the same name; every module starts with `// owner: WPxx`; every `unstable_cache(` call sits in a data/ file.
// tests/plane-api.test.ts asserts that the sections of api.ts and the modules below are the same list.
export * from "./types";
export * from "./core";
export * from "./catalog";
export * from "./catalog-shim";
export * from "./history";
export * from "./lists";
export * from "./search";
export * from "./facets";
export * from "./commanders";
export * from "./sealed";
export * from "./deals";
export * from "./demand";
export * from "./stores";
export * from "./decks";
export * from "./sets";
export * from "./home";
export * from "./sitemap";
export * from "./site";
export * from "./email";
export * from "./ebay";
