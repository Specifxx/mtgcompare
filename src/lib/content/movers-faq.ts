// /movers' FAQ: five Q&As rendered as a visible HubFaq and published as FAQPage
// JSON-LD (RiftCompare's movers FAQ, for One Piece). States only what the page does.
export const MOVERS_FAQ: { q: string; a: string }[] = [
  {
    q: "How is a One Piece card's weekly price move calculated?",
    a: "It compares TCGplayer's market price today with the same card about seven days earlier, in US dollars, so a move reads the same in every market. A card needs a recorded price a week apart before it can appear, and only cards worth US$1 or more are ranked.",
  },
  {
    q: "Why do some cards spike in price?",
    a: "Usually a tournament result, a new set reveal or a reprint announcement changes how many people want a card or how many copies exist. A spike that comes from a single week of demand often settles once the meta adjusts, which is why the best-value list sits beside the risers.",
  },
  {
    q: "What does best value mean?",
    a: "It lists the cards furthest below their own highest market price in the last 90 days. A big gap means the card is cheaper than it recently was; it does not mean it will go back up, and nothing on this page forecasts a price.",
  },
  {
    q: "Is a card that fell this week cheaper to buy now?",
    a: "The move is TCGplayer's market price, a reference built from recent US sales. What you pay is the cheapest in-stock listing in your market, shown on each card's page and compared across stores. A fall in the reference does not always reach a local store's price.",
  },
  {
    q: "Does the whole market move together?",
    a: "Not always. The OP Compare Index tracks the market as one number, so you can tell whether a card moved on its own or with everything else. Open the market page beside this one to compare.",
  },
];
