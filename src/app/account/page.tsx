import { redirect } from "next/navigation";

// /account was wave 1's profile-plus-plan page. Since wave 2 (2026-10-03) the
// profile is RiftCompare's /profile and membership lives on /premium; this
// path stays as a NON-permanent redirect (307), so old links keep working.
export const dynamic = "force-dynamic";

export default function AccountRedirect() {
  redirect("/profile");
}
