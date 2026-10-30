import type { Metadata } from "next";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CreatorAvatar } from "@/components/creators/CreatorAvatar";
import { PLATFORM_STYLE, PlatformIcon } from "@/components/creators/PlatformIcon";
import { featuredCreators, type Creator } from "@/lib/creators";
import { jsonLd, pageMeta } from "@/lib/seo";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";

// /creators: the Magic creators we feature (owner, 2026-10-30), modelled on RiftCompare's /creators. The list is static
// (lib/creators.ts) and the page reads no data, so it is prerendered at build like /about: a visit is a static file. Every word and
// link is in the server HTML (the crawlability rule). Creators' links are followed and keep the referrer (rel="noopener", no
// "noreferrer"): their analytics should see mtgcompare.app, which is the point of the listing.

export const metadata: Metadata = pageMeta({
  title: "MTG Creators We Feature: Altered Cards, Art & More",
  description:
    "Magic: The Gathering creators we love, starting with altered-card artist Kevin Lepage. Follow them on Instagram, YouTube and Threads. Make MTG content? Get featured free.",
  path: "/creators",
});

const FAQS = [
  {
    q: "Does it cost anything to be featured?",
    a: `No. A listing is free. We ask featured creators to mention ${SITE_NAME} in their content now and then, and we send our visitors their way in return.`,
  },
  {
    q: "Who can be featured?",
    a: "Anyone who makes Magic: The Gathering content regularly: alters and art, deck techs, pack openings, Commander games, on Instagram, YouTube, TikTok, Twitch or a blog. Good Magic content matters more than audience size.",
  },
  {
    q: "Does MTG Compare earn from these links?",
    a: "No. Links to creators are plain links to their own profiles. Nobody pays to be listed here, and a listing never changes how stores are ranked.",
  },
];

function ExternalLink({ link, creator, big = false }: { link: Creator["links"][number]; creator: Creator; big?: boolean }) {
  const st = PLATFORM_STYLE[link.platform];
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener"
      aria-label={`${creator.name} on ${link.platform}${link.handle ? ` (${link.handle})` : ""}`}
      className={`inline-flex items-center gap-2 rounded-full font-semibold transition-opacity hover:opacity-85 ${big ? "min-h-11 px-4 text-sm" : "min-h-10 px-3.5 text-[13px]"}`}
      style={{ backgroundColor: st.bg, color: st.fg }}
    >
      <PlatformIcon platform={link.platform} size={big ? 18 : 16} />
      <span>{link.platform}</span>
      {(link.handle || link.label) && <span className="font-medium opacity-85">{link.handle ?? link.label}</span>}
    </a>
  );
}

/** The newest creator, big: the first thing on the page. */
function Spotlight({ c }: { c: Creator }) {
  const main = c.links[0];
  return (
    <article id={c.slug} className="card relative scroll-mt-24 overflow-hidden">
      <div aria-hidden className="h-24 bg-gradient-to-r from-[#c13584]/25 via-brand/20 to-amber-400/25 sm:h-28" />
      <div className="-mt-14 flex flex-col gap-6 px-5 pb-6 sm:-mt-16 sm:flex-row sm:items-start sm:px-8 sm:pb-8">
        <a href={main.url} target="_blank" rel="noopener" className="shrink-0 self-center sm:self-start" aria-label={`${c.name} on ${main.platform}`}>
          <CreatorAvatar creator={c} size={144} eager className="ring-4 ring-surface shadow-lift" />
        </a>
        <div className="min-w-0 flex-1 text-center sm:pt-16 sm:text-left">
          <span className="eyebrow text-brand">★ Featured creator</span>
          <h2 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            <a href={main.url} target="_blank" rel="noopener" className="hover:text-brand">
              {c.name}
            </a>
          </h2>
          {main.handle && <p className="mt-1 text-[15px] font-medium text-muted">{main.handle}</p>}
          <p className="mt-3 text-base leading-7">{c.blurb}</p>
          <p className="mt-2 text-[15px] leading-7 text-muted">{c.about}</p>
          <dl className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-muted sm:justify-start">
            {c.based && (
              <div>
                <dt className="sr-only">Based in</dt>
                <dd>📍 {c.based}</dd>
              </div>
            )}
            {c.reach && (
              <div>
                <dt className="sr-only">Audience</dt>
                <dd>{c.reach}</dd>
              </div>
            )}
          </dl>
          <ul role="list" className="mt-4 flex flex-wrap justify-center gap-1.5 sm:justify-start">
            {c.tags.slice(0, 4).map((t) => (
              <li key={t} className="rounded-full bg-raised px-2.5 py-1 text-xs font-medium text-muted">
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
            {c.links.map((l) => (
              <ExternalLink key={l.url} link={l} creator={c} big />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Every other creator, as a smaller card (none yet: the spotlight is the first). */
function CreatorCard({ c }: { c: Creator }) {
  return (
    <article id={c.slug} className="card flex scroll-mt-24 flex-col p-5">
      <div className="flex items-center gap-3">
        <CreatorAvatar creator={c} size={64} />
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold leading-tight">{c.name}</h3>
          {c.based && <p className="text-xs text-muted">{c.based}</p>}
        </div>
      </div>
      <p className="mt-3 flex-1 text-sm leading-6 text-muted">{c.blurb}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {c.links.map((l) => (
          <ExternalLink key={l.url} link={l} creator={c} />
        ))}
      </div>
    </article>
  );
}

export default function CreatorsPage() {
  const [spotlight, ...rest] = featuredCreators();
  const crumbs = [{ href: "/", label: SITE_NAME }, { label: "Creators" }];
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `MTG creators we feature | ${SITE_NAME}`,
      url: `${SITE_URL}/creators`,
      mainEntity: {
        "@type": "ItemList",
        itemListElement: featuredCreators().map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "Person",
            name: c.name,
            description: c.blurb,
            url: `${SITE_URL}/creators#${c.slug}`,
            ...(c.avatar ? { image: `${SITE_URL}${c.avatar}` } : {}),
            sameAs: c.links.filter((l) => !l.label).map((l) => l.url),
          },
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];
  return (
    <div className="page max-w-4xl py-8">
      <Breadcrumbs items={crumbs} />
      <header className="max-w-2xl">
        <div className="eyebrow">Creators</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-5xl">Magic creators we love</h1>
        <p className="mt-3 text-lg leading-8 text-muted">
          The artists and players who make Magic fun to follow. Have a look at their work, follow them, and tell them {SITE_NAME} sent you.
        </p>
      </header>

      {spotlight && (
        <section className="mt-8" aria-label="Featured creator">
          <Spotlight c={spotlight} />
        </section>
      )}

      {rest.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-2xl font-bold tracking-tight">More creators</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((c) => (
              <CreatorCard key={c.slug} c={c} />
            ))}
          </div>
        </section>
      )}

      <section id="get-featured" className="card mt-10 scroll-mt-24 border-dashed p-6 sm:p-8">
        <h2 className="font-display text-2xl font-bold tracking-tight">Make Magic content? Get featured, free</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">
          Alters, art, deck techs, pack openings or Commander nights: if you make Magic content regularly, we&rsquo;d love to feature you
          here and on our homepage. Mention {SITE_NAME} in your content now and then, and we send Magic players your way.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={`mailto:${CONTACT_EMAIL}?subject=MTG%20Compare%20creator%20feature`} className="btn-primary min-h-11 px-5">
            Email us to get featured
          </a>
          <Link href="/contact" className="btn-ghost min-h-11 px-5">
            Other ways to reach us
          </Link>
        </div>
      </section>

      <section className="mt-10 max-w-2xl" aria-labelledby="creators-faq">
        <h2 id="creators-faq" className="font-display text-2xl font-bold tracking-tight">
          Creators FAQ
        </h2>
        <dl className="mt-4 space-y-5">
          {FAQS.map((f) => (
            <div key={f.q}>
              <dt className="font-semibold">{f.q}</dt>
              <dd className="mt-1 text-[15px] leading-7 text-muted">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-10 text-sm text-muted">
        While you&rsquo;re here:{" "}
        <Link href="/us/sealed" className="font-semibold text-ink underline underline-offset-2 hover:text-brand">
          compare Magic sealed prices
        </Link>{" "}
        across independent stores.
      </p>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
    </div>
  );
}
