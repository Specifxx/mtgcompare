// English Pokémon TCG sets whose sealed product DexCompare groups by set.
// Newest first. Derived from the pokemontcg.io set catalogue the old DexCompare
// shipped (XY onward), minus the sub-sets that never have sealed product of
// their own (trainer/galarian galleries, shiny vaults, promos, McDonald's).
//
// ADDING A SET: add an entry at the top. `slug` is the URL (/au/sets/<slug>)
// and must never change once live. If a store titles the set some other way,
// add an `aliases` regex source. Nothing else needs editing — products group
// under the new set on the next import.
//
// `generic` marks a set whose name is also its SERIES name ("Scarlet &
// Violet", "Mega Evolution"). Stores prefix every set in a series with it
// ("Scarlet & Violet—Surging Sparks Elite Trainer Box"), so a generic set only
// matches when no other set does. See detectSet() in sealed-title.ts.

export interface PokemonSet {
  code: string;
  name: string;
  slug: string;
  series: string;
  releaseDate: string; // YYYY-MM-DD
  logo: string | null;
  generic?: boolean;
  aliases?: string[]; // extra regex sources (case-insensitive)
  // The set was never sold as a 36-pack booster box (the ".5" and special sets:
  // ETBs, bundles and collections only). A "Booster Box" or "36 Pack Bundle" of
  // it is a store-made lot, refused by identify(). Checked against TCGplayer's
  // catalogue on 2026-09-28: it lists no booster box (or case) for any of them.
  noBoosterBox?: boolean;
}

export const SETS: PokemonSet[] = [
  // Added by hand (newer than the pokemontcg.io export the list came from).
  // Dates from Bulbapedia's set pages, read 2026-09-25.
  {"code":"me6","name":"Delta Reign","slug":"delta-reign","series":"Mega Evolution","releaseDate":"2026-11-06","logo":null},
  {"code":"cel30","name":"30th Celebration","slug":"30th-celebration","series":"Mega Evolution","releaseDate":"2026-09-16","logo":null},
  {"code":"me5","name":"Pitch Black","slug":"pitch-black","series":"Mega Evolution","releaseDate":"2026-07-17","logo":null},
  {"code":"me4","name":"Chaos Rising","slug":"chaos-rising","series":"Mega Evolution","releaseDate":"2026-05-22","logo":"https://images.scrydex.com/pokemon/me4-logo/logo"},
  {"code":"me3","name":"Perfect Order","slug":"perfect-order","series":"Mega Evolution","releaseDate":"2026-03-27","logo":"https://images.scrydex.com/pokemon/me3-logo/logo"},
  {"code":"me2pt5","name":"Ascended Heroes","slug":"ascended-heroes","series":"Mega Evolution","releaseDate":"2026-01-30","logo":"https://images.scrydex.com/pokemon/me2pt5-logo/logo"},
  {"code":"me2","name":"Phantasmal Flames","slug":"phantasmal-flames","series":"Mega Evolution","releaseDate":"2025-11-14","logo":"https://images.pokemontcg.io/me2/logo.png"},
  {"code":"me1","name":"Mega Evolution","slug":"mega-evolution","series":"Mega Evolution","releaseDate":"2025-09-26","logo":"https://images.pokemontcg.io/me1/logo.png","generic":true},
  {"code":"zsv10pt5","name":"Black Bolt","slug":"black-bolt","series":"Scarlet & Violet","releaseDate":"2025-07-18","logo":"https://images.pokemontcg.io/zsv10pt5/logo.png"},
  {"code":"rsv10pt5","name":"White Flare","slug":"white-flare","series":"Scarlet & Violet","releaseDate":"2025-07-18","logo":"https://images.pokemontcg.io/rsv10pt5/logo.png"},
  {"code":"sv10","name":"Destined Rivals","slug":"destined-rivals","series":"Scarlet & Violet","releaseDate":"2025-05-30","logo":"https://images.pokemontcg.io/sv10/logo.png"},
  {"code":"sv9","name":"Journey Together","slug":"journey-together","series":"Scarlet & Violet","releaseDate":"2025-03-28","logo":"https://images.pokemontcg.io/sv9/logo.png"},
  {"code":"sv8pt5","name":"Prismatic Evolutions","slug":"prismatic-evolutions","series":"Scarlet & Violet","releaseDate":"2025-01-17","logo":"https://images.pokemontcg.io/sv8pt5/logo.png"},
  {"code":"sv8","name":"Surging Sparks","slug":"surging-sparks","series":"Scarlet & Violet","releaseDate":"2024-11-08","logo":"https://images.pokemontcg.io/sv8/logo.png"},
  {"code":"sv7","name":"Stellar Crown","slug":"stellar-crown","series":"Scarlet & Violet","releaseDate":"2024-09-13","logo":"https://images.pokemontcg.io/sv7/logo.png"},
  {"code":"sv6pt5","name":"Shrouded Fable","slug":"shrouded-fable","series":"Scarlet & Violet","releaseDate":"2024-08-02","logo":"https://images.pokemontcg.io/sv6pt5/logo.png"},
  {"code":"sv6","name":"Twilight Masquerade","slug":"twilight-masquerade","series":"Scarlet & Violet","releaseDate":"2024-05-24","logo":"https://images.pokemontcg.io/sv6/logo.png"},
  {"code":"sv5","name":"Temporal Forces","slug":"temporal-forces","series":"Scarlet & Violet","releaseDate":"2024-03-22","logo":"https://images.pokemontcg.io/sv5/logo.png"},
  {"code":"sv4pt5","name":"Paldean Fates","slug":"paldean-fates","series":"Scarlet & Violet","releaseDate":"2024-01-26","logo":"https://images.pokemontcg.io/sv4pt5/logo.png"},
  {"code":"sv4","name":"Paradox Rift","slug":"paradox-rift","series":"Scarlet & Violet","releaseDate":"2023-11-03","logo":"https://images.pokemontcg.io/sv4/logo.png"},
  {"code":"sv3pt5","name":"Scarlet & Violet 151","slug":"scarlet-violet-151","series":"Scarlet & Violet","releaseDate":"2023-09-22","logo":"https://images.pokemontcg.io/sv3pt5/logo.png"},
  {"code":"sv3","name":"Obsidian Flames","slug":"obsidian-flames","series":"Scarlet & Violet","releaseDate":"2023-08-11","logo":"https://images.pokemontcg.io/sv3/logo.png"},
  {"code":"sv2","name":"Paldea Evolved","slug":"paldea-evolved","series":"Scarlet & Violet","releaseDate":"2023-06-09","logo":"https://images.pokemontcg.io/sv2/logo.png"},
  {"code":"sv1","name":"Scarlet & Violet","slug":"scarlet-violet","series":"Scarlet & Violet","releaseDate":"2023-03-31","logo":"https://images.pokemontcg.io/sv1/logo.png","generic":true},
  {"code":"swsh12pt5","name":"Crown Zenith","slug":"crown-zenith","series":"Sword & Shield","releaseDate":"2023-01-20","logo":"https://images.pokemontcg.io/swsh12pt5/logo.png"},
  {"code":"swsh12","name":"Silver Tempest","slug":"silver-tempest","series":"Sword & Shield","releaseDate":"2022-11-11","logo":"https://images.pokemontcg.io/swsh12/logo.png"},
  {"code":"swsh11","name":"Lost Origin","slug":"lost-origin","series":"Sword & Shield","releaseDate":"2022-09-09","logo":"https://images.pokemontcg.io/swsh11/logo.png"},
  {"code":"pgo","name":"Pokémon GO","slug":"pokemon-go","series":"Sword & Shield","releaseDate":"2022-07-01","logo":"https://images.pokemontcg.io/pgo/logo.png"},
  {"code":"swsh10","name":"Astral Radiance","slug":"astral-radiance","series":"Sword & Shield","releaseDate":"2022-05-27","logo":"https://images.pokemontcg.io/swsh10/logo.png"},
  {"code":"swsh9","name":"Brilliant Stars","slug":"brilliant-stars","series":"Sword & Shield","releaseDate":"2022-02-25","logo":"https://images.pokemontcg.io/swsh9/logo.png"},
  {"code":"swsh8","name":"Fusion Strike","slug":"fusion-strike","series":"Sword & Shield","releaseDate":"2021-11-12","logo":"https://images.pokemontcg.io/swsh8/logo.png"},
  {"code":"cel25","name":"Celebrations","slug":"celebrations","series":"Sword & Shield","releaseDate":"2021-10-08","logo":"https://images.pokemontcg.io/cel25/logo.png"},
  {"code":"swsh7","name":"Evolving Skies","slug":"evolving-skies","series":"Sword & Shield","releaseDate":"2021-08-27","logo":"https://images.pokemontcg.io/swsh7/logo.png"},
  {"code":"swsh6","name":"Chilling Reign","slug":"chilling-reign","series":"Sword & Shield","releaseDate":"2021-06-18","logo":"https://images.pokemontcg.io/swsh6/logo.png"},
  {"code":"swsh5","name":"Battle Styles","slug":"battle-styles","series":"Sword & Shield","releaseDate":"2021-03-19","logo":"https://images.pokemontcg.io/swsh5/logo.png"},
  {"code":"swsh45","name":"Shining Fates","slug":"shining-fates","series":"Sword & Shield","releaseDate":"2021-02-19","logo":"https://images.pokemontcg.io/swsh45/logo.png"},
  {"code":"swsh4","name":"Vivid Voltage","slug":"vivid-voltage","series":"Sword & Shield","releaseDate":"2020-11-13","logo":"https://images.pokemontcg.io/swsh4/logo.png"},
  {"code":"swsh35","name":"Champion's Path","slug":"champion-s-path","series":"Sword & Shield","releaseDate":"2020-09-25","logo":"https://images.pokemontcg.io/swsh35/logo.png"},
  {"code":"swsh3","name":"Darkness Ablaze","slug":"darkness-ablaze","series":"Sword & Shield","releaseDate":"2020-08-14","logo":"https://images.pokemontcg.io/swsh3/logo.png"},
  {"code":"swsh2","name":"Rebel Clash","slug":"rebel-clash","series":"Sword & Shield","releaseDate":"2020-05-01","logo":"https://images.pokemontcg.io/swsh2/logo.png"},
  {"code":"swsh1","name":"Sword & Shield","slug":"sword-shield","series":"Sword & Shield","releaseDate":"2020-02-07","logo":"https://images.pokemontcg.io/swsh1/logo.png","generic":true},
  {"code":"sm12","name":"Cosmic Eclipse","slug":"cosmic-eclipse","series":"Sun & Moon","releaseDate":"2019-11-01","logo":"https://images.pokemontcg.io/sm12/logo.png"},
  {"code":"sm115","name":"Hidden Fates","slug":"hidden-fates","series":"Sun & Moon","releaseDate":"2019-08-23","logo":"https://images.pokemontcg.io/sm115/logo.png"},
  {"code":"sm11","name":"Unified Minds","slug":"unified-minds","series":"Sun & Moon","releaseDate":"2019-08-02","logo":"https://images.pokemontcg.io/sm11/logo.png"},
  {"code":"sm10","name":"Unbroken Bonds","slug":"unbroken-bonds","series":"Sun & Moon","releaseDate":"2019-05-03","logo":"https://images.pokemontcg.io/sm10/logo.png"},
  {"code":"det1","name":"Detective Pikachu","slug":"detective-pikachu","series":"Sun & Moon","releaseDate":"2019-04-05","logo":"https://images.pokemontcg.io/det1/logo.png"},
  {"code":"sm9","name":"Team Up","slug":"team-up","series":"Sun & Moon","releaseDate":"2019-02-01","logo":"https://images.pokemontcg.io/sm9/logo.png"},
  {"code":"sm8","name":"Lost Thunder","slug":"lost-thunder","series":"Sun & Moon","releaseDate":"2018-11-02","logo":"https://images.pokemontcg.io/sm8/logo.png"},
  {"code":"sm75","name":"Dragon Majesty","slug":"dragon-majesty","series":"Sun & Moon","releaseDate":"2018-09-07","logo":"https://images.pokemontcg.io/sm75/logo.png"},
  {"code":"sm7","name":"Celestial Storm","slug":"celestial-storm","series":"Sun & Moon","releaseDate":"2018-08-03","logo":"https://images.pokemontcg.io/sm7/logo.png"},
  {"code":"sm6","name":"Forbidden Light","slug":"forbidden-light","series":"Sun & Moon","releaseDate":"2018-05-04","logo":"https://images.pokemontcg.io/sm6/logo.png"},
  {"code":"sm5","name":"Ultra Prism","slug":"ultra-prism","series":"Sun & Moon","releaseDate":"2018-02-02","logo":"https://images.pokemontcg.io/sm5/logo.png"},
  {"code":"sm4","name":"Crimson Invasion","slug":"crimson-invasion","series":"Sun & Moon","releaseDate":"2017-11-03","logo":"https://images.pokemontcg.io/sm4/logo.png"},
  {"code":"sm35","name":"Shining Legends","slug":"shining-legends","series":"Sun & Moon","releaseDate":"2017-10-06","logo":"https://images.pokemontcg.io/sm35/logo.png"},
  {"code":"sm3","name":"Burning Shadows","slug":"burning-shadows","series":"Sun & Moon","releaseDate":"2017-08-05","logo":"https://images.pokemontcg.io/sm3/logo.png"},
  {"code":"sm2","name":"Guardians Rising","slug":"guardians-rising","series":"Sun & Moon","releaseDate":"2017-05-05","logo":"https://images.pokemontcg.io/sm2/logo.png"},
  {"code":"sm1","name":"Sun & Moon","slug":"sun-moon","series":"Sun & Moon","releaseDate":"2017-02-03","logo":"https://images.pokemontcg.io/sm1/logo.png","generic":true},
  {"code":"xy12","name":"Evolutions","slug":"evolutions","series":"XY","releaseDate":"2016-11-02","logo":"https://images.pokemontcg.io/xy12/logo.png"},
  {"code":"xy11","name":"Steam Siege","slug":"steam-siege","series":"XY","releaseDate":"2016-08-03","logo":"https://images.pokemontcg.io/xy11/logo.png"},
  {"code":"xy10","name":"Fates Collide","slug":"fates-collide","series":"XY","releaseDate":"2016-05-02","logo":"https://images.pokemontcg.io/xy10/logo.png"},
  {"code":"g1","name":"Generations","slug":"generations","series":"XY","releaseDate":"2016-02-22","logo":"https://images.pokemontcg.io/g1/logo.png"},
  {"code":"xy9","name":"BREAKpoint","slug":"breakpoint","series":"XY","releaseDate":"2016-02-03","logo":"https://images.pokemontcg.io/xy9/logo.png"},
  {"code":"xy8","name":"BREAKthrough","slug":"breakthrough","series":"XY","releaseDate":"2015-11-04","logo":"https://images.pokemontcg.io/xy8/logo.png"},
  {"code":"xy7","name":"Ancient Origins","slug":"ancient-origins","series":"XY","releaseDate":"2015-08-12","logo":"https://images.pokemontcg.io/xy7/logo.png"},
  {"code":"xy6","name":"Roaring Skies","slug":"roaring-skies","series":"XY","releaseDate":"2015-05-06","logo":"https://images.pokemontcg.io/xy6/logo.png"},
  {"code":"xy5","name":"Primal Clash","slug":"primal-clash","series":"XY","releaseDate":"2015-02-04","logo":"https://images.pokemontcg.io/xy5/logo.png"},
  {"code":"xy4","name":"Phantom Forces","slug":"phantom-forces","series":"XY","releaseDate":"2014-11-05","logo":"https://images.pokemontcg.io/xy4/logo.png"},
  {"code":"xy3","name":"Furious Fists","slug":"furious-fists","series":"XY","releaseDate":"2014-08-13","logo":"https://images.pokemontcg.io/xy3/logo.png"},
  {"code":"xy2","name":"Flashfire","slug":"flashfire","series":"XY","releaseDate":"2014-05-07","logo":"https://images.pokemontcg.io/xy2/logo.png"},
  {"code":"xy1","name":"XY","slug":"xy","series":"XY","releaseDate":"2014-02-05","logo":"https://images.pokemontcg.io/xy1/logo.png","generic":true},
];

// Sets sold without a booster box (see PokemonSet.noBoosterBox).
const NO_BOOSTER_BOX = ["cel30", "me2pt5", "sv8pt5", "sv6pt5", "sv4pt5", "sv3pt5", "swsh12pt5", "pgo", "cel25", "swsh45", "swsh35", "sm115", "sm75", "sm35", "det1", "g1"];
for (const s of SETS) if (NO_BOOSTER_BOX.includes(s.code)) s.noBoosterBox = true;

// Title spellings the plain set name doesn't cover.
const ALIASES: Record<string, string[]> = {
  // "151" alone is a number; only accept it where it can't be a collector
  // number ("/151", "151/165") or a count ("151 cards").
  sv3pt5: ["(?<![\\d/.])151(?![\\d/]|\\s*cards?)"],
  sv1: ["scarlet\\s*(?:&|and)\\s*violet\\s*base(?:\\s*set)?"],
  swsh35: ["champions?[’']?s?\\s*path"],
  // Store misspellings seen in the 2026-09 import: "Shinning Fates", "Guardian Rising".
  swsh45: ["shin+ing\\s*fates"],
  sm2: ["guardian'?s?\\s*rising"],
  // "Stella Crown Booster pack" (Beaches TCG, 2026-10-19; its photo is the English pack). Japan's set is
  // Stellar Miracle, and a Japanese listing is refused as foreign before the set is read.
  sv7: ["\\bstella\\s*crown\\b"],
  pgo: ["pok[eé]mon\\s*go\\b"],
  cel25: ["25th\\s*anniversary"],
  // Stores also write it "30th Celebrations", which must not read as
  // Celebrations (cel25, 2021). Longer names are tried first, so this wins.
  cel30: ["30th\\s*anniversary\\s*celebration", "\\bpokemon\\s*30th\\s*anniversary\\b", "\\b30th[\\s:\\-]*celebrations\\b"],
  g1: ["\\bgenerations\\b"],
  xy9: ["break\\s*point"],
  xy8: ["break\\s*through"],
  // "XY" alone is also the series (every XY-era set is "XY - Flashfire"), so the
  // base set only reads from "XY Base Set", "XY Booster Box", "XY Elite Trainer Box".
  xy1: ["\\bxy\\s*[:\\-]?\\s*\\(?\\s*(?:base\\s*set|booster|elite)"],
};
for (const s of SETS) if (ALIASES[s.code]) s.aliases = ALIASES[s.code];

export const SET_BY_CODE = new Map(SETS.map((s) => [s.code, s]));
export const SET_BY_SLUG = new Map(SETS.map((s) => [s.slug, s]));

export const SERIES_ORDER = ["Mega Evolution", "Scarlet & Violet", "Sword & Shield", "Sun & Moon", "XY", "Special"];
