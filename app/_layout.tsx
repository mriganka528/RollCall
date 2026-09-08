import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { ClerkProvider } from '@clerk/expo';
import { useFonts as useArchivo, ArchivoBlack_400Regular } from '@expo-google-fonts/archivo-black';
import {
  useFonts as usePoppins,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from '@expo-google-fonts/poppins';
import { AuthProvider, useAuth } from '../lib/auth-context';
import { theme } from '../components/BauhausCard';
import { LoadingScreen } from '../components/LoadingScreen';
import { ConnectionErrorScreen } from '../components/ConnectionErrorScreen';
import { ToastProvider } from '../components/Toast';
import { ConfirmProvider } from '../components/ConfirmDialog';

// Required for OAuth (Google) to finish: when the auth browser session redirects
// back into the app, this resolves the pending session. Safe no-op on native
// when there's nothing to complete; on web it dismisses the popup.
WebBrowser.maybeCompleteAuthSession();

// Clerk publishable key (safe to ship in the client). Set it in the ROOT .env as
// EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — see .env.example.
const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Clerk persists its session/JWT here. On native we back it with expo-secure-store
// (encrypted keychain / keystore); on web Clerk falls back to its own browser
// storage, so we pass no cache there.
const tokenCache =
  Platform.OS === 'web'
    ? undefined
    : {
        getToken: (key: string) => SecureStore.getItemAsync(key).catch(() => null),
        saveToken: (key: string, value: string) =>
          SecureStore.setItemAsync(key, value).catch(() => undefined),
      };

function RootNavigator() {
  const { user, loading, isSignedIn, needsRole, connError, refresh, signOut } = useAuth();
  // expo-router types useSegments() as a length-1 tuple in some route shapes, so
  // indexing segments[1] trips TS2493. We legitimately read the 2nd segment (the
  // role-picker check below), so widen to string[] — a runtime no-op.
  const segments = useSegments() as string[];
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    // Signed in but the backend is unreachable → the error screen is shown
    // (below); don't try to route anywhere yet.
    if (isSignedIn && connError && !user) return;
    const group = segments[0];
    if (group === undefined) return;

    const inAuth = group === '(auth)';
    const onRolePicker = inAuth && segments[1] === 'role';

    // 1) No Clerk session → everything outside (auth) is off-limits.
    if (!isSignedIn) {
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }

    // 2) Signed in but no Profile yet → force the one-time role picker. Keep them
    //    there (don't bounce to a dashboard) until a role is chosen.
    if (needsRole) {
      if (!onRolePicker) router.replace('/(auth)/role');
      return;
    }

    // 3) Signed in with a Profile. Route by role and keep roles in their own area.
    if (!user) return; // transient: profile resolving
    if (inAuth) {
      router.replace(user.role === 'teacher' ? '/(teacher)/dashboard' : '/(student)/dashboard');
    } else if (user.role === 'teacher' && group === '(student)') {
      router.replace('/(teacher)/dashboard');
    } else if (user.role === 'student' && group === '(teacher)') {
      router.replace('/(student)/dashboard');
    }
  }, [user, loading, isSignedIn, needsRole, connError, segments]);

  // Fonts are already loaded by RootLayout here, so the branded loader is safe.
  if (loading) return <LoadingScreen />;

  // Signed in, but we couldn't load the profile because the server was
  // unreachable. Offer retry / sign out instead of a dead spinner.
  if (isSignedIn && connError && !user) {
    return <ConnectionErrorScreen message={connError} onRetry={refresh} onSignOut={signOut} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(teacher)" />
      <Stack.Screen name="(student)" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}

export default function RootLayout() {
  const [archivoLoaded, archivoError] = useArchivo({ ArchivoBlack: ArchivoBlack_400Regular });
  const [poppinsLoaded, poppinsError] = usePoppins({
    Poppins: Poppins_400Regular,
    PoppinsMedium: Poppins_500Medium,
    PoppinsSemiBold: Poppins_600SemiBold,
  });

  // A font problem must never brick the whole app. We still wait for the brand
  // fonts, but each hook is allowed to "settle" as either loaded OR errored, and
  // a hard timeout is the final backstop. So if a font asset is missing or
  // corrupt (e.g. the Poppins package isn't installed yet), the app falls back
  // to the system font instead of hanging on the splash indefinitely.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (archivoError || poppinsError) {
      // eslint-disable-next-line no-console
      console.warn(
        '[fonts] brand font failed to load — falling back to the system font. Run `npm install` to install @expo-google-fonts/poppins.',
        archivoError ?? poppinsError
      );
    }
  }, [archivoError, poppinsError]);

  const fontsSettled = (archivoLoaded || !!archivoError) && (poppinsLoaded || !!poppinsError);
  const ready = fontsSettled || timedOut;

  // While the brand fonts load we can't render Archivo Black text yet, so keep
  // this gate a plain indicator rather than the branded LoadingScreen.
  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.ink} size="large" />
      </View>
    );
  }

  // Fail loudly-but-friendly if the Clerk key is missing, instead of hanging on a
  // blank spinner forever. This is what happens when a build ships WITHOUT the
  // EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY env var — most commonly an EAS build where
  // the value wasn't provided (it lives in .env, which is gitignored, so cloud
  // builds must get it from eas.json's "env" block). Showing the reason on screen
  // turns a mystery "stuck loading" APK into a one-line diagnosis.
  if (!CLERK_PUBLISHABLE_KEY) {
    return (
      <View style={styles.center}>
        <Text style={styles.errTitle}>Configuration error</Text>
        <Text style={styles.errBody}>
          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is missing from this build. If this is an
          APK from EAS, add it to the build profile’s "env" block in eas.json, then
          rebuild. Locally, set it in the root .env and restart with `expo start -c`.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <StatusBar barStyle="dark-content" backgroundColor={theme.bg} />
              <RootNavigator />
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </ClerkProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, padding: 24 },
  errTitle: { fontSize: 20, fontWeight: '700', color: theme.ink, marginBottom: 12, textAlign: 'center' },
  errBody: { fontSize: 14, color: theme.ink, textAlign: 'center', lineHeight: 21 },
});
