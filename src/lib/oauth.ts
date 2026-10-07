// OAuth sign-in (Google + Discord), RiftCompare's custom flow. A provider is on
// when its client id AND secret are set:
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
//   DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET
// Redirect URIs to register with each provider:
//   https://opcompare.app/api/auth/oauth/google/callback
//   https://opcompare.app/api/auth/oauth/discord/callback
import { SITE_URL } from "./site";

export type OAuthProvider = "google" | "discord";
export const OAUTH_PROVIDERS: OAuthProvider[] = ["google", "discord"];
export const PROVIDER_NAMES: Record<OAuthProvider, string> = { google: "Google", discord: "Discord" };

export interface ProviderConfig {
  clientId?: string;
  clientSecret?: string;
  authUrl: string;
  tokenUrl: string;
  userUrl: string;
  scope: string;
}

export function isOAuthProvider(v: string): v is OAuthProvider {
  return v === "google" || v === "discord";
}

export function providerConfig(provider: OAuthProvider): ProviderConfig {
  if (provider === "google") {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
      scope: "openid email profile",
    };
  }
  return {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    authUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    userUrl: "https://discord.com/api/users/@me",
    scope: "identify email",
  };
}

export function isProviderEnabled(provider: OAuthProvider): boolean {
  const c = providerConfig(provider);
  return Boolean(c.clientId && c.clientSecret);
}

export function enabledProviders(): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter(isProviderEnabled);
}

export function redirectUri(provider: OAuthProvider): string {
  return `${SITE_URL}/api/auth/oauth/${provider}/callback`;
}

/** A provider's profile, normalised. Only a provider-VERIFIED email may link or create an account. */
export interface OAuthProfile {
  providerId: string | undefined;
  email: string | undefined;
  emailVerified: boolean;
  name: string | undefined;
  avatar: string | null;
}

export function normaliseProfile(provider: OAuthProvider, p: Record<string, unknown>): OAuthProfile {
  if (provider === "google") {
    return {
      providerId: typeof p.sub === "string" ? p.sub : undefined,
      email: typeof p.email === "string" ? p.email.toLowerCase() : undefined,
      emailVerified: p.email_verified === true || p.email_verified === "true",
      name: typeof p.name === "string" ? p.name : undefined,
      avatar: typeof p.picture === "string" ? p.picture : null,
    };
  }
  const id = typeof p.id === "string" ? p.id : undefined;
  return {
    providerId: id,
    email: typeof p.email === "string" ? p.email.toLowerCase() : undefined,
    emailVerified: p.verified === true,
    name: (typeof p.global_name === "string" && p.global_name) || (typeof p.username === "string" ? p.username : undefined),
    avatar: id && typeof p.avatar === "string" ? `https://cdn.discordapp.com/avatars/${id}/${p.avatar}.png` : null,
  };
}
