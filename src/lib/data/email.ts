// owner: WP14
// src/lib/data/email.ts: the section "email.ts" of api.ts. What a public page may promise about email.
// The mail keys live only in GitHub Actions, and a public render never reads Neon, so the answer is an environment switch: the owner sets
// EMAIL_STATUS=on on the site once both mail secrets exist in Actions (the runs still record what they found in Meta "email" for /admin/mail).
// Anything else, a missing variable included, is "off": no copy promises an email and no email field renders.

export function getEmailStatus(): Promise<"on" | "off"> {
  return Promise.resolve(process.env.EMAIL_STATUS?.trim().toLowerCase() === "on" ? "on" : "off");   // environment only
}
