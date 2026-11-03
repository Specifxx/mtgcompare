import type { Metadata } from "next";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { StaticPage } from "@/components/StaticPage";

export const revalidate = 86400;
export const metadata: Metadata = { title: "Terms of use", ...canon("/terms") };

export default function Terms() {
  return (
    <StaticPage title="Terms of use">
      <p>{SITE.name} shows prices collected from third-party stores for information. Prices and stock change; the store&apos;s own checkout is final and we are not a party to any purchase.</p>
      <p>{SITE.game} and all related names and images are trademarks of their owners; {SITE.name} is not affiliated with or endorsed by them.{SITE.disclaimer ? ` ${SITE.disclaimer}` : ""}</p>
    </StaticPage>
  );
}
