import type { Country } from "../country";
import { getCatalog, getIndexSeries, getSealedCatalog, getSiteStats } from "../data";
import type { PostContext } from "./types";

export async function postContext(country: Country): Promise<PostContext> {
  const [cat, sealed, stats, index] = await Promise.all([getCatalog(), getSealedCatalog(), getSiteStats(), getIndexSeries()]);
  return { cat, sealed, stats, index, country };
}
