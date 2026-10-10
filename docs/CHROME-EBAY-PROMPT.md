# Claude in Chrome: turn MTG Compare's eBay prices on at 1,000 calls a day

Paste everything below the line into Claude in Chrome. It is idempotent and only READS Rift Compare's eBay keyset; it never changes anything of Rift Compare.

---

You are switching on MTG Compare's eBay prices. MTG Compare shares Rift Compare's eBay Production keyset (shared mode: Rift always goes first; MTG spends at most 1,000 Browse calls a day from what Rift leaves). Never print, paste or screenshot a key into chat or any page other than the exact GitHub field named below. If a step needs me (2FA, a password, an agreement to accept), add it to a MANUAL list, leave the tab open and continue; print the MANUAL list at the end.

1. Open https://developer.ebay.com/my/keys (sign in as the account that owns Rift Compare's application). Find the **Production** keyset of Rift Compare's application. Read two values only: **App ID (Client ID)** and **Cert ID (Client Secret)**. Change nothing on this page or any eBay page.
2. Open https://github.com/Specifxx/mtgcompare/settings/secrets/actions, tab **Secrets**, section **Repository secrets** (NOT Environment secrets, NOT Dependabot). Create or update:
   - `EBAY_CLIENT_ID` = the App ID
   - `EBAY_CLIENT_SECRET` = the Cert ID
   Paste each value with Ctrl+V and confirm the box is not empty before saving. The list must then show both names with "Updated now".
3. Open https://github.com/Specifxx/mtgcompare/settings/variables/actions, **Repository variables**. Make sure:
   - `EBAY_KEYSET_MODE` = `shared`
   - `EBAY_DAILY_CALL_BUDGET` = `1000` (or delete the variable: 1000 is the default)
   - `EBAY_OBSERVE_ONLY` = `0` (or delete the variable: spending is the default). If it says `1`, change it to `0`.
   - `EBAY_API_ENABLED`: delete it if it exists with the value `0` (that is the kill switch).
   - `EBAY_MAX_CALLS`: delete it if it exists (it caps every run).
   - `NEXT_PUBLIC_EBAY_CAMPAIGN_ID` = `5339155912` (create it if missing).
4. Report: the secret names and "Updated" times as GitHub lists them, every variable name starting with `EBAY_` with its value, and the MANUAL list. Then tell me: "eBay settings done; ask Claude Code to run eBay prices."
