import { HolidaySalePage, holidayMetadata } from "@/components/HolidaySalePage";

// /[region]/cyber-monday (DECISIONS.md, "Black Friday and Cyber Monday price watch pages", 2026-11-06): the Black Friday page under
// Cyber Monday's own URL and words, one per region, kept every year. Kept by the CDN like every page.
export const dynamic = "force-dynamic";

type Props = { params: { region: string } };
export const generateMetadata = (props: Props) => holidayMetadata("cyber-monday", props);

export default function Page(props: Props) {
  return HolidaySalePage({ event: "cyber-monday", params: props.params });
}
