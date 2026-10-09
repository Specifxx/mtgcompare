// NEXT_PUBLIC_TCGPLAYER_CREATIVES: owner-supplied Impact creative ids for MTG
// Compare's OWN Impact account (never a sister site's), "<id>:<w>x<h>"
// comma-separated, e.g. "3841228:336x280".
// Pure parse; a malformed entry is dropped (never guessed), none means no banner.
export interface TcgCreative {
  id: string;
  w: number;
  h: number;
}

export function parseCreatives(raw: string | undefined | null): TcgCreative[] {
  const out: TcgCreative[] = [];
  for (const part of (raw ?? "").split(",")) {
    const m = /^\s*(\d{5,9}):(\d{2,4})x(\d{2,4})\s*$/.exec(part);
    if (m) out.push({ id: m[1], w: Number(m[2]), h: Number(m[3]) });
  }
  return out;
}
