# Claude in Chrome prompt: Cyberpunk Compare first-time setup

Paste everything below the line into Claude in Chrome. Be signed in to Vercel,
GitHub, Google (bill.jyang101@gmail.com) and the eBay developer
portal first. The code, the stores and the daily import are
already on GitHub (`Specifxx/cyberpunkcompare`); this is the account-side setup only.

---

You are setting up my new website, Cyberpunk Compare (a free Cyberpunk TCG price comparison site). The code is on GitHub at https://github.com/Specifxx/cyberpunkcompare and is ready. CHECK FIRST and only do what is missing. Rules: never pay for or buy anything (including the domain), never delete anything, never change or remove an existing DNS record (only ADD records), never touch my other projects (riftcompare, opcompare, mtgcompare, gundamcompare, lorcanacompare, ygocompare, dexcompare, compareempire, camcompare, wargamecompare, figurecompare, kaeyoung) except to READ a value where a step says so. If a page wants a payment, a phone number, a plan upgrade, or a choice you are unsure about, leave that tab open, note it, and move on. Never show a secret key in your final summary.

## Task 1: Domain

1. I own cyberpunkcompare.com. Open https://vercel.com/dashboard → Domains and note whether cyberpunkcompare.com is listed there, and where its DNS is managed (Vercel or another registrar). Don't change anything yet.

## Task 2: Vercel project

1. Vercel → Add New → Project → Import Git Repository → Specifxx/cyberpunkcompare (if it isn't listed, use "Adjust GitHub App Permissions" to give Vercel access to that one repository). Framework: Next.js. Leave the build settings at their defaults. Production branch: main.
2. Before the first deploy, open Environment Variables and add these for Production (and Preview):
   - NEXT_PUBLIC_SITE_URL = https://cyberpunkcompare.com
   - TCGPLAYER_IMPACT_LINK = copy the exact value from the gundamcompare project (Vercel → gundamcompare → Settings → Environment Variables; click the eye icon to read it). If that project doesn't have it, use https://partner.tcgplayer.com/c/7385758/1780961/21018
   - INDEXNOW_KEY = a new random 32-character string of lowercase letters and digits (make one up; write it down for Task 3)
   - AMAZON_ASSOCIATE_TAG = copy from the gundamcompare project if it has one; otherwise skip.
   - REPORTS_GITHUB_TOKEN (Production only, Sensitive): if the team has it as a Shared variable (Vercel team Settings → Environment Variables → Shared), link it to this project. Then open https://github.com/settings/personal-access-tokens, edit the token named site-reports, and add the repository cyberpunkcompare to its repository access (keep Contents: Read and write). Change nothing else on the token.
3. Click Deploy. The first build will show as "Ignored" or "Canceled": that is expected (the site only builds for a release commit). Don't retry it.
4. Project → Settings → Functions: if there is a "Function Region" choice, leave the default. Settings → Deployment Protection: leave as is.
5. Project → Analytics → enable Web Analytics (free tier). If it asks to upgrade the plan, skip.
6. Domain: Project → Settings → Domains → Add → cyberpunkcompare.com (the bare domain; it is the site's main address). Do NOT add www.cyberpunkcompare.com and do NOT set any redirect. If Vercel asks for DNS records: ADD exactly the records it shows (at Vercel DNS, or at the registrar if the domain's DNS lives there). Never edit or delete an existing DNS record. Wait until Vercel shows "Valid Configuration" for cyberpunkcompare.com (refresh every minute or two, up to 15 minutes). If it still isn't valid, note exactly what Vercel says and move on.

## Task 3: GitHub secrets and variables

Open https://github.com/Specifxx/cyberpunkcompare/settings/secrets/actions.

1. Secrets tab, New repository secret, for each of these that is missing:
   - EBAY_CLIENT_ID and EBAY_CLIENT_SECRET: Cyberpunk Compare has its OWN new eBay keyset, NOT the one GundamCompare, LorcanaCompare and YGO Compare share. Open https://developer.ebay.com/my/keys and find the newest Production keyset I made for Cyberpunk Compare. If there is none yet, or it says it is waiting for approval, skip these two secrets and note it (the site runs without eBay until they exist). Otherwise copy its App ID (Client ID) and Cert ID (Client Secret). If you can't tell which keyset is the new one, stop and ask me.
   - Only if you added the eBay keys: eBay requires the Marketplace Account Deletion endpoint for a new keyset. In that keyset's "Alerts & Notifications" / "Marketplace account deletion" settings, set the endpoint to https://cyberpunkcompare.com/api/ebay/account-deletion and a new verification token of 32 to 80 letters and digits (make one up). Add that token in Vercel (Task 2's project, Production) as EBAY_VERIFICATION_TOKEN, redeploy is not needed until the first release, then press eBay's "Send test notification" after Task 4 once the site is live.
   - INDEXNOW_KEY = the same string you put in Vercel in Task 2. If this secret already exists (from an earlier setup), click Update and set it to that same new string.
2. Variables tab: SITE_URL = https://cyberpunkcompare.com. If SITE_URL already exists with another value (for example https://cyberpunkcompare.app), edit it to exactly https://cyberpunkcompare.com; otherwise create it.
3. Open https://github.com/Specifxx/cyberpunkcompare/settings → General → Default branch. It should be main; if not, switch it to main.

## Task 4: First release

1. The prices are already imported on GitHub. Open https://github.com/Specifxx/cyberpunkcompare/actions/workflows/production-deploy.yml → Run workflow (branch main) → Run. It lands a release commit and Vercel builds it (about 3 to 6 minutes). From then on the site rebuilds once a day by itself after the 00:17 UTC price import, which also starts using eBay now that the keys are in.
2. If Vercel shows no new deployment 5 minutes after that run is green, open the Vercel project → Deployments and tell me what the newest entry says.
3. When the Vercel deployment is Ready, open the production URL (and https://cyberpunkcompare.com once it shows Valid Configuration). Check: the home page shows prices; open /sealed, click the Welcome to Night City Retail Booster Box, and confirm the price table lists TCGplayer and at least one store; click a Buy button and confirm it opens the store (TCGplayer links go through partner.tcgplayer.com, eBay links contain campid=5339155912).

## Task 5: Search engines (only once cyberpunkcompare.com shows Valid Configuration)

1. Google Search Console (https://search.google.com/search-console): Add property → Domain → cyberpunkcompare.com. ADD the TXT record where the domain's DNS lives (Vercel → Domains → cyberpunkcompare.com → DNS Records, or the registrar), never editing an existing record (Type TXT, Name @, Value = Google's text). Verify (if it fails, wait 2 minutes and try once more). Then Sitemaps → submit https://cyberpunkcompare.com/sitemap.xml. Then URL Inspection → Request indexing for https://cyberpunkcompare.com/, /sealed, /preorders, /cards, /blog and /blog/cyberpunk-tcg-beta-vs-retail-booster-box.
2. In the OP Compare property in Search Console → Settings → Users and permissions, find the user whose email ends in iam.gserviceaccount.com and add the same email as a Full user to the new cyberpunkcompare.com property.
3. Bing Webmaster Tools (https://www.bing.com/webmasters): Import from Google Search Console and tick cyberpunkcompare.com; then check the sitemap is listed, and add it if not.
4. Yandex Webmaster (https://webmaster.yandex.com): Add site https://cyberpunkcompare.com, verify with the DNS (TXT) method, adding the record as above, then Indexing → Sitemap files → add the sitemap.

(No affiliate step: Cyberpunk Compare uses the eBay Partner Network campaign and the TCGplayer Impact link every Compare site already shares, tagged per site.)

## When you finish

Give me one table: task | done / skipped / needs me | notes. Then list: whether cyberpunkcompare.com shows Valid Configuration in Vercel (and if not, exactly what it says), the Vercel production URL, the Refresh prices run result (green or red, and the last 20 lines of its log if red), and every tab you left open with exactly what I need to do there.
