"use client";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { regionOfPath } from "@/lib/seo";
import { usePathname } from "next/navigation";

// The error boundary replaces the page inside the root layout, so it draws its
// own header and footer (with the region the visitor was in) to stay on-brand.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const region = regionOfPath(usePathname() || "/");
  return (
    <>
      <Header region={region?.region ?? null} />
      <main id="main" className="page flex-1 py-24 text-center">
        <h1 className="font-display text-3xl font-bold">Something went wrong.</h1>
        <p className="mt-3 text-muted">It&rsquo;s probably temporary. Try again in a moment.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="btn-primary min-h-11 px-5">
            Try again
          </button>
          <a href={region ? `/${region.region}` : "/"} className="btn-ghost min-h-11 px-5">
            {region ? `${region.name} home` : "Home"}
          </a>
        </div>
      </main>
      <Footer region={region?.region ?? null} />
    </>
  );
}
