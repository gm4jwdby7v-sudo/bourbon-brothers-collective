# Shipping to the App Store without a Mac

The `ios-capacitor` branch builds in the cloud via GitHub Actions
(`.github/workflows/ios-build.yml`): a macOS runner builds the web app,
syncs Capacitor, archives with Xcode, and uploads to TestFlight.
Every push to `ios-capacitor` (or manual "Run workflow") triggers a build.

## One-time setup

### 1. Register the bundle ID
- Go to [developer.apple.com](https://developer.apple.com) -> Certificates, Identifiers & Profiles -> Identifiers
- Register an **App ID** with bundle ID `app.bourbonconnect.mobile`
- Enable any capabilities the app needs (push notifications require this if you add native push later)

### 2. Create the app in App Store Connect
- Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) -> My Apps -> **+**
- Bundle ID: `app.bourbonconnect.mobile`, SKU: anything unique (e.g. `bourbon-brothers-1`)
- Note: this is an alcohol-related app, so expect a **17+ age rating** and be ready with screenshots, description, and privacy policy URL during review

### 3. Create an App Store Connect API key
- App Store Connect -> Users and Access -> **Integrations** -> App Store Connect API -> Team Keys -> **+**
- Name it (e.g. "CI Upload"), access level **App Manager** or higher
- Download the `.p8` file (you only get one chance) and note the **Key ID** and **Issuer ID**
- Find your **Team ID**: developer.apple.com -> Membership details (10 characters)

### 4. Add GitHub secrets
Repo -> Settings -> Secrets and variables -> Actions -> New repository secret:

| Secret | Value |
|---|---|
| `VITE_BACKEND_URL` | Your published Lovable URL, e.g. `https://xyz.lovable.app` (no trailing slash) |
| `APPLE_TEAM_ID` | 10-character Team ID from Membership details |
| `APP_STORE_CONNECT_API_KEY_ID` | Key ID from step 3 |
| `APP_STORE_CONNECT_API_ISSUER_ID` | Issuer ID from step 3 |
| `APP_STORE_CONNECT_API_PRIVATE_KEY` | Full contents of the `.p8` file, including `-----BEGIN PRIVATE KEY-----` lines |

### 5. Run the build
- Push to `ios-capacitor` or go to Actions -> "iOS Build & TestFlight Upload" -> **Run workflow**
- When it finishes, the build appears in App Store Connect -> TestFlight (processing takes a few minutes)
- From TestFlight you can invite testers, then submit the build for App Store review

## Notes
- The workflow uses Xcode automatic signing (`-allowProvisioningUpdates`), so no manual certificates or provisioning profiles are needed.
- Builds use the `VITE_BACKEND_URL` secret as the backend — the app's server functions and data come from your deployed Lovable app.
- GitHub's free tier includes macOS runner minutes for public repos; private repos draw from the monthly minute allowance (macOS minutes count 10x).
