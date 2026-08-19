# Putting Rhythm Master on the App Store and Google Play

The store apps are the web build inside a Capacitor shell (research.md D-009), sold
through each store's own billing (D-010): a **monthly subscription that starts with a
3-day free trial**, and a **one-time "buy outright"**. Nothing here needs a server.

Everything below is done once, by hand, in the two consoles and the two IDEs. The code
side is finished; what remains is accounts, products, signing and uploads. Expect a
weekend for the first pass and an hour for each release after that.

---

## 0. What you need on this Mac

| | Why | Get it |
|---|---|---|
| **Xcode** (full app, not just Command Line Tools) | Builds, signs and uploads the iOS app; StoreKit local testing | Mac App Store → Xcode, then run it once and accept the licence. Then: `sudo xcode-select -s /Applications/Xcode.app` |
| **Android Studio** (bundles a JDK and the SDK) | Builds and signs the Android app bundle | https://developer.android.com/studio |
| **Apple Developer Program** membership — $99/yr | App Store Connect, In-App Purchases | https://developer.apple.com/programs/enroll/ |
| **Google Play Console** developer account — $25 once | Play listing, Play Billing | https://play.google.com/console/signup |

Neither IDE was installed when this was written; `npm run cap:sync` (which is all CI
runs) works without them, but the actual store builds do not.

## 1. Build the shell

```bash
npm run cap:sync
```

That is `VITE_BASE=/ vite build` (the shell serves the app from its own root, not
`/rhythm-master/`) followed by `npx cap sync`, which copies `dist/` into
`ios/App/App/public` and `android/app/src/main/assets/public` and wires the billing
plugin. Run it after **every** change to the web app before building either shell.

```bash
npx cap open ios       # opens ios/App/App.xcodeproj in Xcode
npx cap open android   # opens android/ in Android Studio
```

The app id on both stores is **`com.thinkfast37.rhythmmaster`** (`capacitor.config.json`,
`android/app/build.gradle`, and the Xcode target's Bundle Identifier). Change all three
together if you want a different one — before the first upload, because a store id is
permanent.

## 2. The two products — identical on both stores

Prices are set in the consoles, never in code (App Review rejects hard-coded prices;
the paywall shows whatever the store returns).

| Product id | Type | Free trial | Notes |
|---|---|---|---|
| `rm.monthly` | Auto-renewable subscription, 1 month | **3 days**, as the introductory / free-trial offer | Google: base plan id **`monthly`** (the code passes this as `planIdentifier`) |
| `rm.lifetime` | Non-consumable (Apple) / One-time in-app product (Google) | — | "Buy outright" |

Suggested display names, since both stores show them on the paywall: *Rhythm Master
Monthly* and *Rhythm Master Forever* (or whatever you prefer — the app shows the store's
title verbatim).

## 3. Apple — App Store Connect

1. **Agreements, Tax, and Banking** → accept the *Paid Apps* agreement and add bank and
   tax details. In-app purchases will not work in sandbox until this is Active.
2. **My Apps → + → New App**: iOS, name *Rhythm Master*, bundle id
   `com.thinkfast37.rhythmmaster` (register it under Certificates, Identifiers & Profiles
   first, with the **In-App Purchase** capability ticked), SKU `rhythm-master`.
3. **Subscriptions** (left column) → create a **Subscription Group** (e.g. *Rhythm
   Master*) → **+** subscription: reference name *Monthly*, product id **`rm.monthly`**,
   duration **1 month**. Set the price. Add a localisation (display name + description).
   Then **Introductory Offers → +**: territories all, start date now, no end date, type
   **Free**, duration **3 days**. Save. Fill in the *Subscription Review* screenshot and
   note when you first submit.
4. **In-App Purchases** → **+** → **Non-Consumable**, reference name *Lifetime*, product id
   **`rm.lifetime`**, price, localisation.
5. **App Information** → set the *Privacy Policy URL* and *Terms of Use (EULA)* — point
   both at the live site's pages:
   `https://thinkfast37.github.io/rhythm-master/privacy.html` and
   `…/terms.html` (they are built with the app; the same pages are shipped inside the app
   and linked from the paywall, which is what guideline 3.1.2 asks for). If Pages is not
   hosting at the time, any static host of `dist/` will do; the URL just has to resolve.
6. **App Privacy** → *Data Not Collected*. That is true: no accounts, no analytics.
7. **In Xcode**: select the *App* target → *Signing & Capabilities* → tick *Automatically
   manage signing*, choose your team, and **+ Capability → In-App Purchase**. Set the
   Version (1.0.0) and Build (1) — bump Build on every upload.
8. **Test before you submit** — two ways:
   - *StoreKit local testing*: in Xcode, *File → New → File → StoreKit Configuration
     File*, tick "Sync this file with an app in App Store Connect", pick the app; then
     *Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration* = that
     file. Run on a simulator; purchases are free and instant, and the trial's clock can
     be sped up under *Debug → StoreKit → Manage Transactions*.
   - *Sandbox*: *Users and Access → Sandbox Testers → +*, then on a real device sign out
     of the App Store and run the app from Xcode; use the sandbox account when asked.
     A 3-day trial lasts **3 minutes** in sandbox.
9. **Upload**: *Product → Archive* → *Distribute App → App Store Connect → Upload*. In
   App Store Connect add screenshots (6.7" and 6.5" iPhone, 12.9" iPad — take them from
   the simulator), description, keywords, support URL
   (`https://github.com/thinkfast37/rhythm-master/issues`), select the build, attach the
   two in-app purchases to the version, and **Submit for Review**. First reviews take a
   few days; expect one round of questions.

## 4. Google — Play Console

1. **Payments profile**: *Setup → Payments profile* — link or create a merchant account.
   In-app products cannot be created until this is done.
2. **Create app**: name *Rhythm Master*, app, free (the download is free; the purchase is
   inside), then complete the *Dashboard* checklist: privacy policy URL (same page as
   above), app access (all functionality is available without special access — the trial
   is self-serve; say so), ads (none), content rating questionnaire, target audience,
   data safety (**no data collected or shared**), category *Music & Audio*.
3. **Monetize → Products → Subscriptions → Create subscription**: product id
   **`rm.monthly`**, name. Inside it **Add base plan**: base plan id **`monthly`**,
   auto-renewing, billing period 1 month, set the price. Activate it. Then **Add offer**
   on that base plan: offer id `trial`, eligibility *New customer acquisition* (never had
   this subscription), phase **Free trial, 3 days**. Activate.
4. **Monetize → Products → In-app products → Create**: product id **`rm.lifetime`**,
   name, price. Activate.
5. **Signing**: in Android Studio, *Build → Generate Signed Bundle / APK → Android App
   Bundle*, create a keystore the first time and **keep it safe and backed up** — losing
   it means you can never update the app. Choose *Play App Signing* when the console
   offers it, so Google holds the release key and yours is only the upload key.
   Bump `versionCode` and `versionName` in `android/app/build.gradle` on every upload.
6. **Test before you publish**: *Testing → Internal testing → Create release*, upload the
   `.aab`, add your Gmail as a tester (and under *Setup → License testing*, add the same
   address so purchases are free). Install from the opt-in link on a device signed in as
   that account. Free-trial and renewal periods are shortened for licence testers.
7. **Publish**: *Production → Create release*, upload the same bundle, roll out. First
   review usually takes a few days.

## 5. Each later release

```bash
npm run cap:sync
```

Then bump the build numbers (Xcode Build; `versionCode` in `build.gradle`), Archive and
upload in Xcode, Generate Signed Bundle and upload in Play Console. Merging to `main`
still deploys the free web build on its own as before; the store builds do not move
until you upload them.

## 6. What the app does with all this (so review questions are answerable)

- On launch it asks the store for current purchases and shows the paywall unless one is
  live. Nothing about purchase state is stored locally.
- *Start your free 3-day trial* buys `rm.monthly`; the store applies the trial offer;
  cancelling within 3 days costs nothing.
- *Buy outright* buys `rm.lifetime`; a subscriber can do it from **Purchases** in the
  header, which also has *Manage subscription* (opens the store's own page) and *Restore
  purchases*.
- Terms of Use and Privacy Policy are shipped in the app and linked from the paywall.
- The web version at the Pages URL is free and is a different distribution, not covered
  by any purchase — Apple does not require parity, and this is stated in the Terms.

## 7. Known follow-ups (logged, not blocking)

- **iOS may evict WKWebView `localStorage` under storage pressure**, which is where a
  Musician's own Patterns live. Backing `storage/keyValue.js` with the native Preferences
  plugin inside the shell is the fix; it is a separate task.
- App icons and a splash screen: the shells currently carry Capacitor's defaults. Replace
  `ios/App/App/Assets.xcassets/AppIcon.appiconset` and
  `android/app/src/main/res/mipmap-*` before the first store submission (both stores
  reject the placeholder icon). `npx @capacitor/assets generate` will produce every size
  from one 1024×1024 PNG placed at `resources/icon.png`.
