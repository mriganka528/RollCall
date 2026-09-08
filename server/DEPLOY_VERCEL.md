# Deploying the ROLLCALL API to Vercel

Vercel runs your backend as a **serverless function**: there's no single process
that stays up, but your API is always reachable and each request wakes a function
on demand (with an occasional ~1–2s cold start). Your server suits this well — it
keeps no in-memory state, has no background timers or websockets, and uploads are
parsed in memory.

You'll add 3 small files, make 2 tiny edits, and set one project option. The app
still runs locally exactly as before. Budget ~15 minutes.

> Vercel's dashboard wording changes from time to time; the button labels below
> may differ slightly, but the concepts (Root Directory, Environment Variables,
> Build Command) are stable.

---

## 1. Add the serverless entry point

Create a new file **`server/api/index.ts`**:

```ts
// Vercel serverless entry. vercel.json routes every request to this function,
// which is simply our Express app.
import app from '../src/index';

export default app;
```

## 2. Export the app, and only listen locally

Vercel invokes the exported app per request, so it must **not** call
`app.listen()`. In **`server/src/index.ts`**, replace the block at the bottom:

```ts
const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`ROLLCALL API listening on http://0.0.0.0:${PORT}`);
});
```

with:

```ts
// Only start a real listener when running locally. On Vercel the app is exported
// (see api/index.ts) and invoked per request, so calling listen() there is wrong.
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT ?? 4000);
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`ROLLCALL API listening on http://0.0.0.0:${PORT}`);
  });
}

export default app;
```

`npm run dev` and `npm start` keep working unchanged — Vercel sets `VERCEL=1`, so
only Vercel skips the listen.

## 3. Add vercel.json

Create **`server/vercel.json`**:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/api" }
  ]
}
```

This forwards every path (`/auth/me`, `/classes`, `/sessions/…`, etc.) to the
Express function, which still receives the original URL — so all your existing
routes work without change.

## 4. Make Prisma build correctly on Vercel

**a)** In **`server/package.json`**, add one line to `"scripts"` (Vercel runs this
at build time to generate the Prisma client):

```json
"vercel-build": "prisma generate",
```

For example:

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "prisma generate && tsc -p tsconfig.json",
  "vercel-build": "prisma generate",
  "start": "node dist/index.js",
  ...
}
```

**b)** In **`server/prisma/schema.prisma`**, add the Linux engine target so Prisma
runs on Vercel's runtime. Change:

```prisma
generator client {
  provider = "prisma-client-js"
}
```

to:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "rhel-openssl-3.0.x"]
}
```

## 5. Commit and push

```bash
git add server/api server/vercel.json server/src/index.ts server/package.json server/prisma/schema.prisma
git commit -m "Configure server for Vercel serverless deployment"
git push
```

## 6. Create the Vercel project

1. Go to **vercel.com → Add New → Project** and import your GitHub repo
   `mriganka528/RollCall`.
2. **Set Root Directory to `server`.** This is the key step — click *Edit* next to
   Root Directory and choose the `server` folder, so Vercel builds your backend
   (not the Expo app at the repo root).
3. **Framework Preset: Other.**
4. Leave the build/output settings as detected — your `vercel-build` script handles
   Prisma. Set the environment variables (next step) before or right after the
   first deploy, then redeploy.

## 7. Set environment variables

In **Settings → Environment Variables**, add (at least for Production):

| Variable | Value | Required |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** connection string (host contains `-pooler`) | Yes |
| `CLERK_SECRET_KEY` | Your current (rotated) Clerk secret key | Yes |
| `DIRECT_URL` | Neon **direct** string (host without `-pooler`) | Recommended |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key | Optional |

- **Do not** set `PORT` — Vercel manages it and the listener is skipped.
- `NODE_ENV` is set to `production` automatically.
- Use the **same Clerk instance** your mobile app's publishable key belongs to, and
  the **rotated** Neon password / Clerk secret from the earlier secret cleanup.
- If you change env vars later, redeploy for them to take effect.

## 8. Database schema

- **Reusing your existing Neon database (default): nothing to do** — the tables
  are already there from local development.
- **Using a brand-new production database:** run this once locally, pointed at the
  new DB (set `DATABASE_URL`/`DIRECT_URL` in `server/.env` to the new DB first):

  ```bash
  cd server
  npx prisma db push
  ```

  This repo has no migration files, so `prisma db push` is how you create the
  tables from `schema.prisma`. It never runs on Vercel.

## 9. Deploy and verify

Deploy from the dashboard (or your `git push` triggers it). Once live, test:

- `https://<your-project>.vercel.app/health` → `{"ok":true}`
- `https://<your-project>.vercel.app/health/db` → `{"ok":true,"db":"reachable"}`

If `/health` works but `/health/db` fails, it's a database/env issue — check
`DATABASE_URL`. For any error, open **Deployments → (your deploy) → Functions /
Logs** to see the real message (your server logs the full error there).

## 10. Point the mobile app at the deployed API

In the **repo-root `.env`** (the app's, not `server/.env`):

```
EXPO_PUBLIC_API_URL=https://<your-project>.vercel.app
```

Then restart Expo with a cache clear so the bundled value updates:

```bash
npx expo start -c
```

The app's automatic base-URL detection only finds your laptop on the LAN for local
dev; a deployed backend must be set explicitly. For a production/standalone app
build, this value is baked in at build time.

---

## Good to know (serverless specifics)

- **Cold starts:** after idle, the first request may take ~1–2s while the function
  wakes; subsequent requests are fast.
- **Function timeout:** 10s on the Hobby plan — your queries are well under that.
- **Upload size:** Vercel caps request bodies at ~4.5MB, so roster-import files
  must be under that (your code already limits to 5MB).
- **Connections:** you're on Neon's pooled endpoint, which is built for serverless.
  If you ever see `prepared statement "s0" already exists` errors, append
  `?pgbouncer=true` (or `&pgbouncer=true`) to `DATABASE_URL`.
- **Node version:** Vercel defaults to a recent LTS. To pin it, add
  `"engines": { "node": "22.x" }` to `server/package.json`.

## If a deploy fails

- **"Prisma Client could not locate the Query Engine…"** → confirm the
  `vercel-build` script and the `binaryTargets` line (step 4) are committed.
- **Build runs `tsc` and fails on types** → make sure the `vercel-build` script
  exists (Vercel runs it instead of the full `build`), or set the Build Command to
  `prisma generate` in Settings → General.
- **404 on every route** → check `vercel.json` rewrites and that Root Directory is
  set to `server`.
- **Function exits / 500 on cold start** → a required env var is missing; the
  server calls `process.exit(1)` if `DATABASE_URL` or `CLERK_SECRET_KEY` isn't set.
  Add it and redeploy.
