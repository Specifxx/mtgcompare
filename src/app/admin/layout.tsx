import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminNoAnalytics } from "@/components/admin/AdminNoAnalytics";
import { adminMetadata, isAdminViewer } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: { default: "Admin · MTG Compare", template: "%s · Admin" } });

// Chrome only, and never the gate: EVERY page calls requireAdminPage() itself
// (a layout is not re-run on client navigation between sibling pages). For a
// non-admin the layout renders no bar and lets the page's notFound() reach the
// root not-found boundary, so outsiders get the ordinary server-rendered 404
// (a notFound() thrown HERE would send an empty client-only error shell).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminViewer())) return <>{children}</>;
  return (
    <>
      <AdminNoAnalytics />
      {/* Inside the root layout's container now (wave 2): a hairline bar at
          the top of the content column rather than a full-bleed band. */}
      <div className="-mt-6 mb-6 border-b border-ink-700">
        <AdminNav />
      </div>
      {children}
    </>
  );
}
