import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { api, ApiError, registerAuthTokenGetter } from './api';
import { Role, User } from './types';

// The app-level auth surface. Clerk owns credentials (email/password, sessions);
// this context bridges Clerk → the app's own Profile (id/name/email/role) so the
// rest of the screens keep calling a single useAuth() with familiar fields.
interface AuthState {
  user: User | null; // the app Profile — null until one exists for the Clerk user
  loading: boolean; // Clerk still initializing, or the profile lookup is in flight
  isSignedIn: boolean; // a Clerk session exists (may still need a role)
  needsRole: boolean; // signed in with Clerk but no Profile yet → show role picker
  connError: string | null; // signed in, but the backend was unreachable (network/5xx)
  chooseRole: (role: Role, name?: string) => Promise<void>;
  updateProfile: (input: { name: string }) => Promise<void>;
  deleteAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

// Shape of GET /auth/me: either an existing profile, or a signal that the Clerk
// user still needs to pick a role (no Profile row yet).
interface MeResponse {
  user: User | null;
  needsProfile: boolean;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken, signOut: clerkSignOut } = useClerkAuth();

  const [user, setUser] = useState<User | null>(null);
  const [needsRole, setNeedsRole] = useState(false);
  // Set when we're signed into Clerk but the backend didn't answer (network
  // failure / timeout / 5xx). Distinct from "no profile yet" — it means the
  // server is unreachable, so the router shows a retry screen instead of a dead
  // loading state. Cleared on a successful /auth/me or on sign-out.
  const [connError, setConnError] = useState<string | null>(null);
  // Whether we've resolved the profile state at least once for the current Clerk
  // session. Gates `loading` so the router waits for a definitive answer instead
  // of flashing the login screen on launch.
  const [resolved, setResolved] = useState(false);

  // Feed the Clerk session token to the API layer. Registered in its own effect
  // (which runs before the profile-fetch effect below) so the very first
  // authed request already carries a token.
  useEffect(() => {
    registerAuthTokenGetter(async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
    return () => registerAuthTokenGetter(null);
  }, [getToken]);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<MeResponse>('/auth/me');
      setConnError(null); // reached the server → clear any prior outage
      if (me.user) {
        setUser(me.user);
        setNeedsRole(false);
      } else {
        setUser(null);
        setNeedsRole(true);
      }
    } catch (e) {
      // A 401 means Clerk says signed-in but the backend disagrees (token race /
      // just signed out) — treat as no profile rather than an outage.
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setNeedsRole(false);
        setConnError(null);
      } else {
        // Network failure (ApiError status 0), timeout, or 5xx: the Clerk session
        // is valid but our backend is unreachable. Surface it so the router shows
        // a retry screen instead of dead-ending on the loading spinner. THIS is
        // the "stuck after email verification" case when the server is down or
        // EXPO_PUBLIC_API_URL is wrong.
        // eslint-disable-next-line no-console
        console.error('[auth] /auth/me failed:', e instanceof ApiError ? `HTTP ${e.status}: ${e.message}` : e);
        setUser(null);
        setNeedsRole(false);
        setConnError(e instanceof ApiError ? e.message : 'Could not reach the server.');
      }
    } finally {
      setResolved(true);
    }
  }, []);

  // React to Clerk auth state. When a session appears, resolve the app profile;
  // when it disappears (sign out / delete), clear everything.
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      setResolved(false);
      void refresh();
    } else {
      setUser(null);
      setNeedsRole(false);
      setConnError(null);
      setResolved(true);
    }
  }, [isLoaded, isSignedIn, userId, refresh]);

  const chooseRole = useCallback(async (role: Role, name?: string) => {
    // eslint-disable-next-line no-console
    console.log(`[auth] chooseRole: POST /auth/profile (${role}) …`);
    const res = await api.post<{ user: User }>('/auth/profile', { role, name });
    setUser(res.user);
    setNeedsRole(false);
    setConnError(null);
    setResolved(true);
    // eslint-disable-next-line no-console
    console.log('[auth] chooseRole: profile created');
  }, []);

  const updateProfile = useCallback(async (input: { name: string }) => {
    const res = await api.patch<{ user: User }>('/auth/me', input);
    setUser(res.user);
  }, []);

  const deleteAccount = useCallback(async () => {
    // eslint-disable-next-line no-console
    console.log('[auth] deleteAccount: DELETE /auth/me …');
    try {
      await api.del('/auth/me');
      // eslint-disable-next-line no-console
      console.log('[auth] deleteAccount: server confirmed deletion');
    } catch (e) {
      // 404 → already gone, which is the end state we want. Anything else must
      // propagate so the screen shows it and does NOT sign the user out as if it
      // had succeeded.
      if (e instanceof ApiError && e.status === 404) {
        // eslint-disable-next-line no-console
        console.log('[auth] deleteAccount: already gone (404) — treating as success');
      } else {
        // eslint-disable-next-line no-console
        console.error('[auth] deleteAccount: FAILED —', e instanceof ApiError ? `HTTP ${e.status}: ${e.message}` : e);
        throw e;
      }
    }
    // Clear local state, then end the Clerk session. The backend already deleted
    // the Clerk user; signing out locally drops the cached token so the app
    // returns to the signed-out state and the router sends us to login.
    setUser(null);
    setNeedsRole(false);
    await clerkSignOut();
    // eslint-disable-next-line no-console
    console.log('[auth] deleteAccount: local session cleared');
  }, [clerkSignOut]);

  const signOut = useCallback(async () => {
    // eslint-disable-next-line no-console
    console.log('[auth] signOut: ending Clerk session …');
    setUser(null);
    setNeedsRole(false);
    try {
      await clerkSignOut();
    } finally {
      // eslint-disable-next-line no-console
      console.log('[auth] signOut: session cleared');
    }
  }, [clerkSignOut]);

  const loading = !isLoaded || (!!isSignedIn && !resolved);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      isSignedIn: !!isSignedIn,
      needsRole,
      connError,
      chooseRole,
      updateProfile,
      deleteAccount,
      signOut,
      refresh,
    }),
    [user, loading, isSignedIn, needsRole, connError, chooseRole, updateProfile, deleteAccount, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
