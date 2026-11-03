// Pure price-series helpers, safe for client components.
export type Series = [number, number][];
export function dayToDate(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}
