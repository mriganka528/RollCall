import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { useSSO } from '@clerk/expo';
import { BauhausCard, fonts, theme } from './BauhausCard';
import { useToast } from './Toast';

// Ensures any in-flight OAuth session is dismissed once the browser redirects
// back into the app. Called once here as a safety net (also done in _layout).
WebBrowser.maybeCompleteAuthSession();

// Android opens OAuth in a Custom Tab; warming it up ahead of the tap makes the
// hand-off noticeably snappier (recommended by Clerk). No-op elsewhere.
function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

/**
 * "Continue with Google" — one-tap SSO via Clerk. On success we activate the
 * new session and let RootNavigator route onward (a brand-new Google user has
 * no backend Profile yet, so it lands on the role picker just like email
 * sign-up). The visible toast carries its own success/error haptic.
 */
export function GoogleAuthButton({
  label = 'Continue with Google',
  disabled = false,
}: {
  label?: string;
  disabled?: boolean;
}) {
  useWarmUpBrowser();
  const { startSSOFlow } = useSSO();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const onPress = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        // Uses the app's "rollcall" scheme (app.json) to return from the browser.
        redirectUrl: Linking.createURL('/'),
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        toast.show('Signed in with Google!', 'success');
        // RootNavigator takes over: role picker if no Profile yet, else dashboard.
      } else {
        // Flow returned without a session (e.g. cancelled, or needs extra steps).
        toast.show('Google sign-in didn’t complete. Please try again.', 'info');
      }
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.errors?.[0]?.message ??
        e?.message ??
        'Google sign-in was cancelled or failed.';
      toast.show(msg, 'error');
    } finally {
      setBusy(false);
    }
  }, [busy, startSSOFlow, toast]);

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
