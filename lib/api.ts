import Constants from 'expo-constants';

// The backend port. Override with EXPO_PUBLIC_API_PORT if you run the server on
// a different port; otherwise it matches the server's default (see server/.env).
const API_PORT = process.env.EXPO_PUBLIC_API_PORT ?? '4000';

// The deployed backend (Vercel), read from the env file
// (EXPO_PUBLIC_DEPLOYED_API_URL). Used as the default when no explicit
// EXPO_PUBLIC_API_URL is set and there is no Metro dev host to auto-detect from
// (e.g. a production build), so the app talks to the live server by default.
const DEPLOYED_API_URL = process.env.EXPO_PUBLIC_DEPLOYED_API_URL?.trim().replace(/\/+$/, '') ?? '';

// Resolve the backend base URL, in priority order:
//   1) EXPO_PUBLIC_API_URL — an explicit override always wins (use this for a
//      deployed/remote server, e.g. https://api.example.com).
//   2) Auto-detect (dev): reuse the host that is already serving the JS bundle —
//      i.e. your computer's IP as seen by the device — and point at :4000. This
//      means a physical phone in Expo Go OR an emulator reaches the backend with
//      NO manual LAN-IP configuration, as long as the server runs on the same
//      machine as Metro. This is the usual cause of "HTTP 0 / request timed out":
//      the old default of localhost only works for a web build or an emulator on
//      the same host, never for a real phone.
//   3) The deployed backend (DEPLOYED_API_URL) — the default when there is no
//      Metro host to auto-detect from, e.g. a production build.
function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, ''); // strip trailing slash(es)

  // hostUri looks like "192.168.1.20:8081" in dev. Older/newer runtimes stash the
  // same thing in different places, so check the common ones.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as any).expoGoConfig?.debuggerHost ??
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ??
    (Constants as any).manifest?.debuggerHost ??
    '';
  const host = hostUri.split(':')[0]?.trim();
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${API_PORT}`;
  }

  return DEPLOYED_API_URL || `http://localhost:${API_PORT}`;
}

const BASE_URL = resolveBaseUrl();

// Log the resolved base URL once at startup so it's easy to confirm on-device
// that the app is pointed where you expect. If requests fail, check this line
// first: it should be your computer's LAN IP (auto-detected from the Metro host)
// while you're on a physical phone — not localhost. Set EXPO_PUBLIC_API_URL to
// override.
// eslint-disable-next-line no-console
console.log(
  `[api] base URL: ${BASE_URL}` +
    (process.env.EXPO_PUBLIC_API_URL ? ' (from EXPO_PUBLIC_API_URL)' : ' (auto-detected from Metro host)')
);

// ---- Auth token injection ----
// Clerk owns the session now. Rather than import Clerk here (this module stays
// framework-agnostic and usable outside React), the AuthProvider registers a
// getter that returns the current Clerk session token. Every authed request
// calls it and attaches `Authorization: Bearer <token>`, which the backend's
// Clerk middleware verifies. When no getter is registered (signed out) requests
// simply go out unauthenticated and the backend replies 401.
type TokenGetter = () => Promise<string | null>;
let authTokenGetter: TokenGetter | null = null;

export function registerAuthTokenGetter(getter: TokenGetter | null): void {
  authTokenGetter = getter;
}

async function currentToken(): Promise<string | null> {
  if (!authTokenGetter) return null;
  try {
    return await authTokenGetter();
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  status: number;
  reason?: string;
  constructor(message: string, status: number, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

// Per-request timeout. Raised from 10s → 20s because the backend runs on Vercel
// serverless: the first request after the function goes idle pays a cold-start
// penalty, which on a slow mobile connection can easily push a simple GET past
// 10s and surface the misleading "Request timed out" error. A timed-out GET is
// retried with backoff (see request()), and that retry usually hits a now-warm
// function, so 20s is a generous ceiling rather than the common case.
const TIMEOUT_MS = 20_000;

// One attempt. Throws ApiError on an HTTP error (which must NOT be retried) and
// re-throws the raw fetch/abort error on a network failure (which may be retried).
async function attempt<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean }
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = await currentToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const reason = data?.reason ?? data?.error ?? `Request failed (${res.status})`;
      // eslint-disable-next-line no-console
      console.warn(`[api] ${method} ${path} → HTTP ${res.status}: ${reason}`);
      throw new ApiError(reason, res.status, data?.reason);
    }
    // Log mutations (non-GET) so signup/login/logout/delete are easy to confirm
    // in the console, without spamming a line for every background GET.
    if (method !== 'GET') {
      // eslint-disable-next-line no-console
      console.log(`[api] ${method} ${path} → ${res.status} OK`);
    }
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

// Small delay helper for backoff between retries.
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// §13: automatic retries on a NETWORK failure (timeout / dropped connection) —
// never on an HTTP response (4xx/5xx), which is surfaced as-is so a duplicate
// write is never issued. GETs are idempotent, so they get more attempts with a
// short backoff — this is what absorbs a Vercel/Neon cold start: the first
// attempt wakes the serverless function + database, then a slightly-delayed
// retry hits a now-warm backend and succeeds. Writes (POST/PATCH/DELETE) keep a
// single retry to avoid double-submitting.
async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const method = options.method ?? 'GET';
  const maxAttempts = method === 'GET' ? 3 : 2;
  // Backoff before each retry (index 0 = wait before the 2nd attempt, etc.).
  const backoffs = [600, 1500];
  let lastErr: unknown;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await attempt<T>(path, options);
    } catch (err) {
      if (err instanceof ApiError) throw err; // got a response — don't retry
      lastErr = err;
      if (i < maxAttempts - 1) await sleep(backoffs[Math.min(i, backoffs.length - 1)]);
    }
  }

  const timedOut = lastErr instanceof Error && lastErr.name === 'AbortError';
  // eslint-disable-next-line no-console
  console.warn(
    `[api] ${method} ${path} → no response after ${maxAttempts} attempt(s) (${
      timedOut ? 'timeout' : 'network error'
    }). Is the server reachable? Base URL: ${BASE_URL}`
  );
  throw new ApiError(
    timedOut ? 'Request timed out — check your connection.' : 'Network error — check your connection.',
    0
  );
}

// Fire-and-forget backend warm-up. Vercel serverless + Neon (scale-to-zero) both
// cold-start, so the first real request after an idle period can be slow enough
// to time out. Calling this as the app opens / a dashboard gains focus pings the
// public /health/db endpoint (no auth), which wakes BOTH the function and the
// database — so by the time the user taps into a class the backend is already
// warm. Errors are swallowed: it's best-effort priming, never blocking.
export function warmUp(): void {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  fetch(`${BASE_URL}/health/db`, { method: 'GET', signal: controller.signal })
    .then(() => {
      // eslint-disable-next-line no-console
      console.log('[api] warm-up ping sent to /health/db');
    })
    .catch(() => {
      /* offline or still cold — the real request will retry with backoff */
    })
    .finally(() => clearTimeout(timer));
}

// Multipart upload (roster import). `file` is a document-picker asset.
async function upload<T>(
  path: string,
  file: { uri: string; name: string; mimeType?: string }
): Promise<T> {
  const token = await currentToken();
  const form = new FormData();
  // React Native FormData accepts this {uri,name,type} shape.
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType ?? 'application/octet-stream',
  } as any);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const reason = data?.reason ?? data?.error ?? `Upload failed (${res.status})`;
    throw new ApiError(reason, res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: 'POST', body, auth }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload,
  baseUrl: BASE_URL,
};
