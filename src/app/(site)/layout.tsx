import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header region={null} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer region={null} />
    </>
  );
}
