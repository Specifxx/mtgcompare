import { redirect } from "next/navigation";

// /search?q= is what people (and some browsers' site-search shortcuts) guess;
// the full results page is /browse?q= (the WebSite SearchAction target).
export default function SearchPage({ searchParams }: { searchParams: { q?: string | string[] } }) {
  const q = (Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q)?.trim().slice(0, 80);
  redirect(q ? `/browse?q=${encodeURIComponent(q)}` : "/browse");
}
