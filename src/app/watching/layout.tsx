import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// The signed-out check lives in the LAYOUT, above this segment's loading.tsx.
// A redirect() thrown by the page runs after the streamed loading shell has been
// flushed, and swapping that shell for the redirect threw React error #310 in
// production (an expired or invalid session cookie still got there; no cookie at
// all is already a 307 from next.config.js). A layout is outside the segment's
// Suspense boundary, so this redirect is a real 307 before anything streams.
// getCurrentUser is React-cached: the page's own check costs no second query.
export default async function WatchingLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentUser())) redirect("/login?next=/watching");
  return children;
}
