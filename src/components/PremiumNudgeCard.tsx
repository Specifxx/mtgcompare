import Link from "next/link";
import PlanButton from "./PlanButton";
import { memberNudgeHref } from "@/lib/premium-nudge";

// The personal nudge — "4 cards you watch are underpriced right now" — as a
// card (RiftCompare's PremiumNudgeCard, ported in wave 2). Copy comes from
// lib/premium-nudge.ts nudgeCopy(), which returns null when there is nothing
// true and specific to say; callers render this only when it did not.
//
// FREE ACCOUNT: the upsell, on the gate of the tool the line talks about: Deal
// Finder is Plus ("deal"), Rising Cards is Premium ("rising", lib/premium-gates.ts
// FEATURE_RULES). MEMBER: never a wall — a link straight to the list it talks about.
export function PremiumNudgeCard({
  heading,
  line,
  surface,
  className = "",
  member = false,
  kind = "deal",
}: {
  heading: string;
  line: string;
  surface: string;
  className?: string;
  member?: boolean;
  kind?: "deal" | "rising";
}) {
  return (
    <section
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 ${className}`}
      aria-label={member ? "Your cards in our lists" : `What ${kind === "rising" ? "Premium" : "Plus"} would show you`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white">
          <span aria-hidden className="text-gold">
            ✦{" "}
          </span>
          {heading}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{line}</p>
      </div>
      {member ? (
        <Link href={memberNudgeHref(kind)} className="btn-ghost text-sm">
          {kind === "rising" ? "See the picks →" : "See them →"}
        </Link>
      ) : (
        <PlanButton surface={surface} tier={kind === "rising" ? "premium" : "plus"} />
      )}
    </section>
  );
}
