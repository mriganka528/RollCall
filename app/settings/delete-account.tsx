import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BauhausButton, BauhausCard, BauhausHeader, BauhausInput, BauhausText, fonts, theme } from '../../components/BauhausCard';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import { useAuth } from '../../lib/auth-context';
import { SPACING } from '../../lib/theme';

export default function DeleteAccount() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const askConfirm = useConfirm();
  const { deleteAccount } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = confirm.trim().toUpperCase() === 'DELETE' && !busy;

  async function onDelete() {
    if (!enabled) return;
    // Final confirmation before the irreversible call (§8). In-app dialog so it
    // fires on web too (Alert.alert buttons no-op on react-native-web).
    const ok = await askConfirm({
      title: 'Delete account?',
      message: 'This permanently removes your account and can’t be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) void doDelete();
  }

  async function doDelete() {
    // Warn haptic before the destructive, irreversible call (§6).
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setBusy(true);
    setError(null);
    // eslint-disable-next-line no-console
    console.log('[delete-account] Delete confirmed → calling deleteAccount()');
    try {
      await deleteAccount();
      // eslint-disable-next-line no-console
      console.log('[delete-account] deleted → replacing route with login');
      toast.show('Your account has been deleted.', 'success');
      // Root navigator redirects to login once user becomes null.
      router.replace('/(auth)/login');
    } catch (e: any) {
      const msg = e?.message ?? 'Could not delete your account.';
      // eslint-disable-next-line no-console
      console.error('[delete-account] delete FAILED:', msg);
      setError(msg);
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + SPACING.xl }]}>
      <BauhausCard color={theme.absent} style={styles.warnCard}>
        <BauhausHeader style={styles.warnTitle}>This can’t be undone</BauhausHeader>
        <BauhausText style={styles.warnBody}>
          Deleting your account permanently removes your profile. If you’re a teacher, all of your classes, sessions,
          and attendance records go with it. If you’re a student, your roster spots are freed up so your history is no
          longer linked to you.
        </BauhausText>
      </BauhausCard>

      <BauhausText style={styles.label}>Type DELETE to confirm</BauhausText>
      <BauhausInput
        placeholder="DELETE"
        autoCapitalize="characters"
        autoCorrect={false}
        value={confirm}
        onChangeText={setConfirm}
      />

      {error ? <BauhausText style={styles.error}>{error}</BauhausText> : null}

      <BauhausButton
        label={busy ? 'Deleting…' : 'Delete My Account'}
        color={theme.absent}
        disabled={!enabled}
        onPress={onDelete}
        style={{ marginTop: 24 }}
      />
      <BauhausButton label="Cancel" color={theme.white} onPress={() => router.back()} style={{ marginTop: 12 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { padding: SPACING.lg },
  warnCard: { padding: 20 },
  warnTitle: { fontSize: 20, marginBottom: 10, color: theme.white },
  warnBody: { color: theme.white, lineHeight: 21 },
  label: { fontSize: 13, marginTop: 28, marginBottom: 10, opacity: 0.7 },
  error: { color: theme.absent, marginTop: 16, fontFamily: fonts.bodySemibold },
});
