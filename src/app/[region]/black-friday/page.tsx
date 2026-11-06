import { HolidaySalePage, holidayMetadata } from "@/components/HolidaySalePage";

// /[region]/black-friday: one URL per region, kept every year (lib/black-friday.ts; the price watch joined it 2026-11-06). Kept by the
// CDN like every page.
export const dynamic = "force-dynamic";

type Props = { params: { region: string } };
export const generateMetadata = (props: Props) => holidayMetadata("black-friday", props);

export default function Page(props: Props) {
  return HolidaySalePage({ event: "black-friday", params: props.params });
}
