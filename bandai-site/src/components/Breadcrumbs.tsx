import Link from "@/components/Link";
import { abs } from "@/lib/site";
import { JsonLd } from "./JsonLd";

export interface Crumb { name: string; href?: string }

/** Visible breadcrumb trail plus its BreadcrumbList schema. Home is implied. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all: Crumb[] = [{ name: "Home", href: "/" }, ...items];
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: all.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, ...(c.href ? { item: abs(c.href) } : {}) })),
        }}
      />
      <nav className="mb-3 text-xs text-muted" aria-label="Breadcrumb">
        {all.map((c, i) => (
          <span key={i}>
            {i > 0 && " / "}
            {c.href && i < all.length - 1 ? <Link className="hover:underline" href={c.href}>{c.name}</Link> : <span>{c.name}</span>}
          </span>
        ))}
      </nav>
    </>
  );
}
