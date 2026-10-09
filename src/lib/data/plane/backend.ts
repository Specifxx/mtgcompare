// src/lib/data/plane/backend.ts (owner WP02). WHICH TRANSPORT CARRIES THE PLANE (DECISIONS.md, 2026-10-09, "The plane moves into Neon"). The plane contract (v1/ file paths, JSON under 1,000,000 bytes, the validator before anything is visible, the pointer last, sha-addressed
// content, the loader API) is the same on both; only the transport differs:
//   neon   (DEFAULT)  one table, "PlaneFile", in the DATABASE_URL database. No token, no extra secret.
//   github            the private data repository (PLANE_REPO, DATA_REPO_TOKEN to write, PLANE_TOKEN to read): set PLANE_BACKEND=github explicitly to go back.
// PLANE_DIR (a directory that holds v1/) overrides both for development, jobs and tests; PLANE_REMOTE (a git remote or a local bare repository, for drills and tests) can only mean git. Pure of Next and of the database.
export type PlaneBackend = "neon" | "github";
export function planeBackend(env: Record<string, string | undefined> = process.env): PlaneBackend {
  const b = (env.PLANE_BACKEND ?? "").trim().toLowerCase();
  if (b === "github" || b === "git") return "github";
  if (b === "neon") return "neon";
  if (env.PLANE_REMOTE) return "github";                  // a git remote named by hand (a bare repository for the drills) is git by definition
  return "neon";
}
