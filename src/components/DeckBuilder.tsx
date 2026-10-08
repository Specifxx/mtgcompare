"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import CardQuickLink from "./CardQuickLink";
import { useCountry } from "./CountryProvider";
import { CardPicker, type PickerCard } from "./CardPicker";
import { QtyInput } from "./QtyInput";
import { DeckWatchForm } from "./DeckWatchForm";
import { DeckPublishPanel } from "./decks/DeckPublishPanel";
import { InlineSignupPrompt } from "./InlineSignupPrompt";
import { DATA_TABLE } from "./prose";
import { COUNTRIES, MARKETS, type Country } from "@/lib/country";
import { outboundRel } from "@/lib/affiliate";
import { encodeDeckParam, formatDeckLine, formatDeckList, DECK_LINE_CAP, DECK_FORMATS, QTY_CAP } from "@/lib/deck";
import { FORMAT_UI, type Format } from "@/lib/constants";
import type { DeckPriceResult, DeckLineOut } from "@/lib/deck-price";
import { money } from "@/lib/format";
import { cardImage } from "@/lib/images";
import { usdCentsToCountry } from "@/lib/fx";
import { trackEvent } from "@/lib/analytics";
import { FREE_WATCHLIST_LIMIT } from "@/lib/free-limits";

// The deck builder and list pricer: the free, no-account tool behind /deck, and the site's bulk price checker:
//   - plain names without quantities ("Sol Ring" = one copy), "4x" or "4" quantities, Arena/MTGO/Moxfield section headers (Commander, Companion,
//     Deck, Sideboard) understood;
//   - every line that couldn't be matched listed, with "Search for this";
//   - quantity editing and remove on every line, and search-to-add;
//   - each line resolved to a printing (a bare name prices the cheapest one; a set code, a set and number, a "#id" pin or the printing switch
//     picks another), foil and etched copies priced as their own finish;
//   - an optional format check (size, copies, bans, and for Commander the commander, singleton and colour identity), judged by lib/commander-rules;
//   - a shareable ?list= in UTF-8 base64 (the encoding Best Basket decodes) and "Buy this deck for less", which hands the list to Best Basket.
//
// The paste box is the list: pricing resolves it on the server (/api/deck/price) and rewrites it in canonical form ("4 Lightning Bolt (M11) 149",
// " #id" for a pinned printing), so what you see is what the share link, the deck watch, the deck library and Best Basket get.

export const SAMPLE = `Commander
1 Atraxa, Praetors' Voice

Deck
1 Sol Ring
1 Arcane Signet
1 Command Tower
1 Counterspell
1 Swords to Plowshares
1 Cultivate
1 Doubling Season
1 Deepglow Skate
1 Evolution Sage
1 Plains
1 Island
1 Forest`;

// deck_create fires on a user PRICING their own pasted list rule: deck_id is a short, non-cryptographic hash of the list text.
function shortHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function DeckBuilder({ initialList, emailOn = false }: { initialList: string; emailOn?: boolean }) {
  const { country } = useCountry();
  const [text, setText] = useState(initialList);
  // The paste box was edited since the list was last priced from it — then
  // pricing replaces the list with this text (said under the button).
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<DeckPriceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState<"copied" | "address-bar" | null>(null);
  const [preview, setPreview] = useState<DeckLineOut | null>(null);
  // "" = judge by the list (Commander when it has a Commander section, else no verdict).
  const [format, setFormat] = useState<Format | "">("");
  const lastPriced = useRef<{ text: string; country: Country } | null>(null);

  const price = useCallback(
    async (list: string, opts: { add?: { slug: string; qty: number }; user?: boolean } = {}) => {
      if (!list.trim() && !opts.add) return;
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/deck/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: list, add: opts.add, ...(format ? { format } : {}) }) });
        const j = await r.json();
        if (!r.ok) setError(j.error ?? "Couldn't price that list just now — try again in a moment.");
        else {
          const res = j as DeckPriceResult;
          setResult(res);
          setText(res.text || list);
          setDirty(false);
          setPreview(res.lines[0] ?? null);
          lastPriced.current = { text: res.text || list, country };
          // Only a genuine click on "Price this list" counts as deck_create —
          // not a shared link's auto-price, not a market re-price.
          if (opts.user) trackEvent("deck_create", { deck_id: shortHash(list.trim()), archetype: "custom" });
          try {
            window.history.replaceState(null, "", `/deck?list=${encodeDeckParam(res.text || list)}`);
          } catch {
            /* history blocked */
          }
        }
      } catch {
        setError("Network error — try again.");
      }
      setLoading(false);
    },
    [country, format],
  );

  // A shared link prices itself once; a market change re-prices what was priced.
  useEffect(() => {
    if (lastPriced.current) {
      if (lastPriced.current.country !== country) price(lastPriced.current.text);
    } else if (initialList.trim()) price(initialList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  // The list back as text with its sections (Commander, Deck, Sideboard); a line that did not match has no zone and rides in the main deck.
  const linesText = (lines: DeckLineOut[], unmatched: string[]) => formatDeckList([...lines.map((l) => ({ zone: l.zone, text: l.text })), ...unmatched.map((u) => ({ zone: "main" as const, text: u }))]);
  const switchPrinting = (line: DeckLineOut, id: number) => {
    if (!result) return;
    price(linesText(result.lines.map((l) => (l === line ? { ...l, text: formatDeckLine(l.qty, { id, name: l.card.name, number: null, setCode: "", flags: 0 }, { finish: l.finish }) } : l)), result.unmatched));
  };
  const setQty = (line: DeckLineOut, qty: number) => {
    if (!result) return;
    const q = Math.max(1, Math.min(QTY_CAP, qty));
    price(linesText(result.lines.map((l) => (l === line ? { ...l, text: l.text.replace(/^\d+x?/, String(q)) } : l)), result.unmatched));
  };
  const removeLine = (line: DeckLineOut) => {
    if (!result) return;
    const rest = result.lines.filter((l) => l !== line);
    if (!rest.length && !result.unmatched.length) return clearAll();
    price(linesText(rest, result.unmatched));
  };
  const dismissUnmatched = (raw: string) => {
    if (!result) return;
    const rest = result.unmatched.filter((u) => u !== raw);
    if (!result.lines.length && !rest.length) return clearAll();
    price(linesText(result.lines, rest));
  };
  function clearAll() {
    setResult(null);
    setText("");
    setDirty(false);
    setPreview(null);
    lastPriced.current = null;
    try {
      window.history.replaceState(null, "", "/deck");
    } catch {
      /* history blocked */
    }
  }

  // Search-to-add, and "Search for this" on an unmatched or guessed line: the
  // picked printing joins the list; picked for an unmatched line, it replaces
  // that line and keeps its quantity.
  const [find, setFind] = useState<{ n: number; q: string; raw: string | null; kind: "add" | "unmatched" | "fuzzy" }>({ n: 0, q: "", raw: null, kind: "add" });
  const searchBox = useRef<HTMLDivElement>(null);
  const addCard = (c: PickerCard) => {
    const raw = find.raw;
    const qty = raw ? Math.max(1, Math.min(QTY_CAP, parseInt(/^\s*(\d{1,3})/.exec(raw)?.[1] ?? "1", 10) || 1)) : 1;
    const base = result
      ? [...result.lines.filter((l) => !(find.kind === "fuzzy" && l.raw === raw)).map((l) => l.text), ...result.unmatched.filter((u) => u !== raw)]
      : text.split(/\r?\n/).filter((l) => l.trim() && l.trim() !== raw);
    setFind((f) => ({ n: f.n + 1, q: "", raw: null, kind: "add" }));
    price(base.join("\n"), { add: { slug: c.slug, qty } });
  };
  const lookFor = (raw: string, q: string, kind: "unmatched" | "fuzzy") => {
    setFind((f) => ({ n: f.n + 1, q: q.replace(/^\s*\d{1,3}\s*[xX×]?\s*/, "").replace(/#\d+/, "").trim(), raw, kind }));
    searchBox.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const listText = result?.text || text;
  const share = async () => {
    if (!listText.trim()) return;
    const url = `${window.location.origin}/deck?list=${encodeDeckParam(listText)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShared("copied");
    } catch {
      window.history.replaceState(null, "", url);
      setShared("address-bar");
    }
    setTimeout(() => setShared(null), 2500);
  };

  const c = COUNTRIES[country];
  const t = result?.totals[country];
  const fmt = (cents: number | null | undefined) => money(cents, country);
  const listParam = encodeDeckParam(listText);
  const hasList = !!result && (result.lines.length > 0 || result.unmatched.length > 0);
  const firstName = result?.lines.find((l) => l.commander)?.card.name ?? result?.lines[0]?.card.name;

  return (
    // 300px paste column from lg to xl, 380px from xl .
    <div className="grid gap-6 lg:grid-cols-[300px_1fr] xl:grid-cols-[380px_1fr]">
      {/* Input */}
      <div className="lg:sticky lg:top-36 lg:self-start xl:top-20">
        <div className="card-surface p-4">
          <label htmlFor="deck-paste" className="mb-1 block text-sm font-semibold text-white">
            Paste your decklist or card list
          </label>
          <p className="mb-2 text-xs text-slate-500">
            One card per line: <span className="font-mono">4 Lightning Bolt</span>, <span className="font-mono">1 Sol Ring (C21) 263</span>, or just a
            name for one copy. A bare name prices the cheapest printing; add <span className="font-mono">*F*</span> for foil. Commander, Deck and
            Sideboard headers are understood. (Moxfield, Archidekt, Arena and MTGO exports work as-is.)
          </p>
          {/* sm:text-sm, not text-sm: .input is 16px below sm so iOS doesn't zoom the page on focus. */}
          <textarea
            id="deck-paste"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setDirty(true);
            }}
            rows={14}
            spellCheck={false}
            placeholder={"Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n4 Lightning Bolt (M11) 149\n…"}
            className="input font-mono sm:text-sm"
          />
          <label htmlFor="deck-format" className="mt-3 block text-xs font-medium text-slate-400">
            Check the list against
          </label>
          <select id="deck-format" value={format} onChange={(e) => setFormat(e.target.value as Format | "")} className="input mt-1 w-full">
            <option value="">Automatic (Commander if the list has a commander)</option>
            {FORMAT_UI.map((f) => (
              <option key={f} value={f}>
                {DECK_FORMATS[f].label}
              </option>
            ))}
          </select>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => price(text, { user: true })} disabled={loading || !text.trim()} className="btn-primary flex-1 disabled:opacity-60">
              {loading ? "Pricing…" : "Price this list"}
            </button>
            <button
              type="button"
              onClick={() => {
                setText(SAMPLE);
                setDirty(true);
              }}
              className="btn-ghost"
            >
              Sample
            </button>
          </div>
          {result && dirty && <p className="mt-2 text-[11px] text-slate-500">Pricing replaces the list on the right with this text.</p>}
          <button
            type="button"
            onClick={share}
            disabled={!listText.trim()}
            className="btn-ghost mt-2 w-full text-sm disabled:opacity-50"
            title="Copy a link that loads and prices this exact list"
          >
            {shared === "copied" ? "✓ Link copied!" : shared === "address-bar" ? "Link is in your address bar" : "🔗 Copy shareable link"}
          </button>
        </div>

        {/* Card preview — fills in when you hover a card in the results. */}
        {result && result.lines.length > 0 && (
          <div className="mt-4 hidden lg:block">
            <div className="card-surface overflow-hidden">
              <div className="relative aspect-[5/7] w-full bg-ink-900">
                {preview?.card.hasImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cardImage.tile(preview.card.id)} alt={`${preview.card.name} ${preview.card.number ?? ""}`} className="h-full w-full object-cover object-top" />
                ) : (
                  <div className="grid h-full place-items-center p-4 text-center text-xs text-slate-500">Hover a card in your list to preview it here</div>
                )}
              </div>
              {preview && (
                <div className="p-3">
                  <div className="text-sm font-bold text-white">
                    {preview.card.name}
                    {preview.card.variant ? ` (${preview.card.variant})` : ""}{preview.finishWord ? ` · ${preview.finishWord}` : ""}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {preview.card.setCode} · {preview.card.number}
                    {preview.card.low[country] != null ? ` · from ${fmt(preview.card.low[country])}` : ""}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="min-w-0 space-y-4" aria-live="polite">
        {loading && !hasList ? (
          <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
            <div className="flex flex-col items-center gap-3">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400" />
              <p className="text-sm font-semibold text-white">Pricing your list…</p>
              <p className="text-xs">Matching each card to the cheapest {c.adjective} price.</p>
            </div>
          </div>
        ) : !hasList ? (
          <div className="card-surface p-8 text-center text-slate-400">
            <p className="text-lg font-semibold text-white">Price a whole deck or card list at once</p>
            <p className="mt-1 text-sm">
              Paste a decklist — or any list of card names — and we&apos;ll match every card and total up the cheapest {c.adjective} prices. Or build
              it here, card by card:
            </p>
          </div>
        ) : (
          <div className="card-surface flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex flex-wrap gap-6">
              <Sum label="List total" value={fmt(t?.cents)} highlight />
              <Sum label="Cards" value={`${t?.totalQty ?? 0}`} />
              <Sum label="Matched" value={`${result!.lines.length}/${result!.lines.length + result!.unmatched.length}`} />
              <Sum label="TCGplayer market" value={`≈ ${fmt(usdCentsToCountry(result!.marketUsdTotal, country))}`} />
            </div>
            {result!.lines.length > 0 && (
              <Link href={`/tools/best-basket?list=${listParam}`} className="btn-ghost text-sm" title="The cheapest delivered order across stores, postage included">
                Buy this deck for less →
              </Link>
            )}
          </div>
        )}

        {/* Watch this deck's delivered price (Premium): the alert run re-prices
            the list after every import, lib/deck-watch.ts. The form for a
            Premium member; the PlanButton gate for anyone else. */}
        {result && result.lines.length > 0 && <DeckWatchForm listText={listText} defaultName={firstName ? `${firstName} deck` : "My deck"} emailOn={emailOn} />}

        {/* Publish to the public deck library. */}
        {result && result.lines.length > 0 && (
          <DeckPublishPanel listText={listText} format={result.format} loginHref={`/login?src=deck_publish&next=${encodeURIComponent(`/deck?list=${listParam}`)}`} />
        )}

        {error && (
          <p role="alert" className="text-sm text-rose-400">
            {error}
          </p>
        )}
        {result && hasList && (
          <p className="text-xs text-slate-400">
            Matched {result.lineCount - result.unmatched.length} of {result.lineCount} line{result.lineCount === 1 ? "" : "s"}
            {result.unmatched.length ? ` — ${result.unmatched.length} couldn't be matched (listed below).` : "."}
            {result.truncated ? ` Only the first ${DECK_LINE_CAP} lines are priced.` : ""}
          </p>
        )}
        {result && result.lines.length > 0 && <DeckChecks result={result} />}

        {/* Search-to-add. Remounted (key) with a query when "Search for this" is used on a line. */}
        <div ref={searchBox} className="card-surface p-4">
          <label htmlFor="deck-add" className="mb-1 block text-xs font-medium text-slate-400">
            {find.kind === "unmatched" ? `Find the card for “${find.q}”` : find.kind === "fuzzy" ? `Pick the right card for “${find.q}”` : "Add a card to your list"}
          </label>
          <CardPicker key={find.n} inputId="deck-add" initialQuery={find.q} autoFocus={find.raw != null} onPick={addCard} disabled={loading} />
          {find.raw && (
            <button type="button" onClick={() => setFind((f) => ({ n: f.n + 1, q: "", raw: null, kind: "add" }))} className="mt-2 text-xs text-slate-500 hover:text-slate-300">
              Cancel
            </button>
          )}
        </div>

        {result && result.lines.length > 0 && (
          <section className="card-surface overflow-hidden" aria-label="Your list">
            <ul className="divide-y divide-ink-800">
              {result.lines.map((l) => {
                const unit = l.card.low[country];
                return (
                  <li key={`${l.card.id}-${l.finish}-${l.raw}`} onMouseEnter={() => setPreview(l)} className="flex flex-wrap items-center gap-3 p-3 transition-colors hover:bg-ink-900/50 sm:flex-nowrap">
                    <QtyInput value={l.qty} onChange={(q) => setQty(l, q)} max={QTY_CAP} label={`Quantity for ${l.card.name}`} />
                    <CardQuickLink slug={l.card.slug} className="shrink-0">
                      {l.card.hasImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cardImage.thumb(l.card.id)} alt="" width={36} height={48} loading="lazy" className="h-12 w-9 rounded object-cover ring-1 ring-ink-700" />
                      ) : (
                        <span className="block h-12 w-9 rounded bg-ink-800" />
                      )}
                    </CardQuickLink>
                    <div className="min-w-0 flex-1">
                      <CardQuickLink slug={l.card.slug} className="font-medium text-white hover:text-brand-400">
                        {l.card.name}
                      </CardQuickLink>
                      {l.commander ? <span className="chip ml-2 border border-gold/40 text-[10px] text-gold">Commander</span> : null}
                      {l.finishWord ? <span className="chip ml-2 border border-ink-700 text-[10px] text-slate-300">{l.finishWord}</span> : null}
                      {l.zone === "side" ? <span className="chip ml-2 border border-ink-700 text-[10px] text-slate-400">Sideboard</span> : null}
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        {l.options.length > 1 ? (
                          <>
                            <label className="sr-only" htmlFor={`pr-${l.card.id}`}>
                              Printing of {l.card.name}
                            </label>
                            <select
                              id={`pr-${l.card.id}`}
                              value={l.card.id}
                              onChange={(e) => switchPrinting(l, Number(e.target.value))}
                              disabled={loading}
                              className="w-full min-w-0 max-w-full rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-xs text-slate-200 sm:w-auto sm:max-w-[16rem]"
                            >
                              {l.options.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.label}
                                  {o.low != null ? ` · ${fmt(o.low)}` : ""}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : (
                          <span>
                            {l.card.setCode} · {l.card.number} {l.card.variant ?? ""}
                          </span>
                        )}
                      </div>
                      {l.how === "name" && l.ambiguous && (
                        <div className="text-xs text-gold">
                          Matched from “{l.raw}” by name only —{" "}
                          <button type="button" onClick={() => lookFor(l.raw, l.raw, "fuzzy")} className="underline hover:text-white">
                            not it? search
                          </button>
                        </div>
                      )}
                      {(l.setMissed || l.etchedMissed || l.finishAdjusted) && (
                        <div className="text-xs text-gold">
                          {l.setMissed
                            ? "That set or number didn't match: priced at the cheapest printing."
                            : l.etchedMissed
                              ? "No etched printing found: priced as a regular foil or non-foil."
                              : "That printing doesn't come in the finish asked for."}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {l.cheapest ? (
                          <a
                            href={l.cheapest.url}
                            target="_blank"
                            rel={outboundRel()}
                            data-retailer={l.cheapest.source.replace("store:", "")}
                            data-page="deck"
                            data-card={l.card.slug}
                            data-surface="deck_cheapest"
                            className="font-semibold text-brand-400 hover:underline"
                          >
                            {l.cheapest.store}
                            {l.cheapest.condition && l.cheapest.condition !== "NM" ? ` (${l.cheapest.condition})` : ""} →
                          </a>
                        ) : (
                          <span className="text-slate-500">No store in {c.place} has it in stock</span>
                        )}
                        {l.tcgplayerUrl && country === "US" && l.cheapest?.source !== "tcgplayer" ? (
                          <a href={l.tcgplayerUrl} target="_blank" rel={outboundRel()} data-retailer="tcgplayer" data-page="deck" data-card={l.card.slug} data-surface="deck_tcgplayer" className="text-slate-300 hover:underline">
                            TCGplayer
                          </a>
                        ) : null}
                        <a href={l.ebayUrl} target="_blank" rel={outboundRel()} data-retailer="ebay_search" data-page="deck" data-card={l.card.slug} data-surface="deck_ebay" className="text-slate-300 hover:underline">
                          eBay
                        </a>
                      </div>
                    </div>
                    <div className="ml-auto shrink-0 text-right">
                      {unit != null ? (
                        <>
                          <div className="num font-bold text-white">{fmt(unit * l.qty)}</div>
                          <div className="num text-[11px] text-slate-500">{fmt(unit)} ea</div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-500">no price</div>
                      )}
                    </div>
                    <button type="button" onClick={() => removeLine(l)} disabled={loading} aria-label={`Remove ${l.card.name}`} className="shrink-0 text-slate-600 hover:text-rose-300">
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between border-t border-ink-700 p-4">
              <span className="text-sm text-slate-400">
                {t?.pricedQty ?? 0} of {t?.totalQty ?? 0} cards priced
              </span>
              <span className="num text-xl font-extrabold text-accent">{fmt(t?.cents)}</span>
            </div>
          </section>
        )}

        {result && result.unmatched.length > 0 && (
          <div className="card-surface p-4">
            <p className="text-sm font-semibold text-gold">
              {result.unmatched.length} line{result.unmatched.length === 1 ? "" : "s"} couldn&apos;t be matched — not in the total
            </p>
            <ul className="mt-2 divide-y divide-ink-800">
              {result.unmatched.map((u) => (
                <li key={u} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-400">{u}</span>
                  <button type="button" onClick={() => lookFor(u, u, "unmatched")} className="shrink-0 text-xs font-semibold text-brand-400 hover:underline">
                    Search for this
                  </button>
                  <button type="button" onClick={() => dismissUnmatched(u)} aria-label={`Dismiss ${u}`} className="shrink-0 text-slate-600 hover:text-rose-300">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasList && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-600">
              Total uses each card&apos;s cheapest in-stock {country} price and may span multiple stores — postage not included.
            </p>
            <button type="button" onClick={clearAll} className="shrink-0 text-xs text-slate-500 hover:text-slate-300">
              Clear list
            </button>
          </div>
        )}

        {result && result.split.groups.length > 0 && (
          <section className="card-surface p-5" aria-labelledby="by-store-h">
            <h2 id="by-store-h" className="text-lg font-bold text-white">
              Buy each card where it&apos;s cheapest
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              <span className="num font-semibold text-white">{fmt(result.split.totalCents)}</span> across {result.split.groups.length} store
              {result.split.groups.length === 1 ? "" : "s"} in {c.place}, item prices only. Postage is extra at each store, so fewer stores can work out
              cheaper —{" "}
              <Link href={`/tools/best-basket?list=${listParam}`} className="text-brand-400 hover:underline">
                Best Basket
              </Link>{" "}
              finds the cheapest delivered split.
            </p>
            {result.split.groups.map((g) => (
              <details key={g.source} className="mt-3 rounded-lg border border-ink-800 p-3">
                <summary className="flex cursor-pointer justify-between gap-3 text-sm">
                  <span className="font-semibold text-white">{g.store}</span>
                  <span className="text-slate-300">
                    {g.copies} card{g.copies === 1 ? "" : "s"} · <span className="num font-semibold text-white">{fmt(g.totalCents)}</span>
                  </span>
                </summary>
                <ul className="mt-2 divide-y divide-ink-800">
                  {g.picks.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <span className="min-w-0 truncate text-slate-200">
                        {p.qty}× {p.name}
                        {p.condition && p.condition !== "NM" ? <span className="text-slate-500"> · {p.condition}</span> : null}
                      </span>
                      <a href={p.url} target="_blank" rel={outboundRel()} data-retailer={g.source.replace("store:", "")} data-page="deck" className="num shrink-0 font-semibold text-white hover:text-brand-400">
                        {fmt(p.unitCents * p.qty)} →
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            {result.split.missing.length ? <p className="mt-3 text-xs text-slate-500">Not in stock anywhere in {c.place}: {result.split.missing.join(", ")}.</p> : null}
            <p className="mt-3 text-xs text-slate-500">Stores publish whether a card is in stock, not how many copies, so check each store has the quantity.</p>
          </section>
        )}

        {result && result.lines.length > 0 && (
          <section className="card-surface overflow-x-auto p-5" aria-labelledby="markets-h">
            <h2 id="markets-h" className="text-lg font-bold text-white">
              This list in every market
            </h2>
            <table className={`${DATA_TABLE} mt-3 min-w-[420px]`}>
              <thead>
                <tr>
                  <th>Market</th>
                  <th className="text-right">Cheapest total</th>
                  <th className="text-right">Cards priced</th>
                </tr>
              </thead>
              <tbody>
                {MARKETS.map((m) => (
                  <tr key={m} className={m === country ? "bg-brand-500/10" : undefined}>
                    <td className="text-slate-200">{COUNTRIES[m].label}</td>
                    <td className="num text-right font-semibold text-white">{money(result.totals[m].cents, m)}</td>
                    <td className="num text-right text-slate-300">
                      {result.totals[m].pricedQty}/{result.totals[m].totalQty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">Each market&apos;s total covers only the cards in stock there, in its own currency.</p>
          </section>
        )}

        {/* After a list is priced: what a free account adds to it. Signed-out
            visitors only; ?next= brings them back to this list. */}
        {result && result.lines.length > 0 && (
          <InlineSignupPrompt
            surface="inline-deck"
            title="Watch this list's cards for a price drop"
            body={`A free account watches up to ${FREE_WATCHLIST_LIMIT} of its cards and tells you when one hits a new low. Premium's Best Basket finds the cheapest delivered way to buy the whole list, store by store.`}
            next={`/deck?list=${listParam}`}
          />
        )}
      </div>
    </div>
  );
}

function DeckChecks({ result }: { result: DeckPriceResult }) {
  const check = result.check;
  if (!check) return <p className="text-xs text-slate-500">Pick a format above to check the list as a deck. Pricing a list, not a deck? Fine.</p>;
  const f = DECK_FORMATS[check.format];
  if (!check.issues.length) return <p className="text-xs text-emerald-400">Looks legal for {f.label}: {check.counts.deck} cards{check.identity != null ? ", inside the commander's colour identity" : ""}.</p>;
  return (
    <div className="text-xs text-slate-400">
      <p className={check.ok ? "text-emerald-400" : "text-slate-300"}>
        {check.ok ? `Legal for ${f.label}, with notes:` : `As a ${f.label} deck:`}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {check.issues.map((i, n) => (
          <li key={`${i.code}-${n}`} className={i.level === "error" ? "text-rose-300" : undefined}>
            {i.message}
            {i.names.length ? ` (${i.names.slice(0, 6).join(", ")}${i.names.length > 6 ? ", …" : ""})` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sum({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num text-xl font-extrabold ${highlight ? "text-accent" : "text-white"}`}>{value}</div>
    </div>
  );
}
