import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// See watching/layout.tsx: the signed-out redirect belongs above loading.tsx,
// so it is a real 307 and never races the streamed shell (React error #310).
// A layout does not know which sub-page was asked for, so this fallback returns
// to /portfolio after sign-in; a visit with NO session cookie never gets here
// (next.config.js redirects it with the exact path in `next`), and each page
// keeps its own redirect for the same case.
export default async function PortfolioLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentUser())) redirect("/login?next=/portfolio");
  return children;
}
