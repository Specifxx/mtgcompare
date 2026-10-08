// Load + draw for every share image. The routes in src/app/**/opengraph-image.tsx
// are one-liners over these, so scripts and tests can render exactly what a
// route serves. Data comes only from the loaders of lib/data (published files
// read through the pinned data commit: no database, no Offer query, no eBay),
// the market is fixed at US (an OG PNG has no visitor), and any failure draws
// FallbackImage: an unfurl must produce an image, never a 500. Every image is
// sent with OG_CACHED, every fallback with OG_AFTER_ERROR (see respond.ts).
// Card art is imageFor(c, "og"): a JPEG on both image hosts.
import type { ImageResponse } from "next/og";
import { PRINTINGS, SET_KINDS, finishLabel, rarityLabel } from "../constants";
import { MARKETS } from "../country";
import {
  getCardLookup,
  getCardPage,
  getCardsByIds,
  getHomeStats,
  getPublishedDeck,
  getRisingSnapshot,
  getSealedBySet,
  getSealedDetail,
  getSetBySlug,
  getSetHighlights,
  getSetIndex,
  type CardLite,
} from "../data";
import { imageFor } from "../images";
import { hotListName } from "../rising-snapshot";
import { postBySlug } from "../blog";
import { postContext } from "../blog/context";
import { ogArt, withArt } from "./art";
import { BlogImage, CardImage, FallbackImage, GuideImage, SealedImage, SetImage, type GuideVariant } from "./compose";
import { OG_AFTER_ERROR, OG_CACHED, ogResponse } from "./respond";
import { ogDate } from "./theme";
import { ogPriceLines, pickGuideRows, sealedArt, setBoxImage, setPreviewCards, setTopRows, storesTracked } from "./select";

function warn(where: string, err: unknown) {
  console.error(`[og] ${where} fell back:`, err instanceof Error ? err.message : err);
}

export const fallbackOg = () => ogResponse(<FallbackImage />, OG_AFTER_ERROR);

/** An extra the image can do without (store count, box art): its failure, even one thrown before a promise exists, costs the extra and nothing else. */
async function optional<T>(read: () => Promise<T>, instead: T): Promise<T> {
  try {
    return await read();
  } catch {
    return instead;
  }
}

/** (a) the site default and (b) /price-guide: the first page of the guide's default sort, filtered by pickGuideRows. */
export async function guideOg(variant: GuideVariant): Promise<ImageResponse> {
  try {
    const [page, sets, stats] = await Promise.all([getCardPage({ sort: "value", page: 1, per: 100 }), getSetIndex(), optional(() => getHomeStats(), null)]);
    const rows = pickGuideRows({ cards: page.items, setById: sets.byId }, "US", 5);
    if (rows.length < 3) return fallbackOg();
    return ogResponse(<GuideImage rows={await withArt(rows)} cards={page.total} stores={storesTracked(stats)} variant={variant} />, OG_CACHED);
  } catch (err) {
    warn(`guide(${variant})`, err);
    return fallbackOg();
  }
}

/** (c) /sets/[slug]: the set's own mini price guide, or its art when unpriced. */
export async function setOg(slug: string): Promise<ImageResponse> {
  try {
    const set = await getSetBySlug(slug);
    if (!set) return fallbackOg();
    // The twelve dearest listed cards of the set (one board read), hydrated for their cheapest listing and store counts.
    const board = await getSetHighlights(set.id, 12);
    const found = await getCardsByIds(board.map((b) => b.id));
    const cards = board.map((b) => found.get(b.id)).filter((c): c is CardLite => !!c);
    const rows = setTopRows(cards, set, 5);
    const priced = rows.length >= 3;
    const preview = priced ? [] : await withArt(setPreviewCards(cards, set, 4));
    // No card art yet (an upcoming set): its booster box, from the sealed products of the set.
    const boxArt = priced || preview.some((r) => r.art) ? null : await ogArt(setBoxImage(await optional(() => getSealedBySet(set.id), []), set.id));
    const today = new Date().toISOString().slice(0, 10);
    return ogResponse(
      <SetImage
        code={set.code}
        name={set.name}
        kindLabel={SET_KINDS[set.kind]?.label ?? "Set"}
        printings={set.cardCount}
        topCard={rows[0]?.marketUsd ?? null}
        released={ogDate(set.releasedOn)}
        upcoming={!!set.releasedOn && set.releasedOn > today}
        rows={priced ? await withArt(rows) : []}
        preview={preview.filter((r) => r.art)}
        boxArt={boxArt}
      />,
      OG_CACHED,
    );
  } catch (err) {
    warn(`set(${slug})`, err);
    return fallbackOg();
  }
}

/** (c) /sealed/[slug]: the product on a white plate with its price. */
export async function sealedOg(slug: string): Promise<ImageResponse> {
  try {
    const s = await getSealedDetail(slug);
    if (!s) return fallbackOg();
    const set = s.setId != null ? (await getSetIndex()).byId.get(s.setId) : undefined;
    const { head, others } = ogPriceLines(s, 4);
    return ogResponse(
      <SealedImage
        name={s.name}
        kindLabel={s.kind}
        setCode={set?.code ?? null}
        art={await ogArt(sealedArt(s.id))}
        marketUsd={s.marketUsd}
        packCount={s.packCount}
        head={head}
        others={others}
      />,
      OG_CACHED,
    );
  } catch (err) {
    warn(`sealed(${slug})`, err);
    return fallbackOg();
  }
}

/** (d) /card/[slug]: art, printing, rarity and the cheapest price per market, for the card's headline unit (Normal first). */
export async function cardOg(slug: string): Promise<ImageResponse> {
  try {
    const look = await getCardLookup({ slugs: [slug] });
    const c = look.bySlug.get(slug);
    if (!c) return fallbackOg();
    const { head, others } = ogPriceLines(c, 5);
    return ogResponse(
      <CardImage
        name={c.name}
        variant={c.variant}
        printing={c.printing}
        printingLabel={PRINTINGS[c.printing]?.label ?? "Standard"}
        finish={c.headFinish === "F" ? finishLabel(c, "F") : null}
        rarity={c.rarity}
        rarityLabel={c.rarity ? rarityLabel(c.rarity) : null}
        number={c.number}
        setCode={c.setCode}
        setName={look.setById.get(c.setId)?.name ?? ""}
        art={await ogArt(imageFor(c, "og"))}
        marketUsd={c.marketUsd}
        head={head}
        others={others}
      />,
      OG_CACHED,
    );
  } catch (err) {
    warn(`card(${slug})`, err);
    return fallbackOg();
  }
}

/** (d) /blog/[slug] and /guides/[slug]: the post title beside its three hero cards. */
export async function blogOg(slug: string): Promise<ImageResponse> {
  const post = postBySlug(slug);
  if (!post) return fallbackOg();
  try {
    const ctx = await postContext("US");
    const title = post.title(ctx);
    const urls = post
      .build(ctx)
      .heroCards.map((c) => imageFor(c, "og"))
      .filter((u): u is string => !!u)
      .slice(0, 3);
    const arts = await Promise.all(urls.map((u) => ogArt(u)));
    return ogResponse(<BlogImage title={title} arts={arts} />, OG_CACHED);
  } catch (err) {
    warn(`blog(${slug})`, err);
    return fallbackOg();
  }
}

/**
 * (e) /decks/[slug]: the deck's title and what it costs to build (the library's own
 * US total, the figure the deck page quotes), beside its commander and two dearest
 * cards. No total in the library row means no price in the title, never a guess.
 */
export async function deckOg(slug: string): Promise<ImageResponse> {
  try {
    const deck = await getPublishedDeck(slug);
    if (!deck) return fallbackOg();
    const total = deck.publishedTotals.US ?? null;
    const lead = [deck.commanderCardId, ...(deck.partnerCardId ? [deck.partnerCardId] : [])];
    const found = await getCardsByIds([...new Set([...lead, ...deck.lines.map((l) => l.cardId)])], { stores: false });
    const front = lead.map((id) => found.get(id)).filter((c): c is CardLite => !!c && imageFor(c, "og") != null);
    const rest = deck.lines
      .map((l) => found.get(l.cardId))
      .filter((c): c is CardLite => !!c && !lead.includes(c.id) && imageFor(c, "og") != null)
      .sort((a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0) || a.id - b.id);
    const urls = [...front.slice(0, 1), ...rest].slice(0, 3).map((c) => imageFor(c, "og"));
    const arts = await Promise.all(urls.map((u) => ogArt(u)));
    const title = total != null ? `${deck.title}: ${ogDollars(total)} to build` : deck.title;
    return ogResponse(<BlogImage title={title} arts={arts} badge="DECK" footer={`${deck.commanderName} · ${deck.cardCount} cards, priced in ${MARKETS.length} markets`} />, OG_CACHED);
  } catch (err) {
    warn(`deck(${slug})`, err);
    return fallbackOg();
  }
}

/**
 * A minted Hot 40 snapshot (/rising/[token]): its frozen title beside the top
 * three cards' art — every figure from the frozen row (getRisingSnapshot),
 * nothing recomputed; only the art is looked up (by card id). A missing token or
 * an empty run draws the fallback.
 */
export async function risingOg(token: string): Promise<ImageResponse> {
  try {
    const snap = await getRisingSnapshot(token);
    if (!snap || !snap.data.picks.length) return fallbackOg();
    const top = snap.data.picks.slice(0, 3);
    const found = await getCardsByIds(top.map((p) => Number(p.id)), { stores: false });
    const arts = await Promise.all(
      top.map((p) => {
        const c = found.get(Number(p.id));
        return ogArt(c ? imageFor(c, "og") : null);
      }),
    );
    const day = new Date(snap.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    // "HOT 40": the list's own name and count (hotListName) without whichever site brand leads it, so the badge never repeats the lockup beside it.
    const badge = hotListName(snap.data.picks.length).replace(/^.*?(?=\bHot\b)/i, "").toUpperCase();
    return ogResponse(<BlogImage title={snap.title} arts={arts} badge={badge} footer={`A frozen snapshot of Rising Cards, ${day}`} />, OG_CACHED);
  } catch (err) {
    warn(`rising(${token.slice(0, 6)}…)`, err);
    return fallbackOg();
  }
}

/** US cents as "$123" / "$12.34" for an image headline. */
function ogDollars(cents: number): string {
  return cents >= 100_000 ? `$${Math.round(cents / 100).toLocaleString("en-US")}` : `$${(cents / 100).toFixed(2)}`;
}
