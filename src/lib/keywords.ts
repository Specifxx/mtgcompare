// One Piece Card Game keywords and timing markers, for /keywords and
// /keywords/[slug]. Pure: cardKeywords() reads a card's printed effect text
// (Card.effect, TCGplayer's own rules text) and tests/keywords.test.ts pins it.
//
// WHICH CARDS COUNT. A keyword is printed in square brackets ("[Rush]",
// "[On Play]"). A card counts when the bracket appears anywhere in its text,
// which includes cards that GAIN the keyword ("this Character gains [Blocker]")
// — the page says "cards whose text has [Blocker]", never "cards with Blocker",
// for exactly that reason. "[Rush: Character]" is its own keyword and is not
// counted as [Rush]; "[Activate:Main]" and "[Activate: Main]" are one marker
// (TCGplayer's text spells it both ways); DON!! ×N conditions fold into one
// "DON!! ×N" page.
//
// THE DEFINITIONS are short paraphrases of how each keyword works under
// Bandai's One Piece Card Game Comprehensive Rules (keyword effects section).
// They describe the keyword itself, never a ruling on a particular card; the
// page links readers to Bandai's rules for anything more.

export interface KeywordDef {
  slug: string;
  name: string; // as printed, without brackets
  kind: "keyword" | "timing";
  summary: string; // one sentence for the hub and meta description
  body: string[]; // paragraphs for the keyword's page
  /** The bracket text(s) that mark it, lowercased, spaces squeezed. */
  markers: string[];
}

export const KEYWORDS: KeywordDef[] = [
  {
    slug: "rush",
    name: "Rush",
    kind: "keyword",
    summary: "A Character with [Rush] can attack on the turn it is played.",
    body: [
      "Characters normally cannot attack during the turn they are played. A Character with [Rush] ignores that restriction and can attack straight away, at your opponent's Leader or at a rested Character.",
      "Rush is the colour of aggression: it turns a card played this turn into immediate pressure on your opponent's Life.",
    ],
    markers: ["rush"],
  },
  {
    slug: "rush-character",
    name: "Rush: Character",
    kind: "keyword",
    summary: "[Rush: Character] lets a Character attack your opponent's Characters, but not their Leader, on the turn it is played.",
    body: [
      "A narrower version of Rush: the Character may attack during the turn it is played, but only an opponent's Character — never the Leader.",
      "It is mostly a removal tool, letting a fresh Character knock out a rested blocker or attacker the turn it lands.",
    ],
    markers: ["rush: character", "rush:character"],
  },
  {
    slug: "blocker",
    name: "Blocker",
    kind: "keyword",
    summary: "When your opponent attacks, you may rest a [Blocker] Character to make it the new target of the attack.",
    body: [
      "After your opponent declares an attack, in the block step you may rest one of your active Characters with [Blocker]; the attack then targets that Character instead.",
      "Blockers protect your Leader's Life. Some cards stop the opponent from activating [Blocker] for a turn, which is why the keyword appears in so many cards' text.",
    ],
    markers: ["blocker"],
  },
  {
    slug: "double-attack",
    name: "Double Attack",
    kind: "keyword",
    summary: "A card with [Double Attack] deals 2 damage instead of 1 when it hits your opponent's Leader.",
    body: [
      "When an attack by a card with [Double Attack] deals damage to the opponent's Leader, it deals 2 damage — two Life cards — instead of one.",
      "It is one of the fastest ways to close a game, so many Double Attack cards cost more or need DON!! attached.",
    ],
    markers: ["double attack"],
  },
  {
    slug: "banish",
    name: "Banish",
    kind: "keyword",
    summary: "Damage dealt by a [Banish] card sends the Life card to the trash instead of your opponent's hand, and its Trigger does not activate.",
    body: [
      "Normally a Life card lost to damage goes to its owner's hand, and its [Trigger] may be used. When the damage comes from a card with [Banish], the Life card is trashed instead, with no Trigger.",
      "Banish denies the defender both the card and the comeback a Trigger can bring.",
    ],
    markers: ["banish"],
  },
  {
    slug: "unblockable",
    name: "Unblockable",
    kind: "keyword",
    summary: "Your opponent cannot activate [Blocker] against an attack by an [Unblockable] card.",
    body: ["When a card with [Unblockable] attacks, the defending player cannot use [Blocker] to redirect the attack. Counters still apply."],
    markers: ["unblockable"],
  },
  {
    slug: "trigger",
    name: "Trigger",
    kind: "keyword",
    summary: "When a Life card with [Trigger] is revealed by damage, its owner may activate the Trigger effect instead of adding it to hand.",
    body: [
      "When you take damage, the Life card is revealed; if it has a [Trigger], you may activate that effect instead of adding the card to your hand.",
      "Triggers are the defender's comeback mechanic, and Yellow decks in particular are built around them. [Banish] damage stops them.",
    ],
    markers: ["trigger"],
  },
  {
    slug: "counter",
    name: "Counter",
    kind: "timing",
    summary: "[Counter] marks an Event's effect you can use during your opponent's attack, in the counter step.",
    body: [
      "Event cards with [Counter] are played during the counter step of your opponent's attack, usually to raise a card's power for the battle.",
      "Not to be confused with a Character's printed counter value (+1000, +2000), which is used from hand in the same step.",
    ],
    markers: ["counter"],
  },
  {
    slug: "on-play",
    name: "On Play",
    kind: "timing",
    summary: "An [On Play] effect activates when the card is played.",
    body: ["The effect resolves as the Character (or Stage) comes into play from your hand. It is the most common timing in the game."],
    markers: ["on play"],
  },
  {
    slug: "when-attacking",
    name: "When Attacking",
    kind: "timing",
    summary: "A [When Attacking] effect activates when the card attacks.",
    body: ["The effect activates when the Leader or Character declares an attack, before the opponent blocks or counters."],
    markers: ["when attacking"],
  },
  {
    slug: "activate-main",
    name: "Activate: Main",
    kind: "timing",
    summary: "An [Activate: Main] effect can be used during your Main Phase, often by paying a cost.",
    body: ["You choose when to use it during your own Main Phase, when no battle is happening. Many carry a cost such as resting the card or returning DON!!, and many are [Once Per Turn]."],
    markers: ["activate: main", "activate:main"],
  },
  {
    slug: "main",
    name: "Main",
    kind: "timing",
    summary: "[Main] marks an Event's effect you play during your Main Phase.",
    body: ["An Event with [Main] is played from your hand during your own Main Phase by paying its cost."],
    markers: ["main"],
  },
  {
    slug: "on-ko",
    name: "On K.O.",
    kind: "timing",
    summary: "An [On K.O.] effect activates when the Character is K.O.'d.",
    body: ["When the Character is K.O.'d — in battle or by an effect — its [On K.O.] effect activates."],
    markers: ["on k.o."],
  },
  {
    slug: "on-block",
    name: "On Block",
    kind: "timing",
    summary: "An [On Block] effect activates when the card blocks.",
    body: ["It activates when the Character activates [Blocker] and becomes the attack's new target."],
    markers: ["on block"],
  },
  {
    slug: "on-your-opponents-attack",
    name: "On Your Opponent's Attack",
    kind: "timing",
    summary: "An [On Your Opponent's Attack] effect can activate when your opponent attacks.",
    body: ["It activates during your opponent's attack, which lets Leaders and Characters defend in ways a counter cannot."],
    markers: ["on your opponent's attack"],
  },
  {
    slug: "end-of-your-turn",
    name: "End of Your Turn",
    kind: "timing",
    summary: "An [End of Your Turn] effect activates at the end of your turn.",
    body: ["It activates in your End Phase — often to set DON!! or Characters as active again before your opponent's turn."],
    markers: ["end of your turn"],
  },
  {
    slug: "your-turn",
    name: "Your Turn",
    kind: "timing",
    summary: "A [Your Turn] effect applies only during your own turn.",
    body: ["A continuous effect limited to your turn, such as extra power while you attack."],
    markers: ["your turn"],
  },
  {
    slug: "opponents-turn",
    name: "Opponent's Turn",
    kind: "timing",
    summary: "An [Opponent's Turn] effect applies only during your opponent's turn.",
    body: ["A continuous effect limited to your opponent's turn, usually a defensive one."],
    markers: ["opponent's turn"],
  },
  {
    slug: "once-per-turn",
    name: "Once Per Turn",
    kind: "timing",
    summary: "An effect marked [Once Per Turn] can be activated only once each turn.",
    body: ["It limits how often the effect can be used, not when; it is printed beside another timing such as [Activate: Main] or [On Your Opponent's Attack]."],
    markers: ["once per turn"],
  },
  {
    slug: "don-x",
    name: "DON!! ×N",
    kind: "timing",
    summary: "A [DON!! ×N] effect applies only while at least N DON!! cards are given to the card.",
    body: ["The condition counts the DON!! cards attached to that Leader or Character. [DON!! ×1] and [DON!! ×2] are the common ones; the effect switches off when the DON!! return to your cost area."],
    markers: ["don!! x1", "don!! x2", "don!! x3", "don!! x4", "don!! ×1", "don!! ×2", "don!! ×3", "don!! ×4"],
  },
];

export const KEYWORD_BY_SLUG = new Map(KEYWORDS.map((k) => [k.slug, k]));
const BY_MARKER = new Map(KEYWORDS.flatMap((k) => k.markers.map((m) => [m, k.slug] as const)));

/** The keyword slugs a card's effect text carries, in KEYWORDS order, no repeats. */
export function cardKeywords(effect: string | null | undefined): string[] {
  if (!effect) return [];
  const found = new Set<string>();
  for (const m of effect.matchAll(/\[([^\]]{2,40})\]/g)) {
    const key = m[1].toLowerCase().replace(/\s+/g, " ").trim();
    const slug = BY_MARKER.get(key);
    if (slug) found.add(slug);
  }
  return KEYWORDS.map((k) => k.slug).filter((s) => found.has(s));
}
