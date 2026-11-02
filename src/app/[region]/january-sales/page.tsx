import { SaleSeasonPage, saleMetadata } from "@/components/SaleSeasonPage";

// One URL per region, kept every year (DECISIONS.md, "Seasonal sale pages", 2026-11-02). Kept by the CDN like every page.
export const dynamic = "force-dynamic";

type Props = { params: { region: string } };
export const generateMetadata = (props: Props) => saleMetadata("january-sales", props);

export default function Page(props: Props) {
  return SaleSeasonPage({ slug: "january-sales", params: props.params });
}
