import crypto from "node:crypto";

export const ENDPOINT_PATH = "/api/ebay/account-deletion";

/** eBay's challenge: sha256(challengeCode + verificationToken + endpoint), hex. */
export function challengeResponse(code: string, token: string, endpoint: string): string {
  return crypto.createHash("sha256").update(code).update(token).update(endpoint).digest("hex");
}
