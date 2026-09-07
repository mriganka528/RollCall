import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import { prisma } from './db';
import authRoutes from './routes/auth';
import classRoutes from './routes/classes';
import sessionRoutes from './routes/sessions';
import analyticsRoutes from './routes/analytics';

// Fail loud at boot if a required secret is missing, instead of crashing
// mysteriously on the first request that needs it. Clerk is the identity
// provider now: clerkMiddleware() verifies Bearer tokens using CLERK_SECRET_KEY,
// which is the only Clerk value the backend strictly needs.
for (const key of ['DATABASE_URL', 'CLERK_SECRET_KEY'] as const) {
  if (!process.env[key]) {
    // eslint-disable-next-line no-console
    console.error(
      `[boot] Missing required env var ${key}. Copy server/.env.example to server/.env and fill it in.`
    );
    process.exit(1);
  }
}

// The publishable key is optional for a mobile backend (it's only needed for
// Clerk's redirect "handshake" used by SSR web apps). Accept it under either the
// backend name (CLERK_PUBLISHABLE_KEY) or the Expo name the app uses
// (EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY), so a single value in .env works for both.
const clerkPublishableKey =
  process.env.CLERK_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

const app = express();

app.use(cors());
app.use(express.json());

// Clerk auth context. Must run before any route that calls getAuth(req): it reads
// the Authorization: Bearer <token> header, verifies it against CLERK_SECRET_KEY,
// and populates the auth object our requireAuth/requireClerk middleware reads. It
// does NOT itself block unauthenticated requests — our middleware does that
// per-route.
app.use(clerkMiddleware(clerkPublishableKey ? { publishableKey: clerkPublishableKey } : undefined));

// ---- Request logging (observability) ----
// Logs every API call as it completes: method, path, status code and duration.
// This is the fastest way to confirm in the server console that a call actually
// arrived, whether it succeeded, and how long its DB work took. We deliberately
// log only the method/path/status — never request bodies — so passwords and
// tokens are never written to the log.
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const { method, originalUrl } = req;
  // eslint-disable-next-line no-console
  console.log(`[req] --> ${method} ${originalUrl}`);
  res.on('finish', () => {
    const ms = Date.now() - start;
    const tag = res.statusCode >= 500 ? 'ERR ' : res.statusCode >= 400 ? 'WARN' : 'OK  ';
    // eslint-disable-next-line no-console
    console.log(`[req] ${tag} ${method} ${originalUrl} --> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// Diagnostic: confirms the API can actually reach the database, isolating
// "server is up" from "database is reachable" (debug Step 2 / Step 5).
app.get('/health/db', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'reachable' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[health/db] database unreachable:', err);
    res.status(500).json({ ok: false, db: 'unreachable', error: (err as Error).message });
  }
});

app.use('/auth', authRoutes);
app.use('/', classRoutes);
app.use('/', sessionRoutes);
app.use('/', analyticsRoutes);

// Unmatched route → JSON 404 (not Express's default HTML page, which the mobile
// client can't parse and would surface as a confusing generic failure).
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// Central error handler (must be LAST and take 4 args). Async route rejections
// are forwarded here by makeRouter() in lib/router.ts. Logs the full error
// server-side and returns the real message to the client so failures are
// visible instead of hanging / showing a generic "API error".
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  const status =
    typeof (err as { status?: number }).status === 'number'
      ? (err as { status: number }).status
      : typeof (err as { statusCode?: number }).statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : 500;
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`ROLLCALL API listening on http://0.0.0.0:${PORT}`);
});
