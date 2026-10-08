// Scryfall access and the join (owner WP01b). The rows below are REAL Scryfall default_cards records (2026-10-07 bulk file), trimmed to the fields the slim row reads: a 7th Edition printing and its foil star twin that share one tcgplayer_id, a transform
// card (Delver of Secrets), a modal DFC, a reversible card whose oracle_id lives only on its faces, an etched Secret Lair printing with both ids, and a digital-only row. The sets are real /sets records. Nothing is fetched: fetch is injected.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import {
  ScryfallRateLimited, buildScryfallIndex, claimByIds, collectorKeys, fetchBulkListing, fetchSets, joinProduct, nameCandidates, parseSets, pickShared, printingNames, scryfallHeaders, slimScryfall, staticSets,
  strictOracleName, streamDefaultCards, streamDefaultCardsFile, type ScryfallRow,
} from "../src/lib/scryfall";

const REAL = {"birdsPlain":{"id":"a2985857-fee5-42a6-9b5d-e157ada52a03","oracle_id":"d3a0b660-358c-41bd-9cd2-41fbf3491b1a","tcgplayer_id":2831,"name":"Birds of Paradise","released_at":"2001-04-11","layout":"normal","image_updated_at":"2026-07-13T12:23:58Z","mana_cost":"{G}","cmc":1.0,"type_line":"Creature — Bird","oracle_text":"Flying\n{T}: Add one mana of any color.","power":"0","toughness":"1","colors":["G"],"color_identity":["G"],"keywords":["Flying"],"produced_mana":["B","G","R","U","W"],"legalities":{"standard":"not_legal","future":"not_legal","historic":"legal","timeless":"legal","gladiator":"legal","pioneer":"not_legal","modern":"legal","legacy":"legal","pauper":"not_legal","vintage":"legal","penny":"legal","commander":"legal","oathbreaker":"legal","standardbrawl":"not_legal","brawl":"legal","competitivebrawl":"legal","alchemy":"not_legal","paupercommander":"not_legal","duel":"legal","oldschool":"not_legal","premodern":"legal","predh":"legal","tlr":"legal"},"games":["paper","mtgo"],"reserved":false,"game_changer":false,"finishes":["nonfoil"],"oversized":false,"promo":false,"reprint":true,"variation":false,"set":"7ed","set_name":"Seventh Edition","set_type":"core","scryfall_set_uri":"https://scryfall.com/sets/7ed?utm_source=api","collector_number":"231","digital":false,"rarity":"rare","border_color":"white","frame":"1997","full_art":false,"textless":false,"edhrec_rank":35,"penny_rank":70},"birdsStar":{"id":"ef7106d8-ec4f-4bc2-aa39-9a605b04cf88","oracle_id":"d3a0b660-358c-41bd-9cd2-41fbf3491b1a","tcgplayer_id":2831,"name":"Birds of Paradise","released_at":"2001-04-11","layout":"normal","image_updated_at":"2026-07-13T12:24:00Z","mana_cost":"{G}","cmc":1.0,"type_line":"Creature — Bird","oracle_text":"Flying\n{T}: Add one mana of any color.","power":"0","toughness":"1","colors":["G"],"color_identity":["G"],"keywords":["Flying"],"produced_mana":["B","G","R","U","W"],"legalities":{"standard":"not_legal","future":"not_legal","historic":"legal","timeless":"legal","gladiator":"legal","pioneer":"not_legal","modern":"legal","legacy":"legal","pauper":"not_legal","vintage":"legal","penny":"legal","commander":"legal","oathbreaker":"legal","standardbrawl":"not_legal","brawl":"legal","competitivebrawl":"legal","alchemy":"not_legal","paupercommander":"not_legal","duel":"legal","oldschool":"not_legal","premodern":"legal","predh":"legal","tlr":"legal"},"games":["paper","mtgo"],"reserved":false,"game_changer":false,"finishes":["foil"],"oversized":false,"promo":false,"reprint":true,"variation":false,"set":"7ed","set_name":"Seventh Edition","set_type":"core","scryfall_set_uri":"https://scryfall.com/sets/7ed?utm_source=api","collector_number":"231★","digital":false,"rarity":"rare","watermark":"wotc","border_color":"black","frame":"1997","full_art":false,"textless":false,"edhrec_rank":35,"penny_rank":70},"transform":{"id":"11bf83bb-c95b-4b4f-9a56-ce7a1816307a","oracle_id":"edd531b9-f615-4399-8c8c-1c5e18c4acbf","tcgplayer_id":56246,"name":"Delver of Secrets // Insectile Aberration","released_at":"2011-09-30","layout":"transform","image_updated_at":"2026-07-13T11:09:44Z","cmc":1.0,"type_line":"Creature — Human Wizard // Creature — Human Insect","color_identity":["U"],"keywords":["Flying","Transform"],"card_faces":[{"name":"Delver of Secrets","mana_cost":"{U}","type_line":"Creature — Human Wizard","oracle_text":"At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform this creature.","colors":["U"],"power":"1","toughness":"1"},{"name":"Insectile Aberration","mana_cost":"","type_line":"Creature — Human Insect","oracle_text":"Flying","colors":["U"],"color_indicator":["U"],"power":"3","toughness":"2"}],"all_parts":[{"object":"related_card","id":"99ce1bee-8f95-4284-8e06-9de9bfcb53b5","component":"combo_piece","name":"Innistrad Checklist","type_line":"Card","uri":"https://api.scryfall.com/cards/99ce1bee-8f95-4284-8e06-9de9bfcb53b5"},{"object":"related_card","id":"11bf83bb-c95b-4b4f-9a56-ce7a1816307a","component":"combo_piece","name":"Delver of Secrets // Insectile Aberration","type_line":"Creature — Human Wizard // Creature — Human Insect","uri":"https://api.scryfall.com/cards/11bf83bb-c95b-4b4f-9a56-ce7a1816307a"}],"legalities":{"standard":"not_legal","future":"not_legal","historic":"legal","timeless":"legal","gladiator":"legal","pioneer":"legal","modern":"legal","legacy":"legal","pauper":"legal","vintage":"legal","penny":"not_legal","commander":"legal","oathbreaker":"legal","standardbrawl":"not_legal","brawl":"legal","competitivebrawl":"legal","alchemy":"not_legal","paupercommander":"legal","duel":"legal","oldschool":"not_legal","premodern":"not_legal","predh":"not_legal","tlr":"legal"},"games":["paper","mtgo"],"reserved":false,"game_changer":false,"finishes":["nonfoil","foil"],"oversized":false,"promo":false,"reprint":false,"variation":false,"set":"isd","set_name":"Innistrad","set_type":"expansion","scryfall_set_uri":"https://scryfall.com/sets/isd?utm_source=api","collector_number":"51","digital":false,"rarity":"common","border_color":"black","frame":"2003","frame_effects":["sunmoondfc"],"full_art":false,"textless":false,"edhrec_rank":16190,"penny_rank":181},"mdfc":{"id":"499c2b20-e83e-40ff-919e-1d134ad50c0a","oracle_id":"562d71b9-1646-474e-9293-55da6947a758","tcgplayer_id":222164,"name":"Agadeem's Awakening // Agadeem, the Undercrypt","released_at":"2020-09-25","layout":"modal_dfc","image_updated_at":"2026-07-13T07:54:38Z","cmc":3.0,"type_line":"Sorcery // Land","color_identity":["B"],"keywords":[],"produced_mana":["B"],"card_faces":[{"name":"Agadeem's Awakening","mana_cost":"{X}{B}{B}{B}","type_line":"Sorcery","oracle_text":"Return from your graveyard to the battlefield any number of target creature cards that each have a different mana value X or less.","colors":["B"]},{"name":"Agadeem, the Undercrypt","mana_cost":"","type_line":"Land","oracle_text":"As this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {B}.","colors":[]}],"legalities":{"standard":"not_legal","future":"not_legal","historic":"legal","timeless":"legal","gladiator":"legal","pioneer":"legal","modern":"legal","legacy":"legal","pauper":"not_legal","vintage":"legal","penny":"not_legal","commander":"legal","oathbreaker":"legal","standardbrawl":"not_legal","brawl":"legal","competitivebrawl":"legal","alchemy":"not_legal","paupercommander":"not_legal","duel":"legal","oldschool":"not_legal","premodern":"not_legal","predh":"not_legal","tlr":"legal"},"games":["paper","mtgo"],"reserved":false,"game_changer":false,"finishes":["nonfoil","foil"],"oversized":false,"promo":false,"reprint":false,"variation":false,"set":"znr","set_name":"Zendikar Rising","set_type":"expansion","scryfall_set_uri":"https://scryfall.com/sets/znr?utm_source=api","collector_number":"336","digital":false,"rarity":"mythic","border_color":"black","frame":"2015","frame_effects":["extendedart"],"full_art":false,"textless":false,"promo_types":["boosterfun"],"edhrec_rank":964},"reversible":{"id":"018830b2-dff9-45f3-9cc2-dc5b2eec0e54","tcgplayer_id":533913,"name":"Jinnie Fay, Jetmir's Second // Jinnie Fay, Jetmir's Second","released_at":"2024-01-22","layout":"reversible_card","image_updated_at":"2026-07-19T17:42:14Z","color_identity":["G","R","W"],"keywords":[],"card_faces":[{"oracle_id":"61fbaaf2-4286-4e9a-b9cb-aa31262b596a","layout":"normal","name":"Jinnie Fay, Jetmir's Second","mana_cost":"{R/G}{G}{G/W}","cmc":3.0,"type_line":"Legendary Creature — Elf Druid","oracle_text":"If you would create one or more tokens, you may instead create that many 2/2 green Cat creature tokens with haste or that many 3/1 green Dog creature tokens with vigilance.","colors":["G","R","W"],"power":"3","toughness":"3"},{"oracle_id":"61fbaaf2-4286-4e9a-b9cb-aa31262b596a","layout":"normal","name":"Jinnie Fay, Jetmir's Second","mana_cost":"{R/G}{G}{G/W}","cmc":3.0,"type_line":"Legendary Creature — Elf Druid","oracle_text":"If you would create one or more tokens, you may instead create that many 2/2 green Cat creature tokens with haste or that many 3/1 green Dog creature tokens with vigilance.","colors":["G","R","W"],"power":"3","toughness":"3"}],"all_parts":[{"object":"related_card","id":"018830b2-dff9-45f3-9cc2-dc5b2eec0e54","component":"combo_piece","name":"Jinnie Fay, Jetmir's Second // Jinnie Fay, Jetmir's Second","type_line":"Legendary Creature — Elf Druid // Legendary Creature — Elf Druid","uri":"https://api.scryfall.com/cards/018830b2-dff9-45f3-9cc2-dc5b2eec0e54"},{"object":"related_card","id":"53f30e6b-602d-4e7d-b217-8c8d6b9ecc27","component":"token","name":"Dog","type_line":"Token Creature — Dog","uri":"https://api.scryfall.com/cards/53f30e6b-602d-4e7d-b217-8c8d6b9ecc27"},{"object":"related_card","id":"687bbd21-ae87-43b9-9d32-e981e7a78d76","component":"token","name":"Cat","type_line":"Token Creature — Cat","uri":"https://api.scryfall.com/cards/687bbd21-ae87-43b9-9d32-e981e7a78d76"}],"legalities":{"standard":"not_legal","future":"not_legal","historic":"legal","timeless":"legal","gladiator":"legal","pioneer":"legal","modern":"legal","legacy":"legal","pauper":"not_legal","vintage":"legal","penny":"legal","commander":"legal","oathbreaker":"legal","standardbrawl":"not_legal","brawl":"legal","competitivebrawl":"legal","alchemy":"not_legal","paupercommander":"not_legal","duel":"legal","oldschool":"not_legal","premodern":"not_legal","predh":"not_legal","tlr":"legal"},"games":["paper"],"reserved":false,"game_changer":false,"finishes":["nonfoil"],"oversized":false,"promo":false,"reprint":true,"variation":false,"set":"sld","set_name":"Secret Lair Drop","set_type":"box","scryfall_set_uri":"https://scryfall.com/sets/sld?utm_source=api","collector_number":"1556","digital":false,"rarity":"rare","border_color":"borderless","frame":"2015","frame_effects":["legendary","inverted"],"full_art":false,"textless":false,"promo_types":["thick"],"edhrec_rank":4371,"penny_rank":5483},"etched":{"id":"0310bb0e-bd22-470e-8711-4e15aec86578","oracle_id":"d36e0c9f-c025-4dfe-9644-9cad2461ce38","tcgplayer_id":242381,"tcgplayer_etched_id":242382,"name":"Gruul Signet","released_at":"2021-06-21","layout":"normal","image_updated_at":"2026-07-13T07:09:14Z","mana_cost":"{2}","cmc":2.0,"type_line":"Artifact","oracle_text":"{1}, {T}: Add {R}{G}.","colors":[],"color_identity":["G","R"],"keywords":[],"produced_mana":["G","R"],"legalities":{"standard":"not_legal","future":"not_legal","historic":"legal","timeless":"legal","gladiator":"legal","pioneer":"not_legal","modern":"legal","legacy":"legal","pauper":"legal","vintage":"legal","penny":"legal","commander":"legal","oathbreaker":"legal","standardbrawl":"not_legal","brawl":"legal","competitivebrawl":"legal","alchemy":"not_legal","paupercommander":"legal","duel":"legal","oldschool":"not_legal","premodern":"not_legal","predh":"legal","tlr":"legal"},"games":["paper"],"reserved":false,"game_changer":false,"finishes":["nonfoil","etched"],"oversized":false,"promo":false,"reprint":true,"variation":false,"set":"sld","set_name":"Secret Lair Drop","set_type":"box","scryfall_set_uri":"https://scryfall.com/sets/sld?utm_source=api","collector_number":"288","digital":false,"rarity":"rare","border_color":"black","frame":"1997","full_art":false,"textless":false,"edhrec_rank":825,"penny_rank":3383},"digital":{"id":"0003b07e-0d6e-4844-93c7-3f1f6a7d8c4d","oracle_id":"a7887b24-977d-4a40-bb30-4bf467e5dba6","name":"Bronze Horse","released_at":"2011-01-10","layout":"normal","image_updated_at":"2026-07-13T11:16:58Z","mana_cost":"{7}","cmc":7.0,"type_line":"Artifact Creature — Horse","oracle_text":"Trample\nAs long as you control another creature, prevent all damage that would be dealt to this creature by spells that target it.","power":"4","toughness":"4","colors":[],"color_identity":[],"keywords":["Trample"],"legalities":{"standard":"not_legal","future":"not_legal","historic":"not_legal","timeless":"not_legal","gladiator":"not_legal","pioneer":"not_legal","modern":"not_legal","legacy":"legal","pauper":"not_legal","vintage":"legal","penny":"legal","commander":"legal","oathbreaker":"legal","standardbrawl":"not_legal","brawl":"not_legal","competitivebrawl":"not_legal","alchemy":"not_legal","paupercommander":"not_legal","duel":"legal","oldschool":"not_legal","premodern":"legal","predh":"legal","tlr":"not_legal"},"games":["mtgo"],"reserved":false,"game_changer":false,"finishes":["nonfoil","foil"],"oversized":false,"promo":false,"reprint":true,"variation":false,"set":"me4","set_name":"Masters Edition IV","set_type":"masters","scryfall_set_uri":"https://scryfall.com/sets/me4?utm_source=api","collector_number":"186","digital":true,"rarity":"uncommon","border_color":"black","frame":"1997","full_art":false,"textless":false,"edhrec_rank":24272}} as Record<string, Record<string, unknown>>;
const REAL_SETS = {"object":"list","has_more":false,"data":[{"object":"set","code":"mh3","name":"Modern Horizons 3","set_type":"draft_innovation","tcgplayer_id":23444,"released_at":"2024-06-14","digital":false},{"object":"set","code":"who","name":"Doctor Who","set_type":"commander","tcgplayer_id":23165,"released_at":"2023-10-13","digital":false},{"object":"set","code":"znr","name":"Zendikar Rising","set_type":"expansion","tcgplayer_id":2648,"released_at":"2020-09-25","digital":false},{"object":"set","code":"sld","name":"Secret Lair Drop","set_type":"box","tcgplayer_id":2576,"released_at":"2019-12-02","digital":false},{"object":"set","code":"isd","name":"Innistrad","set_type":"expansion","tcgplayer_id":59,"released_at":"2011-09-30","digital":false},{"object":"set","code":"me4","name":"Masters Edition IV","set_type":"masters","released_at":"2011-01-10","digital":true},{"object":"set","code":"7ed","name":"Seventh Edition","set_type":"core","tcgplayer_id":2,"released_at":"2001-04-11","digital":false}]};

// The trimmed rows keep no image links; the slim row only counts the faces that have one, so give each face the (empty) object a real row carries.
for (const r of Object.values(REAL)) { if (Array.isArray(r.card_faces)) for (const f of r.card_faces as Record<string, unknown>[]) f.image_uris = {}; else r.image_uris = {}; }
const slim = (k: string): ScryfallRow => { const r = slimScryfall(REAL[k]); assert.ok(r, `${k} is a paper row`); return r; };
const sets = parseSets(REAL_SETS);
const paper = ["birdsPlain", "birdsStar", "transform", "mdfc", "reversible", "etched"].map(slim);
const idx = buildScryfallIndex(paper, sets);
const tmp = (): { dir: string; done: () => void } => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scry-")); return { dir, done: () => fs.rmSync(dir, { recursive: true, force: true }) }; };
const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("headers: the build string in CI, the production string with the site elsewhere, never an e-mail address", () => {
  const ci = scryfallHeaders({ GITHUB_ACTIONS: "true" }), prod = scryfallHeaders({ NEXT_PUBLIC_SITE_URL: "https://mtgcompare.app/" }), dflt = scryfallHeaders({});
  assert.match(ci["User-Agent"]!, /^MTGCompare-build\/\d/); assert.equal(prod["User-Agent"], "MTGCompare/1.0 (+https://mtgcompare.app)"); assert.match(dflt["User-Agent"]!, /^MTGCompare\/1\.0 \(\+https:\/\//);
  for (const h of [ci, prod, dflt]) { assert.equal(h.Accept, "*/*"); assert.ok(!JSON.stringify(h).includes("@"), "no e-mail in a header"); assert.ok(!/opcompare|riftcompare/i.test(h["User-Agent"]!)); }
});

test("slimScryfall: a digital-only row is not paper and is dropped; garbage is dropped", () => {
  assert.equal(slimScryfall(REAL.digital), null); assert.equal(slimScryfall(null), null); assert.equal(slimScryfall({ name: "no id", games: ["paper"] }), null); assert.equal(slimScryfall("x"), null);
});

test("slimScryfall: a plain paper printing keeps its facts, its two ids and its finishes", () => {
  const e = slim("etched");
  assert.equal(e.name, "Gruul Signet"); assert.equal(e.set, "sld"); assert.equal(e.cn, "288"); assert.equal(e.tcgplayerId, 242381); assert.equal(e.tcgplayerEtchedId, 242382); assert.deepEqual(e.finishes, ["nonfoil", "etched"]);
  assert.equal(e.oracleId, "d36e0c9f-c025-4dfe-9644-9cad2461ce38"); assert.equal(e.nfaces, 1); assert.deepEqual(e.faces, []); assert.ok(e.games.includes("paper")); assert.equal(e.digital, false);
  assert.ok(e.legalities && typeof e.legalities === "object" && Object.keys(e.legalities).length > 5);
});

test("slimScryfall: a transform / modal DFC takes mana cost, type line, colors and oracle text from the faces, and lists both face names", () => {
  const d = slim("transform"), m = slim("mdfc");
  assert.equal(d.layout, "transform"); assert.deepEqual(d.faces, ["Delver of Secrets", "Insectile Aberration"]); assert.equal(d.nfaces, 2);
  assert.equal(d.manaCost, "{U}", "a transform card has no top-level mana cost: face 0 supplies it"); assert.deepEqual(d.colors, ["U"]); assert.match(d.typeLine, /^Creature/); assert.equal(d.power, "1"); assert.equal(d.toughness, "1");
  assert.ok(d.oracleText && d.oracleText.includes("\n//\n"), "face texts are joined");
  assert.equal(m.layout, "modal_dfc"); assert.deepEqual(m.faces, ["Agadeem's Awakening", "Agadeem, the Undercrypt"]); assert.equal(m.nfaces, 2);
  assert.ok(d.oracleId && m.oracleId && d.oracleId !== m.oracleId);
});

test("slimScryfall: a reversible card has no top-level oracle_id; the oracle id comes from face 0", () => {
  const r = slim("reversible"); assert.equal(r.layout, "reversible_card"); assert.equal(r.oracleId, "61fbaaf2-4286-4e9a-b9cb-aa31262b596a"); assert.equal(r.faces.length, 2); assert.equal(r.faceFlavor.length, 2); assert.equal(r.tcgplayerId, 533913);
});

test("slimScryfall: identical legality vectors and oracle texts are one shared object (the memory the 118k-row run depends on)", () => {
  const a = slimScryfall(REAL.birdsPlain)!, b = slimScryfall(REAL.birdsStar)!;
  assert.strictEqual(a.legalities, b.legalities); assert.strictEqual(a.oracleText, b.oracleText);
});

test("printingNames: the card name, each half, every face and every flavor name, folded", () => {
  const n = printingNames(slim("transform")); for (const k of ["delver of secrets insectile aberration", "delver of secrets", "insectile aberration"]) assert.ok(n.has(k), k);   // fold drops punctuation
  assert.ok(printingNames({ name: "Jinnie Fay", flavorName: "Mountain", printedName: null, faces: [], faceFlavor: [] }).has("mountain"));
});

test("parseSets: the /sets record becomes ScryfallSet and keeps the TCGplayer group id, the release date and the digital flag", () => {
  const byCode = new Map(sets.map((s) => [s.code, s]));
  assert.equal(sets.length, 7); assert.equal(byCode.get("sld")!.tcgplayerId, 2576); assert.equal(byCode.get("isd")!.tcgplayerId, 59); assert.equal(byCode.get("me4")!.digital, true); assert.equal(byCode.get("me4")!.tcgplayerId, null);
  assert.equal(byCode.get("who")!.releasedAt, "2023-10-13"); assert.deepEqual(parseSets([]), []); assert.deepEqual(parseSets(null), []);
});

test("collectorKeys / nameCandidates: the keys a number and a name can be found under", () => {
  assert.deepEqual(collectorKeys("231★"), [[0, "231★"], [1, "231"]]); assert.deepEqual(collectorKeys("0205"), [[0, "205"]]);
  assert.deepEqual(collectorKeys("38p"), [[0, "38p"], [2, "38"]]); assert.ok(collectorKeys("XLN-217").some(([s, k]) => s === 3 && k === "217"));
  const c = nameCandidates("Forest (0205)"); assert.ok(c.has("forest")); assert.ok(nameCandidates("Goblin Token").has("goblin"));
  const split = nameCandidates("Delver of Secrets // Insectile Aberration"); assert.ok(split.has("delver of secrets") && split.has("insectile aberration"));
  assert.ok(nameCandidates("Jinnie Fay - Showcase").has("jinnie fay"));
});

test("the index: ids, etched ids, sets and names (oracle names answer for real game cards, face names included)", () => {
  assert.equal(idx.byTcgId.get(2831)!.length, 2, "one tcgplayer_id, two printings");
  assert.equal(idx.byTcgId.get(242381)![0]!.name, "Gruul Signet"); assert.equal(idx.byEtchedId.get(242382)![0]!.name, "Gruul Signet"); assert.equal(idx.byTcgId.get(242382), undefined);
  assert.equal(idx.bySet.get("7ed")!.length, 2); assert.equal(idx.sets.get("isd")!.name, "Innistrad");
  assert.deepEqual([...idx.oracleByNameKey.get("delver of secrets")!], [slim("transform").oracleId]); assert.deepEqual([...idx.oracleByNameKey.get("insectile aberration")!], [slim("transform").oracleId]);
  assert.ok(idx.oracleByNameKey.has("agadeem the undercrypt"));
});

test("pickShared: a clean pair is the nonfoil printing and its foil-only star twin; every other shape takes the lowest collector number", () => {
  const plain = slim("birdsPlain"), star = slim("birdsStar");
  const clean = pickShared([star, plain]); assert.equal(clean.clean, true); assert.equal(clean.row.id, plain.id); assert.equal(clean.starRow!.id, star.id);
  assert.equal(pickShared([plain]).starRow, null); assert.equal(pickShared([plain]).clean, false);
  const starAlsoNonfoil: ScryfallRow = { ...star, finishes: ["nonfoil", "foil"] };                              // the 17 odd shapes: the twin is not foil only
  const odd = pickShared([starAlsoNonfoil, plain]); assert.equal(odd.clean, false); assert.equal(odd.row.id, plain.id); assert.equal(odd.starRow, null);
  const three = pickShared([plain, star, { ...plain, id: "00000000-0000-4000-8000-000000000001", cn: "232" }]); assert.equal(three.clean, false); assert.equal(three.row.cn, "231");
});

test("claimByIds: the lowest productId owns a printing; only singles teach the group's sets", () => {
  const { claimed, memory } = claimByIds([{ productId: 242382, groupId: 2576, single: true }, { productId: 242381, groupId: 2576, single: true }, { productId: 2831, groupId: 2, single: true }, { productId: 9, groupId: 2, single: false }], idx);
  const gruul = slim("etched"); assert.equal(claimed.get(gruul.id), 242381, "id and etched id are the same printing: the lower product holds it");
  assert.equal(claimed.get(slim("birdsPlain").id), 2831); assert.equal(claimed.get(slim("birdsStar").id), 2831);
  assert.equal(memory.learned.get(2576)!.get("sld"), 2); assert.equal(memory.learned.get(2)!.get("7ed"), 2); assert.equal(memory.groupOf.get(9), 2);
  assert.equal(claimByIds([{ productId: 9, groupId: 2, single: false }], idx).memory.learned.size, 0);
});

test("joinProduct: id, etched id, then nothing for a token or art card that no id reaches", () => {
  const { claimed, memory } = claimByIds([{ productId: 242381, groupId: 2576, single: true }, { productId: 242382, groupId: 2576, single: true }, { productId: 2831, groupId: 2, single: true }], idx);
  const g = { name: "Secret Lair Drop", abbreviation: "SLD", kind: "secret-lair" };
  const byId = joinProduct({ productId: 242381, groupId: 2576, name: "Gruul Signet", number: "288", cls: 0 }, g, idx, claimed, memory); assert.equal(byId.linkLevel, "id"); assert.equal(byId.row!.set, "sld");
  const etched = joinProduct({ productId: 242382, groupId: 2576, name: "Gruul Signet (Foil Etched)", number: "288", cls: 0 }, g, idx, claimed, memory); assert.equal(etched.linkLevel, "etched"); assert.equal(etched.row!.tcgplayerEtchedId, 242382);
  const shared = joinProduct({ productId: 2831, groupId: 2, name: "Birds of Paradise", number: "231", cls: 0 }, { name: "Seventh Edition", abbreviation: "7ED", kind: "expansion" }, idx, claimed, memory);
  assert.equal(shared.linkLevel, "id"); assert.equal(shared.row!.cn, "231"); assert.equal(shared.starRow!.cn, "231★"); assert.equal(shared.oracleId, slim("birdsPlain").oracleId);
  const token = joinProduct({ productId: 1, groupId: 59, name: "Delver of Secrets // Insectile Aberration Token", number: "51", cls: 3 }, { name: "Innistrad", abbreviation: "ISD", kind: "expansion" }, idx, new Map(), undefined);
  assert.equal(token.linkLevel, "none", "a class-3 product is joined by id only"); assert.equal(token.row, null); assert.equal(token.oracleId, null);
});

test("joinProduct: the static set of the group (its TCGplayer id) finds the printing by set, number and name; a printing another product owns is a VARIANT of that product", () => {
  const g = { name: "Innistrad", abbreviation: "ISD", kind: "expansion" };
  assert.ok(staticSets(idx, { groupId: 59, ...g }).has("isd"), "the set whose tcgplayer_id is the group id");
  const delver = slim("transform");
  const free = new Map<string, number>();                                                                        // no id owner: a fallback join
  const fb = joinProduct({ productId: 999001, groupId: 59, name: "Delver of Secrets // Insectile Aberration", number: "51", cls: 0 }, g, idx, free, undefined);
  assert.equal(fb.linkLevel, "fallback"); assert.equal(fb.row!.id, delver.id); assert.equal(fb.oracleId, delver.oracleId);
  const owned = claimByIds([{ productId: 56246, groupId: 59, single: true }, { productId: 999001, groupId: 59, single: true }], idx);   // 56246 owns it by id: 999001 is its variant (a stamped or rainbow copy)
  const v = joinProduct({ productId: 999001, groupId: 59, name: "Delver of Secrets // Insectile Aberration (Stamped)", number: "51", cls: 0 }, g, idx, owned.claimed, owned.memory);
  assert.equal(v.linkLevel, "variant"); assert.equal(v.rootProductId, 56246); assert.equal(v.row!.id, delver.id);
  const wrongName = joinProduct({ productId: 999002, groupId: 59, name: "Some Other Card", number: "51", cls: 0 }, g, idx, free, undefined);
  assert.notEqual(wrongName.linkLevel, "fallback", "the name gate: the right number with the wrong name never joins");
});

test("joinProduct: a name that is one oracle links to that oracle with no printing; an ambiguous printing is skipped, never guessed", () => {
  const g = { name: "Not A Real Group", abbreviation: "", kind: "expansion" };
  const o = joinProduct({ productId: 999003, groupId: 777, name: "Agadeem's Awakening", number: null, cls: 0 }, g, idx, new Map(), undefined);
  assert.equal(o.linkLevel, "oracle-name"); assert.equal(o.row, null); assert.equal(o.oracleId, slim("mdfc").oracleId);
  assert.equal(strictOracleName("Agadeem, the Undercrypt (Showcase)", idx), slim("mdfc").oracleId, "a back-face name and a trailing group fold to the oracle"); assert.equal(strictOracleName("Nothing Like It", idx), null);
  // two free printings with the same number and name in one set, neither a star twin: a guess would pick one at random
  const plain = slim("birdsPlain"); const twin: ScryfallRow = { ...plain, id: "00000000-0000-4000-8000-0000000000aa", tcgplayerId: null, finishes: ["foil"] };
  const idx2 = buildScryfallIndex([{ ...plain, tcgplayerId: null }, twin], sets);
  const a = joinProduct({ productId: 999004, groupId: 2, name: "Birds of Paradise", number: "231", cls: 0 }, { name: "Seventh Edition", abbreviation: "7ED", kind: "expansion" }, idx2, new Map(), undefined);
  assert.equal(a.ambiguous, true); assert.equal(a.row, null, "no printing is chosen"); assert.equal(a.oracleId, plain.oracleId, "the oracle by exact name is still unambiguous");
});

test("fetchBulkListing: the default_cards entry, its jsonl download and size; a list without one is an error", async () => {
  const calls: { url: string; ua: string }[] = [];
  const f = (async (url: string, init?: RequestInit) => { calls.push({ url, ua: String((init?.headers as Record<string, string>)["User-Agent"]) }); return jsonResponse({ object: "list", data: [
    { type: "oracle_cards", updated_at: "2026-10-07T21:01:55.000+00:00", jsonl_download_uri: "https://data.scryfall.io/oracle-cards/oracle-cards-20261007210155.jsonl.gz", compressed_size: 24597502 },
    { type: "default_cards", updated_at: "2026-10-07T21:05:42.958+00:00", jsonl_download_uri: "https://data.scryfall.io/default-cards/default-cards-20261007210542.jsonl.gz", compressed_size: 78779086 }] }); }) as unknown as typeof fetch;
  const b = await fetchBulkListing({ fetch: f });
  assert.deepEqual(b, { updatedAt: "2026-10-07T21:05:42.958+00:00", jsonlUrl: "https://data.scryfall.io/default-cards/default-cards-20261007210542.jsonl.gz", compressedSize: 78779086 });
  assert.deepEqual(calls.map((c) => c.url), ["https://api.scryfall.com/bulk-data"]); assert.ok(!calls[0]!.ua.includes("@"));
  await assert.rejects(fetchBulkListing({ fetch: (async () => jsonResponse({ data: [{ type: "oracle_cards", updated_at: "x" }] })) as unknown as typeof fetch }), /default_cards/);
});

test("fetchSets: one GET /sets, parsed", async () => {
  const urls: string[] = []; const s = await fetchSets({ fetch: (async (u: string) => { urls.push(u); return jsonResponse(JSON.parse(JSON.stringify(REAL_SETS))); }) as unknown as typeof fetch });
  assert.deepEqual(urls, ["https://api.scryfall.com/sets"]); assert.equal(s.length, 7);
});

test("a 429 backs off once and retries; a second 429 is ScryfallRateLimited (the caller continues with SCRYFALL_MODE=off); any other error is an error", async () => {
  const was = process.env.SCRYFALL_BACKOFF_MS; process.env.SCRYFALL_BACKOFF_MS = "0";
  try {
    let n = 0; const once = (async () => (++n === 1 ? new Response("slow down", { status: 429 }) : jsonResponse({ data: [{ type: "default_cards", updated_at: "u", jsonl_download_uri: "https://data.scryfall.io/x.gz" }] }))) as unknown as typeof fetch;
    assert.equal((await fetchBulkListing({ fetch: once })).updatedAt, "u"); assert.equal(n, 2, "one retry");
    let m = 0; const always = (async () => { m++; return new Response("no", { status: 429 }); }) as unknown as typeof fetch;
    await assert.rejects(fetchBulkListing({ fetch: always }), (e: unknown) => e instanceof ScryfallRateLimited && /429/.test((e as Error).message)); assert.equal(m, 2, "never a third call");
    await assert.rejects(fetchSets({ fetch: (async () => new Response("down", { status: 503 })) as unknown as typeof fetch }), /HTTP 503/);
  } finally { if (was === undefined) delete process.env.SCRYFALL_BACKOFF_MS; else process.env.SCRYFALL_BACKOFF_MS = was; }
});

test("streaming: a gzipped jsonl file, a plain one and our own slim cache file all yield the paper rows only", async () => {
  const t = tmp(); try {
    const lines = Object.values(REAL).map((r) => JSON.stringify(r)); const gz = path.join(t.dir, "default-cards.jsonl.gz"), plain = path.join(t.dir, "default-cards.jsonl"), slimF = path.join(t.dir, "slim.ndjson");
    fs.writeFileSync(gz, zlib.gzipSync(lines.join("\n") + "\n")); fs.writeFileSync(plain, lines.join("\n") + "\n\n");
    const got: ScryfallRow[] = []; const a = await streamDefaultCardsFile(gz, (r) => got.push(r));
    assert.deepEqual(a, { rows: 7, kept: 6 }, "the digital-only row is read and dropped"); assert.deepEqual(got.map((r) => r.set).sort(), ["7ed", "7ed", "isd", "sld", "sld", "znr"]);
    const b = await streamDefaultCardsFile(plain, () => undefined); assert.deepEqual(b, { rows: 7, kept: 6 }, "blank lines are skipped");
    fs.writeFileSync(slimF, got.map((r) => JSON.stringify(r)).join("\n")); const back: ScryfallRow[] = []; const c = await streamDefaultCardsFile(slimF, (r) => back.push(r));
    assert.deepEqual(c, { rows: 6, kept: 6 }); assert.deepEqual(back, got, "a slim row passes through unchanged");
  } finally { t.done(); }
});

test("streamDefaultCards: the download is gunzipped line by line from the response body; a refused download is an error", async () => {
  const lines = Object.values(REAL).map((r) => JSON.stringify(r)).join("\n") + "\n"; const gz = zlib.gzipSync(lines); const seen: string[] = [];
  const f = (async (u: string, init?: RequestInit) => { seen.push(`${u} ${(init?.headers as Record<string, string>)["User-Agent"]}`); return new Response(new Uint8Array(gz), { status: 200 }); }) as unknown as typeof fetch;
  const got: string[] = []; const r = await streamDefaultCards("https://data.scryfall.io/default-cards/x.jsonl.gz", (row) => got.push(row.name), { fetch: f });
  assert.deepEqual(r, { rows: 7, kept: 6 }); assert.ok(got.includes("Gruul Signet") && !got.includes("Bronze Horse")); assert.ok(seen[0]!.startsWith("https://data.scryfall.io/"));
  await assert.rejects(streamDefaultCards("https://data.scryfall.io/gone.gz", () => undefined, { fetch: (async () => new Response("", { status: 404 })) as unknown as typeof fetch }), /HTTP 404/);
});
