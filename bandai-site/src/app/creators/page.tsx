import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { CreatorAvatar } from "@/components/creators/CreatorAvatar";
import { PLATFORM_STYLE, PlatformIcon } from "@/components/creators/PlatformIcon";
import { creatorsOn, featuredCreators, type Creator } from "@/lib/creators";
import { canon, SITE_URL } from "@/lib/site";
import { SITE } from "@/site.config";

// /creators: the creators this site features (owner, 2026-10-31), modelled on
// MTG Compare's /creators. The list is static (src/content/creators.ts) and the
// page reads no price data. Every word and link is in the server HTML (the
// crawlability rule). Creators' links are followed and keep the referrer
// (rel="noopener", no "noreferrer"): their analytics should see this site,
// which is the point of the listing. A site with no creators has no page.

export const revalidate = 86400;

const first = featuredCreators()[0];
export const metadata: Metadata = {
  title: `${SITE.gameShort} creators we feature`,
  description: `${SITE.game} creators we love${first ? `, starting with ${first.name}` : ""}. Follow them on Instagram and YouTube. Make ${SITE.gameShort} content? Get featured free.`,
  ...canon("/creators"),
};

// "How to work with us" (owner, 2026-11-01): creators kept asking how we'd like
// to be promoted. Flexible on purpose: any one of these is plenty. Creators
// call us their "partner" in their own content (we don't pay them, so not
// "sponsor"); on this site they stay "featured creators".
const WORK_WITH_US = [
  { title: "Link us", body: `Put ${SITE.domain} in your bio, video description or a story link. That's the one thing that helps most.` },
  { title: "Shout us out", body: `In the content you already make, a quick line: “check out our partner ${SITE.name}” while you price a card, open packs or plan a deck.` },
  { title: "Show how it works", body: `A short walkthrough or honest review of ${SITE.name}: look up a card, compare the stores, find the cheapest. Say what you really think.` },
];

const FAQS = [
  { q: "Does it cost anything to be featured?", a: `No. A listing is free. We ask featured creators to mention ${SITE.name} in their content now and then, and we send our visitors their way in return.` },
  { q: "Who can be featured?", a: `Anyone who makes ${SITE.game} content regularly: deck techs, pack openings, rules explainers, games and art, on Instagram, YouTube, TikTok, Twitch or a blog. Good ${SITE.gameShort} content matters more than audience size.` },
  { q: `Does ${SITE.name} earn from these links?`, a: "No. Links to creators are plain links to their own profiles. Nobody pays to be listed here, and a listing never changes how stores are ranked." },
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
    <article id={c.slug} className="card-surface relative scroll-mt-24 overflow-hidden">
      <div aria-hidden className="h-24 bg-gradient-to-r from-brand/30 via-brand/10 to-accent/25 sm:h-28" />
      <div className="-mt-14 flex flex-col gap-6 px-5 pb-6 sm:-mt-16 sm:flex-row sm:items-start sm:px-8 sm:pb-8">
        <a href={main.url} target="_blank" rel="noopener" className="shrink-0 self-center sm:self-start" aria-label={`${c.name} on ${main.platform}`}>
          <CreatorAvatar creator={c} size={144} eager className="ring-4 ring-ink-900" />
        </a>
        <div className="min-w-0 flex-1 text-center sm:pt-16 sm:text-left">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-400">★ Featured creator</span>
          <h2 className="mt-1 font-display text-3xl font-black tracking-tight sm:text-4xl">
            <a href={main.url} target="_blank" rel="noopener" className="hover:text-brand-400">{c.name}</a>
          </h2>
          {main.handle && main.handle.replace(/^@/, "") !== c.name && <p className="mt-1 text-[15px] font-medium text-muted">{main.handle}</p>}
          <p className="mt-3 text-base leading-7">{c.blurb}</p>
          <p className="mt-2 text-[15px] leading-7 text-muted">{c.about}</p>
          {(c.based || c.reach) && (
            <dl className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-muted sm:justify-start">
              {c.based && <div><dt className="sr-only">Based in</dt><dd>{c.based}</dd></div>}
              {c.reach && <div><dt className="sr-only">Audience</dt><dd>{c.reach}</dd></div>}
            </dl>
          )}
          <ul role="list" className="mt-4 flex flex-wrap justify-center gap-1.5 sm:justify-start">
            {c.tags.slice(0, 4).map((t) => <li key={t} className="chip">{t}</li>)}
          </ul>
          <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
            {c.links.map((l) => <ExternalLink key={l.url} link={l} creator={c} big />)}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Every other creator, as a smaller card. */
function CreatorCard({ c }: { c: Creator }) {
  return (
    <article id={c.slug} className="card-surface flex scroll-mt-24 flex-col p-5">
      <div className="flex items-center gap-3">
        <CreatorAvatar creator={c} size={64} />
        <div className="min-w-0">
          <h3 className="text-lg font-bold leading-tight">{c.name}</h3>
          {c.based && <p className="text-xs text-muted">{c.based}</p>}
        </div>
      </div>
      <p className="mt-3 flex-1 text-sm leading-6 text-muted">{c.blurb}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {c.links.map((l) => <ExternalLink key={l.url} link={l} creator={c} />)}
      </div>
    </article>
  );
}

export default function CreatorsPage() {
  if (!creatorsOn()) notFound();
  const all = featuredCreators();
  const [spotlight, ...rest] = all;
  const subject = encodeURIComponent(`${SITE.name} creator feature`);
  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs items={[{ name: "Creators" }]} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${SITE.gameShort} creators we feature | ${SITE.name}`,
          url: `${SITE_URL}/creators`,
          mainEntity: {
            "@type": "ItemList",
            itemListElement: all.map((c, i) => ({
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
        }}
      />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />

      <header className="mt-4 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-400">Creators</p>
        <h1 className="mt-2 font-display text-3xl font-black md:text-5xl">{SITE.gameShort} creators we love</h1>
        <p className="mt-3 text-lg leading-8 text-muted">
          The players who make {SITE.game} fun to follow. Have a look at their work, follow them, and tell them {SITE.name} sent you.
        </p>
      </header>

      {spotlight && (
        <section className="mt-8" aria-label="Featured creator">
          <Spotlight c={spotlight} />
        </section>
      )}

      {rest.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold">More creators</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((c) => <CreatorCard key={c.slug} c={c} />)}
          </div>
        </section>
      )}

      <section id="get-featured" className="card-surface mt-10 scroll-mt-24 border-dashed p-6 sm:p-8">
        <h2 className="text-2xl font-bold">Make {SITE.gameShort} content? Get featured, free</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">
          Deck techs, pack openings, rules explainers or game nights: if you make {SITE.game} content regularly, we&rsquo;d love to feature you here and on our homepage. Mention {SITE.name} in your content now and then, and we send {SITE.gameShort} players your way.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={`mailto:${SITE.supportEmail}?subject=${subject}`} className="btn-primary">Email us to get featured</a>
          <Link href="/contact" className="btn-ghost">Other ways to reach us</Link>
        </div>
      </section>

      <section id="work-with-us" className="mt-10 scroll-mt-24" aria-labelledby="work-with-us-title">
        <h2 id="work-with-us-title" className="text-2xl font-bold">How to work with us</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">
          Creators often ask how we&rsquo;d like {SITE.name} promoted. Honestly, however suits you: no contract, no script, no quota and nothing to send us first. We help you, you help us, and we keep featuring you either way.
        </p>
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {WORK_WITH_US.map((w, i) => (
            <li key={w.title} className="card-surface p-5">
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-400">Option {i + 1}</span>
              <h3 className="mt-1 font-bold">{w.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted">{w.body}</p>
            </li>
          ))}
        </ol>
        <div className="card-surface mt-3 p-5">
          <h3 className="font-bold">Lines you can borrow</h3>
          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-muted">
            <li>&ldquo;Prices checked on our partner {SITE.domain}. Link in my bio.&rdquo;</li>
            <li>&ldquo;Be sure to check out our partner {SITE.name}: it compares {SITE.gameShort} prices across stores, so you find the cheapest.&rdquo;</li>
          </ul>
          <p className="mt-3 text-sm leading-6 text-muted">
            Please say we&rsquo;re partners (&ldquo;our partner&rdquo;, or your platform&rsquo;s partnership label) so your followers know. Ad rules such as the FTC&rsquo;s in the US and the ASA&rsquo;s in the UK ask for that even when no money changes hands.
          </p>
        </div>
      </section>

      <section className="mt-10 max-w-2xl" aria-labelledby="creators-faq">
        <h2 id="creators-faq" className="text-2xl font-bold">Creators FAQ</h2>
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
        While you&rsquo;re here: <Link href="/cards" className="link">compare {SITE.gameShort} card prices</Link> across every store.
      </p>
    </div>
  );
}
