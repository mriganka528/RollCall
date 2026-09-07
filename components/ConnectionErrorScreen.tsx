import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BauhausButton, BauhausHeader, BauhausText, theme } from './BauhausCard';
import { SPACING } from '../lib/theme';
import { api } from '../lib/api';
import { haptics } from '../lib/haptics';

/**
 * Shown when the user is signed into Clerk but the app cannot reach its own
 * backend (network failure / timeout / server down). Without this, that state
 * dead-ends on the loading spinner — which is exactly the "stuck after email
 * verification" symptom when the server isn't running or EXPO_PUBLIC_API_URL /
 * the auto-detected host is wrong.
 *
 * It gives two clear actions: retry the profile lookup, or sign out. The
 * resolved base URL is shown so it's obvious where the app is trying to connect.
 */
export function ConnectionErrorScreen({
  message,
  onRetry,
  onSignOut,
}: {
  message: string;
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    setBusy(true);
    haptics.light();
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={56} color={theme.absent} style={{ marginBottom: SPACING.md }} />
      <BauhausHeader style={styles.title}>Can’t reach the server</BauhausHeader>
      <BauhausText style={styles.body}>
        You’re signed in, but the app couldn’t load your profile. Make sure the backend server is running and reachable
        from this device, then try again.
      </BauhausText>
      <BauhausText style={styles.detail}>{message}</BauhausText>
      <BauhausText style={styles.url}>Trying: {api.baseUrl}</BauhausText>

      <View style={styles.actions}>
        <BauhausButton label={busy ? 'Retrying…' : 'Try again'} onPress={retry} disabled={busy} />
        <BauhausButton label="Sign out" color={theme.white} onPress={() => void onSignOut()} disabled={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, padding: SPACING.xl },
  title: { fontSize: 24, textAlign: 'center', marginBottom: SPACING.sm },
  body: { fontSize: 15, textAlign: 'center', color: theme.muted, marginBottom: SPACING.md, lineHeight: 22 },
  detail: { fontSize: 13, textAlign: 'center', color: theme.absent, marginBottom: SPACING.xs },
  url: { fontSize: 12, textAlign: 'center', color: theme.muted, marginBottom: SPACING.xl },
  actions: { alignSelf: 'stretch', gap: SPACING.md },
});

export default ConnectionErrorScreen;
