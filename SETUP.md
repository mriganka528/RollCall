# ROLLCALL — Setup & Runbook (Clerk auth + fixes)

This is everything you need to take the app from its current state to a fully
working build. It covers the Clerk authentication migration, the database
reset, and the new features (delete class, toasts/haptics, refreshed design,
app icon).

> **Why the app "wasn't working" before:** the broken actions (end session,
> delete account, edit profile) and the `HTTP 0: Request timed out` /
> stuck-loading errors were not logic bugs — they were connectivity + setup
> gaps: (a) the API base URL defaulted to `localhost`, which a physical phone
> can't reach — now **auto-detected** from the Metro host; (b) the app had **no
> root `.env`**, so the Clerk key was missing; and (c) the Neon database had
> **no tables** (migration never applied). All three are fixed by the steps
> below. The Clerk migration then replaces the old custom auth entirely.

---

## 0. What changed

- **Authentication is now Clerk** (`@clerk/expo`, Clerk's current "Core 3"
  SDK). Clerk owns credentials and sessions; the backend stores a lightweight
  `Profile` (name + role) keyed by the Clerk user id. New users pick
  teacher/student **once** on a role screen after signing up.
- **Google sign-in is now NATIVE.** "Continue with Google" on the login and
  sign-up screens opens the **device's own Google account picker** (Android
  Credential Manager / iOS) listing every account already signed in on the phone
  — no browser hop. It's implemented with Clerk's built-in Google module
  (`useSignInWithGoogle` from `@clerk/expo/google`). A brand-new Google user has
  no `Profile` yet, so they land on the same role screen, then straight into
  their dashboard. **Requires** the Google client ID from §2a and a **native
  build** (§2b) — it does *not* work in Expo Go. On the **web** the app
  automatically falls back to the browser-based flow.
- **Sign in / sign up / reset** — email + password with a 6-digit email code,
  all handled by Clerk. Password fields now have a **show/hide eye toggle**.
- **The app auto-detects the backend URL.** It derives the API host from the
  Metro dev-server host, so a physical phone in Expo Go reaches your machine
  **without** hand-editing an IP. `EXPO_PUBLIC_API_URL` is now an optional
  override (see §3). This is what fixed the `HTTP 0: Request timed out` error and
  the "stuck on loading after email verification" hang.
- **Delete class** — teachers can permanently delete a class (transactional;
  cascades to its sessions, roster, and attendance).
- **Toasts + haptics** on every meaningful event (sign in/up, role choice,
  profile save, account delete, sign out, class create/delete, session
  start/end, roster add/remove/import, join, scan).
- **Design refresh** — rounded corners, a warmer multicolor palette, softer
  cards. Screens/fonts/layout are unchanged otherwise.
- **App icon** set to `assets/images/rollcall-icon-v2.png`.

---

## 1. Install dependencies

The sandbox can't reach the npm registry, so these must run on your Windows
machine.

```powershell
# from the project root (D:\Mobile dev\qr-attendence)
npm install                       # picks up @clerk/expo + all app deps

# make sure the Expo-compatible Clerk version + peers are resolved, and drop
# the old package if it lingers in the lockfile from before the migration:
npx expo install @clerk/expo
npm uninstall @clerk/clerk-expo   # no-op if it's already gone

cd server
npm install                       # installs @clerk/express (backend)
cd ..
```

> ⚠️ Two notes on the Clerk package:
> - The app was **migrated** from `@clerk/clerk-expo` (deprecated) to
>   **`@clerk/expo`** — Clerk's current "Core 3" SDK. `package.json` already
>   lists `@clerk/expo`; the commands above just resolve and lock it. All app
>   imports now read `from '@clerk/expo'`.
> - The install command you originally had
>   (`npx create-expo-app@latest clerk-expo`) is **wrong** — that scaffolds a
>   brand-new app. You only need the packages above. The server uses
>   `@clerk/express`, already in `server/package.json`.

---

## 2. Configure the Clerk dashboard

In your Clerk instance (dashboard.clerk.com) → **User & Authentication**:

1. **Email** → enable **Email address** as an identifier.
2. **Password** → enable **Password**.
3. **Email verification** → set the verification method to **Email
   verification code** (the app uses a 6-digit code, not a magic link).
4. **Password reset** → enable **Reset password** via **Email code**.
5. **Google** → under **Social Connections**, enable **Google**. Because the app
   now uses the **native** account picker (not Clerk's browser SSO), Clerk must
   verify a Google **ID token**, so you have to give it your **own** Google OAuth
   credentials — Clerk's shared dev credentials only cover the browser flow. Set
   those up in §2a first, then in this Google connection enable **Use custom
   credentials** and paste the **Web** client ID + secret. Clerk validates the
   native token's audience against that Web client ID, so it must be the *same*
   ID you put in `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID` (§3).

### 2a. Create the Google OAuth client IDs (Google Cloud Console)

The native picker authenticates against a Google OAuth client **you own**. Do
this once at <https://console.cloud.google.com> → **APIs & Services →
Credentials**:

1. Pick or create a project. If prompted, configure the **OAuth consent screen**
   (User type **External**; while it's in "Testing", add your Google address as a
   **test user** or sign-in is blocked).
2. **Create Credentials → OAuth client ID → Web application** (name it e.g.
   "ROLLCALL Web"). Under **Authorized redirect URIs** add the exact callback URL
   Clerk shows on its Google settings page (Clerk → Configure → SSO Connections →
   Google → **Use custom credentials**). For your current **dev** instance that is
   `https://firm-pigeon-9080.clerk.accounts.dev/v1/oauth_callback` — but always
   copy it from the Clerk dashboard, since it changes if you move to a production
   or custom domain. If Clerk also lists an **Authorized JavaScript origin**
   (`https://firm-pigeon-9080.clerk.accounts.dev`), add it under **Authorized
   JavaScript origins**. **Create.**
   - Its **Client ID** → this is **`EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID`**
     (§3). Yes, the **Web** client ID even for Android — it's the token audience.
   - Its **Client secret** → paste into the Clerk Google connection (step 5).
3. **Android only — Create Credentials → OAuth client ID → Android:**
   - **Package name:** `com.mriganka528.qrattendence` (matches `app.json`).
   - **SHA-1 certificate fingerprint** of the build you'll install. For an **EAS**
     build: `eas credentials` → Android → your profile shows the SHA-1. For a
     local `expo run:android` debug build:
     `keytool -list -v -keystore $env:USERPROFILE\.android\debug.keystore -alias androiddebugkey -storepass android`.
     Add a **separate Android client per SHA-1** (debug, EAS, and Play-signing
     certs all differ). No env var is needed — Google matches the Android client
     by package + SHA-1 automatically.
4. **iOS only** (skip for an Android-only build): **Create Credentials → OAuth
   client ID → iOS**, bundle ID `com.mriganka528.qrattendence`. Copy its client
   ID → **`EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID`**, and its **reversed** form
   (`com.googleusercontent.apps.…`) → **`EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME`**
   (§3). The `@clerk/expo` config plugin wires that URL scheme in at build time.

### 2b. The native module needs a real build (NOT Expo Go)

Clerk's Google module is a **native module** compiled into the app — it's absent
from Expo Go, so "Continue with Google" only works in a build that includes it:

- **EAS:** `eas build --profile development --platform android` (or `preview`
  for a shareable APK). The client IDs are read from `eas.json` (§3) at build time.
- **Local:** `npx expo run:android` (or `run:ios`), reading the values from `.env`.
- **Rebuild** whenever you change a client ID or the URL scheme. Email/password
  works fine in Expo Go — only Google needs the native build.

---

## 3. Environment variables

Two `.env` files. **Never commit either** (both are covered by `.gitignore`).

### `server/.env` (backend — secrets live here only)

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string (runtime). |
| `DIRECT_URL` | Neon **direct** connection string (used by `prisma migrate`). |
| `CLERK_SECRET_KEY` | Clerk **secret** key (`sk_...`). Server-side only. |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` *(or `CLERK_PUBLISHABLE_KEY`)* | Clerk publishable key. The server reads either name. |
| `PORT` | `4000` |

`JWT_SECRET` is now unused (leftover from the old auth) — harmless, remove if
you like.

### root `.env` (the Expo app — only `EXPO_PUBLIC_*` values)

```dotenv
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx

# Native Google Sign-In — the "Web application" OAuth client ID from §2a
# (a public identifier, not a secret). Required for the Android account picker;
# leave blank to keep Google off until you've set it up.
EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID=xxxxxxxxxxxx-xxxx.apps.googleusercontent.com
# iOS only:
# EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID=xxxxxxxxxxxx-yyyy.apps.googleusercontent.com
# EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.xxxxxxxxxxxx-yyyy

# The deployed backend URL (Vercel). Used as the default fallback when
# EXPO_PUBLIC_API_URL is unset and there's no Metro host to auto-detect.
EXPO_PUBLIC_DEPLOYED_API_URL=https://roll-call-self.vercel.app

# Points the app at the DEPLOYED backend so API calls work from any device, any
# time. Comment it out to develop against a LOCAL server (the app then
# auto-detects the Metro host), or set your LAN IP to force a specific URL:
EXPO_PUBLIC_API_URL=https://roll-call-self.vercel.app
# EXPO_PUBLIC_API_PORT=4000        # override the default port (4000)
```

- **`EXPO_PUBLIC_API_URL` points at the deployed backend.** It's set to the
  Vercel URL (`https://roll-call-self.vercel.app`), which always wins over
  auto-detect, so every API call reaches the live server — on a physical phone,
  an emulator, or a production build. Check the `[api] base URL: …` log line at
  launch to confirm. To develop against a **local** server instead, comment the
  line out (the app then auto-detects Expo's Metro dev-server host and uses port
  `4000`) or set your LAN IP; use `EXPO_PUBLIC_API_PORT` only if the local server
  isn't on `4000`.
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is the same publishable key as the
  server's; it's safe to ship in the client.
- **`EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID`** turns on native Google. It's a
  public OAuth client ID (safe to ship), **not** a secret. For **EAS** builds the
  value comes from `eas.json` — **add the line to each of the three profiles'
  `env` blocks once you have the ID.** ⚠️ EAS rejects an *empty* env value
  (`eas.json is not valid … not allowed to be empty`), so do **not** leave a
  blank placeholder there — omit the key entirely until you have the real client
  ID, then paste it in. For local `expo run:` builds the value comes from this
  `.env` (where blank is fine). When it's unset, the Google button surfaces a
  clear "set the client ID" message instead of failing silently.

---

## 4. Reset & migrate the database (fresh start)

The `Profile` schema changed (dropped `passwordHash`/`googleId`/`resetOtp`,
added `clerkUserId`), so we wipe and re-create. This is the agreed fresh start —
**all existing rows are discarded.**

```powershell
cd server
npm run prisma:generate     # regenerates the Prisma client with clerkUserId
npm run migrate:reset       # drops everything, re-applies migrations
# (or, if the DB is already empty:)  npm run migrate
cd ..
```

> The sandbox where this code was written **cannot** reach Neon or run Prisma,
> so this migration has **not** been applied yet — you must run it once locally.
> Until you do, `GET /auth/me` will error because the `Profile` table won't have
> the `clerkUserId` column.

---

## 5. Run it

```powershell
# Terminal 1 — backend
cd server
npm run dev        # http://localhost:4000, watches for changes

# Terminal 2 — app
npm start          # then press a / i, or scan the QR in Expo Go
```

On boot the server prints a line per request and logs DB activity (e.g.
`[classes] DELETED class ... cascaded N session(s)`), which makes it easy to
confirm each action hit the database. The app logs its resolved API base URL at
startup (`[api] base URL: ...`) — check that first if requests fail.

---

## 6. Verify (smoke test)

1. **Sign up** → enter email + password (tap the **eye** to reveal what you
   typed) → receive the 6-digit code → verify.
2. **Role screen** → enter your name, pick **Teacher** → land on the dashboard.
3. **Create a class** → toast "Created ..."; class appears.
4. **Roster** → add a student (toast), remove one (confirm → toast).
5. **Start session** → QR shows; on a second device **sign up as Student**,
   join with the code + roll number, then **scan** → "Marked Present".
6. **End session** → confirm → toast "Session ended"; the live QR stops.
7. **Delete class** → confirm → toast "Class deleted"; back to dashboard.
8. **Account menu** → Edit Profile (change name → toast), Sign Out (toast),
   then sign back in.
9. **Delete account** → type DELETE → confirm → account removed, back to login.
10. **Forgot password** → request code → reset → you're signed straight in.
11. **Continue with Google** (native build — see §2b) → the **device account
    picker** appears listing your Google accounts → pick one → new users land on
    the role screen, returning users go straight to the dashboard.

Every step should fire a haptic and a toast, and the matching `[api]` /
`[auth]` / `[classes]` log line should appear in the server terminal.

---

## 7. Security follow-ups (do these)

- **Rotate the Neon database password.** The `DATABASE_URL` password was shared
  in chat during development. In the Neon dashboard, reset the role password and
  update `server/.env` with the new connection string.
- Confirm neither `.env` is tracked by git: `git status` should not list them.
- Never put `DATABASE_URL` or `CLERK_SECRET_KEY` in the app (root) `.env` — only
  `EXPO_PUBLIC_*` values belong there, and anything `EXPO_PUBLIC_*` is bundled
  into the client.

---

## 8. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `HTTP 0: Request timed out` / stuck on loading after email verification | The backend is unreachable. Make sure `npm run dev` is running in `server/`, on the same network as the phone. The app now shows a **"Can't reach the server"** retry screen and logs `[api] base URL: …` — verify that host is your machine. If auto-detect picks the wrong interface, set `EXPO_PUBLIC_API_URL` explicitly. |
| `The CAPTCHA failed to load …` on sign-up (browser) | **Not a server error.** Clerk's *Bot sign-up protection* (Turnstile) failing on web. Quick fix: Clerk Dashboard → **Configure → Attack protection → Bot sign-up protection → OFF** (fine for dev). It's also wired for web via a `clerk-captcha` element in `signup.tsx`, but an ad-blocker/privacy extension can still block Turnstile — disable extensions or test sign-up on a **device/emulator**, where this web-only path doesn't trigger. |
| Every request fails on a physical phone | Phone and dev machine aren't on the same LAN, or a firewall blocks port `4000`. Confirm the `[api] base URL` host, or set `EXPO_PUBLIC_API_URL` to your LAN IPv4. |
| "Continue with Google" shows a "set the client ID" / "credentials not found" message | `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID` is blank. Set it (§2a/§3) and make a **new native build** so the value is bundled in. |
| "Continue with Google" does nothing in Expo Go | The native Google module isn't in Expo Go — use a dev/preview build (§2b). |
| Native picker opens then errors (`DEVELOPER_ERROR` / code 10) | The **Android OAuth client's SHA-1 or package name** doesn't match the installed build. Add an Android client for that exact SHA-1 (§2a step 3), and confirm the Clerk Google connection uses your **custom** Web credentials. |
| Google works in a dev build but not the store/Play build | Different signing cert → different SHA-1. Add an Android OAuth client for the production / Play-app-signing SHA-1 too. |
| App stuck on a spinner at launch | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` missing/blank in the **root** `.env`. |
| `Clerk … deprecated: @clerk/clerk-expo` warning | The old package is still installed. Run the §1 commands (`npx expo install @clerk/expo` + `npm uninstall @clerk/clerk-expo`). |
| `GET /auth/me` → 500, column `clerkUserId` does not exist | Migration not applied — run step 4. |
| Signed in but bounced to the role screen every time | The backend `Profile` wasn't created; check the `[auth] chooseRole` log and that the POST `/auth/profile` returned 200. |
| Sign-up code never arrives | Enable **Email verification code** in the Clerk dashboard (step 2). |
| `npm run dev` exits complaining about `CLERK_SECRET_KEY` | It's required at boot — add it to `server/.env`. |

---

## Note on local type-checking

This code was authored in a sandbox that can't install packages or reach the
database, so `tsc` was **not** run there — and it will report errors until you
complete steps 1 and 4 locally (the `@clerk/*` packages must be installed and
the Prisma client regenerated with the new `clerkUserId` field). After
`npm install` (both folders) and `npm run prisma:generate`, a type-check should
be clean:

```powershell
cd server && npx tsc --noEmit && cd ..
npx tsc --noEmit          # app (or: npm run lint)
```
