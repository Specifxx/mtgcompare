// The collection value card (owner, 2026-11-18: "we need more shareable artefacts"). My collection's share button
// draws a 1200x630 picture of the visitor's own totals IN THEIR BROWSER (a canvas, no server, no function, no Vercel
// image cost) and hands it to the phone's share sheet as a file with the link, so it lands in a chat, a Discord or an
// Instagram story as an image. Where files can't be shared (most desktops) it saves the PNG and copies the link.
// The same file in every site with My collection (src/lib/vault.ts); port fixes by hand.
//
// Only the visitor's own numbers, from their own list and the site's /prices.json: nothing is sent to us. `cardModel`
// is pure (tests); `drawCard` needs a browser.

export interface CardInput {
  site: string;
  /** what the collection holds, e.g. "Riftbound", "Pokémon sealed" */
  what: string;
  /** the site's host, e.g. tcgprices.app */
  host: string;
  /** "$1,234.56" */
  total: string;
  /** null when there is no change to report */
  change: { up: boolean; text: string } | null;
  units: number;
  market: string;
  /** the most valuable items, already formatted */
  top: { name: string; price: string }[];
  date: Date;
}

export interface CardModel {
  site: string;
  title: string;
  total: string;
  change: { up: boolean; text: string } | null;
  meta: string;
  top: { name: string; price: string }[];
  footer: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function cardModel(i: CardInput): CardModel {
  const day = i.date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return {
    site: i.site,
    title: clip(`My ${i.what} collection`, 34),
    total: i.total,
    change: i.change,
    meta: `${i.units === 1 ? "1 item" : `${i.units} items`} · ${i.market} store prices · ${day}`,
    top: i.top.slice(0, 3).map((t) => ({ name: clip(t.name, 30), price: t.price })),
    footer: `Track yours free at ${i.host}`,
  };
}

/** The tracked link the card points to. */
export const cardLink = (origin: string) => `${origin}/?utm_source=share&utm_medium=collection&utm_campaign=collection-card`;

/** Draws the card and returns it as a PNG, or null when the browser can't (no canvas, blocked). */
export async function drawCard(m: CardModel): Promise<Blob | null> {
  try {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 630;
    const g = c.getContext("2d");
    if (!g) return null;
    // the left column's width with the item panel beside it, else the whole card
    const W = m.top.length ? 600 : 1072;
    const font = (w: number, px: number) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    g.fillStyle = "#0f172a";
    g.fillRect(0, 0, 1200, 630);
    g.textBaseline = "alphabetic";
    g.fillStyle = "#93c5fd";
    g.font = font(700, 30);
    g.fillText(m.site, 64, 92);
    g.fillStyle = "#e2e8f0";
    g.font = font(700, 40);
    g.fillText(m.title, 64, 156, W);
    g.fillStyle = "#ffffff";
    g.font = font(800, m.total.length > 12 ? 92 : 112);
    g.fillText(m.total, 64, 290, W);
    if (m.change) {
      g.fillStyle = m.change.up ? "#4ade80" : "#f87171";
      g.font = font(700, 32);
      g.fillText(`${m.change.up ? "▲" : "▼"} ${m.change.text}`, 64, 350, W);
    }
    g.fillStyle = "#94a3b8";
    g.font = font(500, 26);
    g.fillText(m.meta, 64, 410, W);
    if (m.top.length) {
      const x = 700;
      g.fillStyle = "rgba(255,255,255,0.06)";
      g.beginPath();
      g.roundRect?.(x, 120, 440, 330, 20);
      g.fill();
      g.fillStyle = "#94a3b8";
      g.font = font(600, 24);
      g.fillText("Most valuable", x + 28, 170);
      m.top.forEach((t, n) => {
        const y = 230 + n * 80;
        g.fillStyle = "#f8fafc";
        g.font = font(600, 26);
        g.fillText(t.name, x + 28, y, 384);
        g.fillStyle = "#4ade80";
        g.font = font(700, 26);
        g.fillText(t.price, x + 28, y + 34, 384);
      });
    }
    g.fillStyle = "#1e293b";
    g.fillRect(0, 520, 1200, 110);
    g.fillStyle = "#ffffff";
    g.font = font(700, 32);
    g.fillText(m.footer, 64, 585);
    return await new Promise<Blob | null>((res) => c.toBlob((b) => res(b), "image/png"));
  } catch {
    return null;
  }
}

/** Saves a blob as a file (desktop fallback). */
export function saveBlob(b: Blob, name: string): void {
  const url = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
