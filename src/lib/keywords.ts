// Magic: The Gathering keywords, for /keywords, /keywords/[slug] and the card page. Pure: tests/keywords.test.ts pins it.
//
// WHICH CARDS COUNT. Scryfall's `keywords` array on an Oracle card lists the keyword abilities and ability words the card
// has or grants ("Flying", "First strike", "Cascade"). The published oracle rows carry it as lower-case hyphenated tokens
// ("first-strike"), and a keyword's page lists every ORACLE card whose list has the token. A card that only grants a
// keyword to others ("creatures you control have flying") is in Scryfall's list too, so the page says "cards with Flying
// in their rules text", never "flyers". cardKeywords() reads that list; with plain rules text instead it finds the
// whole-word names of KEYWORDS in the text (a heuristic for text with no Scryfall list, never used for a count).
//
// THE DEFINITIONS are short paraphrases of the keyword's entry in the Magic: The Gathering Comprehensive Rules (section
// 702, keyword abilities). They describe the keyword itself, never a ruling on a particular card; the page links readers
// to Wizards of the Coast's rules for anything more.

export interface KeywordDef {
  slug: string;
  name: string; // as printed
  kind: "evergreen" | "ability" | "action"; // evergreen: in every set; ability: a keyword ability; action: a keyword action ("scry")
  summary: string; // one sentence for the hub and meta description
  body: string[]; // paragraphs for the keyword's page
  /** The printed name(s) that mark it in rules text, lower-cased, spaces squeezed. */
  markers: string[];
}

/** The slug of a keyword name: lower case, runs of anything else become one hyphen ("First strike" -> "first-strike"). */
export const keywordSlug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** A keyword page with fewer oracle cards than this is `noindex` and out of the sitemap (REQ-WP15-6: the sitemap reads this same constant). */
export const KEYWORD_INDEX_MIN = 5;
export const isIndexableKeyword = (oracleCount: number): boolean => oracleCount >= KEYWORD_INDEX_MIN;

// [name, kind, summary, detail]. The body is the summary's sentence widened by the detail.
const RAW: [string, KeywordDef["kind"], string, string][] = [
  ["Flying", "evergreen", "A creature with flying can be blocked only by creatures with flying or reach.", "It is the most common evasion in the game, so a flyer is often the way a deck wins when the ground is clogged."],
  ["First strike", "evergreen", "A creature with first strike deals combat damage before creatures without it.", "If it kills its blocker or attacker in that first step, it takes no damage back."],
  ["Double strike", "evergreen", "A creature with double strike deals combat damage twice, once with first strike and once normally.", "It doubles damage from the creature, and from anything that boosts its power, which is why it pairs with equipment and pump spells."],
  ["Deathtouch", "evergreen", "Any amount of damage a creature with deathtouch deals to a creature is enough to destroy it.", "One point of damage is lethal, which makes a small deathtouch creature a deterrent against far bigger attackers."],
  ["Defender", "evergreen", "A creature with defender cannot attack.", "It is a cost on cards that make up for it with a good body or an ability, usually one that works while it sits back."],
  ["Haste", "evergreen", "A creature with haste can attack and use tap abilities the turn it comes under your control.", "Haste turns a creature you just cast into immediate pressure, and is the signature of red decks."],
  ["Hexproof", "evergreen", "A permanent or player with hexproof cannot be the target of spells or abilities your opponents control.", "It does not stop effects that do not target, such as a sweeper, and it does not stop you from targeting your own permanent."],
  ["Indestructible", "evergreen", "A permanent with indestructible cannot be destroyed by damage or by effects that say destroy.", "It still dies to exile, sacrifice and to toughness reduced to zero."],
  ["Lifelink", "evergreen", "Damage dealt by a source with lifelink also gains its controller that much life.", "The life is gained as the damage is dealt, whether it hits a creature or a player."],
  ["Menace", "evergreen", "A creature with menace can be blocked only by two or more creatures.", "A single blocker cannot stop it, so it needs the defender to commit more of their board."],
  ["Reach", "evergreen", "A creature with reach can block creatures with flying.", "Green's answer to flyers: it blocks exactly as a flyer could, and is not itself evasive."],
  ["Trample", "evergreen", "An attacking creature with trample assigns the excess damage beyond lethal to its blockers to the player or planeswalker it attacks.", "A big trampler is hard to chump block, because the damage it does not need for the blocker goes through."],
  ["Vigilance", "evergreen", "Attacking does not cause a creature with vigilance to tap.", "It can attack and still be untapped to block on the opponent's turn."],
  ["Flash", "evergreen", "A spell with flash can be cast any time you could cast an instant.", "On a creature or an enchantment it allows an ambush block or holding up mana for a counterspell."],
  ["Ward", "evergreen", "Whenever a permanent with ward becomes the target of a spell or ability an opponent controls, counter it unless that player pays the ward cost.", "The cost can be mana, life or a discard, and the tax applies each time it is targeted."],
  ["Prowess", "ability", "Whenever you cast a noncreature spell, a creature with prowess gets +1/+1 until end of turn.", "Spell-heavy decks build around it: every instant and sorcery makes the creature a bigger threat."],
  ["Protection", "ability", "A permanent with protection from a quality cannot be damaged, enchanted or equipped, blocked or targeted by anything with that quality.", "The quality can be a colour, a card type, a creature type or even a player."],
  ["Equip", "ability", "Equip is the activated ability that attaches an Equipment to a creature you control.", "It is paid at sorcery speed and the cost is usually part of what makes the Equipment good."],
  ["Kicker", "ability", "Kicker is an optional additional cost you can pay when casting a spell for a stronger effect.", "Multikicker lets you pay it any number of times."],
  ["Cycling", "ability", "Cycling lets you pay a cost and discard the card from your hand to draw a card.", "It keeps a situational card or an extra land from being a dead draw."],
  ["Landcycling", "ability", "Landcycling lets you pay a cost and discard the card to search your library for a land of the named type.", "Basic landcycling finds any basic land; typecycling can find a specific land type."],
  ["Flashback", "ability", "Flashback lets you cast a card from your graveyard for its flashback cost, then exile it.", "It gives an instant or sorcery a second use, and a discard outlet becomes card advantage."],
  ["Convoke", "ability", "Convoke lets you tap untapped creatures you control to help pay for a spell.", "Each creature pays for {1} or one mana of its colour."],
  ["Delve", "ability", "Delve lets you exile cards from your graveyard to pay for generic mana in a spell's cost.", "A fuller graveyard makes the spell cheaper, so it is a fixture of graveyard decks."],
  ["Cascade", "ability", "When you cast a spell with cascade, exile cards from the top of your library until you hit a cheaper nonland card, and you may cast it free.", "The rest go to the bottom of the library in a random order."],
  ["Storm", "ability", "When you cast a spell with storm, copy it for each spell cast before it this turn.", "It rewards chaining many cheap spells in one turn."],
  ["Affinity", "ability", "Affinity makes a spell cost {1} less for each permanent of the named type you control.", "Affinity for artifacts built entire decks around artifact creatures."],
  ["Infect", "ability", "A source with infect deals damage to creatures as -1/-1 counters and to players as poison counters.", "A player with ten or more poison counters loses the game."],
  ["Proliferate", "action", "Proliferate adds another counter of each kind already on any permanents or players you choose.", "It grows loyalty, +1/+1 counters, poison counters and any other counter at once."],
  ["Scry", "action", "To scry N, look at the top N cards of your library, then put any number on the bottom and the rest back in any order.", "Scry smooths draws without drawing a card."],
  ["Surveil", "action", "To surveil N, look at the top N cards of your library, then put any number into your graveyard and the rest back in any order.", "It is scry that fills the graveyard, which makes it a fit for recursion decks."],
  ["Mill", "action", "To mill N, put the top N cards of your library into your graveyard.", "It is a way to fill the graveyard or to deck an opponent."],
  ["Explore", "action", "When a creature explores, reveal the top card of your library: a land goes to your hand, otherwise the creature gets a +1/+1 counter and you may put the card in the graveyard.", "It is smoothing and growth in one action."],
  ["Investigate", "action", "To investigate, create a Clue token: an artifact that you can sacrifice for {2} to draw a card.", "Cards that investigate trade tempo for card advantage later."],
  ["Amass", "action", "To amass N, put N +1/+1 counters on an Army creature you control, creating a 0/0 Army token first if you have none.", "The counters make one Army larger instead of spreading across many bodies."],
  ["Connive", "action", "To connive, draw a card, then discard a card; if you discarded a nonland card, put a +1/+1 counter on the creature.", "The creature grows when you can spare a spell, and looting is its reward when you cannot."],
  ["Fabricate", "ability", "Fabricate N lets you put N +1/+1 counters on the creature or create N 1/1 Servo artifact creature tokens.", "A choice made as it enters: one big body or several small ones."],
  ["Ninjutsu", "ability", "Ninjutsu lets you return an unblocked attacker you control to your hand to put the ninja onto the battlefield tapped and attacking.", "It lets a small evasive creature carry a stronger one past the blockers."],
  ["Morph", "ability", "A card with morph can be cast face down as a 2/2 creature for {3}, then turned face up for its morph cost.", "The face-down card hides which creature you are holding."],
  ["Persist", "ability", "When a creature with persist dies without a -1/-1 counter on it, return it with a -1/-1 counter.", "It lets a creature come back once, which is why it pairs well with sacrifice effects."],
  ["Undying", "ability", "When a creature with undying dies without a +1/+1 counter on it, return it with a +1/+1 counter.", "Persist's mirror: it returns bigger instead of smaller."],
  ["Evoke", "ability", "Evoke lets you cast a creature for its evoke cost; it is sacrificed as it enters.", "The enters-the-battlefield effect still happens, so you pay less for the effect and skip the body."],
  ["Unearth", "ability", "Unearth lets you return a creature card from your graveyard to the battlefield with haste for its cost, then exile it at the end of turn.", "A one-turn return that reuses an enters-the-battlefield effect."],
  ["Madness", "ability", "Madness lets you cast a card for its madness cost when you discard it, instead of putting it into your graveyard.", "Discard outlets make the card a bargain, a design built for the discard deck."],
  ["Overload", "ability", "Overload lets you cast a spell for its overload cost, replacing the word target with each in its text.", "A spell that hits one creature becomes a sweeper."],
  ["Replicate", "ability", "Replicate lets you pay its cost any number of times when casting to copy the spell for each payment.", "Copies are created on the stack, with new targets."],
  ["Suspend", "ability", "Suspend lets you exile a card from your hand with time counters, then cast it free when the last counter is removed.", "You pay less, but you wait for the spell."],
  ["Rebound", "ability", "Rebound exiles a spell you cast from hand as it resolves, and lets you cast it free at your next upkeep.", "A single spell, cast twice."],
  ["Dredge", "ability", "Dredge N lets you return the card from your graveyard to your hand instead of drawing by milling N cards.", "It trades card draws for self-mill, which suits graveyard decks."],
  ["Exploit", "ability", "When a creature with exploit enters, you may sacrifice a creature, which can be the exploiter itself.", "The exploit trigger is the reward for the sacrifice."],
  ["Crew", "ability", "Crew N lets you tap creatures with total power N or more to make a Vehicle an artifact creature until end of turn.", "A Vehicle is a creature only while crewed."],
  ["Partner", "ability", "Two commanders that each have partner can both be your commander in a Commander deck.", "Your colour identity is the union of the two."],
  ["Companion", "ability", "A companion starts outside the game and can be put into your hand once, for {3}, if your deck meets its deck-building condition.", "It is a sideboard card you can pay to access."],
  ["Mutate", "ability", "Mutate lets you cast a creature for its mutate cost onto a non-Human creature you own, merging them into one creature.", "The merged creature has the top card's characteristics and all the abilities."],
  ["Escape", "ability", "Escape lets you cast a card from your graveyard for its escape cost, which includes exiling other cards from your graveyard.", "It makes the graveyard a resource, with a cost of its own."],
  ["Foretell", "ability", "Foretell lets you pay {2} on your turn to exile a card face down, then cast it later for its foretell cost.", "It splits a big cost between two turns."],
  ["Disturb", "ability", "Disturb lets you cast the back face of a transforming card from your graveyard for its disturb cost.", "The card returns as an Aura or Spirit and is exiled if it would go to the graveyard again."],
  ["Bestow", "ability", "Bestow lets you cast a creature as an Aura, which becomes a creature again if the enchanted creature leaves.", "It is a creature that is never a dead draw."],
  ["Emerge", "ability", "Emerge lets you cast a spell by sacrificing a creature and paying its emerge cost reduced by the sacrificed creature's mana value.", "A bigger sacrifice makes the spell cheaper."],
  ["Casualty", "ability", "Casualty N lets you sacrifice a creature with power N or greater as you cast a spell to copy it.", "The cost is a creature; the reward is a second spell."],
  ["Toxic", "ability", "Toxic N means that a creature deals combat damage to a player and that player gets N poison counters as well.", "The damage is also dealt as normal."],
  ["Backup", "ability", "Backup N puts N +1/+1 counters on a target creature when the card enters; if that creature is another one, it gains the card's other abilities until end of turn.", "The counters stay on the creature; the borrowed abilities last a turn."],
  ["Disguise", "ability", "Disguise lets you cast a card face down as a 2/2 creature with ward {2}, then turn it face up for its disguise cost.", "A morph with a built-in ward."],
  ["Plot", "ability", "Plot lets you exile a card from your hand and cast it later without paying its mana cost, as a sorcery.", "You pay on one turn and get the spell free on another."],
  ["Blitz", "ability", "Blitz lets you cast a creature for its blitz cost, giving it haste and a draw trigger, and sacrificing it at end of turn.", "A one-turn attacker that replaces itself."],
  ["Dash", "ability", "Dash lets you cast a creature for its dash cost with haste, returning it to your hand at the end of the turn.", "It dodges sorcery-speed removal and sweepers."],
  ["Extort", "ability", "Whenever you cast a spell, you may pay {W/B}; if you do, each opponent loses 1 life and you gain that much.", "Each extort creature you control triggers on its own."],
  ["Exalted", "ability", "Whenever a creature you control attacks alone, each instance of exalted gives it +1/+1 until end of turn.", "It rewards sending a single attacker."],
  ["Shadow", "ability", "A creature with shadow can block or be blocked by only creatures with shadow.", "In effect it is unblockable, and also unable to block ordinary creatures."],
  ["Fear", "ability", "A creature with fear can be blocked only by artifact and/or black creatures.", "It is an older evasion, replaced in modern sets by menace and similar abilities."],
  ["Intimidate", "ability", "A creature with intimidate can be blocked only by artifact creatures and/or creatures that share a colour with it.", "A colour-based evasion, mostly seen on older cards."],
  ["Skulk", "ability", "A creature with skulk cannot be blocked by creatures with greater power.", "Small creatures with skulk slip past larger blockers."],
  ["Changeling", "ability", "A card with changeling is every creature type at all times.", "It counts for tribal bonuses of every kind."],
  ["Devoid", "ability", "A card with devoid is colourless, whatever its mana cost.", "It is coloured in the casting, colourless on the battlefield."],
  ["Hideaway", "ability", "A permanent with hideaway looks at the top cards of your library when it enters, and hides one face down to play later when a condition is met.", "The condition differs by card."],
  ["Afterlife", "ability", "When a permanent with afterlife dies, create that many 1/1 white and black Spirit tokens with flying.", "The value stays behind when it is removed."],
  ["Echo", "ability", "A permanent with echo costs its echo cost again at your next upkeep, or it is sacrificed.", "A cheap-looking card, with a second payment."],
  ["Cumulative upkeep", "ability", "A permanent with cumulative upkeep gets an age counter each upkeep, and you pay its cost for each age counter or sacrifice it.", "The cost grows every turn, so it is a short-term permanent."],
  ["Phasing", "ability", "A permanent with phasing phases in or out each turn, and while it is phased out it is treated as if it does not exist.", "It phases back in at your untap step."],
  ["Soulbond", "ability", "A creature with soulbond can pair with another unpaired creature when either enters, and both get the stated bonus while they stay paired.", "The bonus ends when one of them leaves or is unpaired."],
  ["Living weapon", "ability", "When an Equipment with living weapon enters, create a 0/0 black Phyrexian Germ token and attach the Equipment to it.", "The Equipment arrives with its own body."],
  ["Reconfigure", "ability", "Reconfigure lets you attach an Equipment creature to a creature you control or unattach it, at sorcery speed.", "While attached, it is not a creature."],
  ["Training", "ability", "Whenever a creature with training attacks with another creature with greater power, put a +1/+1 counter on it.", "It grows when it attacks alongside bigger creatures."],
  ["Riot", "ability", "A creature with riot enters with your choice of a +1/+1 counter or haste.", "The decision is made as it enters."],
  ["Jump-start", "ability", "Jump-start lets you cast a card from your graveyard by discarding a card in addition to paying its other costs, then exile it.", "A second cast for the price of a card."],
  ["Spectacle", "ability", "Spectacle lets you cast a spell for its spectacle cost if an opponent lost life this turn.", "A cheaper cost for an aggressive turn."],
  ["Banding", "ability", "Banding lets attacking creatures with banding band together, and lets the defending player of a banded attacker's damage be assigned by the attacker.", "A very rare, complex ability from the earliest sets."],
  ["Flanking", "ability", "Whenever a creature with flanking is blocked by a creature without flanking, the blocking creature gets -1/-1 until end of turn.", "It shrinks a blocker before damage."],
  ["Bushido", "ability", "Whenever a creature with bushido N blocks or becomes blocked, it gets +N/+N until end of turn.", "It gets bigger in combat."],
  ["Horsemanship", "ability", "A creature with horsemanship can be blocked only by creatures with horsemanship.", "It appears on creatures from Portal Three Kingdoms."],
  ["Bargain", "ability", "Bargain lets you sacrifice an artifact, enchantment or token in addition to the other costs of a spell for a stronger effect.", "It rewards token makers."],
  ["Craft", "ability", "Craft lets you exile a permanent of the stated kind from the battlefield, and others from the graveyard, to return the card transformed.", "The card changes into its other face."],
  ["Offspring", "ability", "Offspring lets you pay an additional cost to create a 1/1 token copy of the creature when it enters.", "The copy has the same enters-the-battlefield abilities."],
  ["Impending", "ability", "Impending lets you cast the permanent for its impending cost, and it is not a creature until its time counters are gone.", "The cost is lower, and the wait is part of the bargain."],
];

export const KEYWORDS: KeywordDef[] = RAW.map(([name, kind, summary, detail]) => ({
  slug: keywordSlug(name),
  name,
  kind,
  summary,
  body: [`${summary} ${detail}`, "This is a short paraphrase of the keyword from the Comprehensive Rules, not a ruling on a particular card; read the card's own text and the official rules for a tricky case."],
  markers: [name.toLowerCase()],
}));

export const KEYWORD_BY_SLUG = new Map(KEYWORDS.map((k) => [k.slug, k]));
const BY_MARKER = new Map(KEYWORDS.flatMap((k) => k.markers.map((m) => [m, k.slug] as const)));

/** A keyword's display name: the definition's printed name, else the slug in sentence case ("first-strike" -> "First strike"). */
export function keywordLabel(slug: string): string {
  const k = KEYWORD_BY_SLUG.get(slug);
  if (k) return k.name;
  const t = slug.replace(/-/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Longest names first, so "first strike" is read before "strike" would be and "landcycling" before "cycling".
const NAME_RE = new RegExp(`\\b(${[...BY_MARKER.keys()].sort((a, b) => b.length - a.length).map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");

/** The slugs of the keywords a card has, in the order of KEYWORDS. Pass the oracle's Scryfall keyword list (OracleDetail.keywords: tokens or names), the authority;
 *  pass rules text instead and the whole-word names found in it are returned. Unknown names are kept in the list form (they have a hub when enough cards share them). */
export function cardKeywords(from: readonly string[] | string | null | undefined): string[] {
  if (from == null) return [];
  const found = new Set<string>();
  if (typeof from === "string") {
    for (const m of from.matchAll(NAME_RE)) {
      const slug = BY_MARKER.get(m[1]!.toLowerCase().replace(/\s+/g, " "));
      if (slug) found.add(slug);
    }
  } else {
    for (const k of from) { const s = keywordSlug(k); if (s) found.add(s); }
  }
  const known = KEYWORDS.filter((k) => found.has(k.slug)).map((k) => k.slug);
  return [...known, ...[...found].filter((s) => !KEYWORD_BY_SLUG.has(s)).sort()];
}

/** Rules text split into plain parts and keyword hits, for KeywordText: [text, name, text, name, ...] with the text first. */
export function splitKeywordText(text: string): string[] {
  const out: string[] = []; let last = 0;
  for (const m of text.matchAll(NAME_RE)) { const at = m.index ?? 0; out.push(text.slice(last, at), m[1]!); last = at + m[0].length; }
  out.push(text.slice(last));
  return out;
}
export const keywordOfName = (name: string): KeywordDef | undefined => {
  const s = BY_MARKER.get(name.toLowerCase().replace(/\s+/g, " ").trim());
  return s ? KEYWORD_BY_SLUG.get(s) : undefined;
};
