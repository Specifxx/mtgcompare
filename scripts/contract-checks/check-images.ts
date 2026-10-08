import { imageFor, backImageFor, scryfallImage, cardImage, hasImageFor } from "../../src/lib/images";
import { CARD_FLAGS } from "../../src/lib/constants";
let fails = 0; const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log("FAIL", m, JSON.stringify(a), JSON.stringify(b)); } };
const sid = "0000419b-0bba-4488-8f7a-6194544ce91e";
eq(scryfallImage(sid, "grid"), "https://cards.scryfall.io/grid/front/0/0/0000419b-0bba-4488-8f7a-6194544ce91e.webp", "scry grid");
eq(scryfallImage(sid, "normal", "back"), "https://cards.scryfall.io/normal/back/0/0/0000419b-0bba-4488-8f7a-6194544ce91e.jpg", "scry back");
eq(cardImage.tile(496078), "https://tcgplayer-cdn.tcgplayer.com/product/496078_400w.jpg", "cardImage.tile");
eq(imageFor({ id: 5, scryId: sid, flags: CARD_FLAGS.TCGIMG | CARD_FLAGS.SCRYIMG }, "tile"), "https://tcgplayer-cdn.tcgplayer.com/product/5_400w.jpg", "tcg first");
eq(imageFor({ id: 5, scryId: sid, flags: CARD_FLAGS.SCRYIMG }, "tile"), scryfallImage(sid, "grid"), "scry fallback");
eq(imageFor({ id: 5, scryId: sid, flags: CARD_FLAGS.TCGIMG | CARD_FLAGS.SCRYIMG }, "large", "scryfall"), scryfallImage(sid, "display"), "flip primary");
eq(imageFor({ id: 5, scryId: null, flags: 0 }, "thumb"), null, "none");
eq(backImageFor({ id: 5, scryId: sid, flags: CARD_FLAGS.DFC | CARD_FLAGS.SCRYIMG }, "large"), scryfallImage(sid, "display", "back"), "back");
eq(backImageFor({ id: 5, scryId: sid, flags: CARD_FLAGS.SCRYIMG }, "large"), null, "no back on non-DFC");
// critique 15: share images need a JPEG on BOTH hosts (satori cannot decode WebP), and hasImage means "any host has one"
eq(imageFor({ id: 5, scryId: sid, flags: CARD_FLAGS.SCRYIMG }, "og"), "https://cards.scryfall.io/normal/front/0/0/0000419b-0bba-4488-8f7a-6194544ce91e.jpg", "og via scryfall is a jpg");
eq(imageFor({ id: 5, scryId: sid, flags: CARD_FLAGS.TCGIMG }, "og"), "https://tcgplayer-cdn.tcgplayer.com/product/5_400w.jpg", "og via tcgplayer is a jpg");
eq(imageFor({ id: 5, scryId: sid, flags: CARD_FLAGS.TCGIMG | CARD_FLAGS.SCRYIMG }, "og", "scryfall")?.endsWith(".jpg"), true, "og never webp even when scryfall is primary");
eq([hasImageFor({ id: 1, scryId: sid, flags: CARD_FLAGS.SCRYIMG }), hasImageFor({ id: 1, scryId: null, flags: CARD_FLAGS.TCGIMG }), hasImageFor({ id: 1, scryId: null, flags: 0 }), hasImageFor({ id: 1, scryId: null, flags: CARD_FLAGS.SCRYIMG })], [true, true, false, false], "hasImageFor");
console.log(fails ? fails + " FAILURES" : "images checks pass");
