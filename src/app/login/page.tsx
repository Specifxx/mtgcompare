import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { contextLineFor } from "@/lib/login-context";
import { POST_SIGN_IN_FALLBACK, sanitizeNextPath } from "@/lib/next-param";
import { enabledProviders } from "@/lib/oauth";
import { pageOg } from "@/lib/og/meta";

// RiftCompare's /login: AuthForm with a "← Back" to where the visitor came
// from and, when that was a gated page, one line saying what signing in opens.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to MTG Compare with Google or Discord.",
  alternates: { canonical: "/login" },
  openGraph: pageOg("/login"),
  robots: { index: false, follow: true },
};

export default async function LoginPage({ searchParams }: { searchParams: { next?: string; src?: string } }) {
  const next = sanitizeNextPath(searchParams.next);
  if (await getCurrentUser()) redirect(next ?? POST_SIGN_IN_FALLBACK);
  return <AuthForm providers={enabledProviders()} cancelHref={next ?? "/"} next={next ?? undefined} source={searchParams.src} contextLine={next ? contextLineFor(next) : undefined} />;
}
