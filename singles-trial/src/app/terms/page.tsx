import { pageMeta } from "@/lib/seo";
import { SITE } from "@/site.config";

export const dynamic = "force-dynamic";
export const metadata = pageMeta({ title: "Terms", description: `Terms of use for ${SITE.name}.`, path: "/terms" });

export default function Terms() {
  return (
    <div className="page">
      <h1>Terms of use</h1>
      <p>Prices on {SITE.name} are information, not offers. They are TCGplayer market prices read once a day and can be out of date or wrong; check the seller&rsquo;s page before you buy. We sell nothing and are not a party to any purchase you make on eBay, TCGplayer or elsewhere.</p>
      <p>Links to eBay and TCGplayer are paid links: we may earn a commission from purchases made through them.</p>
      <p>{SITE.disclaimer}</p>
    </div>
  );
}
