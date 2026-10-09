# Claude in Chrome: move the published price data to GitHub (one pass)

Paste everything below the line into Claude in Chrome. It is idempotent. It only touches MTG Compare's own GitHub repositories, its own Vercel project and nothing of Rift Compare.

---

You are switching MTG Compare's public price data from Neon to a private GitHub repository. The code already supports it; only settings change. Work in ONE pass. Never print, paste or screenshot a token value into chat or any page other than the exact field named below. If a step needs me (2FA, a CAPTCHA, a password prompt), add it to a MANUAL list, leave the tab open, and continue; print the MANUAL list at the end.

## 1. The data repository
Open https://github.com/Specifxx/mtgcompare-data. If it does not exist, create it: owner Specifxx, name `mtgcompare-data`, **Private**, no README, no .gitignore, no licence. Report whether it existed.

## 2. Two fine-grained tokens
Open https://github.com/settings/personal-access-tokens/new (Fine-grained). Create two tokens (if old ones with these names exist, create new ones with today's date in the name; values cannot be re-read):
- `mtgcompare-data-write-<date>`: Resource owner Specifxx; Repository access "Only select repositories" = `Specifxx/mtgcompare-data` ONLY; Repository permissions: **Contents: Read and write** (Metadata read-only is added automatically); expiration 1 year.
- `mtgcompare-data-read-<date>`: same repository only; **Contents: Read-only**; expiration 1 year.
After generating each, copy it and paste it immediately into the places in steps 3 and 4. Do not store it anywhere else.

## 3. GitHub Actions settings of Specifxx/mtgcompare
- https://github.com/Specifxx/mtgcompare/settings/secrets/actions, tab **Secrets**, section **Repository secrets** (NOT Environment secrets, NOT Dependabot): create or update
  - `DATA_REPO_TOKEN` = the WRITE token
  - `PLANE_TOKEN` = the READ token
  Paste the value with Ctrl+V into the "Secret" box and confirm the box is not empty before pressing "Add secret" / "Update secret". The list must then show both names with "Updated now".
- https://github.com/Specifxx/mtgcompare/settings/variables/actions, **Repository variables**: create or update
  - `PLANE_BACKEND` = `github`
  - `PLANE_REPO` = `Specifxx/mtgcompare-data`

## 4. Vercel (the MTG Compare project only), Settings, Environment Variables, Production only
Create or update (do NOT tick Preview or Development):
- `PLANE_BACKEND` = `github`
- `PLANE_REPO` = `Specifxx/mtgcompare-data`
- `PLANE_TOKEN` = the READ token (mark Sensitive)
Do not change `DATABASE_URL`. Do NOT press Redeploy: Claude Code will redeploy after the data is published.

## 5. Report
Print: whether the data repository existed or was created; the two secret names and the two variable names exactly as GitHub lists them with their "Updated" times; the three Vercel variable names with their environments; the MANUAL list. Then tell me: "Settings done; ask Claude Code to run the import and redeploy."
