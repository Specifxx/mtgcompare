import type { Metadata } from "next";
import Link from "next/link";
import { CREATOR_PARTNERS } from "@/lib/content/creators";
import { pageOg } from "@/lib/og/meta";
import { CONTACT_EMAIL, DISCORD_URL, SITE_NAME, SITE_URL } from "@/lib/site";

// /creators: two audiences on one page. A visitor looking for where to follow
// the site, and a Magic content creator sizing up whether to work with it.
// Static: no data read, no live prices.
export const metadata: Metadata = {
  title: "Socials & Creators",
  description: `Where to follow ${SITE_NAME}, the Magic: The Gathering creators it works with, and how to get in touch if you make Magic content.`,
  alternates: { canonical: "/creators" },
  openGraph: pageOg("/creators"),
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Socials & Creators", item: `${SITE_URL}/creators` },
  ],
};

// The social links that exist. Each renders only when its address is configured, so there is never a dead link.
const SOCIALS = [{ label: "Discord", href: DISCORD_URL, hover: "hover:border-[#5865F2] hover:text-[#5865F2]", blurb: "Chat with the community and report a wrong price." }].filter((s) => s.href);

export default function CreatorsPage() {
  const creators = [...CREATOR_PARTNERS].sort((a, b) => b.since.localeCompare(a.since));
  return (
    <article className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">
          Home
        </Link>
        <span>/</span>
        <span className="text-slate-300">Socials &amp; Creators</span>
      </nav>
      <h1 className="text-3xl font-extrabold leading-tight text-white">Socials &amp; Creators</h1>
      <p className="mt-2 text-sm text-slate-500">Where to follow {SITE_NAME}, who it works with, and how to get in touch.</p>

      <div className="mt-6 space-y-8 border-t border-ink-800 pt-6">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">Follow {SITE_NAME}</h2>
          {SOCIALS.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {SOCIALS.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className={`card-surface flex flex-col gap-1 border border-transparent p-4 transition-colors ${s.hover}`}>
                  <span className="text-sm font-bold text-white">{s.label}</span>
                  <span className="text-xs text-slate-500">{s.blurb}</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="card-surface p-5 text-sm leading-relaxed text-slate-400">
              <p>
                {SITE_NAME} has no social accounts yet. Price changes are on the <Link href="/movers" className="text-gold hover:underline">movers page</Link>, and new posts
                reach you through the <a href="/feed.xml" className="text-gold hover:underline">RSS feed</a>.
              </p>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">Creators we work with</h2>
          {creators.length === 0 ? (
            <div className="card-surface p-5 text-sm leading-relaxed text-slate-400">
              <p>No creators are listed yet. A creator appears here only after they have agreed to it. If you make Magic content, see below.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {creators.map((c) => (
                <a key={c.url} href={c.url} target="_blank" rel="noopener noreferrer" className="card-surface flex flex-col gap-1 border border-transparent p-4 transition-colors hover:border-brand-500">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white">{c.name}</span>
                    <span className="chip bg-ink-800 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">{c.platform}</span>
                  </span>
                  <span className="text-xs text-slate-500">{c.blurb}</span>
                  <span className="text-xs text-brand-400">{c.handle}</span>
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="text-lg font-bold text-white">Make Magic content? Let&rsquo;s talk</h2>
          <p>
            If you make deck techs, set reviews or price videos about Magic: The Gathering, we would like to hear from you: a mention in your content, a link back to{" "}
            {SITE_NAME}, or whatever else makes sense for what you make. In return we can list your channel here.
          </p>
          <p>
            One thing already built for creators: live, embeddable widgets you can drop into a blog post or a newsletter as an{" "}
            <code className="rounded bg-ink-800 px-1 py-0.5 text-xs">&lt;iframe&gt;</code>, with no build step on your end. They stay current on their own and link back to the
            full comparison on {SITE_NAME}.
          </p>
          <p>
            <Link href="/embed" className="text-gold hover:underline">
              See the widgets with copy-paste snippets &rarr;
            </Link>
          </p>
          <p>
            Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}?subject=Creator%20partnership`} className="text-gold hover:underline">
              {CONTACT_EMAIL}
            </a>{" "}
            with a link to your channel.
          </p>
        </section>
      </div>
    </article>
  );
}
