import { InlineSignupPrompt } from "./InlineSignupPrompt";

// Inline sign-up CTA for posts and guides (RiftCompare's ArticleSignupCta), placed
// once after the intro and once at the end. While email is off (getEmailStatus)
// it promises nothing by email: it offers the free account, which is what gives
// price-drop flags on the cards a reader wants. Hidden for signed-in readers
// (InlineSignupPrompt settles useMe first, so nothing flashes).
export function ArticleSignupCta({ placement }: { placement: "article_intro" | "article_end" }) {
  return (
    <div className="not-prose my-6">
      <InlineSignupPrompt
        surface={placement}
        title="Watch the cards in this post, free"
        body="A free account lets you heart cards to follow their price, shows Deal Finder's three biggest savings in your market, and is how you get Plus or Premium when you want them."
      />
    </div>
  );
}
