export function StaticPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-black">{title}</h1>
      <div className="prose-site mt-4">{children}</div>
    </article>
  );
}
