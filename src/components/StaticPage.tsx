import { Breadcrumbs } from "./ui";
import { PAGE_PROSE } from "./prose";

// RiftCompare's static-page shape (app/about/page.tsx): a 3xl column, the
// breadcrumb, a bold title, then the body under a hairline.
export function StaticPage({ title, crumb, children }: { title: string; crumb: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl">
      <Breadcrumbs trail={[{ name: crumb }]} />
      <h1 className="text-3xl font-extrabold leading-tight text-white">{title}</h1>
      <div className={`mt-6 border-t border-ink-800 pt-6 ${PAGE_PROSE}`}>{children}</div>
    </article>
  );
}
