import { pageMeta } from "@/lib/seo";
import { SITE } from "@/site.config";

export const dynamic = "force-dynamic";
export const metadata = pageMeta({ title: "Privacy", description: `What ${SITE.name} collects: no accounts, no email, anonymous visit counts.`, path: "/privacy" });

export default function Privacy() {
  return (
    <div className="page">
      <h1>Privacy</h1>
      <p>{SITE.name} has no accounts and asks for no email address or personal details. We count visits with Vercel Web Analytics, which uses no cookies and does not identify you.</p>
      <p>When you follow a link to eBay or TCGplayer, that site may set its own cookies to record that the visit came from us. Their privacy policies apply there.</p>
    </div>
  );
}
