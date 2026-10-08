import { stripeUrlIn } from "@/lib/checkout-params";

// Some Stripe account-level errors (the business name not set, a portal not
// saved: one-time, Stripe-dashboard-only steps with no API equivalent) embed a
// dashboard URL right in the message text. Dumping that as plain red text means
// the user has to select/copy a URL out of a sentence; this turns it into a
// real button instead, so the only "external link" friction left is the click
// itself, not parsing it out of prose (RiftCompare's StripeErrorNotice).
//
// Only a stripe.com address is ever linked (stripeUrlIn), and the checkout and
// portal routes send such a message only to an admin: a visitor gets a generic
// line. Pure presentation, so it renders in a server or a client tree.
export function StripeErrorNotice({ message }: { message: string }) {
  const url = stripeUrlIn(message);

  return (
    <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3" role="alert">
      <p className="text-sm text-rose-300">{message}</p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primary mt-2 inline-flex text-xs">
          Open Stripe settings →
        </a>
      )}
    </div>
  );
}
