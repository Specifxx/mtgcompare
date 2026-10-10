// The eBay plan (src/lib/ebay-plan.ts): the build-enforced quota model. Names, values and EDHREC ranks are REAL: 666 Oracle names with a best-printing TCGplayer market of US$10 or more on
// 2026-10-07 (the dearest 120, every twelfth name below them, and Lightning Bolt, Sol Ring, Counterspell and The One Ring).
// Row: [name, best market in USD, EDHREC rank, Reserved List, has chase printings, newest printing].
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BREAKER_CONSECUTIVE, BANNER_ONLY_RUN_CAP, DEFAULT_EBAY_CONFIG, EBAY_CRONS, EBAY_MARKETS, FailureBreaker, MAIN_CRON, SEALED_MARKETS, SINGLES_MARKETS, TIER, allocate, bannerDailyCost, classAllowance, combineQueries,
  comparePairs, duePairs, ebayConfigFromEnv, ebayRunVerdict, envBool, envInt, intervalHours, isDue, pairKey, pairWrite, parseOnlyMarket, planRun, popularityOf, purposeOfSchedule, scoreOf, sealedEligible,
  sealedPop, singleCost, type EbayConfig, type Pair, type TierCode, type Unit,
} from "../src/lib/ebay-plan";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const NAMES: [string, number, number | null, number, number, string][] = [
  ["Living Artifact",203067.7,29123,0,0,"2022-11-28"],
  ["Cloud, Midgar Mercenary",69999.99,1566,0,1,"2025-12-05"],
  ["Viscera Seer",25000.0,257,0,1,"2026-04-24"],
  ["Smaug the Magnificent",24500.0,3750,0,1,"2026-08-14"],
  ["Gandalf the White",20000.0,2692,0,1,"2023-11-03"],
  ["Gemstone Caverns",20000.0,180,0,1,"2025-08-01"],
  ["Black Lotus",18149.99,null,1,0,"2022-11-28"],
  ["Bloodline Recollector // Ancestral Craving",15000.0,15005,0,1,"2026-10-02"],
  ["Shadowspear",15000.0,307,0,1,"2026-03-06"],
  ["Volcanic Island",13000.0,337,1,0,"2022-11-28"],
  ["Ancestral Recall",9959.99,null,1,0,"2022-11-28"],
  ["Quicksilver, Brash Blur",9950.0,14729,0,0,"2026-07-17"],
  ["Mox Jet",9000.0,null,1,0,"2022-11-28"],
  ["Timetwister",8500.0,3548,1,0,"2022-11-28"],
  ["Dragon's Rage Channeler",7699.99,1851,0,1,"2025-04-28"],
  ["Mox Emerald",7500.0,null,1,0,"2022-11-28"],
  ["Mox Sapphire",6250.0,null,1,0,"2022-11-28"],
  ["Badlands",6049.99,380,1,0,"2022-11-28"],
  ["Bayou",6000.0,425,1,0,"2022-11-28"],
  ["Cabal Coffers",6000.0,198,0,1,"2024-08-02"],
  ["The Ozolith",6000.0,303,0,1,"2024-11-04"],
  ["Time Walk",5719.99,null,1,0,"2022-11-28"],
  ["Lightning Bolt",5421.36,157,0,1,"2026-10-02"],
  ["Tropical Island",4999.99,352,1,0,"2022-11-28"],
  ["Tifa Lockhart",4994.97,2652,0,1,"2025-12-05"],
  ["Cavern of Souls",4900.0,111,0,1,"2023-11-17"],
  ["Avatar Aang // Aang, Master of Elements",4815.78,6913,0,1,"2025-11-21"],
  ["Chaos Orb",4499.99,null,1,0,"2022-11-28"],
  ["Mox Ruby",4396.99,null,1,0,"2022-11-28"],
  ["Firesong and Sunspeaker",4206.9,11760,0,1,"2023-04-21"],
  ["Kozilek's Command",4000.0,2083,0,1,"2026-09-11"],
  ["Gaea's Cradle",3999.0,447,1,0,"1999-08-04"],
  ["Bitterbloom Bearer",3997.0,1872,0,1,"2026-01-23"],
  ["Birds of Paradise",3980.75,35,0,1,"2026-10-02"],
  ["Aerith Gainsborough",3860.0,2113,0,1,"2025-06-13"],
  ["Mishra's Workshop",3699.99,3726,1,0,"1994-03-04"],
  ["Mox Pearl",3513.33,null,1,0,"2022-11-28"],
  ["Savannah",3499.49,456,1,0,"2022-11-28"],
  ["Grim Monolith",3483.66,672,1,0,"2000-08-02"],
  ["Shinka, the Bloodsoaked Keep",3299.99,1959,0,1,"2023-06-23"],
  ["Hallowed Fountain",3266.66,61,0,1,"2026-01-23"],
  ["The Tabernacle at Pendrell Vale",3239.0,8873,1,0,"1994-06-01"],
  ["Meekstone",3194.4,2817,0,0,"2024-08-02"],
  ["Sheoldred // The True Scriptures",3165.46,2003,0,1,"2023-04-21"],
  ["Copy Artifact",3049.5,4093,1,0,"2022-11-28"],
  ["Leonardo, Sewer Samurai",3002.3,13821,0,1,"2026-03-06"],
  ["Tinker",3000.0,null,0,0,"2024-10-12"],
  ["Unstoppable Slasher",3000.0,1558,0,0,"2026-03-15"],
  ["Emrakul, the World Anew",2999.99,2439,0,1,"2024-06-14"],
  ["Time Vault",2949.99,null,1,0,"2022-11-28"],
  ["Emeritus of Ideation // Ancestral Recall",2900.0,5585,0,1,"2026-04-24"],
  ["Candelabra of Tawnos",2850.0,6541,1,0,"1994-03-04"],
  ["Edgar Markov",2825.0,3161,0,1,"2025-01-24"],
  ["Mox Jasper",2824.99,2511,0,1,"2025-04-11"],
  ["Wheel of Fortune",2800.0,576,1,0,"2022-11-28"],
  ["Jayemdae Tome",2775.0,20094,0,0,"2022-11-28"],
  ["Nevinyrral's Disk",2775.0,2026,0,0,"2026-10-02"],
  ["Mana Vault",2708.56,152,0,1,"2024-04-08"],
  ["Karakas",2700.0,null,0,1,"2023-06-23"],
  ["Mahamoti Djinn",2676.08,25586,0,0,"2022-11-28"],
  ["Plateau",2624.99,443,1,0,"2022-11-28"],
  ["Scrubland",2500.0,387,1,0,"2022-11-28"],
  ["Homeward Path",2499.99,1190,0,1,"2026-07-27"],
  ["Shivan Dragon",2499.99,11144,0,1,"2026-08-31"],
  ["Michelangelo, Improviser",2483.32,10572,0,1,"2026-03-06"],
  ["Jace, the Mind Sculptor",2400.0,3365,0,1,"2024-08-02"],
  ["Fastbond",2389.0,null,1,0,"2022-11-28"],
  ["Ulamog, the Defiler",2334.99,1565,0,1,"2024-06-14"],
  ["Donatello, Mutant Mechanic",2233.83,13152,0,1,"2026-03-06"],
  ["Elsewhere Flask",2121.0,11858,0,1,"2022-11-18"],
  ["Juzám Djinn",2113.5,27706,1,0,"1993-12-17"],
  ["Vesuvan Doppelganger",2100.0,17445,1,0,"2022-11-28"],
  ["Breeding Pool",2000.0,59,0,1,"2025-08-01"],
  ["Krenko, Mob Boss",2000.0,1089,0,1,"2026-05-18"],
  ["Raphael, Ninja Destroyer",2000.0,14515,0,1,"2026-03-06"],
  ["Steam Vents",2000.0,63,0,1,"2026-01-23"],
  ["Winter Orb",2000.0,3423,0,0,"2026-02-23"],
  ["Taiga",1990.0,435,1,0,"2022-11-28"],
  ["Survival of the Fittest",1981.99,2364,1,0,"2009-01-01"],
  ["Library of Alexandria",1963.22,null,1,0,"1993-12-17"],
  ["Raging River",1936.0,20684,1,0,"2022-11-28"],
  ["Traveling Chocobo",1920.35,1884,0,1,"2025-12-05"],
  ["Godless Shrine",1920.0,60,0,1,"2025-08-01"],
  ["Bazaar of Baghdad",1900.49,10535,1,0,"1993-12-17"],
  ["Final Fortune",1888.88,1531,0,0,"2025-02-10"],
  ["The Aetherspark",1875.0,1834,0,1,"2025-02-14"],
  ["Contract from Below",1872.5,null,1,0,"1994-04-11"],
  ["Stasis",1869.99,7844,0,0,"2022-11-28"],
  ["The Soul Stone",1844.74,891,0,1,"2025-09-26"],
  ["Intuition",1817.26,2025,1,0,"2003-01-01"],
  ["Unwinding Clock",1800.0,547,0,1,"2022-11-18"],
  ["Smothering Tithe",1760.07,65,0,1,"2025-03-30"],
  ["Earthquake",1759.99,2890,0,0,"2026-06-15"],
  ["The One Ring",1753.06,96,0,1,"2026-08-14"],
  ["Snapcaster Mage",1742.95,1444,0,1,"2025-12-05"],
  ["Mox Diamond",1727.44,247,1,0,"2010-08-27"],
  ["Super Shredder",1710.66,5145,0,1,"2026-03-06"],
  ["Ajani Goldmane",1700.0,10340,0,1,"2023-09-15"],
  ["Wrath of God",1700.0,681,0,1,"2023-08-04"],
  ["Gauntlet of Might",1699.99,12385,1,0,"2022-11-28"],
  ["Balance",1699.69,null,0,0,"2024-08-02"],
  ["Word of Command",1679.65,19329,1,0,"2022-11-28"],
  ["The Mind Stone",1651.65,3719,0,1,"2026-06-26"],
  ["Sol Ring",1578.48,1,0,1,"2026-10-02"],
  ["Kozilek, the Broken Reality",1574.99,2472,0,1,"2024-06-14"],
  ["Rhystic Study",1548.75,46,0,1,"2025-06-13"],
  ["Rishadan Port",1500.82,14649,0,0,"2024-08-02"],
  ["Quicksilver Amulet",1500.0,4076,0,1,"2022-11-18"],
  ["The Tenth Doctor",1500.0,6690,0,1,"2023-10-13"],
  ["City of Brass",1499.99,95,0,1,"2026-03-06"],
  ["Call Up Emrakul to Help",1499.01,null,0,0,"2023-02-17"],
  ["Tundra",1494.91,350,1,0,"2022-11-28"],
  ["Ms. Bumbleflower",1442.22,3189,0,1,"2024-08-02"],
  ["Nightmare",1399.99,14161,0,0,"2022-11-28"],
  ["Island",1399.89,null,0,1,"2026-10-02"],
  ["Mana Crypt",1394.0,null,0,1,"2023-11-17"],
  ["Yawgmoth's Will",1386.0,2619,1,0,"2007-01-01"],
  ["Royal Assassin",1380.0,2286,0,0,"2024-07-05"],
  ["Sothera, the Supervoid",1355.63,4956,0,1,"2025-08-01"],
  ["Polluted Delta",1350.0,36,0,1,"2024-06-14"],
  ["Indominus Rex, Alpha",1318.5,10342,0,1,"2023-11-17"],
  ["Jade Monolith",1200.0,16940,0,0,"2022-11-28"],
  ["The Ninth Doctor",1000.25,7105,0,1,"2023-10-13"],
  ["Forcefield",950.0,17468,1,0,"2022-11-28"],
  ["Counterspell",919.92,16,0,1,"2026-10-02"],
  ["Merfolk of the Pearl Trident",850.0,25789,0,1,"2024-08-02"],
  ["Liliana Vess",799.99,4796,0,1,"2026-05-08"],
  ["Helm of Chatzuk",750.0,19176,0,0,"2022-11-28"],
  ["Ayara, First of Locthwain",699.99,843,0,1,"2026-10-02"],
  ["Swords to Plowshares",688.3,11,0,1,"2026-10-02"],
  ["Mishra's Bauble",650.0,1107,0,1,"2025-04-28"],
  ["Urabrask the Hidden",600.16,1787,0,1,"2023-04-21"],
  ["Diabolic Intent",594.66,274,0,1,"2026-08-17"],
  ["Berserk",550.0,3456,0,0,"2026-04-24"],
  ["All Hallow's Eve",547.12,21280,1,0,"1994-06-01"],
  ["Fire Lord Zuko",512.04,5773,0,1,"2025-11-21"],
  ["Drain Power",499.99,16469,0,0,"2022-11-28"],
  ["Hazel of the Rootbloom",485.85,3166,0,1,"2024-08-02"],
  ["Shahrazad",475.0,null,1,0,"1993-12-17"],
  ["Natural Selection",458.79,28415,1,0,"2022-11-28"],
  ["Wurmcoil Engine",450.0,1069,0,1,"2025-09-26"],
  ["Treachery",426.3,8042,1,0,"1999-06-07"],
  ["Scrap Trawler",412.0,872,0,1,"2023-04-21"],
  ["Daze",400.0,3011,0,0,"2026-04-24"],
  ["Staff of Domination",399.99,1031,0,1,"2022-11-18"],
  ["Psychosis Crawler",390.0,434,0,1,"2026-10-02"],
  ["Quietus Spike",379.99,2778,0,1,"2022-11-18"],
  ["Instill Energy",375.0,5164,0,0,"2022-11-28"],
  ["Fungusaur",369.99,23664,0,0,"2022-11-28"],
  ["Sword of Feast and Famine",359.03,543,0,1,"2024-07-05"],
  ["Sword of the Meek",350.0,7399,0,1,"2024-08-02"],
  ["Terra, Herald of Hope",345.92,5253,0,1,"2025-06-13"],
  ["Life Finds a Way",335.0,8024,0,1,"2023-11-17"],
  ["Craterhoof Behemoth",325.42,297,0,1,"2025-04-11"],
  ["The Hive",315.0,25819,0,0,"2022-11-28"],
  ["Blitzwing, Cruel Tormentor // Blitzwing, Adaptive Assailant",299.99,8419,0,1,"2022-11-18"],
  ["Nether Shadow",296.0,22013,0,0,"2022-11-28"],
  ["Ingris Stingerquill",288.9,14723,0,1,"2026-10-02"],
  ["Brain Freeze",277.38,780,0,1,"2026-04-24"],
  ["Soul of Mirrodin",267.49,null,0,0,"2023-02-17"],
  ["Curse-Marred Demon",257.37,18483,0,1,"2026-10-02"],
  ["Righteousness",250.0,16680,0,0,"2022-12-02"],
  ["Enlightened Tutor",247.8,123,0,1,"2025-11-21"],
  ["Foil",239.99,4265,0,0,"2024-08-02"],
  ["Kwende, Pride of Femeref",233.47,10103,0,1,"2023-04-21"],
  ["Karmic Guide",227.18,980,0,0,"2026-04-24"],
  ["The Great Henge",220.98,227,0,1,"2025-11-21"],
  ["Starfield Vocalist",216.33,1850,0,1,"2025-08-01"],
  ["Gilded Drake",211.16,2731,1,0,"1998-10-12"],
  ["Flamewar, Brash Veteran // Flamewar, Streetwise Operative",207.0,13198,0,1,"2022-11-18"],
  ["Kodama's Reach",201.65,37,0,1,"2026-01-23"],
  ["Lord of the Undead",199.99,3497,0,1,"2026-10-02"],
  ["Ratchet, Field Medic // Ratchet, Rescue Racer",198.42,7877,0,1,"2022-11-18"],
  ["Ankh of Mishra",195.0,5019,0,0,"2022-11-28"],
  ["Battlefield Forge",189.97,120,0,1,"2026-10-02"],
  ["Tolarian Academy",184.72,null,1,0,"1998-10-12"],
  ["Deflecting Swat",180.3,74,0,1,"2025-11-21"],
  ["Red Elemental Blast",178.87,449,0,0,"2022-11-28"],
  ["Herald of Eternal Dawn",175.47,4087,0,1,"2026-10-02"],
  ["Seasoned Pyromancer",172.37,10060,0,1,"2024-09-28"],
  ["Caltrops",169.46,5367,0,0,"2001-04-11"],
  ["Zoraline, Cosmos Caller",167.17,9015,0,1,"2024-08-02"],
  ["Aura Shards",164.54,1060,0,1,"2026-06-15"],
  ["Zinnia, Valley's Voice",161.17,7074,0,1,"2024-08-02"],
  ["Chimil, the Inner Sun",158.0,746,0,1,"2026-01-23"],
  ["Culling the Weak",154.29,515,0,1,"2026-04-24"],
  ["King Suleiman",150.53,30179,1,0,"1993-12-17"],
  ["The Disciple of Vess",149.99,null,0,0,"2024-02-24"],
  ["Boseiju, Who Endures",147.37,77,0,1,"2022-02-18"],
  ["Summoner's Pact",143.57,3000,0,0,"2024-08-02"],
  ["Dracogenesis",139.12,2237,0,1,"2025-04-11"],
  ["Volrath's Stronghold",136.49,2816,1,0,"1999-08-04"],
  ["Blood Pet",133.0,2607,0,0,"2021-11-19"],
  ["Thunder Spirit",131.05,30730,1,0,"1994-06-01"],
  ["Unclaimed Cat",129.74,null,0,0,"2023-02-17"],
  ["Ob Nixilis, Captive Kingpin",127.89,4495,0,1,"2023-05-12"],
  ["Seedtime",125.37,10231,0,0,"2024-08-02"],
  ["Rings of Brighthearth",122.65,1418,0,1,"2023-06-23"],
  ["Second Chance",120.0,20670,1,0,"1999-02-15"],
  ["Rise of the Dark Realms",119.03,489,0,1,"2025-06-13"],
  ["Clive, Ifrit's Dominant // Ifrit, Warden of Inferno",116.3,3347,0,1,"2025-06-13"],
  ["Need for Speed",113.98,14221,0,0,"2001-10-01"],
  ["Telepathy",111.99,5472,0,0,"2009-07-17"],
  ["Blood Moon",110.83,1529,0,1,"2025-11-17"],
  ["Equilibrium",109.99,11428,0,0,"2024-08-02"],
  ["Shadow of the Enemy",108.16,10310,0,1,"2026-08-14"],
  ["Nirkana Revenant",107.03,2950,0,0,"2024-07-29"],
  ["Life from the Loam",105.5,712,0,1,"2025-04-11"],
  ["Thousand-Year Elixir",104.18,887,0,1,"2026-01-23"],
  ["Kindred Discovery",102.78,339,0,1,"2026-06-26"],
  ["Paradox Engine",101.13,null,0,0,"2017-01-20"],
  ["Minnea, Planar Tourist",100.0,null,0,0,"2023-05-06"],
  ["Phyrexian Broodstar",99.99,null,0,0,"2023-02-17"],
  ["Deathgrip",99.95,17967,0,0,"2022-11-28"],
  ["Captain N'ghathrod",99.0,4461,0,1,"2025-10-13"],
  ["Planar Bridge",98.43,4535,0,0,"2022-07-08"],
  ["Myrel, Shield of Argive",96.97,1537,0,1,"2025-11-03"],
  ["Sigil of Sleep",95.15,3388,0,0,"2012-03-30"],
  ["Noble Hierarch",94.16,771,0,1,"2024-08-02"],
  ["Shredder, Shadow Master",93.19,5612,0,1,"2026-03-06"],
  ["Counterbalance",92.0,3382,0,1,"2025-07-25"],
  ["Toxrill, the Corrosive",91.0,2336,0,1,"2025-03-24"],
  ["Seton, Krosan Protector",90.0,18762,0,0,"2001-10-01"],
  ["Purify",89.97,25591,0,0,"2001-04-11"],
  ["Leyline of the Void",89.08,3515,0,0,"2024-09-27"],
  ["Emergence Zone",88.18,539,0,0,"2019-05-03"],
  ["Jetfire, Ingenious Scientist // Jetfire, Air Guardian",86.92,11780,0,1,"2022-11-18"],
  ["Delighted Halfling",85.64,149,0,1,"2026-08-14"],
  ["Crystal Rod",84.99,26862,0,0,"2022-11-28"],
  ["Might of Oaks",84.49,15126,0,0,"2009-07-17"],
  ["Seven Dwarves",83.3,11675,0,1,"2025-10-30"],
  ["Baeloth Barrityl, Entertainer",82.34,4282,0,1,"2022-06-10"],
  ["Arena Rector",81.26,8927,0,0,"2026-05-01"],
  ["Mossborn Hydra",80.65,760,0,1,"2026-01-23"],
  ["Mystic Snake",80.0,5864,0,0,"2024-04-19"],
  ["Tyvar, the Pummeler",79.84,2982,0,1,"2024-09-27"],
  ["April O'Neil, Live on the Scene",77.93,10752,0,1,"2026-03-06"],
  ["Witch Enchanter // Witch-Blessed Meadow",76.77,290,0,1,"2026-06-15"],
  ["Huang Zhong, Shu General",75.79,29374,0,0,"1999-05-01"],
  ["Mzed, Mercenary Leader",75.0,null,0,0,"2023-07-29"],
  ["Delina, Wild Mage",74.97,1738,0,0,"2026-09-14"],
  ["Mana Matrix",74.32,23599,1,0,"1994-06-01"],
  ["Humility",73.7,11703,1,0,"1997-10-14"],
  ["Nicol Bolas, Dragon-God",72.87,4053,0,0,"2024-01-12"],
  ["Academy Ruins",71.99,460,0,1,"2025-02-14"],
  ["It That Betrays",71.49,1553,0,0,"2026-06-15"],
  ["Krosan Wayfarer",70.66,10849,0,0,"2002-05-27"],
  ["Across the Multiverse",69.99,null,0,0,"2023-05-06"],
  ["Naturalize the Phyresis",69.76,null,0,0,"2023-02-17"],
  ["Warren Soultrader",68.78,414,0,1,"2026-01-23"],
  ["The First Sliver",68.26,4258,0,1,"2025-02-03"],
  ["Arcanis the Omnipotent",66.99,3020,0,0,"2026-04-24"],
  ["Pyrohemia",66.66,2447,0,0,"2025-10-27"],
  ["Blasting Station",65.89,3478,0,0,"2020-03-13"],
  ["Edward Kenway",65.53,5702,0,1,"2024-07-05"],
  ["Isochron Scepter",64.92,758,0,1,"2025-11-03"],
  ["Keldon Firebombers",63.96,17307,0,0,"2000-06-05"],
  ["Sun Quan, Lord of Wu",63.48,8356,0,1,"2023-08-04"],
  ["Graven Cairns",62.68,553,0,0,"2025-06-13"],
  ["Doctor Doom, Unrivaled",62.3,11089,0,0,"2026-06-26"],
  ["Cao Cao, Lord of Wei",61.76,22629,0,0,"2011-08-26"],
  ["Aphetto Alchemist",61.31,4914,0,0,"2024-08-02"],
  ["Jandor's Saddlebags",60.93,16250,0,0,"2001-04-11"],
  ["Ancestral Memories",60.41,20824,0,0,"2023-06-23"],
  ["The Five Stages of Grief",60.0,null,0,0,"2026-05-01"],
  ["Alpha Deathclaw",59.83,5538,0,1,"2024-03-08"],
  ["Stroke of Genius",59.16,3539,0,0,"2026-04-24"],
  ["Queen Marchesa",58.48,2701,0,1,"2026-06-15"],
  ["Revel in Riches",57.99,1156,0,1,"2024-12-02"],
  ["Nuclear Fallout",57.7,3107,0,1,"2024-03-08"],
  ["Uthros, Titanic Godcore",57.09,1296,0,1,"2025-08-01"],
  ["Exotic Orchard",56.35,9,0,1,"2026-10-02"],
  ["Rancor",55.68,848,0,0,"2026-06-26"],
  ["Saproling Burst",55.31,19234,0,0,"2001-08-08"],
  ["Jareth, Leonine Titan",54.99,11074,0,0,"2018-06-08"],
  ["Meteor Crater",54.69,7034,0,0,"2025-08-01"],
  ["Urza",54.0,null,0,0,"1997-05-01"],
  ["Call Forth the Tempest",53.4,1800,0,1,"2026-08-14"],
  ["Vedalken Shackles",52.91,11803,0,0,"2016-09-30"],
  ["Ezio Auditore da Firenze",52.54,7618,0,1,"2024-07-05"],
  ["Vincent Valentine // Galian Beast",51.92,3421,0,1,"2025-06-13"],
  ["Recruiter of the Guard",51.5,1166,0,0,"2024-06-14"],
  ["Seal of Fire",51.07,18284,0,0,"2024-08-02"],
  ["Griselbrand",50.61,null,0,1,"2025-01-24"],
  ["There and Back Again",50.23,2048,0,1,"2023-11-03"],
  ["Tarkir Omenpath",50.0,null,0,0,"2025-06-20"],
  ["Magma Sliver",49.99,11923,0,0,"2022-11-05"],
  ["Autumn Willow and Baron Sengir",49.98,null,0,0,"2023-05-06"],
  ["Mindslaver",49.82,4594,0,1,"2024-04-19"],
  ["Yarok, the Desecrated",49.47,2448,0,1,"2026-01-23"],
  ["Elvish Promenade",49.07,3095,0,0,"2021-02-05"],
  ["Team Perseverance",48.99,null,0,0,"2025-02-21"],
  ["Mind Over Matter",48.77,7872,1,0,"1998-06-15"],
  ["Eternity Vessel",48.43,9797,0,0,"2009-10-02"],
  ["Wild Research",48.13,16253,0,0,"2020-09-01"],
  ["Artificer's Intuition",47.93,12971,0,0,"2004-06-04"],
  ["Master Transmuter",47.63,2419,0,0,"2026-10-02"],
  ["Anvil of Bogardan",47.42,5199,1,0,"1997-02-03"],
  ["Burgeoning",47.01,905,0,1,"2025-08-01"],
  ["Meren of Clan Nel Toth",46.77,1508,0,1,"2025-04-11"],
  ["Massacre",46.25,11633,0,0,"2024-08-02"],
  ["Words of Wind",45.94,15680,0,0,"2002-10-07"],
  ["Dystopia",45.63,25285,1,0,"1997-08-13"],
  ["Ghalta, Stampede Tyrant",45.23,1081,0,1,"2023-11-17"],
  ["The Wheeling Runner",45.0,null,0,0,"2024-10-25"],
  ["Noctis, Prince of Lucis",44.85,8272,0,1,"2025-06-13"],
  ["Rewind",44.62,1014,0,0,"2024-08-02"],
  ["Silvos, Rogue Elemental",44.28,19885,0,0,"2022-06-10"],
  ["Winter's Demonmech",44.0,null,0,0,"2025-02-21"],
  ["Glowing One",43.77,4608,0,1,"2024-03-08"],
  ["Twilight Mire",43.63,356,0,0,"2026-04-24"],
  ["Relic of Sauron",43.18,1748,0,1,"2026-08-14"],
  ["Path to Exile",42.98,15,0,1,"2026-10-02"],
  ["Pyrokinesis",42.78,5272,0,0,"2024-08-02"],
  ["The Majestic Duo",42.62,null,0,0,"2024-10-25"],
  ["Samut, Voice of Dissent",42.36,6336,0,1,"2026-09-14"],
  ["Deep Analysis",42.15,1448,0,0,"2026-06-26"],
  ["Zimone, Paradox Sculptor",41.75,3179,0,1,"2025-02-14"],
  ["Flare of Fortitude",41.47,735,0,1,"2024-06-14"],
  ["The Tarrasque",41.3,5857,0,0,"2023-11-17"],
  ["Pitiless Plunderer",41.12,224,0,1,"2025-06-13"],
  ["Arwen, Weaver of Hope",40.91,1864,0,1,"2026-08-14"],
  ["Monastery Swiftspear",40.58,7864,0,0,"2025-04-28"],
  ["Savai Triome",40.4,494,0,1,"2020-04-24"],
  ["Wave of Reckoning",40.16,5359,0,0,"2026-04-24"],
  ["Boon Reflection",40.0,4481,0,0,"2026-08-10"],
  ["Archivist",39.99,14659,0,0,"2005-07-29"],
  ["Thorn Elemental",39.99,18915,0,0,"2018-04-27"],
  ["Super Combo",39.74,8892,0,1,"2026-03-06"],
  ["Takeno, Samurai General",39.5,17569,0,0,"2004-10-01"],
  ["Umbris, Fear Manifest",39.23,7535,0,1,"2025-10-13"],
  ["Forgotten Ancient",39.01,391,0,0,"2026-04-24"],
  ["Beatrix, Loyal General",38.91,8166,0,1,"2025-06-13"],
  ["Welcome to . . . // Jurassic Park",38.68,5606,0,1,"2023-11-17"],
  ["Yellow Scarves General",38.48,29242,0,0,"1999-05-01"],
  ["Reversal of Fortune",38.21,21167,0,0,"2004-06-04"],
  ["Cemetery Prowler",38.07,5663,0,1,"2022-01-28"],
  ["Thrashing Wumpus",37.88,20661,0,0,"1999-10-04"],
  ["Hellkite Tyrant",37.63,742,0,1,"2025-06-13"],
  ["Envelop",37.4,20762,0,0,"2003-08-06"],
  ["May of the Machine",37.23,null,0,0,"2023-05-06"],
  ["Guttural Response",36.99,8890,0,0,"2021-06-19"],
  ["Dictate of Erebos",36.9,1027,0,1,"2025-10-27"],
  ["Body Snatcher",36.64,12623,0,0,"2023-01-13"],
  ["Mimeoplasm, Revered One",36.52,14214,0,1,"2025-02-14"],
  ["Tenacious Pup",36.31,31526,0,0,"2024-08-02"],
  ["Master of the Hunt",36.06,29686,1,0,"1994-06-01"],
  ["Ensnare",35.94,13870,0,0,"2000-02-14"],
  ["Quest for Ula's Temple",35.85,8802,0,0,"2010-02-05"],
  ["Steelshaper's Gift",35.69,1024,0,0,"2026-06-26"],
  ["Ancient Den",35.52,484,0,0,"2025-08-01"],
  ["Grafted Exoskeleton",35.33,2302,0,0,"2023-02-10"],
  ["Grand Crescendo",35.19,1288,0,0,"2026-10-02"],
  ["Benthic Behemoth",35.0,21974,0,0,"2001-04-11"],
  ["Sutured Ghoul",34.99,26345,0,0,"2011-07-15"],
  ["Ixidor, Reality Sculptor",34.78,11543,0,0,"2020-09-01"],
  ["Stitch Together",34.63,1613,0,0,"2025-06-13"],
  ["Rejuvenating Springs",34.44,147,0,1,"2026-06-26"],
  ["Leechridden Swamp",34.22,2597,0,0,"2024-09-27"],
  ["Balance of Power",33.99,25114,0,0,"2023-04-21"],
  ["Phyrexian Devourer",33.82,15112,1,0,"1996-06-10"],
  ["Magus of the Coffers",33.64,5563,0,0,"2014-11-07"],
  ["Ojer Axonil, Deepest Might // Temple of Power",33.47,1540,0,1,"2023-11-17"],
  ["Blowfly Infestation",33.2,3065,0,0,"2026-01-23"],
  ["Memory Plunder",33.0,4768,0,0,"2022-06-10"],
  ["Pulsemage Advocate",32.65,16360,0,0,"2002-05-27"],
  ["Sword of Dungeons & Dragons",32.5,null,0,0,"2022-10-07"],
  ["Wurm",32.3,null,0,0,"2024-01-12"],
  ["Darksteel Colossus",32.17,2349,0,1,"2024-11-15"],
  ["Shapesharer",32.08,9175,0,0,"2025-05-12"],
  ["Wolverine, Best There Is",31.79,6749,0,1,"2026-06-26"],
  ["Cavalier of Dawn",31.51,5687,0,1,"2025-02-14"],
  ["Shadowy Backstreet",31.34,575,0,1,"2024-02-09"],
  ["Black Market Connections",31.16,130,0,1,"2026-06-26"],
  ["Sapphire Medallion",30.98,355,0,1,"2024-06-14"],
  ["Appa, Steadfast Guardian",30.67,3030,0,0,"2025-11-21"],
  ["Aurification",30.48,14303,0,0,"2002-10-07"],
  ["Charismatic Conqueror",30.36,1050,0,1,"2023-11-17"],
  ["Korlash, Heir to Blackblade",30.25,16686,0,0,"2020-09-01"],
  ["Zenos yae Galvus // Shinryu, Transcendent Rival",30.04,4799,0,1,"2025-06-13"],
  ["Johnny, Combo Player",30.0,null,0,0,"2020-02-29"],
  ["Woodfall Primus",30.0,4033,0,0,"2023-06-23"],
  ["Stormscape Familiar",29.99,6821,0,0,"2006-10-06"],
  ["Ur-Golem's Eye",29.92,7631,0,0,"2014-11-07"],
  ["Plaguecrafter",29.68,639,0,1,"2024-08-02"],
  ["Beast Whisperer",29.46,213,0,1,"2026-10-02"],
  ["Niv-Mizzet, Parun",29.31,788,0,1,"2025-02-21"],
  ["Preacher",29.13,22384,1,0,"1994-08-01"],
  ["Serra Advocate",28.99,25916,0,0,"2014-12-05"],
  ["Distorting Lens",28.87,15362,0,0,"2003-07-28"],
  ["Mutinous Massacre",28.7,6718,0,1,"2025-08-01"],
  ["Kumena, Tyrant of Orazca",28.55,5296,0,1,"2023-12-06"],
  ["In the Darkness Bind Them",28.47,4059,0,1,"2023-11-03"],
  ["Casal, Lurkwood Pathfinder // Casal, Pathbreaker Owlbear",28.28,10249,0,1,"2025-04-25"],
  ["Goreclaw, Terror of Qal Sisma",28.13,638,0,1,"2026-10-02"],
  ["Dismiss",27.99,11764,0,0,"2022-12-02"],
  ["Lightmine Field",27.76,11304,0,0,"2010-04-23"],
  ["Reki, the History of Kamigawa",27.65,4329,0,0,"2021-08-24"],
  ["Lu Xun, Scholar General",27.45,17023,0,0,"2017-06-09"],
  ["Ezuri, Renegade Leader",27.22,2321,0,0,"2023-02-10"],
  ["Fatespinner",26.99,6980,0,0,"2020-03-13"],
  ["Worst Fears",26.89,8523,0,0,"2026-02-23"],
  ["Leyline of Singularity",26.73,14237,0,0,"2006-02-03"],
  ["Ink-Treader Nephilim",26.66,19089,0,0,"2006-02-03"],
  ["Playtest Wish",26.48,null,0,0,"2023-09-23"],
  ["Gratuitous Violence",26.37,1515,0,0,"2026-08-31"],
  ["Urza's Mine",26.22,840,0,1,"2024-06-14"],
  ["Hedron Crab",26.04,1400,0,1,"2025-04-11"],
  ["Rhys the Exiled",25.99,8749,0,0,"2021-02-05"],
  ["Mirri, Cat Warrior",25.86,14843,0,0,"2007-07-13"],
  ["False Defeat",25.69,21771,0,0,"1999-05-01"],
  ["Dream Salvage",25.62,19417,0,0,"2008-05-02"],
  ["Thoughts of Ruin",25.48,17685,0,0,"2005-06-03"],
  ["Avatar of Growth",25.35,11811,0,0,"2018-11-16"],
  ["Eerie Interlude",25.2,981,0,0,"2021-02-05"],
  ["Glen Elendra Liege",25.03,5060,0,0,"2023-09-08"],
  ["Leech Medic",25.0,null,0,0,"2023-02-17"],
  ["Welcome to Australia",25.0,null,0,0,"2026-05-01"],
  ["Vexing Shusher",24.98,5674,0,0,"2020-08-07"],
  ["Black Sun's Zenith",24.89,1934,0,0,"2026-01-23"],
  ["Nicol Bolas, Planeswalker",24.72,7406,0,0,"2025-03-07"],
  ["Wrath of the Skies",24.62,9464,0,1,"2024-06-14"],
  ["Words of Worship",24.55,17249,0,0,"2002-10-07"],
  ["Rakdos the Defiler",24.49,16867,0,0,"2019-02-15"],
  ["Stiltzkin, Moogle Merchant",24.38,6925,0,1,"2025-12-05"],
  ["Industrial Advancement",24.25,6624,0,0,"2022-04-29"],
  ["Archmage of Runes",24.05,934,0,1,"2024-11-15"],
  ["Triple Threat",24.0,null,0,0,"2023-07-29"],
  ["Kindred Dominance",23.96,698,0,1,"2026-06-26"],
  ["Pacifism",23.84,5247,0,0,"2026-06-26"],
  ["Psychic Corrosion",23.67,1791,0,1,"2024-09-30"],
  ["Securitron Squadron",23.56,4552,0,1,"2024-03-08"],
  ["My Precious // Allure of Power",23.49,5814,0,1,"2026-08-14"],
  ["Omnath, Locus of the Roil",23.4,3553,0,0,"2026-01-23"],
  ["Storm, Force of Nature",23.3,7173,0,1,"2026-06-26"],
  ["Magosi, the Waterveil",23.21,13791,0,0,"2009-10-02"],
  ["Tooth and Nail",23.09,2886,0,0,"2023-08-04"],
  ["Hammer of Nazahn",22.99,726,0,1,"2026-06-26"],
  ["Sphinx of the Steel Wind",22.9,13361,0,0,"2024-08-02"],
  ["Zilortha, Strength Incarnate",22.84,8909,0,1,"2023-08-04"],
  ["Sharuum the Hegemon",22.75,7060,0,0,"2022-11-18"],
  ["Tasha's Hideous Laughter",22.66,2973,0,0,"2026-09-14"],
  ["Cityscape Leveler",22.52,2106,0,1,"2025-11-21"],
  ["Flayer of Loyalties",22.4,3198,0,1,"2023-08-04"],
  ["Dual Nature",22.32,19957,0,0,"2000-06-05"],
  ["Idol of Oblivion",22.21,191,0,1,"2026-11-09"],
  ["Clockwork Dragon",22.05,21322,0,0,"2022-06-10"],
  ["Shelldock Isle",21.99,16377,0,0,"2021-11-29"],
  ["Ancient Greenwarden",21.9,697,0,0,"2025-06-16"],
  ["Raul, Trouble Shooter",21.84,5619,0,1,"2024-03-08"],
  ["Krosan Beast",21.77,19213,0,0,"2020-11-30"],
  ["Karametra, God of Harvests",21.67,3164,0,0,"2021-09-25"],
  ["Necromancy",21.6,1028,0,0,"2024-02-09"],
  ["Shivan Wurm",21.5,26275,0,0,"2001-02-05"],
  ["Vivien Reid",21.36,4073,0,0,"2024-11-15"],
  ["Biomancer's Familiar",21.27,3072,0,0,"2019-01-25"],
  ["Vampiric Link",21.23,5401,0,0,"2024-08-02"],
  ["Thran Golem",21.13,24389,0,0,"2023-01-13"],
  ["Crush of Wurms",21.0,15825,0,0,"2002-05-27"],
  ["Ancient Cornucopia",20.96,7918,0,1,"2026-08-10"],
  ["Tree of Tales",20.91,1528,0,0,"2024-09-27"],
  ["Chaos Wrap",20.8,null,0,0,"2022-12-01"],
  ["Bringer of the Blue Dawn",20.73,17097,0,0,"2004-06-04"],
  ["Mystic Confluence",20.63,1468,0,0,"2025-09-26"],
  ["Farseek",20.58,23,0,0,"2026-06-26"],
  ["Iymrith, Desert Doom",20.49,5488,0,0,"2022-06-14"],
  ["War Elephant",20.39,24716,0,0,"1995-07-01"],
  ["Powerleech",20.28,21632,1,0,"1994-03-04"],
  ["Wood Elemental",20.19,30314,1,0,"1994-06-01"],
  ["Carrion Ants",20.05,28534,0,0,"1997-03-24"],
  ["Devoted Mardu",20.0,null,0,0,"2025-06-20"],
  ["Plots That Span Centuries",20.0,null,0,0,"2024-09-27"],
  ["Colorless Ultimatum",19.99,null,0,0,"2026-05-01"],
  ["High Noon At Thunder Junction",19.99,null,0,0,"2024-06-28"],
  ["The Good Gamers",19.99,null,0,0,"2026-05-01"],
  ["Pillar of the Paruns",19.96,6362,0,0,"2023-06-23"],
  ["Planetarium of Wan Shi Tong",19.86,3444,0,0,"2025-11-21"],
  ["Furyborn Hellkite",19.75,18628,0,0,"2011-07-15"],
  ["Reyhan, Last of the Abzan",19.69,6392,0,0,"2020-11-20"],
  ["Flickering Hound",19.62,12547,0,0,"2026-10-02"],
  ["Citanul Flute",19.58,14751,0,0,"2007-07-13"],
  ["Martyr's Cause",19.49,8035,0,0,"2019-11-07"],
  ["Greel, Mind Raker",19.4,24714,0,0,"2000-06-05"],
  ["Iname, Death Aspect",19.32,17715,0,0,"2004-10-01"],
  ["Relentless Dead",19.25,5077,0,0,"2025-02-02"],
  ["Force of Despair",19.17,2445,0,0,"2025-03-24"],
  ["Sarkhan, Fireblood",19.11,5829,0,0,"2024-11-15"],
  ["Shalai, Voice of Plenty",19.05,1143,0,0,"2026-08-10"],
  ["Winding Way",19.0,8366,0,0,"2024-08-02"],
  ["Phyrexian Crusader",18.96,7984,0,0,"2025-06-20"],
  ["Alms Collector",18.91,4160,0,0,"2024-01-25"],
  ["Children of Korlis",18.86,4250,0,0,"2021-03-19"],
  ["Springjack Pasture",18.78,12449,0,0,"2013-11-01"],
  ["Allosaurus Rider",18.7,17288,0,0,"2020-03-13"],
  ["Cephalid Constable",18.64,12363,0,0,"2007-07-13"],
  ["Karazikar, the Eye Tyrant",18.55,3839,0,0,"2024-08-27"],
  ["Spirit Mantle",18.48,1700,0,0,"2026-04-24"],
  ["Glint-Horn Buccaneer",18.36,2045,0,0,"2022-12-02"],
  ["Vona's Hunger",18.3,3919,0,0,"2018-01-19"],
  ["Minion of the Mighty",18.24,6242,0,0,"2026-10-02"],
  ["Read the Bones",18.17,487,0,0,"2026-08-17"],
  ["Tawnos",18.11,null,0,0,"1997-05-01"],
  ["Matoya, Archon Elder",18.01,4262,0,0,"2025-06-13"],
  ["Soul Drainer",17.99,null,0,0,"2023-07-29"],
  ["Molten Psyche",17.94,3927,0,0,"2024-02-09"],
  ["Magewright's Stone",17.85,2937,0,0,"2024-01-12"],
  ["Snapdax, Apex of the Hunt",17.8,14090,0,0,"2022-02-25"],
  ["Carrion Rats",17.72,21848,0,0,"2002-02-04"],
  ["Nautiloid Ship",17.61,3265,0,0,"2022-06-10"],
  ["Machinist's Arsenal",17.55,4746,0,0,"2025-06-13"],
  ["Barbarian General",17.49,27942,0,0,"1999-05-01"],
  ["Urza's Factory",17.44,4454,0,0,"2022-12-02"],
  ["The Legend of Yangchen // Avatar Yangchen",17.38,4317,0,0,"2025-11-21"],
  ["Cataclysm",17.32,12712,0,0,"2024-08-02"],
  ["Ardyn, the Usurper",17.25,3386,0,0,"2025-06-13"],
  ["Grim Hireling",17.19,901,0,0,"2026-02-09"],
  ["Wipe Away",17.13,15088,0,0,"2021-03-19"],
  ["Darksteel Relic",17.05,8162,0,0,"2011-05-13"],
  ["Lurking Skirge",17.0,31566,0,0,"1999-02-15"],
  ["Pest Control",16.98,15963,0,0,"2024-04-19"],
  ["Terrasymbiosis",16.94,777,0,0,"2025-08-01"],
  ["Myojin of Cleansing Fire",16.84,15693,0,0,"2004-10-01"],
  ["Lotus Guardian",16.78,25693,0,0,"2000-10-02"],
  ["Gabriel Angelfire",16.67,26499,0,0,"1995-07-01"],
  ["Eirdu, Carrier of Dawn // Isilu, Carrier of Twilight",16.53,5930,0,0,"2026-01-23"],
  ["Celestial Gatekeeper",16.49,16144,0,0,"2003-02-03"],
  ["Sphere Grid",16.45,1257,0,0,"2025-06-13"],
  ["Flame Rift",16.35,4023,0,0,"2021-06-18"],
  ["Perplex",16.31,5172,0,0,"2005-10-07"],
  ["Impostor Syndrome",16.25,3155,0,0,"2025-09-26"],
  ["Spellweaver Helix",16.22,11254,0,0,"2003-10-02"],
  ["Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal",16.17,2838,0,0,"2025-06-13"],
  ["Delayed Blast Fireball",16.08,1416,0,0,"2024-10-14"],
  ["Reaper from the Abyss",16.02,5819,0,0,"2024-11-15"],
  ["The Wind Crystal",15.99,921,0,0,"2025-06-13"],
  ["Sarcomancy",15.95,27639,1,0,"1997-10-14"],
  ["Adelbert Steiner",15.89,6705,0,0,"2025-06-13"],
  ["Decimate",15.85,988,0,0,"2025-06-13"],
  ["Locket of Yesterdays",15.82,7751,0,0,"2006-10-06"],
  ["Mangara, the Diplomat",15.78,610,0,0,"2026-04-24"],
  ["Tectonic Edge",15.71,4165,0,0,"2024-06-14"],
  ["Kessig Wolf Run",15.67,404,0,0,"2025-04-11"],
  ["Game of Chaos",15.6,7390,0,0,"1997-03-24"],
  ["Coldsteel Heart",15.52,2110,0,0,"2022-12-02"],
  ["Miscast",15.47,2791,0,0,"2025-10-13"],
  ["Young Pyromancer",15.42,838,0,0,"2025-04-11"],
  ["Mercadian Atlas",15.36,24870,0,0,"1999-10-04"],
  ["Cemetery Reaper",15.29,2158,0,0,"2026-10-02"],
  ["Kykar, Zephyr Awakener",15.25,4211,0,0,"2025-02-14"],
  ["Vault 12: The Necropolis",15.2,6659,0,0,"2024-03-08"],
  ["Talisman of Resilience",15.1,500,0,0,"2026-04-24"],
  ["Ambassador Laquatus",15.0,18770,0,0,"2007-07-13"],
  ["Power Level Analyzer",15.0,null,0,0,"2023-07-29"],
  ["Sakiko, Mother of Summer",14.99,10426,0,0,"2023-08-04"],
  ["Liar's Pendulum",14.98,14614,0,0,"2003-10-02"],
  ["Midnight Clock",14.95,647,0,0,"2025-10-27"],
  ["Syphon Sliver",14.89,4637,0,0,"2023-08-04"],
  ["The Destined White Mage",14.83,9753,0,0,"2025-12-05"],
  ["Enduring Ideal",14.78,16115,0,0,"2024-12-02"],
  ["Leshrac's Rite",14.74,22417,0,0,"2001-04-11"],
  ["Mathemagics",14.69,4647,0,0,"2026-04-24"],
  ["Jinxed Choker",14.64,11572,0,0,"2003-10-02"],
  ["Rest in Peace",14.59,2312,0,0,"2025-09-26"],
  ["Armored Skyhunter",14.54,2545,0,0,"2026-04-24"],
  ["Into the Earthen Maw",14.46,null,0,0,"2010-06-18"],
  ["Reckless Endeavor",14.38,3434,0,0,"2025-10-13"],
  ["Glissa Sunslayer",14.3,1375,0,0,"2026-01-23"],
  ["Mirror Strike",14.24,17788,0,0,"2000-06-05"],
  ["Progenitor Mimic",14.21,5459,0,0,"2020-08-07"],
  ["Clown Car",14.16,3985,0,0,"2022-10-07"],
  ["Mana Vortex",14.1,20577,1,0,"1994-08-01"],
  ["Metathran Soldier",14.02,22655,0,0,"1999-06-07"],
  ["Another Night in Vegas",13.99,null,0,0,"2024-10-25"],
  ["Boom // Bust",13.97,12970,0,0,"2021-03-19"],
  ["Phyrexian Chimney Imp",13.94,null,0,0,"2023-02-17"],
  ["Neyith of the Dire Hunt",13.9,4256,0,0,"2020-07-17"],
  ["Simic Signet",13.84,625,0,0,"2024-09-27"],
  ["Strength-Testing Hammer",13.82,5555,0,0,"2022-10-07"],
  ["Kindred Charge",13.75,6041,0,0,"2024-08-02"],
  ["Huatli, Warrior Poet",13.68,12901,0,0,"2017-09-29"],
  ["Chromeshell Crab",13.59,9697,0,0,"2019-08-23"],
  ["Heliod, God of the Sun",13.55,3401,0,0,"2023-08-04"],
  ["Hansk, Slayer Zealot",13.5,12900,0,0,"2023-09-08"],
  ["Kabira Evangel",13.44,8518,0,0,"2009-10-02"],
  ["Revenant",13.39,19511,0,0,"2022-12-02"],
  ["Contaminant Grafter",13.3,4044,0,0,"2023-02-10"],
  ["Mirage Mirror",13.26,1319,0,0,"2026-06-26"],
  ["Fire Covenant",13.21,2720,0,0,"2026-01-23"],
  ["Mothdust Changeling",13.15,4367,0,0,"2024-08-02"],
  ["Snake",13.12,null,0,0,"2025-02-14"],
  ["Standardize",13.05,16174,0,0,"2002-10-07"],
  ["Infest",13.0,21855,0,0,"2024-02-23"],
  ["Undergrowth Champion",12.98,8433,0,0,"2024-11-15"],
  ["Perilous Forays",12.94,8920,0,0,"2024-01-12"],
  ["Draining Whelk",12.89,13320,0,0,"2021-03-19"],
  ["Pianna, Nomad Captain",12.85,22051,0,0,"2023-08-04"],
  ["Elephant Resurgence",12.78,27392,0,0,"2000-06-05"],
  ["Phantom Centaur",12.75,27245,0,0,"2019-11-07"],
  ["Court of Ardenvale",12.69,3785,0,0,"2023-09-08"],
  ["Pangosaur",12.64,23179,0,0,"1999-10-04"],
  ["Star Compass",12.59,4731,0,0,"2024-08-02"],
  ["Damping Sphere",12.56,5021,0,0,"2023-01-13"],
  ["Cognivore",12.51,28063,0,0,"2001-10-01"],
  ["Liberator, Urza's Battlethopter",12.48,1252,0,0,"2025-10-13"],
  ["Jeskai Ascendancy",12.44,2759,0,0,"2022-07-08"],
  ["Sphinx of the Second Sun",12.38,2327,0,0,"2024-09-30"],
  ["Twenty Lessons",12.33,null,0,0,"2025-06-20"],
  ["Kaboom!",12.29,20361,0,0,"2002-10-07"],
  ["Reaping the Graves",12.22,17228,0,0,"2024-08-02"],
  ["Abyssal Harvester",12.15,3063,0,0,"2024-11-15"],
  ["Survivors' Encampment",12.12,2659,0,0,"2024-08-02"],
  ["Multiversal Recruitment",12.06,9976,0,0,"2026-06-26"],
  ["Taught by Bruce Tarl",12.0,null,0,0,"2023-07-29"],
  ["Contractual Safeguard",11.98,9567,0,0,"2022-04-29"],
  ["Fleet Swallower",11.95,5058,0,0,"2021-10-18"],
  ["Lazav, Dimir Mastermind",11.91,6940,0,0,"2020-09-25"],
  ["Altar of Bone",11.87,14596,1,0,"1995-06-03"],
  ["Sisters of Stone Death",11.84,17686,0,0,"2018-11-02"],
  ["Dragon",11.8,null,0,0,"2024-02-08"],
  ["Gladiolus Amicitia",11.75,7043,0,0,"2025-06-13"],
  ["Counterflux",11.71,5953,0,0,"2026-04-27"],
  ["Lich's Relic",11.68,17726,0,0,"2026-10-02"],
  ["Henge of Ramos",11.62,27267,0,0,"1999-10-04"],
  ["Plargg and Nassari",11.58,2299,0,0,"2026-04-24"],
  ["Blazing Sunsteel",11.55,6387,0,0,"2020-11-20"],
  ["Slogurk, the Overslime",11.52,11332,0,0,"2022-01-28"],
  ["Aphotic Wisps",11.49,8573,0,0,"2024-08-02"],
  ["Animist's Awakening",11.44,2499,0,0,"2026-04-24"],
  ["The Gitrog, Ravenous Ride",11.4,4272,0,0,"2026-09-14"],
  ["Impact Tremors",11.35,201,0,0,"2026-05-18"],
  ["Shifting Sky",11.31,19151,0,0,"2003-07-28"],
  ["Dusk // Dawn",11.26,961,0,0,"2025-02-14"],
  ["Insatiable Avarice",11.23,1206,0,0,"2024-04-19"],
  ["Viashino Heretic",11.19,13427,0,0,"2022-09-09"],
  ["Dwarven Ruins",11.13,8427,0,0,"2000-10-01"],
  ["Kellan, the Kid",11.1,5286,0,0,"2024-04-19"],
  ["Blessed Wind",11.06,24652,0,0,"2000-06-05"],
  ["Pain's Reward",11.01,13045,0,0,"2005-06-03"],
  ["Traverse the Outlands",11.0,1646,0,0,"2022-06-10"],
  ["Scourge of Kher Ridges",10.97,20528,0,0,"2007-05-04"],
  ["Jeskai Revelation",10.94,12527,0,0,"2025-04-11"],
  ["Kumano, Master Yamabushi",10.9,22732,0,0,"2004-10-01"],
  ["Warrior's Stand",10.88,30562,0,0,"1999-05-01"],
  ["Bringer of the Red Dawn",10.84,20287,0,0,"2004-06-04"],
  ["Monk Class",10.78,9858,0,0,"2021-07-23"],
  ["Krosan Restorer",10.73,10906,0,0,"2023-01-13"],
  ["Slave of Bolas",10.71,13715,0,0,"2019-11-07"],
  ["Drake-Skull Cameo",10.67,23366,0,0,"2000-10-02"],
  ["Darkbore Pathway // Slitherbore Pathway",10.63,1182,0,0,"2023-05-08"],
  ["Vengeful Dreams",10.6,24162,0,0,"2003-08-06"],
  ["Captain Howler, Sea Scourge",10.57,5043,0,0,"2025-02-14"],
  ["Sinew Sliver",10.52,5322,0,0,"2023-08-04"],
  ["Sinister Concierge",10.49,10817,0,0,"2022-04-29"],
  ["Longshot, Rebel Bowman",10.46,2867,0,0,"2025-11-21"],
  ["Reckless One",10.42,13033,0,0,"2014-12-05"],
  ["Gerrard's Wisdom",10.38,27518,0,0,"2001-04-11"],
  ["Undertaker",10.35,11288,0,0,"2006-10-06"],
  ["Morningtide",10.29,28971,0,0,"2002-02-04"],
  ["Dust to Dust",10.25,22307,0,0,"1997-03-24"],
  ["Voldaren Estate",10.23,2505,0,0,"2026-02-09"],
  ["Yidris, Maelstrom Wielder",10.19,9159,0,0,"2022-04-12"],
  ["Angel of Serenity",10.14,3754,0,0,"2023-10-02"],
  ["Thought Scour",10.11,1794,0,0,"2026-04-27"],
  ["Gary Clone",10.08,13218,0,0,"2024-03-08"],
  ["Wall of Shards",10.06,8780,0,0,"2020-03-13"],
  ["Bloodbond March",10.0,17094,0,0,"2005-10-07"]
];
const TODAY = Date.parse("2026-10-08");
const CFG: EbayConfig = DEFAULT_EBAY_CONFIG;
const unitOf = (r: (typeof NAMES)[number], i: number): Unit => ({
  ref: `o:${i + 1}`, kind: "single", name: r[0], valueCents: Math.round(r[1] * 100), chase: r[4] === 1, recent: TODAY - Date.parse(r[5]) <= 45 * 86_400_000,
  pop: popularityOf({ edhrecRank: r[2], reserved: r[3] === 1, ownPercentile: null, totalViews: 0, watchers: 0, change7dPct: null, valueCents: Math.round(r[1] * 100) }), banner: false,
});
const UNITS = NAMES.map(unitOf);
const unitNamed = (n: string) => UNITS.find((u) => u.name === n)!;

test("the defaults are the owner's: 1,000 calls a day, shared keyset, spending on (observe-only is opt-in since 2026-10-10), slices 15/60/15/10", () => {
  assert.equal(CFG.dailyBudget, 1000);
  assert.equal(CFG.keysetMode, "shared");
  assert.equal(CFG.observeOnly, false);
  assert.equal(CFG.apiEnabled, true);
  assert.deepEqual(CFG.slices, { banner: 0.15, singles: 0.6, sealed: 0.15, buffer: 0.1 });
  assert.ok(Math.abs(Object.values(CFG.slices).reduce((a, b) => a + b, 0) - 1) < 1e-9, "the four slices sum to 1");
  assert.equal(CFG.minValueCents, 1000);
  assert.equal(CFG.tierAMinCents, 5000);
  assert.equal(CFG.bIntervalHours, 72);
  assert.equal(CFG.riftOwnReserve, 600);
  assert.equal(singleCost(CFG), 1.15);
});

test("env: only the declared names, a bad value is ignored and named, an empty variable is unset", () => {
  assert.equal(envInt(""), null);
  assert.equal(envInt(" 12 "), 12);
  assert.equal(envInt("x"), null);
  assert.equal(envBool("0", true), false);
  assert.equal(envBool("", true), true);
  const a = ebayConfigFromEnv({ EBAY_DAILY_CALL_BUDGET: "400", EBAY_KEYSET_MODE: "own", EBAY_OBSERVE_ONLY: "0", EBAY_API_ENABLED: "0", EBAY_QUOTA_RESERVE: "800", EBAY_MAX_CALLS: "120", EBAY_MIN_VALUE_CENTS: "2500" });
  assert.deepEqual(a.problems, []);
  assert.deepEqual({ ...a.cfg }, { ...CFG, dailyBudget: 400, keysetMode: "own", observeOnly: false, apiEnabled: false, quotaReserve: 800, maxCalls: 120, minValueCents: 2500 });
  const b = ebayConfigFromEnv({ EBAY_DAILY_CALL_BUDGET: "999999", EBAY_KEYSET_MODE: "both", EBAY_MIN_VALUE_CENTS: "5" });
  assert.equal(b.cfg.dailyBudget, 1000);
  assert.equal(b.cfg.keysetMode, "shared");
  assert.equal(b.cfg.minValueCents, 1000);
  assert.equal(b.problems.length, 3);
  const c = ebayConfigFromEnv({ EBAY_DAILY_CALL_BUDGET: "", EBAY_API_ENABLED: "" });
  assert.equal(c.cfg.dailyBudget, 1000);
  assert.equal(c.cfg.apiEnabled, true, "an empty kill-switch variable leaves eBay on; only 0 turns it off");
  assert.equal(parseOnlyMarket(""), null);
  assert.equal(parseOnlyMarket("gb"), "UK");
  assert.throws(() => parseOnlyMarket("FR"));
});

test("popularity: EDHREC, our own traffic as it grows, watchers, movers, the Reserved List", () => {
  const p = (o: Partial<Parameters<typeof popularityOf>[0]>) => popularityOf({ edhrecRank: null, reserved: false, ownPercentile: null, totalViews: 0, watchers: 0, change7dPct: null, valueCents: 5000, ...o });
  assert.equal(p({}), 0);
  assert.ok(Math.abs(p({ edhrecRank: 1500 }) - 0.5) < 1e-9);
  assert.ok(Math.abs(p({ edhrecRank: 1000 }) - 0.6) < 1e-9);
  assert.equal(p({ reserved: true }), 0.5);
  assert.ok(Math.abs(p({ edhrecRank: 1500, ownPercentile: 1, totalViews: 25_000 }) - 0.75) < 1e-9, "half our own signal at 25,000 views");
  assert.equal(p({ edhrecRank: 1500, ownPercentile: 0, totalViews: 50_000 }), 0.5 * 0 + 0, "all our own signal at 50,000 views");
  assert.ok(p({ watchers: 99 }) > 0.9);
  assert.equal(p({ change7dPct: -20, valueCents: 5000 }), 0.6);
  assert.equal(p({ change7dPct: -20, valueCents: 500 }), 0, "a mover under US$20 does not count");
});

test("score: min(V, US$2,000)^0.7 x (0.15 + pop) x chase x recent, on real names", () => {
  assert.ok(Math.abs(scoreOf({ valueCents: 10_000, pop: 0, chase: false, recent: false }) - Math.pow(100, 0.7) * 0.15) < 1e-9);
  assert.equal(scoreOf({ valueCents: 900_000, pop: 0.4, chase: false, recent: false }), scoreOf({ valueCents: 200_000, pop: 0.4, chase: false, recent: false }));
  assert.ok(Math.abs(scoreOf({ valueCents: 5000, pop: 0.2, chase: true, recent: true }) / scoreOf({ valueCents: 5000, pop: 0.2, chase: false, recent: false }) - 1.15 * 1.2) < 1e-9);
  // Sol Ring (EDHREC 1) outranks a dearer card nobody plays; Lightning Bolt is not tier C
  const solRing = unitNamed("Sol Ring"), cheapUnpopular = UNITS.filter((u) => u.pop === 0 && u.valueCents < 3000)[0]!;
  assert.ok(scoreOf(solRing) > scoreOf(cheapUnpopular));
});

test("the allocator: tiers by score within the singles slice, A a strict prefix, the rest C", () => {
  const a = allocate(UNITS, CFG);
  const tier = (u: Unit) => a.tiers.get(u.ref)!;
  const byScore = [...UNITS].sort((x, y) => (a.scores.get(y.ref) ?? 0) - (a.scores.get(x.ref) ?? 0));
  const A = UNITS.filter((u) => tier(u) === TIER.A), B = UNITS.filter((u) => tier(u) === TIER.B);
  assert.ok(A.length > 100 && B.length > 100, `A ${A.length} B ${B.length}`);
  for (const u of A) assert.ok(u.valueCents >= CFG.tierAMinCents);
  for (const u of [...A, ...B]) assert.ok(u.valueCents >= CFG.minValueCents);
  // the slice arithmetic
  const slice = CFG.slices.singles * CFG.dailyBudget;
  assert.ok(a.daily.A <= CFG.tierAShare * slice + 1e-9, `A costs ${a.daily.A} a day`);
  assert.ok(a.daily.A + a.daily.B <= slice + 1e-9, `A+B costs ${a.daily.A + a.daily.B} a day`);
  assert.ok(a.daily.banner <= CFG.slices.banner * CFG.dailyBudget, `banner costs ${a.daily.banner} a day`);
  assert.ok(a.daily.total <= (1 - CFG.slices.buffer) * CFG.dailyBudget + 1e-9, `the plan models ${a.daily.total} of ${CFG.dailyBudget}, the buffer stays unplanned`);
  // every A name outscores every B name
  const minA = Math.min(...A.map((u) => a.scores.get(u.ref)!)), maxB = Math.max(...B.map((u) => a.scores.get(u.ref)!));
  assert.ok(minA >= maxB, "tiers are a score order");
  assert.ok(byScore.length === UNITS.length);
  // the famous names are searched daily
  for (const n of ["Sol Ring", "Lightning Bolt", "The One Ring", "Counterspell"]) assert.equal(tier(unitNamed(n)), TIER.A, n);
});

test("the cut adapts: half the budget searches fewer names, none below the floors, nothing is searched twice as a unit", () => {
  const full = allocate(UNITS, CFG), half = allocate(UNITS, { ...CFG, dailyBudget: 500 });
  assert.ok(half.counts.A < full.counts.A && half.counts.A > 0);
  assert.ok(half.counts.A + half.counts.B <= full.counts.A + full.counts.B);
  assert.ok(half.daily.total <= 0.9 * 500 + 1e-9);
  const none = allocate(UNITS, { ...CFG, dailyBudget: 0 });
  assert.equal(none.counts.A + none.counts.B + none.counts.sealed, 0, "a zero budget searches nothing");
  const dear = allocate(UNITS, { ...CFG, minValueCents: 100_000, tierAMinCents: 100_000 });
  assert.ok(UNITS.filter((u) => dear.tiers.get(u.ref) !== TIER.C).every((u) => u.valueCents >= 100_000));
});

test("hysteresis: a name near a cut line keeps its tier; fewer tier changes with memory than without", () => {
  const base = allocate(UNITS, CFG);
  const moved: EbayConfig = { ...CFG, dailyBudget: 960 };
  const cold = allocate(UNITS, moved);
  const warm = allocate(UNITS, moved, base.tiers);
  const changes = (t: ReadonlyMap<string, TierCode>) => UNITS.filter((u) => t.get(u.ref) !== base.tiers.get(u.ref)).length;
  assert.ok(changes(warm.tiers) <= changes(cold.tiers), `${changes(warm.tiers)} vs ${changes(cold.tiers)}`);
  assert.ok(warm.daily.A + warm.daily.B <= CFG.slices.singles * moved.dailyBudget + 1e-9, "memory never overspends the slice");
});

test("banner and sealed slices: the pool costs what the brief says; sealed needs a kind, a floor and a slice", () => {
  assert.ok(Math.abs(bannerDailyCost(CFG) - (24 * 4 + 3 * 11) * 1.15) < 1e-9);
  const box: Unit = { ref: "p:1", kind: "sealed", name: "Modern Horizons 3 Play Booster Box", valueCents: 29_000, pop: 0.7, chase: false, recent: false, banner: false, sealedKind: "Booster Box" };
  const pack: Unit = { ...box, ref: "p:2", sealedKind: "Booster Pack" };
  const deck: Unit = { ...box, ref: "p:3", sealedKind: "Commander Deck", valueCents: 6500 };
  const cheapDeck: Unit = { ...deck, ref: "p:4", valueCents: 3000 };
  assert.equal(sealedEligible(box, CFG), true);
  assert.equal(sealedEligible(pack, CFG), false);
  assert.equal(sealedEligible(deck, CFG), true);
  assert.equal(sealedEligible(cheapDeck, CFG), false);
  assert.equal(sealedEligible({ ...box, matchable: false }, CFG), false);
  const a = allocate([box, pack, deck, cheapDeck], CFG);
  assert.equal(a.tiers.get("p:1"), TIER.SEALED);
  assert.equal(a.tiers.get("p:2"), TIER.C);
  assert.ok(a.daily.sealed <= CFG.slices.sealed * CFG.dailyBudget);
  assert.equal(sealedPop({ ownPercentile: null, releasedWithin12Months: true, valueCents: 1000 }), 0.7);
  assert.equal(sealedPop({ ownPercentile: null, releasedWithin12Months: false, valueCents: 60_000 }), 0.6);
  assert.equal(sealedPop({ ownPercentile: null, releasedWithin12Months: false, valueCents: 1000 }), 0.3);
});

test("a chase-pool name that is otherwise tier C is searched for the banner only", () => {
  const cheap = { ...UNITS.at(-1)!, valueCents: 800 };   // the sample's cheapest name, as one of its US$8 printings: under the US$10 floor
  const a = allocate([{ ...cheap, banner: true }], CFG);
  assert.equal(a.tiers.get(cheap.ref), TIER.BANNER);
});

// ── due-ness and the run plan ─────────────────────────────────────────────────
const NOW = new Date("2026-10-08T23:37:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

test("intervals: A daily, B every 72 h, sealed 72 h, the pool 6 h in the US and daily elsewhere", () => {
  assert.equal(intervalHours("A", "US", CFG), 24);
  assert.equal(intervalHours("B", "US", CFG), 72);
  assert.equal(intervalHours("sealed", "AU", CFG), 72);
  assert.equal(intervalHours("banner", "US", CFG), 6);
  assert.equal(intervalHours("banner", "UK", CFG), 24);
});
test("isDue: never searched is due, then interval minus a 3 h grace; force ignores intervals", () => {
  assert.equal(isDue(null, 24, NOW), true);
  assert.equal(isDue(hoursAgo(20), 24, NOW), false);
  assert.equal(isDue(hoursAgo(21), 24, NOW), true);
  assert.equal(isDue(hoursAgo(68), 72, NOW), false);
  assert.equal(isDue(hoursAgo(69), 72, NOW), true);
  assert.equal(isDue(hoursAgo(1), 24, NOW, true), true);
  assert.equal(isDue(hoursAgo(3), 6, NOW), true, "the grace is capped at half the interval: a 6 h pair is due at 3 h");
  assert.equal(isDue(hoursAgo(2), 6, NOW), false);
});

function due(purpose: "banner" | "main", over: Partial<Parameters<typeof duePairs>[0]> = {}): Pair[] {
  const pool = ["Sol Ring", "The One Ring", "Lightning Bolt"].map((n) => ({ ...unitNamed(n), banner: true }));
  const units = [...pool, ...UNITS.filter((u) => !pool.some((p) => p.ref === u.ref))];
  const alloc = allocate(units, CFG);
  return duePairs({ units, tiers: alloc.tiers, checks: new Map(), now: NOW, cfg: CFG, purpose, ...over });
}

test("a banner-only run plans the pool and nothing else; a main run adds A, B and sealed", () => {
  const b = due("banner");
  assert.ok(b.every((p) => p.cls === "banner"));
  assert.deepEqual(new Set(b.map((p) => p.market)), new Set(["US", "UK", "AU", "EU"]));
  assert.equal(b.length, 12, "3 names x 4 markets");
  const m = due("main");
  assert.ok(m.some((p) => p.cls === "A") && m.some((p) => p.cls === "B"));
  assert.ok(m.filter((p) => p.cls === "A" || p.cls === "B").every((p) => p.market === "US"), "singles are searched in the US; UK, AU and EU only through the pool");
  assert.equal(new Set(m.map((p) => pairKey(p.ref, p.market))).size, m.length, "a pair appears once");
});
test("the US pool refreshes every 6 h and the other markets daily", () => {
  const checks = new Map<string, Date>();
  for (const n of ["Sol Ring", "The One Ring", "Lightning Bolt"]) for (const m of ["US", "UK", "AU", "EU"]) checks.set(pairKey(unitNamed(n).ref, m), hoursAgo(7));
  const b = due("banner", { checks });
  assert.deepEqual(new Set(b.map((p) => p.market)), new Set(["US"]), "7 h old: only the 6 h pairs are due");
  assert.equal(due("banner", { checks, force: true }).length, 12);
  assert.deepEqual(new Set(due("banner", { onlyMarket: "AU" }).map((p) => p.market)), new Set(["AU"]));
});
test("priority: banner, then A, then B, then sealed; never searched before stale before fresh", () => {
  const m = due("main");
  const order = ["banner", "A", "B", "sealed"];
  for (let i = 1; i < m.length; i++) assert.ok(order.indexOf(m[i]!.cls) >= order.indexOf(m[i - 1]!.cls));
  const p = (ref: string, checkedAt: Date | null, score: number): Pair => ({ ref, market: "US", kind: "single", cls: "A", valueCents: 1, score, checkedAt, cost: 1.15 });
  assert.ok(comparePairs(p("a", null, 1), p("b", hoursAgo(30), 99), NOW, CFG) < 0);
  assert.ok(comparePairs(p("a", hoursAgo(40), 1), p("b", hoursAgo(30), 99), NOW, CFG) < 0, "more overdue first");
  assert.ok(comparePairs(p("a", hoursAgo(30), 5), p("b", hoursAgo(30), 1), NOW, CFG) < 0, "then by score");
});

test("planRun: each class within its slice, strict priority, the run within its allowance", () => {
  const m = due("main");
  const allowance = classAllowance(CFG, {});
  assert.deepEqual(allowance, { banner: 150, A: 270, B: 330, sealed: 150 });
  const plan = planRun(m, 500, allowance);
  assert.ok(plan.modelled <= 500);
  for (const c of ["banner", "A", "B", "sealed"] as const) assert.ok(plan.used[c] <= allowance[c] + 1e-9, c);
  assert.equal(plan.order.length + plan.overflow.length, m.length);
  // an A pair that does not fit blocks the cheaper A pairs behind it, never a B pair
  const tight = planRun(m, 5000, { banner: 0, A: 2.3, B: 100, sealed: 0 });
  assert.equal(tight.used.A, 2.3);
  assert.equal(tight.order.filter((p) => p.cls === "A").length, 2);
  assert.ok(tight.order.some((p) => p.cls === "B"));
  assert.equal(tight.order.filter((p) => p.cls === "banner").length, 0);
});
test("what a class spent today comes off its slice", () => {
  assert.deepEqual(classAllowance(CFG, { banner: 140, A: 300 }), { banner: 10, A: 0, B: 330, sealed: 150 });
});

// ── the safety rules ──────────────────────────────────────────────────────────
test("a completed search writes, a failed, 429'd or refused one touches nothing", () => {
  assert.deepEqual(pairWrite({ status: "ok", matched: true }), { best: "upsert", track: "matched" });
  assert.deepEqual(pairWrite({ status: "ok", matched: false }), { best: "delete", track: "unmatched" });
  for (const status of ["failed", "rate-limited", "budget"] as const) assert.deepEqual(pairWrite({ status }), { best: "keep", track: "keep" });
});
test("a 429 on the retry means the name is NOT completed", () => {
  assert.equal(combineQueries("ok", "ok"), "ok");
  assert.equal(combineQueries("ok", null), "ok");
  assert.equal(combineQueries("ok", "rate-limited"), "rate-limited");
  assert.equal(combineQueries("failed", null), "failed");
});
test("the failure breaker: 10 failed searches in a row, or over half after 50, stop the run", () => {
  const a = new FailureBreaker();
  for (let i = 0; i < BREAKER_CONSECUTIVE - 1; i++) assert.equal(a.record(true), false);
  assert.equal(a.record(true), true);
  const b = new FailureBreaker();
  for (let i = 0; i < 60; i++) if (b.record(i % 9 !== 0 && i % 9 !== 4)) break;
  assert.ok(b.tripped, "a failure rate over half stops it");
  const c = new FailureBreaker();
  for (let i = 0; i < 200; i++) assert.equal(c.record(i % 3 === 0), false);
});
test("the verdict: red on a refused token, a tripped breaker, or calls spent with nothing completed; a 429 is a clean stop", () => {
  assert.equal(ebayRunVerdict({ tokenRefused: true, latched: null, spent: 0, completed: 0 }).ok, false);
  assert.equal(ebayRunVerdict({ latched: "failures", spent: 12, completed: 0 }).ok, false);
  assert.equal(ebayRunVerdict({ latched: null, spent: 5, completed: 0 }).ok, false);
  assert.equal(ebayRunVerdict({ latched: "429", spent: 30, completed: 25 }).ok, true);
  assert.equal(ebayRunVerdict({ latched: null, spent: 0, completed: 0 }).ok, true, "an observe-only run is green");
});

test("schedule: four crons, the MAIN one at 23:37, every run clear of the import window and after Rift's evening job", () => {
  assert.deepEqual([...EBAY_CRONS], ["37 4 * * *", "37 10 * * *", "37 16 * * *", MAIN_CRON]);
  assert.equal(purposeOfSchedule("37 23 * * *"), "main");
  assert.equal(purposeOfSchedule("37 4 * * *"), "banner");
  assert.equal(purposeOfSchedule(null), "main", "a dispatch is a main run");
  assert.ok(BANNER_ONLY_RUN_CAP >= Math.ceil((24 + 3 * 11) * 1.15) && BANNER_ONLY_RUN_CAP <= 100);
  const yml = read(".github/workflows/ebay-prices.yml");
  assert.deepEqual([...yml.matchAll(/- cron:\s*"([^"]+)"/g)].map((m) => m[1]), [...EBAY_CRONS]);
  assert.deepEqual(SINGLES_MARKETS, ["US", "UK", "AU", "EU"]);
  assert.deepEqual(SEALED_MARKETS, ["US", "UK", "AU", "EU", "CA"]);
  assert.deepEqual(EBAY_MARKETS.slice(0, 5), ["US", "UK", "AU", "EU", "CA"]);
});

// The tier cuts are set by the budget, not by tierAMinCents or minValueCents (the first run cut tier A at US$189.97 and B at US$28.27, and tier C is never
// searched), so since 2026-10-10 the page names the cadence and the markets, never a price floor the plan does not keep.
test("the methodology page states what the plan commits to", () => {
  const page = read("src/app/methodology/page.tsx").replace(/\s+/g, " ");
  assert.ok(page.includes("four times a day"), "the runs");
  assert.ok(page.includes("the top few hundred every day"), "tier A: daily");
  assert.ok(page.includes("the next several hundred every three days"), "tier B");
  assert.equal(CFG.bIntervalHours, 72);
  assert.ok(page.includes("In the UK, Australia and Spain for the EU we follow a short list of chase cards"), "UK/AU/EU singles: the chase pool only");
  assert.ok(CFG.bannerOtherNames > 0 && CFG.bannerOtherNames < 50);
  assert.ok(page.includes("Sealed products are searched in all five markets (the US, the UK, Australia, the EU and Canada)"), "sealed");
  assert.deepEqual(SEALED_MARKETS, ["US", "UK", "AU", "EU", "CA"]);
  assert.doesNotMatch(page, /cards worth US\$\d+ or more|and up daily/, "no price floor the budget does not keep");
});
