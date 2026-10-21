// Which eBay listings are NOT one unit of a sealed product: shared by the importer (ebay-normalise.ts, ebay-sweep.ts) and the
// website's read path (ebay-read.ts drops a stored row that today's rules refuse). Pure; imports only the title normaliser, so the
// route's chain stays free of the importer's modules (tests/ebay-api.test.ts).
import { normalizeTitle, type TypeKey } from "./sealed-title";
import { SETS } from "./sets";

const CASE_TYPES = new Set<TypeKey>(["booster-box-case", "etb-case", "booster-bundle-case"]);

/**
 * Listings never handed to a product (the catalogue sweep AND the per-product searches), on top of what identify() and SEALED_NOISE refuse (tested on the accent-folded
 * title): Japanese product naming ("Pokemon Card Game MEGA Expansion Pack … Box", "Premium Trainer Box"), several units
 * ("Mini Tins (10-Pack)", "Full Set", "All 3", "Lot"), part of a product ("Missing Promo", "Coin Only", "No Packs"), a variant
 * left to chance ("One Variation Chosen At Random", "Assorted") and damage notes.
 */
const LISTING_REJECT = new RegExp(
  [
    "\\bexpansion\\s+pack\\b|\\bhigh\\s+class\\s+pack\\b|\\bconstructed\\s+(?:deck|starter)\\b|\\bpokemon\\s+card(?:\\s+game)?\\s*[:\\-]?\\s*(?:mega|scarlet|sword|sun|xy|151)\\b|\\bpremium\\s+trainer\\s+box\\b",
    "\\btins\\b[^()]{0,40}\\(\\s*\\d+\\s*-?\\s*(?:pack|pk)s?\\s*\\)|\\b(?:full|complete|whole)\\s+set\\b|\\ball\\s+(?:[2-9]|three|four|five|six|eight|nine|ten)\\b|\\b(?:set|bundle|lot)\\s+of\\b|\\blots?\\b",
    // the contents of a product, not the product: "3 Promo Packs From Elite Trainer Box", "Energy Cards from ETB", "pulled from a booster box"
    "\\bfrom\\s+(?:an?\\s+|the\\s+)?(?:[\\w'&-]+\\s+){0,6}?(?:elite\\s+trainer\\s+box(?:es)?|etbs?|box(?:es)?|bundles?|collections?|tins?|upcs?|displays?|blisters?)\\b|\\b\\d{1,3}\\s*/\\s*\\d{2,3}\\b|\\bpromo\\s+packs?\\b|\\benergy\\s+(?:packs?|cards?)\\b|\\bpulled\\s+from\\b",
    "\\b(?:missing|without|w/o|removed|incomplete|partial|contents)\\b|\\b(?:coins?|promos?|cards?|pins?|tin|box|packs?|figure|jumbo|oversized?|posters?|sleeves?|playmats?|dice|binders?|energy|codes?|art|artwork|stickers?|patch(?:es)?|pouch(?:es)?)\\s+only\\b|\\bonly\\s+(?:the\\s+)?(?:poster|coin|pin|promo|sleeves?|playmat|dice|binder|box|tin)\\b|\\bno\\s+(?:packs?|boosters?|promos?|cards?|coins?)\\b",
    "\\brandom\\b|\\bassorted\\b|\\bvariation\\b|\\bchosen\\b|\\bvarious\\b|\\bstyles?\\s+may\\s+vary\\b|\\bmystery\\b|\\byou\\s+choose\\b|\\bchoose\\s+(?:your|one|from|between)\\b|\\bpick\\s+(?:your|one|from)\\b|\\byour\\s+choice\\b",
    "\\bdamage[ds]?\\b|\\bcrushed\\b|\\btorn\\b|\\bresealed\\b|\\bunsealed\\b|\\bempty\\b",
    // 2026-10-11 audit of the live price rows (1,854 rows judged by hand, 176 wrong):
    // a single card or promo: a card number ("Snorlax 051", "#139", "MEP 085"), a graded card, Trainer Tips / art cards, a promo set, a pulled card
    "\\b(?:psa|bgs|cgc|sgc|ace)\\s*\\d{1,2}(?:[.,]\\d)?\\b|\\bgrad(?:ed|e)?\\s*\\d|\\btrainer\\s+tips\\b|\\bart\\s+cards?\\b|\\bholo\\s+card\\b|\\bpromos?\\s*(?:and|&|\\/)\\s*posters?\\b|\\b(?:poster|pin|illustration|sticker|figure)\\s+collection\\s+promos?\\b|\\bpromo\\s+cards?\\s+(?:cosmos|pack\\s*fresh|only)\\b|\\bpack\\s*fresh\\b|\\b\\d\\s+cards?\\s+set\\b|\\b\\d+[\\s-]*inch\\b|\\$\\d|\\b\\d{1,3}[.,]\\d{1,3}\\s*g\\b|\\bheavy\\b(?!\\s+hitters)|^\\s*[2-9]\\s+(?:x\\s+)?pokemon\\b",
    // not sealed, or not a product: an opened one ("Open Live", "LIVE ONLY", "Open (Nearly Complete)"), wear and tear, a protector, an outer sleeve, a repack or a container
    "(?<!never\\s)(?<!not\\s)\\bopen(?:ed)?\\b|\\btears?\\b|\\bholes?\\b|\\bdents?\\b|\\bw\\/\\s*tear\\b|\\bthere'?s\\s+a\\s+rip\\b|\\b(?:a|with)\\s+rip\\b|\\bripped\\b|\\bflaws?\\b|\\bdefective\\b|\\bloch\\b|\\bcosmetic\\s+(?:wear|damage)\\b|\\bschutz\\w*|^\\s*(?:pet\\s+)?(?:plexi\\w*|acryl\\w*)|\\bprotector\\b|\\bouter\\s+sleeve\\b|\\bsampl(?:e|ing)\\b|\\bcandy\\b|\\bcontainer\\b|\\borgani[sz]er\\b|\\bjewel+(?:e?ry)\\b|\\bsurprise\\s+(?:mini\\s+)?tin\\b|\\bguaranteed\\b|\\brepack\\w*|\\btrick\\s+or\\s+trade\\b|\\bhongbao\\b|\\blunar\\b|\\bhalloween\\b|\\band\\s+others\\b",
    // several units: "4x", "2 Stuck", "alle 3", "pack of four", "(6) Bundle", "[36 Packs]", "ALL 36!"
    "\\b(?:[2-9]|1\\d)\\s*x\\b(?!\\s*(?:booster|boosters|packs?|cards?|etbs?|boxes|bundles?|tins?|booster\\s+box(?:es)?))|\\b\\d+\\s*(?:stuck|stk)\\b|\\balle\\s+\\d+\\b|\\bpack\\s+of\\s+(?:[2-9]|two|three|four|five|six)\\b|\\(\\s*\\d+\\s*\\)\\s*bundle\\b|\\[\\s*[1-9]\\d\\s*packs?\\s*\\]|\\ball\\s+\\d+\\b|\\b(?:10|[2-9])\\s+packungen\\b",
    // another language's edition: its own words (German, Italian, French set and product names), a language code, China
    "\\b(?:deu|ita|fra|esp|china|chinese|korean|japanisch|gcc|vorbestellung|deutsch|deutsche|jahre)\\b|\\((?:de|fr|it|es)\\)|[|\\-]\\s*(?:de|fr|it|es)\\s*(?:$|[|(])|\\b(?:de|fr|it)\\s+sealed\\b",
    // the German, Italian and French names of sets, products and Pokémon, unless the listing says it is the English product
    "^(?!.*\\b(?:englisch|englische|english|eng|en)\\b).*\\b(?:scharlach|lila|erhabene|helden|top\\s+trainer\\s+box|ttb|umschlage|tuten|erweiterungs\\w*|geisterflammen|paradoxrift|buio|pesto|megaentwicklung|amphinobi|florizarre|bisaflor|dracaufeu|glurak|optimale|ordnung|ewige|rivalen|zweier|beutel|wachsendes|umschl\\w*)\\b",
  ].join("|"),
  "i",
);

const foldTitle = (t: string) => normalizeTitle(t).toLowerCase();

// A listing that names two DIFFERENT sets is a mixed lot or another set's product ("Pitch Black & Chaos Rising Booster Bundle",
// "Silver Tempest Elite Trainer Box ETB 151 Go"). Black Bolt and White Flare are sold together, so they count as one.
const SET_NAME = new RegExp(
  `\\b(?:${SETS.filter((x) => !x.generic && foldTitle(x.name).split(/\s+/).length >= 2)
    .map((x) => foldTitle(x.name))
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .concat("151")
    .join("|")})\\b`,
  "g",
);
const SET_OF_NAME = new Map<string, string>([...SETS.filter((x) => !x.generic).map((x): [string, string] => [foldTitle(x.name), x.code === "rsv10pt5" ? "zsv10pt5" : x.code]), ["151", "sv3pt5"]]);
function namesTwoSets(t: string): boolean {
  const codes = new Set<string>();
  for (const m of t.matchAll(SET_NAME)) codes.add(SET_OF_NAME.get(m[0]) ?? m[0]);
  return codes.size >= 2;
}

/** Is this listing refused whatever product it is for (LISTING_REJECT, two sets named, on the accent-folded title)? */
export function refusedListing(title: string): boolean {
  const t = foldTitle(title);
  return LISTING_REJECT.test(t) || namesTwoSets(t);
}

// A card number ("Snorlax 051", "#139", "MEP 085", "SWSH139") on a box, ETB, bundle, pack, B&B box, UPC or case listing is that ONE card
// (a promo pulled from the product). Blisters, tins, decks and collections name the promo they come with, so there it is no sign.
const CARD_NUMBER = /\b0\d{2}\b|#\s?\d{2,3}\b|\b(?:mep|svp|svpen|bsp|smp|xyp|bwp)\s*-?\s*(?:en\s+)?(?:promo\s+)?\d{2,3}\b|\b(?:swsh|sm)\s*\d{3}\b/i;
const NO_CARD_NUMBER = new Set<TypeKey>(["etb", "pc-etb", "booster-box", "booster-bundle", "booster-pack", "sleeved-booster", "build-battle", "upc", "collection", "deck", "booster-box-case", "etb-case", "booster-bundle-case"]);

// A booster pack product is ONE pack: "5 Booster Packs", "Booster Pack x10", "(10 Packs)", "Packs" are lots of it.
const SEVERAL_PACKS = /\b(?:[2-9]|[1-9]\d)\s*(?:x\s*)?(?:sleeved\s+)?(?:booster\s+)?packs?\b|\(\s*\d+\s*packs?\s*\)|\bpacks\b|\bx\s*\d+\b|\b\d+\s*x\b/i;
// "151 ETB SEALED w/ case", "Booster Box with acrylic case": one item in a protector, not the case of six or ten.
const WITH_A_CASE = /(?:\bw\/|\bwith\b|\bin\b|\+|\band\b|\bplus\b)\s*(?:an?\s+)?(?:acrylic|protective|magnetic|plastic|hard)?\s*(?:case|protector)\b|\b(?:acrylic|protective|magnetic)\s+case\b/i;
const NOT_PC = /\bnon[\s-]*(?:pokemon[\s-]*cent(?:er|re)|pc)\b|\bnot\s+(?:a\s+|the\s+)?(?:pokemon[\s-]*cent(?:er|re)|pc)\b/i;
// A box or ETB "Case Fresh" is one box from a case, not the case.
const CASE_FRESH = /\bcase[\s-]*fresh\b|\bfresh\s+(?:from|out\s+of)\s+(?:a\s+)?case\b|\bfrom\s+(?:an?\s+)?(?:sealed\s+)?case\b/i;

/** Is this listing, read as `type`, not one unit of that type: a multi-pack lot of a pack, a "case fresh" box for a case, sleeved boosters for a bundle? */
export function refusedForType(title: string, type: TypeKey): boolean {
  const t = foldTitle(title);
  if ((type === "booster-pack" || type === "sleeved-booster") && SEVERAL_PACKS.test(t)) return true;
  if (CASE_TYPES.has(type) && (CASE_FRESH.test(t) || WITH_A_CASE.test(t))) return true;
  // "151 Elite Trainer Box, Non-Pokemon Center": the regular ETB, whatever "Pokemon Center" made the classifier read.
  if (type === "pc-etb" && NOT_PC.test(t)) return true;
  // A regular ETB page takes no Pokémon Center ETB ("Pokemon Centre ETB ... 11 Packs"), unless the listing says it is not one.
  if (type === "etb" && /\bpokemon[\s-]*cent(?:er|re)\b|\bpc\s+etb\b|\b11\s+(?:booster\s+)?packs\b/.test(t) && !NOT_PC.test(t)) return true;
  // A booster box is a box or a display: "[36 Packs] ... Booster Packs" are loose packs.
  if (type === "booster-box" && !/\b(?:box|boxes|display|displays)\b/.test(t)) return true;
  if (NO_CARD_NUMBER.has(type) && CARD_NUMBER.test(t.replace(/^\s*#\s?\d+\s*[-–:]\s*/, ""))) return true; // (a leading "#001 -" is a live sale's lot number)
  // A loose booster pack comes with no promo: "Booster Pack, Slowpoke Promo" is a blister or a pack plus a card.
  if ((type === "booster-pack" || type === "sleeved-booster") && /\bpromo\b/.test(t)) return true;
  // An ETB or a booster box is not "ETB / 2 Pack Blister"; a 36-pack box is not an 18-pack display.
  if ((type === "etb" || type === "pc-etb" || type === "booster-box") && /\bblister\b/.test(t)) return true;
  // A blister's promo on its own: "Slowpoke Promo MEP 086 Pitch Black Checklane" (a card number, and no blister, pack or booster).
  if (type === "blister" && CARD_NUMBER.test(t) && !/\b(?:blister|pack|packs|booster|boosters|sealed)\b/.test(t)) return true;
  // A tin is one tin: "5 Pack Mini Tin Box" is five.
  if (type === "tin" && /\b[5-9]\s*(?:pack|pk)\s+(?:of\s+)?(?:mini\s+)?tins?\b/.test(t)) return true; // ("2 Pack Mini Tin": a tin holding two packs)
  // A collection's promo set is its cards without the box ("Poster Collection Promo Card Set").
  if (type === "collection" && /\bpromo\s+(?:cards?\s+)?set\b/.test(t)) return true;
  // A booster pack is one pack: never a display, a bundle or a box of them ("box fresh" is a pack).
  if (type === "booster-pack" && /\b(?:display|bundle)\b|\bbox\b(?!\s*fresh)|\b(?:18|36)er\b/.test(t)) return true;
  // A Build & Battle Box is the box: not the prerelease deck, the promo or the four packs inside it.
  if (type === "build-battle" && (/\b(?:prerelease|pre-release|promo|stamped)\s+decks?\b|\bpack\s+of\s+four\b|\bprerelease\s+promo\b/.test(t) || (/\b(?:decks?|promo|stamped|tips|cards?)\b/.test(t) && !/\b(?:box|kit)\b/.test(t)))) return true;
  // A booster bundle is six packs: "Booster Bundle ... 3 Packs" is not one; "Pokemon Center Version" is the PC bundle.
  if (type === "booster-bundle" && (/\b[1-5]\s*(?:booster\s+)?packs?\b|\bmit\s+[1-5]\b/.test(t) || /\bpokemon[\s-]*cent(?:er|re)\b/.test(t))) return true;
  // "Sleeved Booster Bundle 4 Arts" is four sleeved boosters, not the 6-pack Booster Bundle.
  return type === "booster-bundle" && /\bsleeved\b/.test(t);
}

