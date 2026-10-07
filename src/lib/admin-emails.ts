// Owner accounts. Admin = User.isAdmin OR an address on this list. Admins count
// as Premium everywhere and can open /admin. Not surfaced in public UI.
// ADMIN_EMAILS (comma-separated) REPLACES the default when set; ADMIN_EMAILS=""
// removes every address-based admin (User.isAdmin still works). Read on every
// call, not at module load, so tests can set and unset it.
export const DEFAULT_ADMIN_EMAILS = ["mastermisclick@gmail.com"];

export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  const list = raw === undefined ? DEFAULT_ADMIN_EMAILS : raw.split(",");
  return list.map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}
