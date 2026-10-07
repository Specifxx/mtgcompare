import { releaseAlertSets, isUnreleased, type ReleaseAlertSource } from "@/lib/release-alerts";
import { EmailOnly } from "./EmailOnly";
import { ReleaseAlertSignup } from "./ReleaseAlertSignup";

// The one-element mount for the "email me when {set} lands" signup on /sets,
// /sealed, /card and /release-dates (wave 2, 2026-10-03). Server-side gate:
// renders only while email is on (EmailOnly) AND the set takes release alerts
// (unreleased, or released within the window: lib/release-alerts.ts). A
// presale-only mount (`unreleasedOnly`) also drops out once the set is out.
export function ReleaseAlertSlot({
  setSlug,
  setName,
  releasedOn,
  source,
  cardId,
  cardName,
  heading,
  unreleasedOnly = false,
  className,
}: {
  setSlug: string;
  setName: string;
  releasedOn: string | null | undefined;
  source: ReleaseAlertSource;
  cardId?: number;
  cardName?: string;
  heading?: string;
  unreleasedOnly?: boolean;
  className?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const date = releasedOn ?? null;
  if (unreleasedOnly ? !isUnreleased(date, today) : !releaseAlertSets([{ releasedOn: date }], today).length) return null;
  return (
    <EmailOnly>
      <ReleaseAlertSignup setSlug={setSlug} setName={setName} source={source} cardId={cardId} cardName={cardName} heading={heading} className={className} />
    </EmailOnly>
  );
}
