import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSignInWithGoogle } from '@clerk/expo/google';
import { BauhausCard, fonts, theme } from './BauhausCard';
import { useToast } from './Toast';

/**
 * "Continue with Google" — NATIVE account picker (iOS / Android).
 *
 * This is the platform-specific variant of GoogleAuthButton. Metro resolves
 * `*.native.tsx` on device, so on iOS/Android THIS file is used; on web the
 * base `GoogleAuthButton.tsx` (browser-based `useSSO` flow) is used instead.
 * Splitting by file keeps each path's hooks unconditional — the native hook
 * `useSignInWithGoogle` throws on web, so it must never load there.
 *
 * Under the hood Clerk's built-in Google module opens the OS credential picker
 * (Android Credential Manager via `presentExplicitSignIn` / the iOS equivalent)
 * that lists every Google account already linked on the device — no browser
 * hop. On success we activate the new session and let RootNavigator route on (a
 * brand-new Google user has no backend Profile yet, so it lands on the role
 * picker just like email sign-up). The visible toast carries its own haptic.
 *
 * Build-time requirements (see SETUP.md):
 *   • EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID   — required on Android (and used
 *     as the audience on iOS too)
 *   • EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID   — additionally required on iOS
 *   • a native rebuild (dev/preview/production) so Clerk's autolinked Google
 *     module is compiled in — it is NOT in Expo Go
 * If the client ID isn't set, the flow throws and we surface the message.
 */
export function GoogleAuthButton({
  label = 'Continue with Google',
  disabled = false,
}: {
  label?: string;
  disabled?: boolean;
}) {
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const onPress = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Opens the native account picker. Returns { createdSessionId, setActive }
      // on success; a null session if the user dismissed the sheet (Clerk
      // swallows the SIGN_IN_CANCELLED error and returns null rather than
      // throwing).
      const { createdSessionId, setActive } = await startGoogleAuthenticationFlow();

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        toast.show('Signed in with Google!', 'success');
        // RootNavigator takes over: role picker if no Profile yet, else dashboard.
      } else {
        // No session — picker dismissed, or the flow needs extra steps. Not an
        // error, so keep it low-key.
        toast.show('Google sign-in was cancelled.', 'info');
      }
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.errors?.[0]?.message ??
        e?.message ??
        'Google sign-in failed. Please try again.';
      toast.show(msg, 'error');
    } finally {
      setBusy(false);
    }
  }, [busy, startGoogleAuthenticationFlow, toast]);

  return (
    <BauhausCard color={theme.white} onPress={onPress} disabled={disabled || busy} fullWidth style={styles.card}>
      <View style={styles.row}>
        <Ionicons name="logo-google" size={20} color="#4285F4" />
        <Text style={styles.label}>{busy ? 'Connecting…' : label}</Text>
      </View>
    </BauhausCard>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 15, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  label: { fontSize: 16, fontFamily: fonts.header, letterSpacing: 0.3, color: theme.ink },
});

export default GoogleAuthButton;
