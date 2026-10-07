import { EbayChase } from "@/components/EbayChase";
import { AdSlot } from "@/components/AdSlot";
import Link from "next/link";
import CardQuickLink from "@/components/CardQuickLink";
import { ArticleFaq } from "@/components/ArticleFaq";
import { ArticleMarketData } from "@/components/ArticleMarketData";
import { ArticleSignupCta } from "@/components/ArticleSignupCta";
import { BlogShopStrip } from "@/components/BlogShopStrip";
import { EbayPicks } from "@/components/EbayPicks";
import { EmailOnly } from "@/components/EmailOnly";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { plainIntroText } from "@/components/HubIntro";
import { HatMark } from "@/components/Logo";
import { ScrollDepthTracker } from "@/components/ScrollDepthTracker";
import { ARTICLE_PROSE } from "@/components/prose";
import { JsonLd } from "@/components/ui";
import { collectMentions } from "@/components/blog/mentions";
import { ShareRow } from "@/components/blog/ShareRow";
import { AUTHOR, POSTS, postHref } from "@/lib/blog";
import { postContext } from "@/lib/blog/context";
import type { Post } from "@/lib/blog/types";
import { longDate, shortDate } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { cardImage } from "@/lib/images";
import { faqLd } from "@/lib/jsonld";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// The shared body of /blog/[slug] and /guides/[slug] (RiftCompare's ArticleView):
// one renderer, so a guide and a post read the same. Adds the FAQ (visible and
// FAQPage JSON-LD from one array), the live per-market store counts on the
// buying guides, sign-up prompts after the intro and at the end, and the
// scroll-depth tracker (mounted here, not in the layout, so it runs once per
// article view).
export async function ArticleView({ post, section }: { post: Post; section: "blog" | "guide" }) {
  const country = getCountry();
  const ctx = await postContext(country);
  const title = post.title(ctx);
  const body = post.build(ctx);
  const base = section === "guide" ? "/guides" : "/blog";
  const url = `${SITE_URL}${base}/${post.slug}`;
  const updated = ctx.cat.pricesAt.slice(0, 10);
  const more = POSTS.filter((p) => p.slug !== post.slug && (p.category ?? "blog") === (post.category ?? "blog")).concat(POSTS.filter((p) => p.slug !== post.slug && (p.category ?? "blog") !== (post.category ?? "blog"))).slice(0, 3);
  // The shop strip: the hero cards, then every other card and product the post
  // names, in order of first mention (components/blog/mentions.ts).
  const mentioned = collectMentions([...body.summary, body.lede, ...body.sections.map((x) => x.body)]);
  const shopSlugs = [...new Set([...body.heroCards.map((c) => c.slug), ...mentioned.cards])];
  const shopCards = shopSlugs
    .map((slug) => ctx.cat.bySlug.get(slug))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .slice(0, 6);
  const shopSealed = mentioned.sealed
    .map((slug) => ctx.sealed.find((x) => x.slug === slug))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .slice(0, shopCards.length ? 2 : 4);
  return (
    <div>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: title,
            description: post.description,
            datePublished: post.date,
            dateModified: updated,
            author: {
              "@type": "Organization",
              name: AUTHOR.name,
              url: `${SITE_URL}${AUTHOR.url}`,
            },
            publisher: {
              "@type": "Organization",
              name: SITE_NAME,
              logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` },
            },
            mainEntityOfPage: url,
            image: `${url}/opengraph-image`,
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: SITE_URL,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: section === "guide" ? "Guides" : "Blog",
                item: `${SITE_URL}${base}`,
              },
              { "@type": "ListItem", position: 3, name: title, item: url },
            ],
          },
          ...(post.faq?.length ? [faqLd(post.faq.map((f) => ({ q: f.q, a: plainIntroText(f.a) })))] : []),
        ]}
      />
      <ScrollDepthTracker />
      <article className="mx-auto max-w-3xl">
        <Link href={base} className="text-sm text-slate-400 hover:text-white">
          {section === "guide" ? "← All guides" : "← All posts"}
        </Link>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <span
              key={t}
              className="rounded bg-ink-800 px-2 py-0.5 text-xs text-slate-300"
            >
              {t}
            </span>
          ))}
        </div>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight text-white">
          {title}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          <Link href={AUTHOR.url} className="underline hover:text-white">
            {AUTHOR.name}
          </Link>{" "}
          · {longDate(post.date)} · {post.minutes} min read · Prices updated{" "}
          {shortDate(updated)} ·{" "}
          <Link href="/editorial-policy" className="underline hover:text-white">
            How we research this
          </Link>
        </p>
        <div className="mt-4">
          <ShareRow url={url} title={title} />
        </div>

        {body.heroCards.length ? (
          <div
            className="mt-6 grid grid-cols-3 gap-3 rounded-lg border border-ink-800 bg-ink-850 p-4"
          >
            {body.heroCards.map((c) => (
              <CardQuickLink key={c.id} slug={c.slug} className="block">
                {c.hasImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cardImage.tile(c.id)}
                    alt={`${c.name}${c.variant ? ` (${c.variant})` : ""} ${c.number ?? ""}`}
                    className="w-full rounded-md"
                  />
                ) : null}
              </CardQuickLink>
            ))}
          </div>
        ) : null}

        {body.summary.length ? (
          <div className="card-surface mt-6 border-l-2 border-l-brand-500 p-5">
            <p className="rb-eyebrow text-slate-500 mb-2">The short version</p>
            <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-slate-200 marker:text-brand-400">
              {body.summary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {body.sections.length > 2 ? (
          <nav className="card-surface mt-6 p-5" aria-label="On this page">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
              On this page
            </p>
            <ol className="space-y-1.5 text-[15px]">
              {body.sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="text-slate-200 hover:text-brand-400"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className={`mt-8 ${ARTICLE_PROSE}`}>
          {body.lede}
          <ArticleSignupCta placement="article_intro" />
          {post.marketData ? <ArticleMarketData stats={ctx.stats} /> : null}
          {body.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </div>

        <EbayChase page="article" className="mt-10" />
        <AdSlot slot="article" className="mt-10" />
        {post.faq?.length ? <ArticleFaq faq={post.faq} /> : null}
        <ArticleSignupCta placement="article_end" />
        <div className="mt-6 empty:hidden">
          <EmailOnly>
            <NewsletterSignup siteName="OP Compare" source="article" variant="card" heading="Get the week's One Piece price moves by email" cta="Email me" />
          </EmailOnly>
        </div>

        <EbayPicks country={country} className="mt-10" page="article" />

        <BlogShopStrip
          cards={shopCards}
          sealed={shopSealed}
          setById={ctx.cat.setById}
          country={country}
        />

        <div className="card-surface mt-10 flex flex-wrap items-center gap-2 p-4 text-sm">
          <span className="text-slate-400">The data behind this post:</span>
          {post.related.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="rounded-md border border-ink-700 px-3 py-1.5 font-semibold text-slate-200 hover:border-brand-500"
            >
              {r.label}
            </Link>
          ))}
        </div>

        <aside
          className="card-surface mt-6 flex gap-4 p-5"
          aria-label="About the author"
        >
          <HatMark size={44} className="shrink-0" />
          <div>
            <p className="font-semibold text-white">
              Written by{" "}
              <Link href={AUTHOR.url} className="hover:text-brand-400">
                {AUTHOR.name}
              </Link>
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              {AUTHOR.bio} Prices refresh twice a day, so the tables above
              always match the price pages. Spotted a mistake?{" "}
              <Link href="/contact" className="text-brand-400 hover:underline">
                Tell us
              </Link>
              .
            </p>
          </div>
        </aside>

        <section className="mt-10">
          <h2 className="mb-3 text-xl text-white">Keep reading</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {more.map((p) => (
              <Link
                key={p.slug}
                href={postHref(p)}
                className="card-surface p-4 hover:border-ink-600"
              >
                <p className="text-[15px] font-bold leading-snug text-white">
                  {p.title(ctx)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {p.minutes} min read
                </p>
              </Link>
            ))}
          </div>
        </section>
      </article>
    </div>
  );
}
