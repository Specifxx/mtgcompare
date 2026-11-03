import { SaleSeasonPage, saleMetadata } from "@/components/SaleSeasonPage";

// One URL kept every year (DECISIONS.md, "Seasonal sale pages"). Rebuilt daily from the day's prices.
export const revalidate = 86400;

export const generateMetadata = () => saleMetadata("boxing-day");

export default function Page() {
  return <SaleSeasonPage slug="boxing-day" />;
}
