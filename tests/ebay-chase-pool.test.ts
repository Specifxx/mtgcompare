// The chase pool (src/lib/ebay-chase-pool.ts) on REAL Magic data: 252 printings with a TCGplayer MARKET price of US$20 or more, taken from the 2026-10-07 TCGCSV build joined to the
// Scryfall bulk (the dearest 140, 80 popular mainstream cards, the newest sets, the thin-market rows, and every Lightning Bolt, Sol Ring, Counterspell and The One Ring over US$40).
// Row: [TCGplayer product id, oracle id (first 8), name, set, Scryfall set type, age in days on 2026-10-07, rarity, finish, market cents, low cents, chase treatment, Reserved List, EDHREC rank, layout].
// The rules pinned here: market only, thin markets out, one printing per name, one per set at the head, the two display bands, hot sets guaranteed, deterministic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHASE, bucketOf, chaseScore, isCandidate, selectChasePool, type ChaseCandidate } from "../src/lib/ebay-chase-pool";

type Row = [number, string, string, string, string, number, string, "nonfoil" | "foil" | "etched", number, number | null, number, number, number | null, string];
const ROWS: Row[] = [
  [693039,"c53b7602","Smaug the Magnificent","hob","expansion",54,"mythic","foil",2450000,2679999,1,0,3750,"normal"],
  [9232,"c823e687","Timetwister","2ed","core",11998,"rare","nonfoil",640000,604999,0,1,3548,"normal"],
  [9231,"d0209d3f","Time Walk","2ed","core",11998,"rare","nonfoil",571999,399500,0,1,null,"normal"],
  [8973,"550c74d4","Ancestral Recall","2ed","core",11998,"rare","nonfoil",499995,499999,0,1,null,"normal"],
  [638816,"878df304","Tifa Lockhart","pf25","promo",644,"rare","foil",499497,475000,1,0,2652,"normal"],
  [517540,"89ca686a","Cavern of Souls","lci","expansion",1055,"mythic","foil",490000,494000,1,0,111,"normal"],
  [648742,"b4872bac","Avatar Aang // Aang, Master of Elements","tla","expansion",320,"mythic","foil",481578,449550,1,0,6913,"transform"],
  [695491,"2f2c549d","Kozilek's Command","slp","promo",26,"rare","foil",400000,239999,1,0,2083,"normal"],
  [37964,"7c427c3d","Gaea's Cradle","jgp","promo",10506,"rare","foil",399900,599999,0,1,447,"normal"],
  [2831,"d3a0b660","Birds of Paradise","7ed","core",9310,"rare","foil",398075,400000,0,0,35,"normal"],
  [658468,"dd9a6f6b","Aerith Gainsborough","ppro","promo",482,"rare","foil",386000,439999,1,0,2113,"normal"],
  [3300,"ba284fe6","Mishra's Workshop","atq","expansion",11905,"rare","nonfoil",369999,399999,0,1,3726,"normal"],
  [9145,"824597b8","Mox Pearl","2ed","core",11998,"rare","nonfoil",351333,275099,0,1,null,"normal"],
  [6323,"229d6627","Grim Monolith","ulg","expansion",10096,"rare","foil",348366,900000,0,1,672,"normal"],
  [449115,"5089ec1a","Black Lotus","30a","memorabilia",1409,"rare","nonfoil",329999,599999,0,1,null,"normal"],
  [518213,"255b937f","Shinka, the Bloodsoaked Keep","ltc","commander",1202,"mythic","foil",329999,450000,1,0,1959,"normal"],
  [4046,"69b409b3","The Tabernacle at Pendrell Vale","leg","expansion",11816,"rare","nonfoil",323900,332999,0,1,8873,"normal"],
  [492734,"97652492","Sheoldred // The True Scriptures","mom","expansion",1265,"mythic","foil",316546,349999,1,0,2003,"transform"],
  [9143,"376ee366","Mox Emerald","2ed","core",11998,"rare","nonfoil",300497,350000,0,1,null,"normal"],
  [657744,"74e3243b","Leonardo, Sewer Samurai","tmt","expansion",215,"mythic","foil",300230,357022,1,0,13821,"normal"],
  [97413,"5089ec1a","Black Lotus","ced","memorabilia",11989,"rare","nonfoil",300000,300000,0,1,null,"normal"],
  [1283,"99d4d99d","Time Vault","lea","core",12116,"rare","nonfoil",294999,250000,0,1,null,"normal"],
  [689798,"24a29be4","Emeritus of Ideation // Ancestral Recall","sos","expansion",166,"mythic","foil",290000,279999,1,0,5585,"prepare"],
  [3267,"c7c7bffa","Candelabra of Tawnos","atq","expansion",11905,"rare","nonfoil",285000,241499,0,1,6541,"normal"],
  [596424,"41e2790d","Edgar Markov","inr","masters",621,"mythic","foil",282500,346499,1,0,3161,"normal"],
  [619671,"d5fca77c","Mox Jasper","tdm","expansion",544,"mythic","foil",282499,289999,1,0,2511,"normal"],
  [38232,"a8abd966","Wheel of Fortune","g10","promo",6123,"rare","foil",280000,290000,0,1,576,"normal"],
  [547733,"736892cb","Mana Vault","sld","box",912,"mythic","foil",270856,449900,1,0,152,"normal"],
  [518206,"59119143","Karakas","ltc","commander",1202,"mythic","foil",270000,600000,1,0,null,"normal"],
  [9146,"ed85fa82","Mox Ruby","2ed","core",11998,"rare","nonfoil",249999,386250,0,1,null,"normal"],
  [518204,"cb8ec2e4","Homeward Path","ltc","commander",1202,"mythic","foil",249999,450000,1,0,1190,"normal"],
  [679048,"1939679b","Michelangelo, Improviser","tmt","expansion",215,"mythic","foil",248332,244999,1,0,10572,"normal"],
  [555059,"97836c48","Ulamog, the Defiler","mh3","draft_innovation",845,"mythic","foil",233499,247905,1,0,1565,"normal"],
  [679045,"f6a7838d","Donatello, Mutant Mechanic","tmt","expansion",215,"mythic","foil",223383,235000,1,0,13152,"normal"],
  [3211,"4e81596c","Juz\u00e1m Djinn","arn","expansion",11982,"rare","nonfoil",211350,239801,0,1,27706,"normal"],
  [531375,"17039058","Steam Vents","rvr","masters",999,"rare","foil",200000,300000,1,0,63,"normal"],
  [531383,"68418069","Krenko, Mob Boss","rvr","masters",999,"rare","foil",200000,275000,1,0,1089,"normal"],
  [531387,"20283c4a","Breeding Pool","rvr","masters",999,"rare","foil",200000,478100,1,0,59,"normal"],
  [679046,"fdb8e862","Raphael, Ninja Destroyer","tmt","expansion",215,"mythic","foil",200000,339998,1,0,14515,"normal"],
  [38273,"119d719d","Survival of the Fittest","g09","promo",6488,"rare","foil",198199,229999,0,1,2364,"normal"],
  [3215,"2111588d","Library of Alexandria","arn","expansion",11982,"uncommon","nonfoil",196322,197999,0,1,null,"normal"],
  [630948,"2e5675d3","Traveling Chocobo","fin","expansion",481,"mythic","foil",192035,194590,1,0,1884,"normal"],
  [531399,"73864fcc","Godless Shrine","rvr","masters",999,"rare","foil",192000,250000,1,0,60,"normal"],
  [3168,"54022a10","Bazaar of Baghdad","arn","expansion",11982,"uncommon","nonfoil",190049,206870,0,1,10535,"normal"],
  [2900,"8d0adc5c","Final Fortune","7ed","core",9310,"rare","foil",188888,249999,0,0,1531,"normal"],
  [614395,"483c747a","The Aetherspark","dft","expansion",600,"mythic","foil",187500,208999,1,0,1834,"normal"],
  [630949,"2e5675d3","Traveling Chocobo","fin","expansion",481,"mythic","foil",186408,218576,1,0,1884,"normal"],
  [630947,"2e5675d3","Traveling Chocobo","fin","expansion",481,"mythic","foil",185355,193220,1,0,1884,"normal"],
  [630946,"2e5675d3","Traveling Chocobo","fin","expansion",481,"mythic","foil",184560,199504,1,0,1884,"normal"],
  [647614,"92cfba68","The Soul Stone","spm","expansion",376,"mythic","foil",184474,170000,1,0,891,"normal"],
  [38251,"3c9faba7","Intuition","g03","promo",8680,"rare","foil",181726,244899,0,1,2025,"normal"],
  [509563,"153376c9","Smothering Tithe","wot","masterpiece",1125,"mythic","foil",176007,185000,1,0,65,"normal"],
  [517451,"3aa83ed2","The One Ring","ltr","draft_innovation",1069,"mythic","foil",175306,229999,1,0,96,"normal"],
  [554649,"2bb2eda7","Snapcaster Mage","sld","box",877,"mythic","nonfoil",174295,179999,1,0,1444,"normal"],
  [36765,"f3c5978a","Mox Diamond","v10","from_the_vault",5885,"mythic","foil",172744,169800,0,1,247,"normal"],
  [679120,"b7ee76bf","Super Shredder","pspl","promo",215,"mythic","foil",171066,169014,1,0,5145,"normal"],
  [693024,"b175e826","The Mind Stone","msh","expansion",103,"mythic","foil",165165,155000,1,0,3719,"normal"],
  [6883,"7c427c3d","Gaea's Cradle","usg","expansion",10222,"rare","nonfoil",162623,140666,0,1,447,"normal"],
  [638816,"878df304","Tifa Lockhart","pf25","promo",644,"rare","nonfoil",160419,299999,1,0,2652,"normal"],
  [122862,"6ad8011d","Sol Ring","mps","masterpiece",3659,"special","foil",157848,150000,0,0,1,"normal"],
  [555060,"39f4bf0e","Kozilek, the Broken Reality","mh3","draft_innovation",845,"mythic","foil",157499,250000,1,0,2472,"normal"],
  [509567,"53236dd7","Rhystic Study","wot","masterpiece",1125,"mythic","foil",154875,157500,1,0,46,"normal"],
  [6667,"f3e8dc56","Rishadan Port","mmq","expansion",9865,"rare","foil",150082,120000,0,0,14649,"normal"],
  [2853,"f25351e3","City of Brass","7ed","core",9310,"rare","foil",149999,139999,0,0,95,"normal"],
  [531348,"d3a0b660","Birds of Paradise","rvr","masters",999,"rare","foil",149999,400000,1,0,35,"normal"],
  [560459,"25636214","Ms. Bumbleflower","blc","commander",796,"mythic","foil",144222,187500,1,0,3189,"normal"],
  [1205,"375932e6","Nightmare","lea","core",12116,"rare","nonfoil",139999,99999,0,0,14161,"normal"],
  [21636,"b2c6aa39","Island","pgru","promo",9949,"rare","nonfoil",139989,130000,0,0,null,"normal"],
  [517541,"2c63e4e1","Mana Crypt","spg","masterpiece",1055,"mythic","foil",139400,145300,1,0,null,"normal"],
  [38283,"322f0459","Yawgmoth's Will","g07","promo",7219,"rare","foil",138600,119999,0,1,2619,"normal"],
  [638902,"760ede92","Sothera, the Supervoid","eoe","expansion",432,"mythic","foil",135563,242500,1,0,4956,"normal"],
  [10484,"ef86989d","Polluted Delta","ons","expansion",8766,"rare","foil",135000,98969,0,0,36,"normal"],
  [524298,"723a66c3","Indominus Rex, Alpha","rex","eternal",1055,"rare","foil",131850,149995,1,0,10342,"normal"],
  [6209,"9ed9accb","Metalworker","uds","expansion",9984,"rare","foil",129950,149999,0,1,3907,"normal"],
  [9248,"c718911c","Volcanic Island","2ed","core",11998,"rare","nonfoil",129850,136000,0,1,337,"normal"],
  [631067,"3268251a","Y'shtola, Night's Blessed","fic","commander",481,"mythic","foil",128165,124275,1,0,2561,"normal"],
  [122853,"736892cb","Mana Vault","mps","masterpiece",3659,"special","foil",128015,120000,0,0,152,"normal"],
  [9240,"4b22be3a","Underground Sea","2ed","core",11998,"rare","nonfoil",127666,140000,0,1,296,"normal"],
  [6609,"c39e5fb0","Misdirection","mmq","expansion",9865,"rare","foil",126666,88115,0,0,1504,"normal"],
  [3825,"eae87919","Chains of Mephistopheles","leg","expansion",11816,"rare","nonfoil",126044,124999,0,1,11161,"normal"],
  [122855,"de2440de","Mox Opal","mps","masterpiece",3659,"special","foil",120573,114001,0,0,243,"normal"],
  [524291,"0dd4bc7b","Indoraptor, the Perfect Hybrid","rex","eternal",1055,"rare","foil",120498,119995,1,0,8853,"normal"],
  [9236,"02418479","Tundra","2ed","core",11998,"rare","nonfoil",120049,120098,0,1,350,"normal"],
  [8836,"78f9c223","Mind Twist","leb","core",12056,"rare","nonfoil",119999,84999,0,0,12163,"normal"],
  [451981,"4d18bcba","Ashnod's Altar","brr","masterpiece",1419,"rare","foil",119999,214999,1,0,134,"normal"],
  [9003,"edb455f4","Chaos Orb","2ed","core",11998,"rare","nonfoil",117477,112000,0,1,null,"normal"],
  [477,"16cd0b90","Imperial Seal","ptk","starter",10021,"rare","nonfoil",111431,90000,0,0,537,"normal"],
  [5382,"f3c5978a","Mox Diamond","sth","expansion",10446,"rare","nonfoil",110866,104867,0,1,247,"normal"],
  [1599,"4b22be3a","Underground Sea","3ed","core",11867,"rare","nonfoil",110508,89700,0,1,296,"normal"],
  [10493,"f3c7af78","Flooded Strand","ons","expansion",8766,"rare","foil",110000,119999,0,0,38,"normal"],
  [6495,"53f7c868","Dark Ritual","mmq","expansion",9865,"common","foil",109999,98500,0,0,33,"normal"],
  [9230,"99d4d99d","Time Vault","2ed","core",11998,"rare","nonfoil",108000,109401,0,1,null,"normal"],
  [2812,"d5ad26cc","Adarkar Wastes","7ed","core",9310,"rare","foil",105000,130000,0,0,143,"normal"],
  [9234,"74b7fe23","Tropical Island","2ed","core",11998,"rare","nonfoil",104999,78800,0,1,352,"normal"],
  [648746,"fbfef028","Toph, the First Metalbender","tla","expansion",320,"rare","foil",104980,134699,1,0,3279,"normal"],
  [541521,"f0bcdc43","Perception Bobblehead","pip","commander",943,"uncommon","foil",104338,750000,1,0,5986,"normal"],
  [6232,"523ae937","Replenish","uds","expansion",9984,"rare","foil",100098,94999,0,1,3857,"normal"],
  [8685,"d3a0b660","Birds of Paradise","leb","core",12056,"rare","nonfoil",100000,349000,0,0,35,"normal"],
  [491999,"7e6b9b59","Atraxa, Praetors' Voice","mul","masterpiece",1265,"mythic","foil",100000,489999,1,0,2399,"normal"],
  [122852,"32e5339e","Lotus Petal","mps","masterpiece",3659,"special","foil",99663,90148,0,0,119,"normal"],
  [8970,"34515b16","Wrath of God","leb","core",12056,"rare","nonfoil",99500,50699,0,0,681,"normal"],
  [1079,"1edee40f","Cyclopean Tomb","lea","core",12116,"rare","nonfoil",99000,60000,0,1,29216,"normal"],
  [524299,"9cfac390","Ravenous Tyrannosaurus","rex","eternal",1055,"rare","foil",97721,102500,1,0,5011,"normal"],
  [1608,"c718911c","Volcanic Island","3ed","core",11867,"rare","nonfoil",97282,77000,0,1,337,"normal"],
  [1170,"5b7515f2","Lich","lea","core",12116,"rare","nonfoil",96450,97999,0,1,20149,"normal"],
  [591814,"68954295","Llanowar Elves","fdn","core",691,"mythic","foil",95427,113400,1,0,58,"normal"],
  [122847,"ec3d4466","Chrome Mox","mps","masterpiece",3659,"special","foil",93529,83299,0,0,156,"normal"],
  [517451,"3aa83ed2","The One Ring","ltr","draft_innovation",1069,"mythic","nonfoil",93166,92260,1,0,96,"normal"],
  [3957,"42208fea","Moat","leg","expansion",11816,"rare","nonfoil",92695,99999,0,1,13243,"normal"],
  [8718,"cc187110","Counterspell","leb","core",12056,"uncommon","nonfoil",91992,69999,0,0,16,"normal"],
  [518155,"9f8f29ba","Sauron, the Dark Lord","ltr","draft_innovation",1069,"mythic","foil",91814,87400,1,0,3183,"normal"],
  [522720,"cc187110","Counterspell","sld","box",1139,"rare","nonfoil",90000,89999,0,0,16,"normal"],
  [638150,"377179d5","Subtlety","sld","box",485,"mythic","foil",89956,106551,1,0,4243,"normal"],
  [525385,"bca33fb6","Hunting Velociraptor","rex","eternal",1055,"rare","foil",89489,119221,1,0,3886,"normal"],
  [1179,"cc7f290f","Lord of Atlantis","lea","core",12116,"rare","nonfoil",87999,105000,0,0,5004,"normal"],
  [8908,"6ad8011d","Sol Ring","leb","core",12056,"uncommon","nonfoil",86999,64973,0,0,1,"normal"],
  [38215,"f25351e3","City of Brass","psus","promo",9410,"rare","foil",85964,79999,0,0,95,"normal"],
  [558590,"f15b3b76","Chatterfang, Squirrel General","blc","commander",796,"mythic","foil",85128,155000,1,0,1058,"normal"],
  [8768,"d38ad188","Gauntlet of Might","leb","core",12056,"rare","nonfoil",84149,189999,0,1,12385,"normal"],
  [558443,"97a84e9d","Lumra, Bellow of the Woods","blb","expansion",796,"mythic","foil",83806,149500,1,0,1126,"normal"],
  [630986,"70113003","Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel","fin","expansion",481,"mythic","foil",83373,79999,1,0,1247,"transform"],
  [517536,"89ca686a","Cavern of Souls","lci","expansion",1055,"mythic","foil",82575,244444,1,0,111,"normal"],
  [7842,"26d3a818","Orim's Chant","pls","expansion",9375,"rare","foil",81799,82999,0,0,1780,"normal"],
  [448965,"c823e687","Timetwister","30a","memorabilia",1409,"rare","nonfoil",81499,76800,0,1,3548,"normal"],
  [623347,"7359e82b","Kaldra Compleat","pspl","promo",571,"mythic","foil",81497,105000,1,0,1678,"normal"],
  [638153,"dcb9c2a7","Solitude","sld","box",485,"mythic","foil",81129,116995,1,0,1967,"normal"],
  [5129,"ee6099b0","Lion's Eye Diamond","mir","expansion",10956,"rare","nonfoil",80565,76015,0,1,740,"normal"],
  [97559,"0677f49e","Mox Jet","ced","memorabilia",11989,"rare","nonfoil",80000,119900,0,1,null,"normal"],
  [541522,"6a69116b","Endurance Bobblehead","pip","commander",943,"uncommon","foil",80000,99999,1,0,5837,"normal"],
  [10473,"6587a463","Wooded Foothills","ons","expansion",8766,"rare","foil",79999,139999,0,0,47,"normal"],
  [518235,"a6c05941","Liliana Vess // Liliana Vess","sld","box",1118,"mythic","foil",79999,400000,1,0,4796,"reversible_card"],
  [1086,"2847c8a0","Demonic Hordes","lea","core",12116,"rare","nonfoil",79866,79999,0,1,25378,"normal"],
  [3130,"857febd9","Underground River","7ed","core",9310,"rare","foil",79225,57778,0,0,142,"normal"],
  [449148,"0677f49e","Mox Jet","30a","memorabilia",1409,"rare","nonfoil",79099,78210,0,1,null,"normal"],
  [3175,"f25351e3","City of Brass","arn","expansion",11982,"uncommon","nonfoil",78999,82935,0,0,95,"normal"],
  [517987,"3aa83ed2","The One Ring","ltr","draft_innovation",1069,"mythic","foil",72351,72790,1,0,96,"normal"],
  [717520,"8dad1fa8","Omnipresence","fra","expansion",5,"mythic","foil",69898,44997,1,0,20889,"normal"],
  [619755,"4457ed35","Lightning Bolt","slp","promo",593,"rare","nonfoil",64729,68999,1,0,157,"normal"],
  [1174,"4457ed35","Lightning Bolt","lea","core",12116,"common","nonfoil",62667,44999,0,0,157,"normal"],
  [38253,"4457ed35","Lightning Bolt","jgp","promo",10506,"rare","foil",62444,58495,0,0,157,"normal"],
  [1073,"cc187110","Counterspell","lea","core",12116,"uncommon","nonfoil",54898,72229,0,0,16,"normal"],
  [715919,"12d617b1","Hexhaven Invigorator","fra","expansion",5,"mythic","foil",54219,49500,1,0,12541,"normal"],
  [38270,"6ad8011d","Sol Ring","g05","promo",7949,"rare","foil",50185,84999,0,0,1,"normal"],
  [693061,"78bed291","Riddles in the Dark","pspl","promo",40,"rare","foil",49775,49500,1,0,13257,"normal"],
  [693048,"3aa83ed2","The One Ring","hoc","eternal",54,"mythic","foil",49545,40000,1,0,96,"normal"],
  [717497,"e4b51c2d","Darklight Phoenix","fra","expansion",5,"mythic","foil",49402,45925,1,0,23731,"normal"],
  [8920,"b1544f21","Swords to Plowshares","leb","core",12056,"uncommon","nonfoil",48655,74999,0,0,11,"normal"],
  [706993,"89a6e876","The Theorist, Jace Beleren","fra","expansion",5,"mythic","foil",48462,41500,1,0,7876,"normal"],
  [709470,"c01aeaa5","Gleaming Splendor","hob","expansion",54,"mythic","foil",46287,41451,1,0,2196,"normal"],
  [638817,"b1544f21","Swords to Plowshares","pf25","promo",474,"rare","foil",42062,44750,1,0,11,"normal"],
  [715898,"217e76ca","Return to the Light Realms","fra","expansion",5,"mythic","foil",41968,47550,1,0,15141,"normal"],
  [707001,"71355b51","Craterclaw Colossus","fra","expansion",5,"mythic","foil",40924,61379,1,0,11355,"normal"],
  [12383,"1da10d5c","Umezawa's Jitte","bok","expansion",7915,"rare","foil",38330,12351,0,0,2958,"normal"],
  [716717,"4421ab7d","Emrakul, the Exigent Doom","fra","expansion",5,"mythic","foil",37120,35000,1,0,12553,"normal"],
  [709985,"cc187110","Counterspell","sld","box",82,"rare","nonfoil",35789,24865,1,0,16,"normal"],
  [488276,"3aa83ed2","The One Ring","ltr","draft_innovation",1202,"mythic","foil",35587,29123,1,0,96,"normal"],
  [8819,"4457ed35","Lightning Bolt","leb","core",12056,"common","nonfoil",34964,32500,0,0,157,"normal"],
  [715934,"07a28621","Kwia Vigorbloom","fra","expansion",5,"mythic","foil",34916,27500,1,0,14965,"normal"],
  [517987,"3aa83ed2","The One Ring","ltr","draft_innovation",1069,"mythic","nonfoil",32000,34839,1,0,96,"normal"],
  [449350,"4457ed35","Lightning Bolt","30a","memorabilia",1409,"common","nonfoil",30799,30491,0,0,157,"normal"],
  [706978,"a139eb7f","Enlightened Confidant","fra","expansion",5,"mythic","foil",30716,27950,1,0,15166,"normal"],
  [517966,"3aa83ed2","The One Ring","ltr","draft_innovation",1069,"mythic","foil",29364,26900,1,0,96,"normal"],
  [501274,"3aa83ed2","The One Ring","pltr","promo",1202,"mythic","foil",29247,125000,0,0,96,"normal"],
  [539392,"6ad8011d","Sol Ring","pip","commander",943,"mythic","foil",27287,28066,1,0,1,"normal"],
  [1080,"53f7c868","Dark Ritual","lea","core",12116,"common","nonfoil",25215,29999,0,0,33,"normal"],
  [122851,"ca204b66","Lightning Greaves","mps","masterpiece",3659,"special","foil",24409,23913,0,0,13,"normal"],
  [8725,"53f7c868","Dark Ritual","leb","core",12056,"common","nonfoil",23333,11870,0,0,33,"normal"],
  [449467,"6ad8011d","Sol Ring","30a","memorabilia",1409,"uncommon","nonfoil",21999,27499,0,0,1,"normal"],
  [12645,"95560508","Fellwar Stone","9ed","core",7740,"uncommon","foil",20675,9500,0,0,17,"normal"],
  [539402,"0bc7f093","Arcane Signet","pip","commander",943,"uncommon","foil",20399,18063,1,0,3,"normal"],
  [9590,"92392467","Cabal Pit","ody","expansion",9137,"uncommon","foil",19738,5799,0,0,6772,"normal"],
  [625668,"cc187110","Counterspell","sld","box",556,"rare","foil",18992,17008,1,0,16,"normal"],
  [662066,"6ad8011d","Sol Ring","slc","box",338,"rare","foil",18011,17976,1,0,1,"normal"],
  [38236,"53f7c868","Dark Ritual","g09","promo",6488,"rare","foil",17664,18000,0,0,33,"normal"],
  [539236,"0895c9b7","Command Tower","pip","commander",943,"uncommon","foil",16974,14599,1,0,2,"normal"],
  [528288,"6ad8011d","Sol Ring","sld","box",1036,"rare","foil",16523,16099,1,0,1,"normal"],
  [563070,"0895c9b7","Command Tower","mb2","masters",796,"common","foil",16475,14495,0,0,2,"normal"],
  [129541,"cc187110","Counterspell","mp2","masterpiece",3449,"special","foil",15614,13999,0,0,16,"normal"],
  [693049,"3aa83ed2","The One Ring","hoc","eternal",54,"mythic","foil",15525,15525,1,0,96,"normal"],
  [2860,"cc187110","Counterspell","7ed","core",9310,"common","foil",15500,14493,0,0,16,"normal"],
  [6484,"cc187110","Counterspell","mmq","expansion",9865,"common","foil",15135,12894,0,0,16,"normal"],
  [6589,"e36f4649","Land Grant","mmq","expansion",9865,"common","foil",14500,3901,0,0,14555,"normal"],
  [488276,"3aa83ed2","The One Ring","ltr","draft_innovation",1202,"mythic","nonfoil",14165,13100,1,0,96,"normal"],
  [487805,"3aa83ed2","The One Ring","ltr","draft_innovation",1202,"mythic","foil",13967,13049,0,0,96,"normal"],
  [129543,"53f7c868","Dark Ritual","mp2","masterpiece",3449,"special","foil",13475,12574,0,0,33,"normal"],
  [234274,"04b7362d","Bojuka Bog","tsr","masters",2028,"special","foil",13178,11337,0,0,24,"normal"],
  [693049,"3aa83ed2","The One Ring","hoc","eternal",54,"mythic","nonfoil",13148,12500,1,0,96,"normal"],
  [456562,"53f7c868","Dark Ritual","sld","box",1402,"rare","nonfoil",12873,11500,1,0,33,"normal"],
  [9210,"6ad8011d","Sol Ring","2ed","core",11998,"uncommon","nonfoil",12250,13500,0,0,1,"normal"],
  [487805,"3aa83ed2","The One Ring","ltr","draft_innovation",1202,"mythic","nonfoil",11619,10001,0,0,96,"normal"],
  [488270,"3aa83ed2","The One Ring","ltr","draft_innovation",1202,"mythic","foil",11449,9096,1,0,96,"normal"],
  [488270,"3aa83ed2","The One Ring","ltr","draft_innovation",1202,"mythic","nonfoil",11065,10600,1,0,96,"normal"],
  [282746,"c23e5b80","Reliquary Tower","sld","box",1934,"rare","foil",11023,12500,1,0,10,"normal"],
  [10332,"7e2cacae","Voidmage Prodigy","ons","expansion",8766,"rare","foil",10050,2952,0,0,14086,"normal"],
  [97622,"6ad8011d","Sol Ring","ced","memorabilia",11989,"uncommon","nonfoil",10000,7726,0,0,1,"normal"],
  [528291,"0bc7f093","Arcane Signet","sld","box",1036,"rare","foil",9969,9000,1,0,3,"normal"],
  [9705,"658bccf8","Cleansing Meditation","tor","expansion",9011,"uncommon","foil",9900,3000,0,0,13758,"normal"],
  [499377,"04b7362d","Bojuka Bog","ltc","commander",1202,"mythic","foil",9652,8799,1,0,24,"normal"],
  [97631,"b1544f21","Swords to Plowshares","ced","memorabilia",11989,"uncommon","nonfoil",9262,8999,0,0,11,"normal"],
  [589737,"cc187110","Counterspell","purl","promo",719,"rare","foil",9229,7538,1,0,16,"normal"],
  [9135,"5ba73182","Meekstone","2ed","core",11998,"rare","nonfoil",9157,2650,0,0,2817,"normal"],
  [555447,"6ad8011d","Sol Ring","sld","box",835,"rare","nonfoil",8864,7371,1,0,1,"normal"],
  [97329,"b1544f21","Swords to Plowshares","cei","memorabilia",11989,"uncommon","nonfoil",8799,8767,0,0,11,"normal"],
  [21702,"cc187110","Counterspell","g00","promo",9776,"rare","foil",8087,6900,0,0,16,"normal"],
  [528210,"6ad8011d","Sol Ring","sld","box",1036,"rare","nonfoil",7870,4799,1,0,1,"normal"],
  [533868,"6ad8011d","Sol Ring // Sol Ring","sld","box",989,"rare","foil",7397,6799,1,0,1,"reversible_card"],
  [715813,"6ad8011d","Sol Ring","sld","box",23,"rare","foil",7257,4298,1,0,1,"normal"],
  [97539,"4457ed35","Lightning Bolt","ced","memorabilia",11989,"common","nonfoil",6964,7049,0,0,157,"normal"],
  [9222,"b1544f21","Swords to Plowshares","2ed","core",11998,"uncommon","nonfoil",6779,5661,0,0,11,"normal"],
  [48138,"cc187110","Counterspell","plgm","promo",11055,"rare","nonfoil",6499,4900,0,0,16,"normal"],
  [559739,"b1544f21","Swords to Plowshares","spg","masterpiece",796,"mythic","foil",6477,5971,1,0,11,"normal"],
  [97320,"6ad8011d","Sol Ring","cei","memorabilia",11989,"uncommon","nonfoil",6442,7725,0,0,1,"normal"],
  [624514,"0bc7f093","Arcane Signet","sld","box",569,"rare","nonfoil",6414,7500,1,0,3,"normal"],
  [97237,"4457ed35","Lightning Bolt","cei","memorabilia",11989,"common","nonfoil",6249,7624,0,0,157,"normal"],
  [528292,"0895c9b7","Command Tower","sld","box",1036,"rare","foil",6224,5857,1,0,2,"normal"],
  [562505,"6ad8011d","Sol Ring","mb2","masters",796,"uncommon","foil",6146,5200,0,0,1,"normal"],
  [97142,"cc187110","Counterspell","cei","memorabilia",11989,"uncommon","nonfoil",6092,6299,0,0,16,"normal"],
  [9020,"cc187110","Counterspell","2ed","core",11998,"uncommon","nonfoil",6050,4058,0,0,16,"normal"],
  [97444,"cc187110","Counterspell","ced","memorabilia",11989,"uncommon","nonfoil",6000,4660,0,0,16,"normal"],
  [562026,"4457ed35","Lightning Bolt","slp","promo",797,"rare","foil",5975,5999,1,0,157,"normal"],
  [67747,"b1544f21","Swords to Plowshares","j13","promo",5027,"rare","foil",5973,5468,0,0,11,"normal"],
  [28531,"27b047e3","Exotic Orchard","con","expansion",6452,"rare","foil",5635,4786,0,0,9,"normal"],
  [528209,"0bc7f093","Arcane Signet","sld","box",1036,"rare","nonfoil",5536,3689,1,0,3,"normal"],
  [545758,"0bc7f093","Arcane Signet","sld","box",912,"rare","foil",5508,5799,1,0,3,"normal"],
  [247896,"f29dc596","Rogue's Passage","sld","box",1862,"rare","foil",5386,4700,1,0,18,"normal"],
  [480523,"27b047e3","Exotic Orchard","sld","box",1272,"rare","foil",5178,4700,1,0,9,"normal"],
  [3041,"8539f295","Rampant Growth","7ed","core",9310,"common","foil",5040,4857,0,0,27,"normal"],
  [561736,"0895c9b7","Command Tower","sld","box",835,"rare","nonfoil",5015,4500,1,0,2,"normal"],
  [97149,"53f7c868","Dark Ritual","cei","memorabilia",11989,"common","nonfoil",4999,4699,0,0,33,"normal"],
  [563123,"0bc7f093","Arcane Signet","mb2","masters",796,"common","foil",4932,4519,0,0,3,"normal"],
  [58133,"0895c9b7","Command Tower","j12","promo",5393,"rare","foil",4907,4650,0,0,2,"normal"],
  [11512,"ca204b66","Lightning Greaves","mrd","expansion",8406,"uncommon","foil",4870,4000,0,0,13,"normal"],
  [34339,"04b7362d","Bojuka Bog","wwk","expansion",6088,"common","foil",4815,3700,0,0,24,"normal"],
  [234012,"7735eeba","Beast Within","tsr","masters",2028,"special","foil",4814,4824,0,0,25,"normal"],
  [530421,"0895c9b7","Command Tower","sld","box",1101,"rare","foil",4780,4500,1,0,2,"normal"],
  [557849,"b1544f21","Swords to Plowshares","slp","promo",831,"rare","foil",4755,4599,1,0,11,"normal"],
  [693225,"6ad8011d","Sol Ring","sld","box",142,"rare","foil",4699,4675,1,0,1,"normal"],
  [624496,"0bc7f093","Arcane Signet","sld","box",569,"rare","nonfoil",4696,4301,1,0,3,"normal"],
  [662271,"0bc7f093","Arcane Signet","sld","box",359,"rare","foil",4556,3999,1,0,3,"normal"],
  [711413,"0bc7f093","Arcane Signet","sld","box",51,"rare","foil",4481,4469,1,0,3,"normal"],
  [677185,"78826359","Nature's Lore","sld","box",247,"rare","foil",4469,3999,0,0,26,"normal"],
  [656818,"6ad8011d","Sol Ring","sld","box",359,"rare","foil",4451,4291,1,0,1,"normal"],
  [233436,"d683d985","Path to Exile","tsr","masters",2028,"special","foil",4298,4822,0,0,15,"normal"],
  [247894,"c8b143ad","Swiftfoot Boots","sld","box",1913,"rare","foil",4268,3080,1,0,12,"normal"],
  [547742,"0bc7f093","Arcane Signet","sld","box",912,"rare","foil",4247,3800,1,0,3,"normal"],
  [523077,"6ad8011d","Sol Ring","pip","commander",943,"mythic","foil",4148,3665,1,0,1,"normal"],
  [530421,"0895c9b7","Command Tower","sld","box",1101,"rare","nonfoil",4136,3744,1,0,2,"normal"],
  [721412,"6ad8011d","Sol Ring","sld","box",9,"rare","foil",4087,3099,0,0,1,"normal"],
  [528290,"9965d9c5","Thought Vessel","sld","box",1036,"rare","foil",4085,3762,1,0,21,"normal"],
  [498461,"04b7362d","Bojuka Bog","ltc","commander",1202,"mythic","foil",4033,3514,1,0,24,"normal"],
  [528289,"ca204b66","Lightning Greaves","sld","box",1036,"rare","foil",4009,3606,1,0,13,"normal"],
  [677185,"78826359","Nature's Lore","sld","box",247,"rare","nonfoil",4005,3795,0,0,26,"normal"]
];
const TODAY = "2026-10-07";
const rel = (age: number) => new Date(Date.parse(TODAY) - age * 86_400_000).toISOString().slice(0, 10);
const kind = (t: string) => (t === "box" || t === "masterpiece" ? "promo" : t);
const cand = (r: Row): ChaseCandidate => ({
  id: r[0], nameKey: r[1], setCode: r[3], setKind: kind(r[4]), releasedOn: rel(r[5]), rarity: r[6], finish: r[7], treatments: [], chase: r[10] === 1, reserved: r[11] === 1, edhrecRank: r[12],
  marketCents: r[8], lowCents: r[9], hasArt: true, cls: 0, layout: r[13], lang: "en",
});
const ALL = ROWS.map(cand);
const byName = (name: string) => ROWS.filter((r) => r[2] === name).map(cand);
const nameOf = new Map(ROWS.map((r) => [r[0], r[2]] as const));

test("the dials are pinned: a change is a code change with this test", () => {
  assert.deepEqual(CHASE, {
    minCents: 4000, capCents: 200_000, poolSize: 64, hotDays: 60, hotMinSlots: 2, setDecay: 0.5, bucketDecay: 0.8, nameLimitFirst: 1, firstN: 24, nameLimit: 2, recentDays: 45, recentBoost: 1.2, chaseBoost: 1.15, thinMarketRatio: 3,
    bands: [{ minCents: 50_000, maxCents: null, slots: 3 }, { minCents: 4000, maxCents: 50_000, slots: 3 }],
  });
});

test("only a printing with a market price of US$40 or more, and not a thin market, is a candidate", () => {
  const thin = ALL.filter((c) => c.lowCents != null && c.marketCents! > 3 * c.lowCents && c.marketCents! >= CHASE.minCents);
  assert.ok(thin.length >= 6, "the fixture holds real thin-market rows");
  for (const c of thin) assert.equal(isCandidate(c), false, `${nameOf.get(c.id)} ${c.setCode} market ${c.marketCents} low ${c.lowCents}`);
  const bolt = byName("Lightning Bolt").find((c) => c.setCode === "lea")!;
  assert.equal(isCandidate(bolt), true);
  assert.equal(isCandidate({ ...bolt, marketCents: null, lowCents: 62_667 }), false, "a thin single listing (no market) is never a candidate: the low is an unsold asking price");
  assert.equal(isCandidate({ ...bolt, marketCents: 3999 }), false);
  assert.equal(isCandidate({ ...bolt, lang: "ja" }), false);
  assert.equal(isCandidate({ ...bolt, hasArt: false }), false);
  assert.equal(isCandidate({ ...bolt, cls: 1 }), false, "a token is not a card");
  assert.equal(isCandidate({ ...bolt, layout: "art_series" }), false);
  assert.equal(isCandidate({ ...bolt, setKind: "art-series" }), false);
});

test("buckets: Reserved List and old are bluechip, recent chase is modern, promo lines are special", () => {
  const alpha = byName("Lightning Bolt").find((c) => c.setCode === "lea")!;
  assert.equal(bucketOf(alpha, TODAY), "bluechip");
  const ring = byName("The One Ring").find((c) => c.setCode === "ltr" && c.finish === "foil")!;
  assert.equal(bucketOf({ ...ring, releasedOn: rel(300), chase: true }, TODAY), "modern-chase");
  assert.equal(bucketOf({ ...ring, releasedOn: rel(900), chase: false }, TODAY), "other");
  assert.equal(bucketOf({ ...ring, setKind: "promo", releasedOn: rel(900), chase: false }, TODAY), "special");
  assert.equal(bucketOf({ ...ring, setCode: "sld", setKind: "expansion", releasedOn: rel(900), chase: false }, TODAY), "special");
  assert.equal(bucketOf({ ...ring, reserved: true, releasedOn: rel(10) }, TODAY), "bluechip");
});

test("score: value^0.7 x (0.15 + popularity) x chase x recent, capped at US$2,000", () => {
  const base: ChaseCandidate = { ...ALL[0]!, marketCents: 10_000, edhrecRank: null, reserved: false, chase: false, releasedOn: rel(900), popularity: null, ownWeight: 0 };
  assert.ok(Math.abs(chaseScore(base, TODAY) - Math.pow(100, 0.7) * 0.15) < 1e-9);
  assert.ok(Math.abs(chaseScore({ ...base, chase: true }, TODAY) / chaseScore(base, TODAY) - 1.15) < 1e-9);
  assert.ok(Math.abs(chaseScore({ ...base, releasedOn: rel(10) }, TODAY) / chaseScore(base, TODAY) - 1.2) < 1e-9);
  assert.ok(Math.abs(chaseScore({ ...base, reserved: true }, TODAY) / chaseScore(base, TODAY) - 0.65 / 0.15) < 1e-9, "the Reserved List counts as 0.5 popularity");
  assert.equal(chaseScore({ ...base, marketCents: 500_000 }, TODAY), chaseScore({ ...base, marketCents: 200_000 }, TODAY), "the value is capped at US$2,000");
  assert.ok(chaseScore({ ...base, edhrecRank: 1 }, TODAY) > chaseScore({ ...base, edhrecRank: 5000 }, TODAY));
  // our own traffic takes over as it grows: wOur = min(1, views / 50,000)
  const own = chaseScore({ ...base, popularity: 1, ownWeight: 1 }, TODAY);
  assert.ok(Math.abs(own - Math.pow(100, 0.7) * 1.15) < 1e-9);
});

const POOL = selectChasePool(ALL, TODAY);

test("the pool: 64 printings, deterministic, whatever the input order", () => {
  assert.equal(POOL.length, 64);
  assert.deepEqual(selectChasePool(ALL, TODAY).map((c) => c.id), POOL.map((c) => c.id));
  assert.deepEqual(selectChasePool([...ALL].reverse(), TODAY).map((c) => c.id), POOL.map((c) => c.id));
  assert.equal(new Set(POOL.map((c) => c.id)).size, 64);
  for (const c of POOL) assert.ok(c.marketCents! >= CHASE.minCents && isCandidate(c));
});

test("diverse: one printing per name in the first 24, two at most after", () => {
  const first = POOL.slice(0, 24).map((c) => c.nameKey);
  assert.equal(new Set(first).size, 24);
  const counts = new Map<string, number>();
  for (const c of POOL) counts.set(c.nameKey, (counts.get(c.nameKey) ?? 0) + 1);
  assert.ok(Math.max(...counts.values()) <= 2);
});

test("the visible row: six different sets and names, three of US$500 or more and three of the US$40 to 500 mainstream", () => {
  const head = POOL.slice(0, 6);
  assert.equal(new Set(head.map((c) => c.setCode)).size, 6);
  assert.equal(new Set(head.map((c) => c.nameKey)).size, 6);
  assert.equal(head.filter((c) => c.marketCents! >= 50_000).length, 3);
  assert.equal(head.filter((c) => c.marketCents! >= 4000 && c.marketCents! < 50_000).length, 3);
  // alternating, so a phone that shows two tiles shows one of each
  const high = head.map((c) => c.marketCents! >= 50_000);
  for (let i = 1; i < high.length; i++) assert.notEqual(high[i], high[i - 1], `place ${i + 1}`);
});

test("the decay spreads sets and buckets: far more sets in the pool than the dearest 24 printings cover", () => {
  const dearest = [...ALL].sort((a, b) => b.marketCents! - a.marketCents! || a.id - b.id).slice(0, 24);
  const poolSets = new Set(POOL.slice(0, 24).map((c) => c.setCode)).size;
  assert.ok(poolSets > new Set(dearest.map((c) => c.setCode)).size, `${poolSets} sets in the first 24`);
  assert.ok(POOL.slice(0, 24).filter((c) => c.setCode === "rvr").length <= 2, "Ravnica Remastered's serialised lands do not fill the strip");
  const buckets = new Set(POOL.slice(0, 24).map((c) => bucketOf(c, TODAY)));
  assert.ok(buckets.size >= 3, [...buckets].join(","));
});

test("the newest sets are guaranteed their slots", () => {
  const hot = (c: ChaseCandidate) => Date.parse(TODAY) - Date.parse(c.releasedOn!) <= CHASE.hotDays * 86_400_000;
  assert.ok(ALL.filter(hot).length >= 2, "the fixture holds printings of sets released in the last 60 days");
  assert.ok(POOL.filter(hot).length >= CHASE.hotMinSlots);
  // withhold the hot printings from the greedy order by pricing them low: the guarantee still swaps them in
  const cold = ALL.map((c) => (hot(c) ? { ...c, marketCents: Math.max(CHASE.minCents, 4000), lowCents: null, edhrecRank: null, chase: false } : c));
  assert.ok(selectChasePool(cold, TODAY).filter(hot).length >= CHASE.hotMinSlots);
});

test("a smaller catalogue gives a smaller pool, an empty one an empty pool, never an error", () => {
  assert.equal(selectChasePool([], TODAY).length, 0);
  assert.equal(selectChasePool(ALL.slice(0, 5), TODAY).length, 5);
  assert.deepEqual(selectChasePool(ALL, TODAY, { poolSize: 12 }).map((c) => c.id), POOL.slice(0, 12).map((c) => c.id), "a shorter pool is the head of the longer one");
});
