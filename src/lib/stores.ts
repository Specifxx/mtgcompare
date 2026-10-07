// The stores OP Compare reads, by market. Shopify stores in three groups, all
// verified on 2026-10-03 (kept when at least 20 English One Piece listings
// carried a card number):
//   1. stores RiftCompare already tracks for Riftbound that also sell One Piece;
//   2. One Piece specialists and large One Piece retailers found by search;
//   3. a third, per-market pass that re-read every candidate's whole catalogue
//      (robots.txt, meta.json currency, every products.json page).
// Then stores on other platforms (`platform`), each read by its own reader in
// lib/store-import.ts: 30 ShadowPOS shops (US), one Ecwid and one BigCommerce
// store (both AU). Verification evidence for
// the third pass and the platforms is summarised in DECISIONS.md ("More
// stores", 2026-10-03).
//
// `collections` are the One Piece handles the probe found (or, off Shopify, the
// category the reader starts from); the Shopify reader also re-discovers
// handles from each store's sitemap on every run (lib/store-import.ts), so a
// store that adds a new collection is picked up without a code change.
//
// `currency` is set only where the storefront charges something other than its
// market's currency (carried over from RiftCompare's registry); the importer
// refuses any price whose currency does not match the market it is shown in.
import type { Country } from "./country";

/**
 * The storefront platform a store runs on, which picks its reader in
 * lib/store-import.ts. Every reader returns the same listing shape, so each
 * listing goes through the same matcher, price, currency, in-stock and
 * staleness rules whatever the platform.
 */
export type StorePlatform = "shopify" | "shadowpos" | "ecwid" | "woocommerce" | "bigcommerce" | "nopcommerce";

export interface StoreInfo {
  key: string;
  name: string;
  base: string; // origin, no trailing slash
  country: Country;
  /**
   * Where the One Piece listings are. Shopify: collection handles. Ecwid:
   * category ids. WooCommerce: category slugs. BigCommerce and nopCommerce:
   * category paths ("/tcgs/one-piece/one-piece-singles/"). ShadowPOS: none
   * (its search is per game).
   */
  collections: string[];
  currency?: string;
  /** Flat postage in the market's currency, ONLY where the store's own page states one flat rate (dated in STORE_POSTAGE_CHECKED). */
  shippingCents?: number;
  /** Free postage over this order total, same rule. */
  freeOverCents?: number;
  /** The store's own shipping policy page, ONLY where it was fetched and returned 200 (STORE_POSTAGE_CHECKED). */
  policyUrl?: string;
  /** Omitted = "shopify". */
  platform?: StorePlatform;
  /** Ecwid only: the store id. The public token is re-read from the storefront on every run. */
  ecwidStoreId?: number;
}

export function platformOf(store: Pick<StoreInfo, "platform">): StorePlatform {
  return store.platform ?? "shopify";
}

/** The day store shipping-policy URLs were last verified (an HTTP 200 on <base>/policies/shipping-policy). */
export const STORE_POSTAGE_CHECKED = "2026-10-04";
const POLICY_VERIFIED = new Set(["acecollectibles", "animealley", "balancegaming", "bananagames", "battlebearkl", "battlebearsb", "blackrosehobbies", "blackvaultgaming", "boardgamebliss", "boardsandswords", "boutiquelechevalier", "breakthecase", "bsastore", "burbanksportscards", "capefear", "cardboardanddie", "cardboardgamer", "cardbot", "cardboyz", "cardcapital", "cardcavern", "cardcosmos", "carddynasty", "cardfather", "cardgoblin", "cardhouse", "cardhub", "cardsandcoasters", "cardxcards", "cardxchange", "cartesleo", "cartessportivesrivesud", "castlegames", "cherry", "collectedition", "collectorclash", "collectorsmith", "collectorstorecards", "comicsbeyond", "commonboxgames", "cosmiccollectables", "danireon", "danireonca", "deckoutgaming", "deepdivegames", "derpycards", "desertcitygames", "devastationmiami", "dicesaloon", "dobigthings", "dongames", "dragonegggames", "dragonsdenshop", "eacollectibles", "eclipsecardsandhobby", "eclipsegames", "elduelista", "elementalarcade", "empiretradings", "enterthebattlefield", "eternalgameschesterfield", "eternalmagic", "fabricatorsforge", "fantasyforged", "finalboss", "five6gaming", "forbiddenplanet", "frenlybricks", "gachaboba", "game3", "gamelandia", "gameology", "gameostorus", "games401", "gamesportal", "gamestimeaversa", "gametime", "gamezilla", "gatekeepers", "gatheringpointgames", "gatorscardden", "gggreensborough", "gglegends", "goodgames", "grailborne", "grognardgames", "gsgameon", "gtgames", "guf", "hairytarantula", "haventabletop", "hbtcollectables", "heavenscollectibles", "hobbiesville", "hobbiesvilleca", "hobbycollectorsaustralia", "hobbysag", "hpwcards", "impactgamingcenter", "impactleague", "infinitycards", "invasioninc", "itsgametime", "jacksonqueen", "jgccollectables", "justcardstuff", "kaiofcards", "kanzengames", "kingdomtitans", "knightandday", "legendarycollectables", "letsplaycards", "levelupgames", "levelupgamesmd", "lichcards", "lmshandel", "lunacards", "lvlupgaming", "managaming", "manamarketeu", "manyrealms", "mayhemcollectables", "merchantsinventory", "millenniumcomics", "mintcollectables", "motorcitygaming", "moxinthehole", "mysterymtg", "nerdmerchant", "nexustabletopgames", "nordiclegends", "northernwartable", "npcollectibles", "obsessiongaming", "onboardgaming", "onepiececardsfr", "onepiecesingles", "paradoxtcg", "pcatoys", "phantasma", "piratecards", "plenty", "pokebox", "pokeboxusa", "progressccg", "punkouter", "pvpshoppe", "raptorgames", "rarecards", "recollectibles", "redriotgames", "redsun", "shippintexas", "shuffled", "silvergoblin", "smokeandmirrorshobby", "solacido", "spellboundgames", "spellroo", "spindown", "stompinggrounds", "stylecreep", "superanimestore", "tapsgames", "tcgking", "teamcardtitan", "thatgamestore", "thecardspot", "thetrainercourt", "tier1games", "tierzerogames", "timetwister", "tistacards", "totalcards", "toysucker", "tradingcardmasters", "tradingcardworld", "triadcards", "trinketmage", "trollaustralia", "trollaustraliamelb", "troveofcollectibles", "turtletcg", "universetcg", "vegassingles", "vulcancollectibles", "waywardcitygames", "wolfdentcg", "wonderlandgames", "wulfgaming", "yardsgames", "zulusgames"]);

const RAW_STORES: StoreInfo[] = [
  { key: "atomilicollectables", name: "ATOMILI COLLECTABLES", base: "https://atomilicollectables.com", country: "US", collections: ["one-piece-card-game"] },
  { key: "blackvaultgaming", name: "Black Vault Gaming", base: "https://blackvaultgaming.com", country: "US", collections: ["one-piece-card-game","one-piece-tcg-singles","one-piece-card-game-singles","one-piece-promotion-cards","extra-booster-one-piece-heroines-edition","one-piece-demo-deck-cards"] },
  { key: "capefear", name: "Cape Fear Collectibles", base: "https://www.capefearcollectibles.com", country: "US", collections: ["one-piece-singles"] },
  { key: "cardboardanddie", name: "Cardboard and Die", base: "https://cardboardanddie.com", country: "US", collections: ["one-piece-singles-in-stock"] },
  { key: "danireon", name: "Danireon Cards & Games", base: "https://www.danireon.com", country: "US", collections: ["one-piece-tcg-singles","one-piece-the-azure-seas-seven-singles","one-piece-premium-booster-the-best-vol-2-singles","one-piece-premium-booster-the-best-singles","one-piece-carrying-on-his-will-singles","one-piece-wings-of-the-captain-singles","one-piece-emperors-in-the-new-world-singles","one-piece-romance-dawn-singles","one-piece-pillars-of-strength-singles","one-piece-a-fist-of-divine-speed-singles","one-piece-paramount-war-singles","one-piece-legacy-of-the-master-singles"] },
  { key: "fabricatorsforge", name: "Fabricator's Forge", base: "https://shop.fabricatorsforge.com", country: "US", collections: ["one-piece-singles"] },
  { key: "foxandfable", name: "Fox and Fable Games", base: "https://foxandfablegames.com", country: "US", collections: ["one-piece-singles"] },
  { key: "gachaboba", name: "Gacha Boba", base: "https://gachaboba.com", country: "US", collections: ["one-piece-singles","one-piece-op01-singles","one-piece-op04-singles-1","one-piece-op03-singles","one-piece-op02-singles","one-piece-op04-singles"] },
  { key: "gatorscardden", name: "Gator's Card Den", base: "https://gatorscardden.com", country: "US", collections: ["one-piece-singles"] },
  { key: "gglegends", name: "GG Legends", base: "https://store.gglehi.com", country: "US", collections: ["one-piece-tcg-singles-in-stock","one-piece-more-than-4","one-piece-last-1","one-piece-2-4"] },
  { key: "grognardgames", name: "Grognard Games", base: "https://grognardgames.com", country: "US", collections: ["one-piece-singles"] },
  { key: "hobbiesville", name: "Hobbiesville", base: "https://hobbiesville.com", country: "US", collections: ["one-piece-adventure-on-kamis-island-singles","one-piece-wings-of-the-captain-singles","one-piece-the-azure-seas-seven-singles","one-piece-singles","one-piece-carrying-on-his-will","one-piece-the-worlds-strongest-warriors-singles","one-piece-premium-booster-the-best","one-piece-premium-booster-the-best-vol-2","one-piece-emperors-in-the-new-world","one-piece-a-fist-of-divine-speed","one-piece-kingdoms-of-intrigue-singles","one-piece-the-time-of-battle-singles"] },
  { key: "impactgamingcenter", name: "Impact Gaming Center", base: "https://impactgamingcenter.gg", country: "US", collections: ["one-piece-singles"] },
  { key: "knightandday", name: "Knight and Day Games", base: "https://knightanddaygames.com", country: "US", collections: ["one-piece-singles"] },
  { key: "manyrealms", name: "Many Realms", base: "https://manyrealms.com", country: "US", collections: ["one-piece-singles-under-1","one-piece-singles","one-piece-over-500","one-piece-card-game-sealed"] },
  { key: "mysterymtg", name: "Mystery MTG", base: "https://mysterymtg.com", country: "US", collections: ["one-piece-tcg"] },
  { key: "nexustabletopgames", name: "Nexus Tabletop Games", base: "https://nexustabletopgames.com", country: "US", collections: ["one-piece"] },
  { key: "npcollectibles", name: "NP Collectibles", base: "https://npcollectibles.com", country: "US", collections: ["one-piece-singles"] },
  { key: "onboardgaming", name: "On-Board Gaming", base: "https://on-boardgaming.com", country: "US", collections: ["one-piece-singles"] },
  { key: "phantasma", name: "Phantasma", base: "https://phantasmalv.com", country: "US", collections: ["one-piece-singles"] },
  { key: "pokeboxusa", name: "PokeBox USA", base: "https://www.pokeboxusa.com", country: "US", collections: ["one-piece-card-game-promo-cards-single-cards-english","one-piece-card-game-single-cards-english","one-piece-card-game"] },
  { key: "punkouter", name: "PunkOuter Games", base: "https://punkouter.com", country: "US", collections: ["one-piece-singles-in-stock","one-piece-premium-booster-the-best-vol-2-singles-in-stock","one-piece-500-years-in-the-future-op-07-singles-in-stock","one-piece-emperors-in-the-new-world-op-09-singles-in-stock","one-piece-two-legends-op-08-singles-in-stock","one-piece-wings-of-the-captain-op-06-singles-in-stock","one-piece-premium-booster-the-best-singles-in-stock","one-piece-legacy-of-the-master-singles-in-stock","one-piece-royal-blood-op-10-singles-in-stock","one-piece-awakening-of-the-new-era-op-05-singles-in-stock","one-piece-paramount-war-op-02-singles-in-stock","one-piece-carrying-on-his-will-singles-in-stock"] },
  { key: "shippintexas", name: "Shippin Texas", base: "https://shippintexas.com", country: "US", collections: ["one-piece-singles"] },
  { key: "stompinggrounds", name: "Stomping Grounds TCG", base: "https://singles.stompinggroundstcg.com", country: "US", collections: ["one-piece"] },
  { key: "sweetsandgeeks", name: "Sweets and Geeks", base: "https://sweetsandgeeks.com", country: "US", collections: ["one-piece-tcg-singles-1","one-piece-tcg-singles","one-piece-tcg","one-piece-anime"] },
  { key: "nerdmerchant", name: "The Nerd Merchant", base: "https://thenerdmerchant.com", country: "US", collections: ["one-piece-singles"] },
  { key: "troveofcollectibles", name: "Trove of Collectibles", base: "https://troveofcollectibles.com", country: "US", collections: ["one-piece-tcg-characters"] },
  { key: "vegassingles", name: "Vegas Singles", base: "https://vegas.singles", country: "US", collections: ["one-piece-singles"] },
  { key: "wolfdentcg", name: "Wolf Den Gaming", base: "https://wolfdentcg.com", country: "US", collections: ["one-piece-singles"] },
  { key: "wulfgaming", name: "Wulf Gaming", base: "https://wulfgaming.com", country: "US", collections: ["one-piece-singles-1","one-piece-card-game"] },
  { key: "zamliytcg", name: "Zamliy TCG", base: "https://zamliytcg.com", country: "US", collections: ["one-piece-singles"] },
  { key: "acecollectibles", name: "Ace Collectibles", base: "https://acecollectibles.com.au", country: "AU", collections: ["one-piece-the-time-of-battle","one-piece-the-worlds-strongest-warriors-op-17","one-piece-singles"] },
  { key: "cardbot", name: "Cardbot", base: "https://cardbot.com.au", country: "AU", collections: ["one-piece","one-piece-singles"] },
  { key: "cherry", name: "Cherry Collectables", base: "https://www.cherrycollectables.com.au", country: "AU", collections: ["one-piece-singles","one-piece-card-game-promo","all-one-piece","carrot-one-piece-cards","rebecca-one-piece-cards"] },
  { key: "elementalarcade", name: "Elemental Arcade", base: "https://elementalarcade.com.au", country: "AU", collections: ["one-piece-singles"] },
  { key: "generalgames", name: "General Games Chirnside Park", base: "https://generalgames.com.au", country: "AU", collections: ["one-piece-singles-collection"] },
  { key: "hobbycollectorsaustralia", name: "Hobby Collectors Australia", base: "https://hobbycollectorsaustralia.com.au", country: "AU", collections: ["all-one-piece-singles","all-singles-one-piece-pokemon-riftbound"] },
  { key: "mintcollectables", name: "Mint Collectables", base: "https://mintcollectables.com.au", country: "AU", collections: ["one-piece-singles"] },
  { key: "obsessiongaming", name: "Obsession Gaming", base: "https://obsessiongaming.com.au", country: "AU", collections: ["one-piece-singles","one-piece-1"] },
  { key: "ozzie", name: "Ozzie Collectables", base: "https://www.ozziecollectables.com", country: "AU", collections: ["manufacturer-one-piece-card-game","one-piece-card-game","one-piece-singles","one-piece-trading-cards","one-piece","one-piece-2"] },
  { key: "plenty", name: "Plenty of Games", base: "https://plenty-of-games-au.myshopify.com", country: "AU", collections: ["one-piece-singles-in-stock","one-piece-single","one-piece-all"] },
  { key: "pokebox", name: "PokéBox", base: "https://www.pokebox.com.au", country: "AU", collections: ["black-one-piece-trading-cards-english","blue-one-piece-trading-cards-english","green-one-piece-trading-cards-english","purple-one-piece-trading-cards-english","red-one-piece-trading-cards-english","yellow-one-piece-trading-cards-english","one-piece-card-game-starter-deck-single-cards-english","one-piece-card-game-single-cards-english","one-piece-card-game-promo-cards-single-cards-english","one-piece-card-game-op-09-emperors-in-the-new-world-single-cards-english","one-piece-card-game-op-11-a-fist-of-divine-speed-single-cards-english","one-piece-card-game-op-04-kingdoms-of-intrigue-single-cards-english"] },
  { key: "spellroo", name: "Spellroo Gaming", base: "https://spellroogaming.com.au", country: "AU", collections: ["one-piece-card-game-singles"] },
  { key: "spindown", name: "Spindown", base: "https://spindown.com.au", country: "AU", collections: ["one-piece-singles","one-piece-card-game","one-piece-card-game-the-time-of-battle-singles","one-piece-promotional-cards"] },
  { key: "cardhub", name: "The Card Hub Australia", base: "https://thecardhubaustralia.com.au", country: "AU", collections: ["newly-added-one-piece-card-game","one-piece-card-game-single","greenacre-one-piece-card-game-single","one-piece-card-game-single-in-stock","op13-one-piece-card-game-single","extra-booster-one-piece-heroines-edition","parallel-one-piece","ssp-one-piece-card-game"] },
  { key: "finalboss", name: "The Final Boss Collectables", base: "https://thefinalbosscollectables.com.au", country: "AU", collections: ["one-piece-singles-gl","one-piece-adventure-on-kamis-island-singles-gl","one-piece-two-legends-singles-gl","one-piece-the-time-of-battle-singles-gl","one-piece-carrying-on-his-will-singles-gl","one-piece-wings-of-the-captain-singles-gl","one-piece-the-best-vol-2-singles","one-piece-royal-blood-singles-gl","one-piece-legacy-of-the-master-singles-gl","one-piece-a-fist-of-divine-speed-singles-gl","one-piece-pillars-of-strength-singles-gl"] },
  { key: "thegamesdistrict", name: "The Games District", base: "https://thegamesdistrict.com", country: "AU", collections: ["one-piece-singles","private-all-one-piece-starter-decks","op-pr-one-piece-promotion-cards"] },
  { key: "trollaustraliamelb", name: "Troll Aus Melbourne", base: "https://trollaustraliamelb.com.au", country: "AU", collections: ["one-piece-singles","prb-02-one-piece-card-the-best-vol-2","prb-01-one-piece-card-the-best"] },
  { key: "trollaustralia", name: "Troll Australia", base: "https://www.trollaustralia.com.au", country: "AU", collections: ["one-piece-singles","one-piece-singles-v2","one-piece-cards","one-piece-singles-banner"] },
  { key: "turnordergames", name: "Turn Order Games", base: "https://turnordergames.com.au", country: "AU", collections: ["one-piece-the-card-game-singles"] },
  { key: "boardsandswords", name: "Boards & Swords", base: "https://boardsandswords.co.uk", country: "UK", collections: ["one-piece-singles","one-piece-promotion-cards"] },
  { key: "cardgoblin", name: "Card Goblin", base: "https://www.cardgoblin.shop", country: "UK", collections: ["one-piece-single","one-piece","one-piece-two-legends-op08","unnumbered-promos-one-piece","promos-one-piece","special-tournament-promos-one-piece","one-piece-memorial-collection","one-piece-products"] },
  { key: "dicesaloon", name: "Dice Saloon", base: "https://dicesaloonsingles.co.uk", country: "UK", collections: ["one-piece-promotion-cards","one-piece-singles","one-piece-card-game","cc-onepiece-op15-eb04","one-piece-the-time-of-battle","one-piece-demo-deck-cards"] },
  { key: "evolutiontcg", name: "Evolution Trading Cards", base: "https://evolutiontradingcards.co.uk", country: "UK", collections: ["one-piece-single"] },
  { key: "forbiddenplanet", name: "Forbidden Planet", base: "https://shop.forbiddenplanet.co.uk", country: "UK", collections: ["one-piece-singles","one-piece-single","one-piece-promotion-cards","extra-booster-one-piece-heroines-edition","one-piece-demo-deck-cards"] },
  { key: "impactleague", name: "Impact League TCG", base: "https://impactleaguetcg.co.uk", country: "UK", collections: ["one-piece-singles","cc-onepiece-prb-02","cc-onepiece-prb-01","cc-onepiece-op08","cc-onepiece-op15-eb04","cc-onepiece-op12","cc-onepiece-op04","one-piece-promotion-cards","extra-booster-one-piece-heroines-edition","cc-onepiece-op13","one-piece","cc-onepiece-op11"] },
  { key: "livingrealms", name: "Living Realms", base: "https://livingrealms.co.uk", country: "UK", collections: ["one-piece-promotion-cards","extra-booster-one-piece-heroines-edition","one-piece-demo-deck-cards"] },
  { key: "moxinthehole", name: "Mox in the Hole", base: "https://moxinthehole.co.uk", country: "UK", collections: ["one-piece-singles-in-stock","one-piece-promotion-cards","extra-booster-one-piece-heroines-edition"] },
  { key: "redsun", name: "Red Sun Collectables", base: "https://redsuncollectables.com", country: "UK", collections: ["one-piece"] },
  { key: "spellboundgames", name: "Spellbound Games", base: "https://spellboundgames.co.uk", country: "UK", collections: ["one-piece-single","one-piece-promotion-cards","extra-booster-one-piece-heroines-edition","one-piece-tcg"] },
  { key: "tierzerogames", name: "Tier Zero Games", base: "https://tierzerogames.com", country: "UK", collections: ["one-piece-single"] },
  { key: "totalcards", name: "Total Cards", base: "https://totalcards.net", country: "UK", collections: ["one-piece-best-sellers","one-piece-main-set-1","one-piece-single-cards","one-piece-extra-boosters","one-piece-op14-the-azure-seas-seven","one-piece-op15-adventure-on-kamis-island","one-piece-prb-02-one-piece-card-the-best-vol-2","one-piece-op13-carrying-on-his-will","one-piece-op07-500-years-in-the-future","one-piece-op03-pillars-of-strength","one-piece-op-09-emperors-in-the-new-world","one-piece-op-11-a-fist-of-divine-speed"] },
  { key: "yardsgames", name: "Yard's Games", base: "https://yardsgames.com", country: "UK", collections: ["one-piece-singles"] },
  { key: "chonkycollectibles", name: "Chonky Collectibles", base: "https://chonkycollectibles.com", country: "SG", collections: ["one-piece-singles","one-piece-trading-cards"] },
  { key: "games401", name: "401 Games", base: "https://store.401games.ca", country: "CA", collections: ["one-piece-singles", "one-piece-booster-sets", "one-piece-starter-deck-sets"] },
  { key: "bananagames", name: "Banana Games & Hobby", base: "https://bananagames.ca", country: "CA", collections: ["one-piece-singles","fix-one-piece-singles","correct-one-piece-singles","one-piece-the-time-of-battle-op16-singles"] },
  { key: "battlegroundgames", name: "Battleground Games", base: "https://battlegroundgames.ca", country: "CA", collections: ["one-piece","one-piece-singles"] },
  { key: "blackrosehobbies", name: "Black Rose Hobbies", base: "https://blackrosehobbies.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "carddynasty", name: "Card Dynasty", base: "https://carddynasty.ca", country: "CA", collections: ["one-piece-singles","one-piece"] },
  { key: "cartessportivesrivesud", name: "Cartes Sportives Rive Sud", base: "https://cartessportivesrivesud.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "danireonca", name: "Danireon Cards & Games", base: "https://www.danireon.com", country: "CA", collections: ["one-piece-tcg-singles","one-piece-the-azure-seas-seven-singles","one-piece-premium-booster-the-best-vol-2-singles","one-piece-premium-booster-the-best-singles","one-piece-carrying-on-his-will-singles","one-piece-wings-of-the-captain-singles","one-piece-emperors-in-the-new-world-singles","one-piece-romance-dawn-singles","one-piece-pillars-of-strength-singles","one-piece-a-fist-of-divine-speed-singles","one-piece-paramount-war-singles","one-piece-legacy-of-the-master-singles"] },
  { key: "derpycards", name: "Derpy Cards", base: "https://derpycards.ca", country: "CA", collections: ["da-one-piece-singles","one-piece","one-piece-trading-card-game-singles","one-piece-1"] },
  { key: "eacollectibles", name: "EA Collectibles", base: "https://eacollectibles.com", country: "CA", collections: ["one-piece-singles-canada","one-piece-heroines-edition-singles"] },
  { key: "eclipsegames", name: "Eclipse Games", base: "https://eclipsegames.ca", country: "CA", collections: ["one-piece-singles","one-piece-high-end"] },
  { key: "empiretradings", name: "Empire Trading", base: "https://www.empiretradings.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "enterthebattlefield", name: "Enter the Battlefield", base: "https://enterthebattlefield.ca", country: "CA", collections: ["one-piece-singles"] },
  { key: "espercards", name: "Esper Cards & Games", base: "https://shop.espercardsandgames.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "freshbrewed", name: "Fresh Brewed Games Ltd.", base: "https://freshbrewed.games", country: "CA", collections: ["one-piece"] },
  { key: "game3", name: "Game 3 TCG & Hobby", base: "https://game3.ca", country: "CA", collections: ["one-piece-singles","one-piece-singles-instock","one-piece","one-piece-best-selection-volume-2-all-products","one-piece-op09-emperors-in-the-new-world","one-piece-op14","one-piece-op15-adventure-on-kamis-island-all-products","one-piece-carrying-on-his-will-op13-all-products","one-piece-op17-the-worlds-strongest-warriors-all-products","one-piece-a-fist-of-divine-speed","one-piece-op16-the-time-of-battle-all-products","one-piece-legacy-of-the-master-all-products"] },
  { key: "itsgametime", name: "Game Time Collectibles", base: "https://itsgametime.ca", country: "CA", collections: ["one-piece-2","one-piece-singles"] },
  { key: "gametime", name: "GameTime/TempsDuJeu", base: "https://game-time.ca", country: "CA", collections: ["one-piece-cartes-a-lunite","op-one-piece-card-the-best-prb-01","op-one-piece-card-the-best-vol-02-prb-02","one-piece","op-one-piece-heroines-edition-eb-03"] },
  { key: "silvergoblin", name: "Gobelin d'Argent - Silver Goblin", base: "https://silvergoblin.cards", country: "CA", collections: ["all-one-piece-card-game-singles","extra-booster-one-piece-heroines-edition-singles"] },
  { key: "gtgames", name: "GT Games", base: "https://gtgames.ca", country: "CA", collections: ["one-piece-single","one-piece-singles","one-piece-4-and-over","one-piece-promotion-cards","extra-booster-one-piece-heroines-edition","extra-booster-one-piece-heroines-edition-vol-2","one-piece-demo-deck-cards"] },
  { key: "heavenscollectibles", name: "Heaven's Collectibles & TCG", base: "https://heavenscollectibles.ca", country: "CA", collections: ["one-piece-singles"] },
  { key: "hobbiesvilleca", name: "Hobbiesville", base: "https://hobbiesville.com", country: "CA", collections: ["one-piece-adventure-on-kamis-island-singles","one-piece-wings-of-the-captain-singles","one-piece-the-azure-seas-seven-singles","one-piece-singles","one-piece-carrying-on-his-will","one-piece-the-worlds-strongest-warriors-singles","one-piece-premium-booster-the-best","one-piece-premium-booster-the-best-vol-2","one-piece-emperors-in-the-new-world","one-piece-a-fist-of-divine-speed","one-piece-kingdoms-of-intrigue-singles","one-piece-the-time-of-battle-singles"] },
  { key: "hobbysag", name: "Hobby Saguenay", base: "https://hobbysag.com", country: "CA", collections: ["one-piece-singles","one-piece-en-stock"] },
  { key: "hpwcards", name: "HPW CARDS INC.", base: "https://hpwcards.com", country: "CA", collections: ["one-piece-singles","all-one-piece-singles","one-piece-singles-extra-booster-anime-25th-collection","extra-booster-one-piece-heroines-edition"] },
  { key: "invasioninc", name: "Invasion Inc", base: "https://invasioncnc.ca", country: "CA", collections: ["one-piece-singles"] },
  { key: "jacksonqueen", name: "Jack's On Queen", base: "https://jacksonqueen.ca", country: "CA", collections: ["one-piece-singles"] },
  { key: "kanzengames", name: "KanZenGames Sports & Collectibles", base: "https://kanzengames.com", country: "CA", collections: ["one-piece-singles-in-stock","one-piece-sealed-singles","one-piece","extra-booster-one-piece-heroines-edition","ebay-one-piece-singles","one-piece-tcg-singles-all","one-piece-sealed","one-piece-tcg-singles-in-stock","one-piece-sealed-in-stock","one-piece-pre-order-1","one-piece-sealed-does-not-include-pre-order","one-piece-sealed-in-stock-no-pre-order"] },
  { key: "boutiquelechevalier", name: "Le Chevalier", base: "https://boutiquelechevalier.com", country: "CA", collections: ["one-piece-singles-all"] },
  { key: "legendarycollectables", name: "Legendary Collectables", base: "https://legendarycollectables.com", country: "CA", collections: ["all-one-piece-singles"] },
  { key: "levelupgames", name: "Level Up Games", base: "https://levelupgames.ca", country: "CA", collections: ["new-one-piece-showcase-singles","one-piece-promotion-cards","extra-booster-one-piece-heroines-edition"] },
  { key: "lotuspetalgaming", name: "Lotus Petal Gaming", base: "https://lotuspetalgaming.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "madmerchantgames", name: "Mad Merchant Cards and Games Limited", base: "https://madmerchantgames.com", country: "CA", collections: ["one-piece"] },
  { key: "merchantsinventory", name: "Merchant's Shop", base: "https://merchantsinventory.ca", country: "CA", collections: ["one-piece-singles"] },
  { key: "northernwartable", name: "Northern War Table", base: "https://northernwartable.com", country: "CA", collections: ["one-piece-singles-test"] },
  { key: "redriotgames", name: "Red Riot Games", base: "https://redriotgames.ca", country: "CA", collections: ["one-piece-op05"] },
  { key: "royaltycardsandcollectibles", name: "Royalty Cards and Collectibles", base: "https://royaltycardsandcollectibles.com", country: "CA", collections: ["one-piece-singles","one-piece-promotion-cards","eb-03-extra-booster-one-piece-heroines-edition-singles"] },
  { key: "skyfoxgames", name: "Sky Fox Games", base: "https://www.skyfoxgames.com", country: "CA", currency: "CAD", collections: ["one-piece-singles-1","one-piece-tcg"] },
  { key: "tapsgames", name: "Taps Games", base: "https://tapsgames.com", country: "CA", collections: ["one-piece-singles","one-piece-singles-high-end"] },
  { key: "vulcancollectibles", name: "Vulcan Collectibles", base: "https://vulcancollectibles.com", country: "CA", collections: ["singles-one-piece","one-piece-singles-in-stock","singles-one-piece-main"] },
  { key: "battlebearkl", name: "Battle Bear Kaiserslautern", base: "https://battle-bear-kl.de", country: "EU", collections: ["one-piece-einzelkarten","one-piece-einzelkarten-bis-10","one-piece-card-game","one-piece-einzelkarten-vitrine","one-piece-alternate-art-einzelkarten"] },
  { key: "battlebearsb", name: "Battle Bear Saarbr\\u00fccken", base: "https://www.battle-bear-sb.de", country: "EU", collections: ["one-piece-einzelkarten","one-piece-einzelkarten-bis-10","one-piece-alternate-art-einzelkarten","one-piece-card-game","one-piece-einzelkarten-vitrine"] },
  { key: "elduelista", name: "El Duelista", base: "https://www.elduelista.com", country: "EU", collections: ["one-piece-single","unnumbered-promos-one-piece","promos-one-piece","special-tournament-promos-one-piece","premium-bandai-products-one-piece","judge-promos-one-piece","winner-cards-one-piece"] },
  { key: "endturn", name: "End Turn", base: "https://www.endturn.pt", country: "EU", collections: ["one-piece-single","unnumbered-promos-one-piece","promos-one-piece","starter-deck-one-piece-film-edition","reprints-one-piece","premium-bandai-products-one-piece","judge-promos-one-piece","special-tournament-promos-one-piece"] },
  { key: "gsgameon", name: "GS-GameOn", base: "https://www.gs-gameon.com", country: "EU", collections: ["one-piece-single","onepiece","unnumbered-promos-one-piece","carte-gradate-one-piece","special-tournament-promos-one-piece","promos-one-piece","judge-promos-one-piece","premium-bandai-products-one-piece","one-piece-products","sigillati-one-piece","prodotti-giapponesi-one-piece","one-piece-promo-products"] },
  { key: "lichcards", name: "Lichcards", base: "https://lichcards.nl", country: "EU", collections: ["one-piece-single"] },
  { key: "manamarketeu", name: "Mana Market EU", base: "https://manamarket.eu", country: "EU", collections: ["one-piece-single","one-piece-singles","one-piece","promos-one-piece"] },
  { key: "nordiclegends", name: "Nordic Legends", base: "https://nordic-legends.com", country: "EU", collections: ["one-piece-single","unnumbered-promos-one-piece","promos-one-piece"] },
  { key: "trextcg", name: "T-REX TCG", base: "https://www.t-rextcg.com", country: "EU", collections: ["one-piece-single","unnumbered-promos-one-piece","promos-one-piece","special-tournament-promos-one-piece","judge-promos-one-piece","starter-deck-one-piece-film-edition","premium-bandai-products-one-piece","reprints-one-piece","one-piece-products","one-piece-preconstructed-decks"] },
  { key: "timetwister", name: "Timetwister Games", base: "https://timetwistergames.it", country: "EU", collections: ["one-piece-single","unnumbered-promos-one-piece","promos-one-piece","judge-promos-one-piece","reprints-one-piece","special-tournament-promos-one-piece","starter-deck-one-piece-film-edition","premium-bandai-products-one-piece"] },
  { key: "trinketmage", name: "Trinket Mage", base: "https://trinket-mage.eu", country: "EU", collections: ["one-piece-single"] },
  { key: "universetcg", name: "Universe TCG", base: "https://www.universetcg.com", country: "EU", collections: ["one-piece-single","home-one-piece-singles","unnumbered-promos-one-piece"] },
  // ── One Piece specialists and large One Piece retailers, found by search and
  // verified the same way on 2026-10-03 (≥20 English One Piece listings with card
  // numbers on the first page of their One Piece collections; market currency).
  { key: "balancegaming", name: "Balance Martial Arts & Gaming", base: "https://balancegamingfl.com", country: "US", collections: ["one-piece-singles-1"] },
  { key: "burbanksportscards", name: "Burbank Sportscards", base: "https://burbankcards.com", country: "US", collections: ["one-piece", "one-piece-cards"] },
  { key: "cardboyz", name: "Card Boyz", base: "https://cardboyz.com", country: "US", collections: ["one-piece-singles", "one-piece"] },
  { key: "cardcavern", name: "Card Cavern Trading Cards", base: "https://www.cardcaverntradingcards.com", country: "US", collections: ["out-of-stock-one-piece", "in-stock-one-piece-card-game", "all-one-piece-singles", "pillars-of-strength-one-piece-singles", "one-piece-starter-deck-singles", "paramount-war-one-piece-singles", "romance-dawn-one-piece-singles", "awakening-of-the-new-era", "kingdoms-of-intrigue-one-piece-singles"] },
  { key: "cardfather", name: "Card Father Games", base: "https://cardfathertcg.com", country: "US", collections: ["one-piece-singles"] },
  { key: "cardxcards", name: "Card x Cards", base: "https://cardxcards.com", country: "US", collections: ["one-piece-instock-1"] },
  { key: "columbuscardshop", name: "Columbus Card Shop", base: "https://columbuscardshop.com", country: "US", collections: ["one-piece-singles"] },
  { key: "constellationcollective", name: "Constellation Collective Sacramento", base: "https://www.constellationcollectivesac.com", country: "US", collections: ["one-piece-singles", "one-piece-products"] },
  { key: "deepdivegames", name: "Deep Dive Games", base: "https://deep-dive-games.myshopify.com", country: "US", collections: ["one-piece-singles"] },
  { key: "devastationmiami", name: "Devastation Store Miami", base: "https://us.storedevastation.com", country: "US", collections: ["singles-one-piece"] },
  { key: "dobigthings", name: "Do Big Things Collectibles", base: "https://www.pullbighits.com", country: "US", collections: ["magic-the-gathering-singles-copy"] },
  { key: "dragonegggames", name: "Dragon Egg Games", base: "https://www.dragon-egg-games.com", country: "US", collections: ["one-piece-single"] },
  { key: "dragonsdenshop", name: "Dragons Den Shop", base: "https://dragonsdenshop.com", country: "US", collections: ["one-piece"] },
  { key: "eclipsecardsandhobby", name: "Eclipse Cards and Hobby", base: "https://www.eclipsecardsandhobby.com", country: "US", collections: ["one-piece-singles-all"] },
  { key: "epikcg", name: "Epik Cards & Games", base: "https://www.epikcg.com", country: "US", collections: ["one-piece-singles-all", "one-piece-singles-in-stock"] },
  { key: "eternalgameschesterfield", name: "Eternal Games Chesterfield", base: "https://eternalgameschesterfield.com", country: "US", collections: ["one-piece-singles"] },
  { key: "five6gaming", name: "FIVE6 Gaming", base: "https://www.five6gaming.com", country: "US", collections: ["one-piece-singles", "in-stock-one-piece", "one-piece-wall-collection"] },
  { key: "forgottenpathgames", name: "Forgotten Path Games", base: "https://forgottenpathgames.com", country: "US", collections: ["one-piece-singles-instock"] },
  { key: "frankscardshop", name: "Frank's Card Shop", base: "https://frankscardshopnj.com", country: "US", collections: ["one-piece", "raw-one-piece"] },
  { key: "galacticgamez", name: "Galactic Gamez", base: "https://www.galacticgamez.com", country: "US", collections: ["one-piece-singles-all"] },
  { key: "gameostorus", name: "Game-O-Storus", base: "https://gameostorus.com", country: "US", collections: ["one-piece-singles", "one-piece"] },
  { key: "gamelandia", name: "Gamelandia", base: "https://gamelandia.fun", country: "US", collections: ["one-piece-singles"] },
  { key: "geargaming", name: "Gear Gaming Bentonville", base: "https://bentonville.geargamingstore.com", country: "US", collections: ["one-piece"] },
  { key: "guardiangames", name: "Guardian Games", base: "https://guardian-games-llc.myshopify.com", country: "US", collections: ["one-piece-1", "prb02-one-piece-card-the-best-vol-2", "prb01-one-piece-card-the-best"] },
  { key: "levelupgamesmd", name: "Level Up Games MD", base: "https://www.levelupgamesmd.com", country: "US", collections: ["one-piece-singles"] },
  { key: "magicandmonsters", name: "Magic and Monsters", base: "https://www.magicandmonsters.com", country: "US", collections: ["one-piece-singles"] },
  { key: "motorcitygaming", name: "Motor City Gaming", base: "https://motorcitygaming.net", country: "US", collections: ["all-things-one-piece", "one-piece-a-fate-of-divine-speed-op-11", "one-piece", "one-piece-legacy-of-the-master-op12"] },
  { key: "pcatoys", name: "PCA Designer Toys and Collectibles", base: "https://pcatoys.com", country: "US", collections: ["one-piece-tcg", "one-piece-the-best-vol-2"] },
  { key: "progressccg", name: "Progress CCG", base: "https://progressccg.com", country: "US", collections: ["one-piece-singles"] },
  { key: "smokeandmirrorshobby", name: "Smoke and Mirrors Hobby", base: "https://www.smokeandmirrorshobby.com", country: "US", collections: ["one-piece-tcg-singles", "one-piece-card-game-all-products", "one-piece-card-game-in-stock"] },
  { key: "solacido", name: "Solacido", base: "https://solacido.com", country: "US", collections: ["singles-one-piece", "one-piece"] },
  { key: "superanimestore", name: "Super Anime Store", base: "https://superanimestore.com", country: "US", collections: ["one-piece-tcg-singles"] },
  { key: "castlegames", name: "The Castle Games", base: "https://castlegameshoppe.com", country: "US", collections: ["one-piece-starter-decks-copy", "pillars-of-strength", "one-piece-500-years-in-the-future", "one-piece-wings-of-the-captain", "one-piece-extra-booster-anime-25th-collection", "one-piece", "one-piece-gear-5"] },
  { key: "haventabletop", name: "The Haven Tabletop Games", base: "https://thehaventabletop.com", country: "US", collections: ["one-piece-singles"] },
  { key: "thehubtcg", name: "The Hub TCG", base: "https://thehubtcg.com", country: "US", collections: ["one-piece-singles"] },
  { key: "lostzone", name: "The Lost Zone Cards & Collectibles", base: "https://thelostzonellc.myshopify.com", country: "US", collections: ["one-piece-singles"] },
  { key: "thetrainercourt", name: "The Trainer Court", base: "https://www.thetrainercourt.com", country: "US", collections: ["one-piece-op11-a-fist-of-divine-speed-singles"] },
  { key: "tier1games", name: "Tier 1 Games", base: "https://tier1games.com", country: "US", collections: ["one-piece-card-game-all-products", "one-piece-card-game-in-stock"] },
  { key: "tradingcardworld", name: "Trading Card World", base: "https://tradingcardworld.store", country: "US", collections: ["one-piece-singles", "one-piece"] },
  { key: "triadcards", name: "Triad Cards and Gaming", base: "https://triadgroup.shop", country: "US", collections: ["one-piece-singles", "one-piece"] },
  { key: "waywardcitygames", name: "Wayward City Games", base: "https://waywardcitygames.net", country: "US", collections: ["one-piece-card-game"] },
  { key: "zulusgames", name: "Zulus Games", base: "https://zulusgames.com", country: "US", collections: ["one-piece-singles"] },
  { key: "crystalcollectablestcg", name: "Crystal Collectables TCG", base: "https://crystalcollectablestcg.com.au", country: "AU", collections: ["one-piece-singles", "one-piece"] },
  { key: "dongames", name: "Don Games", base: "https://dongames.com.au", country: "AU", collections: ["st05-one-piece-film-edition"] },
  { key: "eternalmagic", name: "Eternal Magic", base: "https://eternalmagic.cc", country: "AU", collections: ["one-piece-singles-all", "one-piece-in-stock", "extra-booster-one-piece-heroines-edition"] },
  { key: "frenlybricks", name: "Frenly Bricks", base: "https://frenlybricks.store", country: "AU", collections: ["one-piece-tcg", "one-piece-tcg-singles", "one-piece", "one-piece-sec", "one-piece-sr", "one-piece-purple", "one-piece-red", "one-piece-yellow", "one-piece-black", "one-piece-blue", "one-piece-leaders", "st-10"] },
  { key: "gameology", name: "Gameology", base: "https://www.gameology.com.au", country: "AU", collections: ["one-piece-tcg-single-cards", "one-piece-tcg-op04-kingdoms-of-intrigue-singles", "one-piece-tcg-op05-awakening-of-the-new-era-singles", "one-piece-op01-romance-dawn-singles", "one-piece-tcg-op02-paramount-war-singles", "one-piece-tcg-op03-pillars-of-strength-singles", "one-piece-tcg-op06-wings-of-the-captain-single-cards"] },
  { key: "gamesportal", name: "Games Portal", base: "https://www.gamesportal.com.au", country: "AU", collections: ["one-piece-ccg-singles"] },
  { key: "gatekeepers", name: "Gate Keepers TCG & Collectables", base: "https://www.gatekeeperstcg.com", country: "AU", collections: ["one-piece-sealed"] },
  { key: "goodgames", name: "Good Games", base: "https://tcg.goodgames.com.au", country: "AU", collections: ["one-piece-card-game-carrying-on-his-will-singles", "one-piece-card-game-the-azure-seas-seven-singles", "one-piece-card-game-singles-in-stock", "one-piece-card-game-op-15-adventure-on-kamis-island", "one-piece-card-game-fist-of-divine-speed-singles", "one-piece-card-game-legacy-of-the-master-singles", "one-piece-card-game-awakening-of-the-new-era-1", "one-piece-card-game-500-years-in-the-future-singles", "one-piece-card-game-royal-blood-singles", "one-piece-card-game-wings-of-the-captain-singles", "one-piece-card-game-premium-booster-vol-2", "one-piece-card-game-the-time-of-battle-singles"] },
  { key: "gggreensborough", name: "Good Games Greensborough", base: "https://gggreensborough.com.au", country: "AU", collections: ["one-piece"] },
  { key: "ggmorley", name: "Good Games Morley", base: "https://www.goodgamesmorley.com.au", country: "AU", collections: ["one-piece-gl", "one-piece-new-cards"] },
  { key: "grailborne", name: "Grailborne", base: "https://grailborne.com.au", country: "AU", collections: ["one-piece", "one-piece-singles", "all-singles", "dragon-ball-one-piece-best-sellers", "one-piece-op-13", "one-piece-op-14", "one-piece-op-15", "one-piece-op-17"] },
  { key: "guf", name: "GUF", base: "https://guf.com.au", country: "AU", collections: ["one-piece-singles-op01"] },
  { key: "hbtcollectables", name: "HBT Collectables", base: "https://www.hbtcollectables.com", country: "AU", collections: ["one-piece-card-game-singles", "one-piece-playsets", "one-piece-anime"] },
  { key: "horizontradingcards", name: "Horizon Trading Cards", base: "https://horizontradingcards.com", country: "AU", collections: ["one-piece-singles-gl"] },
  { key: "justcardstuff", name: "Just Card Stuff", base: "https://justcardstuff.com.au", country: "AU", collections: ["tcg-one-piece-singles-raw"] },
  { key: "lunacards", name: "Luna Cards", base: "https://www.lunacards.com.au", country: "AU", collections: ["one-piece-singles-romance-dawn", "one-piece-singles-promos-starter-decks", "one-piece-singles-1", "one-piece-singles"] },
  { key: "mayhemcollectables", name: "Mayhem Collectables", base: "https://mayhemcollectables.com.au", country: "AU", collections: ["singles-one-piece", "one-piece-all", "one-piece-singles", "one-piece-legacy-of-the-master-singles-copy", "one-piece-adventure-on-kamis-island", "one-piece-the-azure-seas-seven", "one-piece-500-years-in-the-future-singles", "one-piece-memorial-collection-extra-booster", "one-piece-legacy-of-the-master-singles", "one-piece-two-legends-singles", "hot-singles-one-piece", "one-piece-extra-booster-one-piece-heroines-edition"] },
  { key: "mightycoolgames", name: "Mighty Cool Games", base: "https://mightycoolgames.com.au", country: "AU", collections: ["one-piece-singles"] },
  { key: "millenniumcomics", name: "Millennium Comics", base: "https://millenniumcomics.com.au", country: "AU", collections: ["one-piece-single"] },
  { key: "raptorgames", name: "Raptor Games", base: "https://www.raptorgames.com", country: "AU", collections: ["one-piece-singles"] },
  { key: "shuffled", name: "Shuffled", base: "https://www.shuffled.com.au", country: "AU", collections: ["one-piece-singles-in-stock"] },
  { key: "teamcardtitan", name: "Team Card Titan", base: "https://teamcardtitan.com", country: "AU", collections: ["explore-all-one-piece", "one-piece-promotion-cards"] },
  { key: "thatgamestore", name: "That Game Store", base: "https://thatgamestore.com.au", country: "AU", collections: ["one-piece-singles-australia-in-stock-that-game-store"] },
  { key: "cardhouse", name: "The Card House", base: "https://www.cardhouse.com.au", country: "AU", collections: ["one-piece-singles"] },
  { key: "thecardspot", name: "The Card Spot", base: "https://thecardspot.com.au", country: "AU", collections: ["one-piece-trading-cards"] },
  { key: "cardboardgamer", name: "The Cardboard Gamer", base: "https://cardboardgamer.com.au", country: "AU", collections: ["one-piece-singles", "one-piece-paramount-war-singles", "one-piece-pillars-of-strength", "one-piece-kingdoms-of-intrigue-singles", "one-piece-awakening-of-the-new-era-singles"] },
  { key: "collectorsmith", name: "The CollectorSmith", base: "https://www.thecollectorsmith.com.au", country: "AU", collections: ["one-piece-singles-gl"] },
  { key: "toysucker", name: "Toy Sucker", base: "https://www.toysucker.com.au", country: "AU", collections: ["one-piece-tcg-singles"] },
  { key: "tradingcardmasters", name: "Trading Card Masters", base: "https://www.tradingcardmasters.com.au", country: "AU", collections: ["one-piece-singles", "one-piece-english-singles"] },
  { key: "turtletcg", name: "Turtle TCG", base: "https://turtletcg.com.au", country: "AU", collections: ["one-piece-singles-consignment", "one-piece-singles"] },
  { key: "wonderlandgames", name: "Wonderland Games", base: "https://www.wonderlandgames.com.au", country: "AU", collections: ["one-piece-singles"] },
  { key: "archerongames", name: "Archeron Games", base: "https://www.archerongames.com", country: "UK", collections: ["all-one-piece", "one-piece-promos"] },
  { key: "cardrush", name: "CardRush", base: "https://www.cardrush.co.uk", country: "UK", collections: ["one-piece-singles", "one_piece", "one-piece-promotion-cards", "extra-booster-one-piece-heroines-edition", "one-piece-demo-deck-cards"] },
  { key: "cardxchange", name: "CardXchange", base: "https://cardxchange.uk", country: "UK", collections: ["one-piece-cg", "one-piece-cg-singles"] },
  { key: "collectorclash", name: "Collector Clash", base: "https://www.collectorclash.com", country: "UK", collections: ["one-piece-card-game", "one-piece-raw-cards"] },
  { key: "comicsbeyond", name: "Comics & Beyond", base: "https://www.comicsandbeyond.co.uk", country: "UK", collections: ["one-piece-tcg"] },
  { key: "cosmiccollectables", name: "Cosmic Collectables", base: "https://www.cosmiccollectables.co.uk", country: "UK", collections: ["single-cards-one-piece"] },
  { key: "gatheringpointgames", name: "Gathering Point Games", base: "https://gatheringpointgames.co.uk", country: "UK", collections: ["one-piece-singles-instock", "one-piece-singles-all-products"] },
  { key: "hiddengemcards", name: "Hidden Gem Trading Cards", base: "https://hiddengemcards.co.uk", country: "UK", collections: ["one-piece", "one-piece-promotion-cards", "cc-onepiece-op05", "cc-onepiece-eb-03", "cc-onepiece-st-01", "cc-onepiece-st21"] },
  { key: "hodges", name: "Hodges Trading Cards", base: "https://hodgestradingcards.com", country: "UK", collections: ["one-piece-card-game-premium-booster-prb-01-singles", "one-piece-card-game-st-collection-singles", "adventure-on-kamis-island-singles", "the-azure-seas-seven-singles", "one-piece-card-game-emperors-in-the-new-world-singles", "one-piece-card-game-pillars-of-strength-singles", "one-piece-card-game-awakening-of-the-new-era-singles", "one-piece-card-game-a-fist-of-divine-speed", "one-piece-card-game-the-worlds-strongest-warriors-singles", "carrying-on-his-will-singles", "one-piece-card-game-kingdoms-of-intrigue-singles", "one-piece-card-game-royal-blood-singles"] },
  { key: "jetcards", name: "JET Cards", base: "https://www.jetcards.uk", country: "UK", collections: ["one-piece-card-game", "one-piece-single-cards", "one-piece-op13-carrying-on-his-will", "one-piece-op15-adventure-on-kamis-island", "one-piece-op17-the-worlds-strongest-warriors", "one-piece-op-16-the-time-of-battle", "one-piece-eb-03-one-piece-heroines-edition", "one-piece-op07-500-years-in-the-future", "one-piece-prb-02-one-piece-card-the-best-vol-2", "one-piece-op12-legacy-of-the-master", "one-piece-op14-the-azure-seas-seven", "one-piece-prb-01-one-piece-card-the-best"] },
  { key: "jgccollectables", name: "JGC Collectables", base: "https://jgc-collectables.co.uk", country: "UK", collections: ["one-piece", "st05-one-piece-film-edition"] },
  { key: "lvlupgaming", name: "LvL Up Gaming", base: "https://lvlupgaming.co.uk", country: "UK", collections: ["one-piece-singles-in-stock", "one-piece-promotion-cards", "extra-booster-one-piece-heroines-edition"] },
  { key: "managaming", name: "Mana Gaming", base: "https://managaming.shop", country: "UK", collections: ["one-piece-card-game"] },
  { key: "onepiecesingles", name: "One Piece Singles", base: "https://onepiecesingles.com", country: "UK", collections: ["buy-one-piece-card-game-pillars-of-strength-cards", "buy-one-piece-card-game-single-cards-from-the-kingdoms-of-intrigue-expansion-set"] },
  { key: "stylecreep", name: "Stylecreep", base: "https://www.stylecreep.com", country: "UK", collections: ["one-piece-card-game", "one-piece-promotion-cards", "cc-onepiece-op15-eb04", "cc-onepiece-st-29", "extra-booster-one-piece-heroines-edition", "cc-onepiece-op02", "cc-onepiece-op04", "cc-onepiece-eb-01", "cc-onepiece-st-28", "cc-onepiece-lt-01", "cc-onepiece-st-27"] },
  { key: "thegrumpygoblin", name: "The Grumpy Goblin", base: "https://thegrumpygoblin.co.uk", country: "UK", collections: ["one-piece-singles", "extra-booster-one-piece-heroines-edition", "one-piece-promotion-cards", "cc-onepiece-op15-eb04", "one-piece-demo-deck-cards-op-dd"] },
  { key: "trainerlegacy", name: "Trainer Legacy", base: "https://www.trainerlegacy.com", country: "UK", collections: ["one-piece-instock", "one-piece-awakening-of-the-new-era", "one-piece-a-fist-of-divine-speed"] },
  { key: "animealley", name: "Anime Alley", base: "https://animealley.ca", country: "CA", collections: ["one-piece-singles"] },
  { key: "boardgamebliss", name: "Board Game Bliss", base: "https://www.boardgamebliss.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "cardsandcoasters", name: "Cards and Coasters", base: "https://cardsandcoasters.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "cartesleo", name: "Cartes Leo", base: "https://cartesleo.ca", country: "CA", collections: ["one-piece-singles"] },
  { key: "collectedition", name: "Collect-Edition", base: "https://cards.collect-edition.com", country: "CA", collections: ["one-piece", "one-piece-single-all", "one-piece-in-stock-over-15", "best-sellers-one-piece"] },
  { key: "commonboxgames", name: "Common Box Games", base: "https://commonboxgames.com", country: "CA", collections: ["one-piece-singles-in-stock", "one-piece-product-emperors-in-the-new-world", "one-piece-singles-awakening-of-the-new-era", "one-piece-singles-awakening-of-the-new-era-1", "one-piece-singles-paramount-war", "one-piece-singles-pillars-of-strength", "one-piece-singles-extra-booster-memorial-collection", "one-piece-singles-wings-of-the-captain"] },
  { key: "deckoutgaming", name: "Deck Out Gaming", base: "https://deckoutgaming.ca", country: "CA", collections: ["one-piece-promos", "one-piece-singles-all", "one-piece-singles-instock"] },
  { key: "desertcitygames", name: "Desert City Games", base: "https://www.desertcitygamestcg.ca", country: "CA", collections: ["one-piece", "one-piece-singles"] },
  { key: "fantasyforged", name: "Fantasy Forged", base: "https://fantasyforged.ca", country: "CA", collections: ["one-piece-singles-1", "one-piece-singles", "recently-restocked-singles-one-piece"] },
  { key: "gamezilla", name: "GameZilla", base: "https://gamezilla.ca", country: "CA", collections: ["one-piece-ccg-all-cards", "one-piece-ccg-royal-blood-copy", "one-piece-ccg-adventure-on-kamis-island", "one-piece-ccg-pillars-of-strength-copy", "one-piece-ccg-carrying-on-his-will", "one-piece-ccg-emperors-in-the-new-world", "one-piece-ccg-a-fist-of-divine-speed", "one-piece-ccg-kingdoms-of-intrigue", "one-piece-ccg-legacy-of-the-master", "one-piece-ccg-the-time-of-battle", "one-piece-ccg-500-years-in-the-future", "one-piece-ccg-premium-booster-the-best-vol-2-copy"] },
  { key: "hairytarantula", name: "Hairy Tarantula", base: "https://www.hairyt.com", country: "CA", collections: ["one-piece-cg-singles"] },
  { key: "infinitycards", name: "Infinity Cards & Collectibles", base: "https://www.infinitycards.ca", country: "CA", collections: ["one-piece", "one-piece-collection"] },
  { key: "kingdomtitans", name: "Kingdom Titans", base: "https://kingdomtitans.cards", country: "CA", collections: ["one-piece"] },
  { key: "luniversdelacarte", name: "L'univers de la carte", base: "https://luniversdelacarte.ca", country: "CA", collections: ["one-piece-tcg-promos", "one-piece-singles"] },
  { key: "letsplaycards", name: "Let's Play! Cards and Games", base: "https://www.skafexpress.ca", country: "CA", collections: ["one-piece-card-singles", "one-piece-cabinet-cards"] },
  { key: "paradoxtcg", name: "ParadoxTCG", base: "https://paradoxtcg.com", country: "CA", collections: ["one-piece-singles", "one-piece-best-selling", "one-piece-the-time-of-battle"] },
  { key: "piratecards", name: "Pirate Cards", base: "https://piratecards.shop", country: "CA", collections: ["singles-collection"] },
  { key: "pvpshoppe", name: "PvP Shoppe", base: "https://pvpshoppe.com", country: "CA", collections: ["one-piece-singles-instock"] },
  { key: "tistacards", name: "TistaCards", base: "https://tistacards.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "onepiececardsfr", name: "Boutique Carte One Piece (onepiece-cards.com)", base: "https://onepiece-cards.com", country: "EU", collections: ["one-piece-eng"] },
  { key: "breakthecase", name: "BreakTheCase", base: "https://www.breakthecase.de", country: "EU", collections: ["cc-onepiece-op15-eb04", "one-piece-promotion-cards", "leader-alt-art-one-piece-card-game", "special-art-sps-one-piece-card-game", "extra-booster-one-piece-heroines-edition"] },
  { key: "bsastore", name: "BSA Store", base: "https://www.bsastore.it", country: "EU", collections: ["one-piece-single-cards-eng", "one-piece-card-game-single-cards-op14-the-azure-seas-seven-eng", "one-piece-card-game-carte-singole-op15-adventure-on-kamis-island-eng", "one-piece-card-game-carte-singole-op13-carrying-on-his-will-eng", "one-piece-card-game-carte-singole-op05-awakening-of-the-new-era-eng", "one-piece-card-game-carte-singole-op09-emperors-in-the-new-world-eng", "one-piece-card-game-carte-singole-op01-romance-dawn-eng", "one-piece-card-game-carte-singole-op12-legacy-of-the-master-eng", "one-piece-card-game-single-cards-op16-the-time-of-battle-eng", "one-piece-card-game-single-cards-op02-paramount-war-eng", "one-piece-card-game-carte-singole-op03-pillars-of-strength-eng", "one-piece-card-game-carte-singole-op06-wings-of-the-captain-eng"] },
  { key: "cardcapital", name: "CardCapital", base: "https://cardcapital.shop", country: "EU", collections: ["one-piece-tcg-trading-card-game-kartenspiel-sammelkarten", "paramount-war-op02-one-piece-tcg-karten", "pillars-of-strength-op03-one-piece-tcg-karten", "romance-dawn-op01-one-piece-tcg-karten", "awakening-of-the-new-era-op05-one-piece-tcg-karten", "kingdoms-of-intrigue-op04-one-piece-tcg-karten", "promo-one-piece-tcg-karten", "wings-of-the-captain-op06-one-piece-tcg-karten"] },
  { key: "cardcosmos", name: "CardCosmos", base: "https://cardcosmos.de", country: "EU", collections: ["bandai", "one-piece-karten-kaufen", "one-piece-tcg-sale-rabatt", "one-piece-premium-geschenke", "one-piece-tcg-geschenke-unter-20", "one-piece-geschenke-20-50", "one-piece-tcg-geschenkideen-von-50-bis-100"] },
  { key: "collectorstorecards", name: "Collector Store Cards", base: "https://collectorstorecards.it", country: "EU", collections: ["carte-singole-one-piece"] },
  { key: "gamestimeaversa", name: "Games Time Aversa", base: "https://gamestimeaversa.com", country: "EU", collections: ["one-piece-single", "one_piece", "unnumbered-promos-one-piece", "promos-one-piece", "reprints-one-piece", "special-tournament-promos-one-piece", "one-piece", "one-piece-preconstructed-decks", "one-piece-products"] },
  { key: "kaiofcards", name: "Kai of Cards", base: "https://kaiofcards.com", country: "EU", collections: ["one-piece-card-game", "one-piece-singles"] },
  { key: "lmshandel", name: "LMS Handel", base: "https://lms-handel.de", country: "EU", collections: ["one-piece"] },
  { key: "rarecards", name: "RareCards", base: "https://rarecards.nl", country: "EU", collections: ["one-piece-kaarten", "laatst-geplaatste-one-piece-producten", "one-piece-tcg", "prb-02-one-piece-card-the-best-vol-2", "high-end-one-piece-kaarten", "prb-01-one-piece-card-the-best"] },
  { key: "recollectibles", name: "ReCollectibles", base: "https://recollectibles.de", country: "EU", collections: ["one-piece-einzelkarten", "one-piece-einzelkarten-neu-im-shop", "alle-promo-karten-in-one-piece"] },
  { key: "tcgking", name: "TCG King", base: "https://tcgking.nl", country: "EU", collections: ["singles", "all-one-piece", "monkey-d-luffy", "op14-eb04-singles", "sanji", "shanks", "roronoa-zoro", "trafalgar-law", "boa-hancock", "nami", "portgas-d-ace", "sabo"] },
  // ── Third pass, verified 2026-10-03 from scratch (robots.txt `User-agent: *`
  // group, meta.json country and currency, the storefront's active currency under
  // ?country=, and EVERY page of each collection's products.json): at least 20
  // English One Piece singles with a card number in the title or variant SKU.
  // Deduplicated against the stores above by key, host and myshopify domain.
  { key: "151collectables", name: "151Collectables", base: "https://151collectables.com", country: "US", collections: ["one-piece-singles","one-piece"] },
  { key: "aandjtradingbros", name: "A&J Trading Bros", base: "https://ajtradingbros.com", country: "US", collections: ["one-piece-singles"] },
  { key: "alohacardshop", name: "Aloha Card Shop", base: "https://www.alohacardshop.com", country: "US", collections: ["one-piece-raw","one-piece-tcg"] },
  { key: "atlantiscomics", name: "Atlantis Games & Comics Norfolk", base: "https://atlantis-comics.com", country: "US", collections: ["one-piece-tcg-singles"] },
  { key: "blackswampgames", name: "Black Swamp Games", base: "https://blackswampgames.com", country: "US", collections: ["one-piece"] },
  { key: "boardwipe", name: "Board Wipe", base: "https://boardwipe.com", country: "US", collections: ["one-piece-singles"] },
  { key: "brickandboardgames", name: "Brick & Board Games and Cards", base: "https://brickandboardgames.com", country: "US", collections: ["one-piece-card-game"] },
  { key: "bunkscardcorner", name: "Bunks Card Corner", base: "https://bunkscardcorner.com", country: "US", collections: ["one-piece-cards"] },
  { key: "cardhavengames", name: "Cardhaven Games", base: "https://cardhaven-games.com", country: "US", collections: ["one-piece-singles"] },
  { key: "clubhousecards", name: "ClubhouseCards", base: "https://theclubhousecards.com", country: "US", collections: ["one-piece-1"] },
  { key: "collectionhousecafe", name: "Collection House Cafe", base: "https://collectionhousecafe.com", country: "US", collections: ["one-piece-singles"] },
  { key: "collectivecubed", name: "Collective Cubed", base: "https://collectivecubed.com", country: "US", collections: ["one-piece-singles"] },
  { key: "cosmicgames", name: "Cosmic Games", base: "https://www.cosmicgames.com", country: "US", collections: ["one-piece-tcg-singles","one-piece-tcg-a-fist-of-divine-speed","one-piece-tcg-legacy-of-the-master","one-piece-tcg-royal-blood","100-one-piece","one-piece-card-game"] },
  { key: "darkstonecomics", name: "Darkstone Comics", base: "https://www.darkstonecomics.com", country: "US", collections: ["one-piece-singles"] },
  { key: "dynamiccardcollectors", name: "Dynamic Card Collectors", base: "https://dynamiccardcollectors.com", country: "US", collections: ["one-piece-singles"] },
  { key: "epictradingcollectibles", name: "Epic Trading Collectibles", base: "https://www.epictradingcollectibles.com", country: "US", collections: ["one-piece-tcg"] },
  { key: "finalform", name: "Final Form", base: "https://www.finalformcards.com", country: "US", collections: ["one-piece"] },
  { key: "glamorousgamers", name: "Glamorous Gamers Connect & Play Cafe", base: "https://www.glamorousgamers.com", country: "US", collections: ["one-piece-smart","one-piece-singles"] },
  { key: "greendoorcollectibles", name: "Green Door Collectibles", base: "https://greendoorcollectibles.com", country: "US", collections: ["one-piece-singles"] },
  { key: "hoarditall", name: "Hoard", base: "https://www.hoarditall.com", country: "US", collections: ["one-piece"] },
  { key: "holohaven", name: "Holo Haven", base: "https://holohaven.com", country: "US", collections: ["one-piece-singles"] },
  { key: "joshscards", name: "Josh's Cards", base: "https://joshscards.com", country: "US", collections: ["one-piece-singles","latest-one-piece-singles","one-piece"] },
  { key: "keyitemscollectibles", name: "Key Items Collectibles", base: "https://keyitemscollect.com", country: "US", collections: ["one-piece"] },
  { key: "littlerootgamesdublin", name: "Littleroot Games - Dublin", base: "https://dublin.littlerootgames.com", country: "US", collections: ["one-piece-singles","one-piece-singles-in-stock","all-one-piece-in-stock"] },
  { key: "ltshobbies", name: "LTs Hobbies", base: "https://www.lthobbies.com", country: "US", collections: ["one-piece-singles"] },
  { key: "nolatcgexperience", name: "NOLA TCG Experience", base: "https://nolatcg.com", country: "US", collections: ["one-piece-tcg-all-singles"] },
  { key: "onendunncards", name: "OneNDunn Cards", base: "https://onendunncards.com", country: "US", collections: ["one-piece-card-game-singles"] },
  { key: "papajoeyscollectibles", name: "Papa Joey's Collectibles", base: "https://papajoeys.com", country: "US", collections: ["one-piece-card-game-singles"] },
  { key: "redfoxgaming", name: "Red Fox Gaming", base: "https://redfoxgamingonline.com", country: "US", collections: ["one-piece-singles"] },
  { key: "shufflenroll", name: "Shuffle N Roll", base: "https://shufflenroll.com", country: "US", collections: ["optcg-instock-singles"] },
  { key: "spankyslootstash", name: "Spanky's Loot Stash", base: "https://www.spankyslootstash.com", country: "US", collections: ["one-piece-trading-card-game"] },
  { key: "svsportscards", name: "Spokane Valley Sports and Trading Cards", base: "https://svsportscards.com", country: "US", collections: ["one-piece"] },
  { key: "tabletopgamingcenter", name: "Tabletop Gaming Center", base: "https://www.tabletopgamingcenter.com", country: "US", collections: ["one-piece-singles"] },
  { key: "thegamecornergames", name: "The Game Corner", base: "https://www.thegamecornergames.com", country: "US", collections: ["one-piece"] },
  { key: "evvgamingguild", name: "The Gaming Guild", base: "https://www.evvgamingguild.com", country: "US", collections: ["one-piece","singles"] },
  { key: "mightymeeple", name: "The Mighty Meeple", base: "https://mightymeeple.com", country: "US", collections: ["one-piece"] },
  { key: "nexuscollectormarket", name: "The Nexus Collector Market", base: "https://thenexusgnv.com", country: "US", collections: ["one-piece-singles"] },
  { key: "vaultgamestore", name: "The Vault", base: "https://vaultgamestore.com", country: "US", collections: ["one-piece-singles","newly-added-pokemon-singles-copy"] },
  { key: "unsettledgeeks", name: "Unsettled Geeks", base: "https://unsettledgeeks.com", country: "US", collections: ["one-piece-in-stock-singles","one-piece-singles","extra-booster-one-piece-heroines-edition"] },
  { key: "wildthingsgames", name: "Wild Things Games LLC", base: "https://pro.wildthingsgames.com", country: "US", collections: ["one-piece-tcg-singles"] },
  { key: "cardoni", name: "Card Oni", base: "https://cardoni.com.au", country: "AU", collections: ["one-piece-singles"] },
  { key: "collectorscompany", name: "Collectors Company", base: "https://collectorscompany.com.au", country: "AU", collections: ["one-piece-cg","one-piece-promos","prb01-premium-booster-the-best","prb02-one-piece-card-the-best-vol-2"] },
  { key: "criticalhitgaming", name: "Critical Hit Gaming", base: "https://www.crithit.com.au", country: "AU", collections: ["one-piece-card-game-singles"] },
  { key: "dragonslair", name: "Dragon's Lair Hobbies and Gaming", base: "https://dragonslair.au", country: "AU", collections: ["one-piece-singles-in-stock"] },
  { key: "fabledgames", name: "Fabled Games Hobbies and Collectibles", base: "https://fabledgames.store", country: "AU", collections: ["one-piece-card-game-singles","prb-01-one-piece-best-cards"] },
  { key: "groovycollectables", name: "Groovy Collectables", base: "https://groovycollectables.com.au", country: "AU", collections: ["one-piece-singles-en"] },
  { key: "hrgames", name: "HR Games", base: "https://hrgames.au", country: "AU", collections: ["one-piece-card-game-singles"] },
  { key: "legendsandcollectables", name: "Legends and Collectables", base: "https://www.legendsandcollectables.com", country: "AU", collections: ["one-piece-singles"] },
  { key: "oneplacetcs", name: "One Place Trading Card Shop", base: "https://oneplacetcs.com.au", country: "AU", collections: ["one-piece-singles"] },
  { key: "rhysticnostalgiagaming", name: "Rhystic Nostalgia Gaming", base: "https://rhysticnostalgiagaming.com.au", country: "AU", collections: ["one-piece-singles-all"] },
  { key: "toneaus", name: "T One Australia", base: "https://www.toneaus.com.au", country: "AU", collections: ["one-piece"] },
  { key: "dragonsbeard", name: "The Dragon's Beard", base: "https://thedragonsbeard.com.au", country: "AU", collections: ["one-piece-singles"] },
  { key: "7thcitycollectables", name: "7th City Collectables", base: "https://7thcitycollectables.com", country: "UK", collections: ["the-world-s-strongest-warriors-op17","one-piece-promotion-cards-op-pr"] },
  { key: "collectbydesign", name: "Collect by Design", base: "https://www.collectbydesign.co.uk", country: "UK", collections: ["one-piece-singles","one-piece-op10-royal-blood","mtg-bloomburrow"] },
  { key: "mysterytavern", name: "Mystery Tavern", base: "https://www.shopmysterytavern.co.uk", country: "UK", collections: ["one-piece-singles"] },
  { key: "pucapucagames", name: "Puca Puca Games", base: "https://www.pucapucagames.co.uk", country: "UK", collections: ["op01-romance-dawn","op02-paramount-war","op03-pillars-of-strength","op04-kingdoms-of-intrigue","op05-awakening-of-the-new-era","op06-wings-of-the-captain","op07-500-years-into-the-future","op08-two-legends","op09-emperors-in-the-new-world","op10-royal-blood","op11-a-fist-of-divine-speed","op12-legacy-of-the-master","op13-carrying-on-his-will","op14-the-azure-seas-seven","op15-adventure-on-kamis-island","op16-the-time-of-battle","op17-the-worlds-strongest-warrior","eb01-memorial-collection","eb02-anime-25th-collection","eb03-heroines-edition","prb01-the-best","prb02-the-best-vol-2"] },
  { key: "sidequestgames", name: "Side Quest Games", base: "https://www.sidequestgames.uk", country: "UK", collections: ["a-fist-of-divine-speed-op11"] },
  { key: "tengentreasures", name: "Tengen Treasures", base: "https://tengentreasures.co.uk", country: "UK", collections: ["one-piece-singles"] },
  { key: "unioncountygames", name: "Union County Games", base: "https://www.unioncountygames.com", country: "UK", collections: ["the-azure-sea-s-seven-op14","adventure-on-kami-s-island-op15-eb04","the-world-s-strongest-warriors-op17","the-time-of-battle-op16","emperors-in-the-new-world-op09","a-fist-of-divine-speed-op11","legacy-of-the-master-op12","royal-blood-op10","carrying-on-his-will-op13","one-piece-promotion-cards-op-pr","wings-of-the-captain-op06","awakening-of-the-new-era-op05","two-legends-op08","premium-booster-the-best-prb-01","premium-booster-the-best-vol-2-prb-02","extra-booster-anime-25th-collection-eb-02","starter-deck-22-ace-newgate-st-22"] },
  { key: "203collectibles", name: "203 Collectibles", base: "https://203collectibles.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "3mana", name: "3 Mana", base: "https://3mana.ca", country: "CA", collections: ["one-piece-singles","one-piece-promotion-cards","one-piece-premium-booster-the-best-vol-2","premium-booster-the-best","azure-seas-seven","one-piece-adventure-on-kami-s-island","one-piece-carrying-on-his-will","one-piece-the-worlds-strongest-warriors","one-piece-emperors-in-the-new-world","one-piece-a-fist-of-divine-speed","one-piece-fist-of-divine-speed","one-piece-the-time-of-battle"] },
  { key: "6ixtcgsmarkham", name: "6ix TCGs Markham", base: "https://6ixtcgsmarkham.ca", country: "CA", collections: ["one-piece-singles"] },
  { key: "abyssgamestore", name: "Abyss Game Store", base: "https://abyssgamestore.ca", country: "CA", collections: ["one-piece-tcg-singles","one-piece-singles-in-stock","new-arrivals-one-piece"] },
  { key: "altf4", name: "ALT F4", base: "https://altf4online.com", country: "CA", collections: ["one-piece-tcg-singles"] },
  { key: "beardycards", name: "BeardyCards", base: "https://www.beardycards.com", country: "CA", collections: ["one-piece-singles","one-piece"] },
  { key: "manacore", name: "Boutique Manacore", base: "https://manacore.ca", country: "CA", collections: ["one-piece"] },
  { key: "cardbrawlers", name: "Card Brawlers", base: "https://cardbrawlers.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "cardcaster", name: "Card Caster", base: "https://cardcastergames.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "cardboardclassics", name: "Cardboard Classics", base: "https://cardboardclassics.ca", country: "CA", collections: ["one-piece-singles"] },
  { key: "cardboardhero", name: "Cardboard Hero", base: "https://cardboardhero.com", country: "CA", collections: ["one-piece-singles","one-piece-emperors-in-the-new-world-singles","one-piece-pillars-of-strength-singles","one-piece-paramount-war-singles","one-piece-romance-dawn-singles"] },
  { key: "cardera", name: "Cardera Collectibles", base: "https://carderaco.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "championcitygames", name: "Champion City Games", base: "https://championcitygames.ca", country: "CA", collections: ["one-piece-singles"] },
  { key: "clawmebaby", name: "Claw Me Baby Games", base: "https://clawmebaby.ca", country: "CA", collections: ["one-piece-promo-cards","one-piece-starter-deck-cards","one-piece-singles"] },
  { key: "darkfoxtcg", name: "Dark Fox TCG", base: "https://darkfoxtcg.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "diademcardsandhobbies", name: "Diadem Cards and Hobbies", base: "https://diademhobbies.com", country: "CA", collections: ["one-piece"] },
  { key: "dragoncardsandgames", name: "Dragon Cards & Games", base: "https://tcg.dragoncardsandgames.com", country: "CA", collections: ["one-piece-singles-all","one-piece"] },
  { key: "dungeoncomics", name: "Dungeon Comics & Cards", base: "https://dungeoncomicsandcards.ca", country: "CA", collections: ["one","one-piece-promos"] },
  { key: "envcollectible", name: "ENV Collectible", base: "https://envcollectible.com", country: "CA", collections: ["onepiece-tcg-singles-instock","emperors-in-the-new-world-op-09","one-piece-the-azure-seas-seven-op-14-eb04","one-piece-two-legends-op-08","royal-blood-op-10","carrying-on-his-will-op-13","legacy-of-the-master-op-12","one-piece-500-years-in-the-future-op-07","a-fist-of-divine-speed-op-11","one-piece-paramount-wars-op-01","one-piece-wings-of-the-captain-op-06","one-piece-kingdoms-of-intrigue-op-04"] },
  { key: "exorgames", name: "Exor Games", base: "https://exorgames.com", country: "CA", collections: ["one-piece-cards","one-piece-in-stock","one-piece-card-game"] },
  { key: "fafnirshoard", name: "Fafnir's Hoard", base: "https://fafnirshoard.ca", country: "CA", collections: ["one-piece-singles"] },
  { key: "forestcitycollectibles", name: "Forest City Collectibles", base: "https://forestcitycollectibles.com", country: "CA", collections: ["one-piece-singles","one-piece-cards-all"] },
  { key: "geekandco", name: "Geek & Co.", base: "https://geekandco.ca", country: "CA", collections: ["one-piece-singles","one-piece-singles-copy"] },
  { key: "hfxgames", name: "HFX Games", base: "https://hfxgames.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "hobbyexpert", name: "Hobby Expert", base: "https://hobbyexpert.ca", country: "CA", collections: ["one-piece-tcg-singles-english","one-piece-promotional-cards","i"] },
  { key: "hopeclub", name: "Hope Club Collectibles", base: "https://hopeclubshop.ca", country: "CA", collections: ["storepass-optcg"] },
  { key: "kapescaping", name: "Kap Escaping", base: "https://kapescaping.ca", country: "CA", collections: ["one-piece-tcg-singles"] },
  { key: "kunaigames", name: "KunaiGames", base: "https://kunaigames.com", country: "CA", collections: ["one-piece-singles","one-piece"] },
  { key: "laboitemystere", name: "La Boite Mystere", base: "https://laboitemystere.com", country: "CA", collections: ["one-piece-singles","one-piece-eb-02-extra","one-piece-extra-booster-memorial-collection-singles","one-piece-kingdoms-of-intrigue-singles","one-piece-romance-dawn-singles","one-piece-awakening-of-the-new-era-singles","one-piece-paramount-war-singles","one-piece-two-legends-singles","one-piece-500-years-in-the-future","one-piece-pillars-of-strength-singles","wings-of-the-captain","one-piece-a-fist-of-divine-speed-singles"] },
  { key: "cryptmtg", name: "La Crypte", base: "https://cryptmtg.com", country: "CA", collections: ["one-piece-unite"] },
  { key: "lecoindujeu", name: "Le Coin du Jeu", base: "https://lecoindujeu.ca", country: "CA", collections: ["one-piece-op-15-adventure-on-kamis-island-singles","one-piece-tcg-singles","one-piece-the-time-of-battle-singles"] },
  { key: "masterset", name: "Masterset Co.", base: "https://masterset.ca", country: "CA", collections: ["one-piece-singles"] },
  { key: "nerdvanacardsandgames", name: "Nerdvana Cards & Games", base: "https://nerdvanacardsandgames.com", country: "CA", collections: ["all-one-piece"] },
  { key: "newrealmgames", name: "New Realm Games", base: "https://newrealmgames.com", country: "CA", collections: ["one-piece-singles","one-piece-card-game-op-15-adventure-on-kamis-island","one-piece-the-time-of-battle"] },
  { key: "pandahobby", name: "Panda Hobby", base: "https://pandahobby.ca", country: "CA", collections: ["one-piece-tcg-single"] },
  { key: "playerscandc", name: "Players Cards and Collectibles", base: "https://playerscandc.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "prestigegames", name: "Prestige Games", base: "https://prestigegames.ca", country: "CA", collections: ["one-piece-singles-1","extra-booster-one-piece-heroines-edition"] },
  { key: "radgameshop", name: "RAD GameShop", base: "https://www.radgameshop.ca", country: "CA", collections: ["one-piece"] },
  { key: "realmhoppers", name: "Realm Hoppers", base: "https://www.realmhoppers.com", country: "CA", collections: ["one-piece","one-piece-pillars-of-strength-in-stock-singles-copy","one-piece-paramount-war-in-stock-singles-copy","one-piece-kingdoms-of-intrigue-in-stock-singles-copy","one-piece-awakening-of-the-new-era-in-stock-singles-copy","one-piece-romance-dawn-in-stock-singles-copy","one-piece-paramount-war-in-stock-singles-copy-1","one-piece-500-years-in-the-future-in-stock-singles-copy","one-piece-the-best-in-stock-singles-copy","one-piece-the-time-of-battle-in-stock-singles-copy","one-piece-adventure-on-kamis-island-in-stock-singles-copy","one-piece-emperors-in-the-new-world-in-stock-singles-copy"] },
  { key: "screenfreegames", name: "Screen Free Games", base: "https://screenfreegames.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "seatoskygames", name: "SeaToSky Games", base: "https://seatoskygames.com", country: "CA", collections: ["one-piece-starter-decks","one-piece-singles","one-piece-revision-cards","one-piece-promotion-cards"] },
  { key: "springerhobbies", name: "Springer Hobbies", base: "https://springerhobbies.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "tabletopgiant", name: "Tabletop Giant", base: "https://tabletopgiant.ca", country: "CA", collections: ["one-piece"] },
  { key: "teamcollectors", name: "Team Collectors", base: "https://teamcollectors.com", country: "CA", collections: ["one-piece-singles-eng-canada"] },
  { key: "negativezone", name: "The Negative Zone", base: "https://negativezonecomics.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "thesidedeck", name: "The Side Deck", base: "https://thesidedeck.ca", country: "CA", collections: ["one-piece-singles-now-in-stock"] },
  { key: "tkotoyco", name: "TKO Toy Co", base: "https://tkotoyco.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "totalplay", name: "Total Play", base: "https://totalplay.ca", country: "CA", collections: ["one-piece-singles"] },
  { key: "trinityhobby", name: "Trinity Hobby", base: "https://trinityhobby.com", country: "CA", collections: ["one-piece-singles"] },
  { key: "twinmoons", name: "Twin Moons Cards & Games", base: "https://twinmoonstcg.com", country: "CA", collections: ["one-piece"] },
  { key: "untouchables", name: "Untouchables Sports Cards and Gaming", base: "https://untouchables.ca", country: "CA", collections: ["one-piece-tcg-singles-collection"] },
  { key: "cardhome", name: "Cardhome", base: "https://cardhome.at", country: "EU", collections: ["one-piece-single","unnumbered-promos-one-piece","promos-one-piece","special-tournament-promos-one-piece","premium-bandai-products-one-piece"] },
  { key: "duelspoint", name: "Duels Point", base: "https://duelspoint.it", country: "EU", collections: ["one-piece-single","unnumbered-promos-one-piece","promos-one-piece","judge-promos-one-piece","special-tournament-promos-one-piece"] },
  { key: "fireanddice", name: "Fire & Dice", base: "https://www.fireanddice.it", country: "EU", collections: ["one-piece-single","unnumbered-promos-one-piece","promos-one-piece","special-tournament-promos-one-piece","premium-bandai-products-one-piece"] },
  { key: "gamesavenue", name: "Games Avenue", base: "https://gamesavenue.fr", country: "EU", collections: ["one-piece-1","cartes-a-lunite-one-piece"] },
  { key: "hitechgames", name: "Hi-Tech Games", base: "https://www.hitechgames.it", country: "EU", collections: ["one-piece-single","unnumbered-promos-one-piece","promos-one-piece"] },
  { key: "magicianscircle", name: "Magician's Circle", base: "https://www.magicians-circle.com", country: "EU", collections: ["one-piece-single","unnumbered-promos-one-piece","promos-one-piece","judge-promos-one-piece"] },
  { key: "opssmarket", name: "OPSS Market", base: "https://opssmarket.com", country: "EU", collections: ["onepiece"] },
  { key: "shopponistore", name: "Shopponi Store", base: "https://shopponistore.com", country: "EU", collections: ["one-piece-single","unnumbered-promos-one-piece"] },
  { key: "spellnexus", name: "SpellNexus", base: "https://spellnexus.com", country: "EU", collections: ["one-piece-single","unnumbered-promos-one-piece","promos-one-piece"] },
  // ── ShadowPOS (TCGLocal storefront) stores, verified 2026-10-03: the whole
  // in-stock One Piece catalogue read from /api/advanced-search (lib/shadowpos.ts),
  // at least 20 numbered English singles each. All US shops pricing in USD.
  { key: "lotusgamesct", name: "Lotus Games (Colchester)", base: "https://lotusgamesltd.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "haikugaming", name: "Haiku Gaming", base: "https://haikugaming.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "evolutiongamestx", name: "Evolution Games", base: "https://evolutiontcg.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "secondhandsoldiers", name: "Secondhand Soldiers", base: "https://secondhandsoldiers.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "jjaspertcg", name: "Jumping Jasper", base: "https://jjaspertcg.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "thecleverkobold", name: "The Clever Kobold", base: "https://thecleverkobold.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "darksidegames", name: "Darkside Games", base: "https://darksidegames.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "littlespectacles", name: "Little Spectacles", base: "https://littlespectacles.shop", country: "US", collections: [], platform: "shadowpos" },
  { key: "millerscomics", name: "Miller's Comics, Cards, Collectibles", base: "https://millersccct.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "theorcslair", name: "The Orc's Lair", base: "https://theorcslair.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "spellboundtx", name: "Spellbound Cards & Games", base: "https://spellboundtx.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "feisgames", name: "Fei's Games", base: "https://feisgames.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "metatcg", name: "Meta TCG", base: "https://metatcg.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "gameandcompany", name: "Game & Company", base: "https://gameandcompany.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "paradisehobbies", name: "Paradise Hobbies", base: "https://paradisehobbiesllc.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "animalhousecards", name: "Animal House Cards", base: "https://animalhousecards.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "primalcards", name: "Primal Cards & Collectables", base: "https://primalcards.net", country: "US", collections: [], platform: "shadowpos" },
  { key: "showdownvalue", name: "Showdown Value Cards & Games", base: "https://showdownvaluecardsandgames.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "divinegamez", name: "Divine Gamez", base: "https://divinegamez.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "cardquestlgs", name: "Card Quest", base: "https://cardquestlgs.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "ahruston", name: "A&H Ruston", base: "https://ruston.ah.games", country: "US", collections: [], platform: "shadowpos" },
  { key: "collectem", name: "Collect'eM Card & Hobby", base: "https://collect-em.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "gamefellas", name: "Gamefellas", base: "https://gamefellastcgandgames.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "superheroesnewnan", name: "Super Heroes Comics Cards and Games", base: "https://summitgames.gg", country: "US", collections: [], platform: "shadowpos" },
  { key: "sealedrelics", name: "Sealed Relics", base: "https://sealedrelics.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "koboldskeep", name: "Kobold's Keep", base: "https://koboldskeep.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "reddhill", name: "Reddhill Games & Electronics", base: "https://reddhill.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "vossmedia", name: "Voss Media Board Game Cafe", base: "https://vossmediastore.com", country: "US", collections: [], platform: "shadowpos" },
  { key: "lotusgamesmt", name: "Lotus Games (Kalispell)", base: "https://lotusgames.shop", country: "US", collections: [], platform: "shadowpos" },
  { key: "blackmanamarket", name: "Black Mana Market", base: "https://blackmanamarket.com", country: "US", collections: [], platform: "shadowpos" },
  // ── Other platforms, verified 2026-10-03, each read from a public listing a
  // shopper or the storefront itself uses (see each reader's header).
  { key: "mightytoys", name: "Mighty Toys", base: "https://mightytoys.com.au", country: "AU", collections: ["147798763"], platform: "ecwid", ecwidStoreId: 14194057 },
  { key: "grandjgames", name: "Grand J Games", base: "https://grandjgames.com", country: "AU", collections: ["/tcgs/one-piece/one-piece-singles/"], platform: "bigcommerce" },
];

/** Every store, with `policyUrl` filled where the store's policy page was verified. */
export const STORES: StoreInfo[] = RAW_STORES.map((s) => (POLICY_VERIFIED.has(s.key) ? { ...s, policyUrl: `${s.base}/policies/shipping-policy` } : s));

export const STORE_BY_KEY: Record<string, StoreInfo> = Object.fromEntries(STORES.map((s) => [s.key, s]));

export function storesIn(country: Country): StoreInfo[] {
  return STORES.filter((s) => s.country === country);
}

/** A row every "N stores" count counts: each tracked store and TCGplayer (as
 *  RiftCompare counts every in-stock seller in the comparison), never eBay
 *  (CLAUDE.md: eBay rows are never counted as a store). */
export function isStoreSource(source: string): boolean {
  return !source.startsWith("ebay");
}

/** "store:cherry" → the store; "tcgplayer" → null. */
export function storeForSource(source: string): StoreInfo | null {
  return source.startsWith("store:") ? STORE_BY_KEY[source.slice(6)] ?? null : null;
}

/** eBay rows: `ebay` is the market's own eBay; `ebay_us` is a CA row derived from the US search. */
export function isEbaySource(source: string): boolean {
  return source === "ebay" || source === "ebay_us";
}

const EBAY_SITE_LABEL: Record<Country, string> = { US: "eBay", AU: "eBay Australia", UK: "eBay UK", SG: "eBay", CA: "eBay Canada", EU: "eBay Spain" };

export function sourceLabel(source: string, market?: string): string {
  if (source === "tcgplayer") return "TCGplayer";
  if (source === "ebay_us") return "eBay US";
  if (source === "ebay") return EBAY_SITE_LABEL[market as Country] ?? "eBay";
  return storeForSource(source)?.name ?? source.replace(/^store:/, "");
}
