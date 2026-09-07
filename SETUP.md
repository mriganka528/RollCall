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
- **Google sign-in** — "Continue with Google" on both the login and sign-up
  screens, via Clerk SSO (`useSSO`, `oauth_google`). A brand-new Google user
  has no `Profile` yet, so they land on the same role screen, then straight into
  their dashboard.
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
5. **Google** → under **Social Connections**, enable **Google**. For a quick
   start you can use Clerk's shared dev credentials (fine for `pk_test_…`); for
   production, add your own Google OAuth client ID/secret as Clerk instructs.

### Native OAuth redirect (so "Continue with Google" returns to the app)

The app's URL scheme is **`rollcall`** (set in `app.json`), and the button
builds its redirect with `Linking.createURL('/')`. You normally don't need to
register anything extra with Clerk for native SSO, but:

- **Google sign-in needs a real build** — a **development build** (`npx expo run:android` / `run:ios` or an EAS dev build) or a store build. In plain
  **Expo Go** the custom-scheme redirect can't complete, so test Google there
  only in a dev build. Email/password works fine in Expo Go.
- If you later serve the app on the web, add your web origin to Clerk's
  **allowed origins**.

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

# OPTIONAL — the app auto-detects the backend from the Metro host, so you
# usually don't need this. Set it only to force a specific URL:
# EXPO_PUBLIC_API_URL=http://192.168.1.20:4000
# EXPO_PUBLIC_API_PORT=4000        # override the default port (4000)
```

- **`EXPO_PUBLIC_API_URL` is now optional.** On startup the app derives the API
  host from Expo's Metro dev-server host (your dev machine's IP) and uses port
  `4000`, so a physical phone in Expo Go reaches your backend with **no config**.
  Check the `[api] base URL: …` log line at launch to see what it resolved.
  Set `EXPO_PUBLIC_API_URL` only to override (e.g. a deployed backend), and
  `EXPO_PUBLIC_API_PORT` only if your server isn't on `4000`.
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is the same publishable key as the
  server's; it's safe to ship in the client.

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
11. **Continue with Google** (dev build — see §2) → pick a Google account → new
    users land on the role screen, returning users go straight to the dashboard.

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
| "Continue with Google" does nothing / doesn't return to the app | You're in **Expo Go** — native OAuth needs a **development build** (§2). Also confirm **Google** is enabled in the Clerk dashboard. |
| Google sign-in opens then errors on redirect | The `rollcall` scheme must match `app.json`; rebuild the dev client after any scheme change. |
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
