// Reading the card files (server only). The ONE seam between pages and data/: if the catalogue outgrows a function bundle, change
// where these read from, not the pages. A missing or unreadable file gives the empty value, never an error page.
import fs from "node:fs";
import path from "node:path";
import type { CardRow, CardSet, HistoryFile, Point, SearchRow, SetFile, SetsFile, TopFile } from "./cards";
import { gameBySlug } from "../site.config";

const root = () => process.env.TSDB_DATA_DIR || path.join(process.cwd(), "data");
const memo = new Map<string, unknown>();
const SAFE = /^[a-z0-9-]+$/;

function read<T>(file: string, fallback: T): T {
  if (memo.has(file)) return memo.get(file) as T;
  let v: T = fallback;
  try {
    v = JSON.parse(fs.readFileSync(path.join(root(), file), "utf8")) as T;
  } catch {
    // Missing or unreadable.
  }
  memo.set(file, v);
  return v;
}

export interface Meta {
  generatedAt: string;
  games: Record<string, { sets: number; cards: number; priced: number; indexed: number; generatedAt: string }>;
}
export const readMeta = (): Meta => read<Meta>("meta.json", { generatedAt: "", games: {} });
export const readSets = (game: string): SetsFile => (gameBySlug(game) ? read<SetsFile>(`cards/${game}/sets.json`, { generatedAt: "", source: "", sets: [] }) : { generatedAt: "", source: "", sets: [] });
export const readTop = (game: string): TopFile => (gameBySlug(game) ? read<TopFile>(`cards/${game}/top.json`, { top: [], up: [], down: [] }) : { top: [], up: [], down: [] });
export const readSearch = (game: string): SearchRow[] => (gameBySlug(game) ? read<SearchRow[]>(`cards/${game}/search.json`, []) : []);
export const setBySlug = (game: string, slug: string): CardSet | null => readSets(game).sets.find((s) => s.slug === slug) ?? null;
export function readSet(game: string, slug: string): CardRow[] {
  if (!gameBySlug(game) || !SAFE.test(slug)) return [];
  return read<SetFile>(`cards/${game}/sets/${slug}.json`, { slug, cards: [] }).cards;
}
export function readHistory(game: string, slug: string, id: number): Point[] {
  if (!gameBySlug(game) || !SAFE.test(slug)) return [];
  return read<HistoryFile>(`history/${game}/${slug}.json`, {})[String(id)] ?? [];
}
/** For tests: forget what was read. */
export const resetStore = () => memo.clear();
