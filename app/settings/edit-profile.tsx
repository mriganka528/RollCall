import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BauhausButton, BauhausCard, BauhausInput, BauhausText, fonts, theme } from '../../components/BauhausCard';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import { useAuth } from '../../lib/auth-context';
import { ApiError } from '../../lib/api';
import { COLORS, SPACING } from '../../lib/theme';
import { haptics } from '../../lib/haptics';

// Name-only profile editing. Email and password are owned by Clerk now, so they
// are shown read-only here with a pointer to where they can be changed; the app
// Profile only stores the display name and role.
export default function EditProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const confirm = useConfirm();
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = name.trim() !== (user?.name ?? '');

  async function onSave() {
    if (!dirty) {
      toast.show('Nothing to update.', 'info');
      return;
    }
    if (!name.trim()) {
      setError('Name can’t be empty.');
      return;
    }
    setError(null);
    const ok = await confirm({ title: 'Save changes?', message: 'Update your display name?', confirmLabel: 'Save' });
    if (ok) void submit();
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await updateProfile({ name: name.trim() });
      haptics.success();
      toast.show('Profile updated.', 'success');
      router.back();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not update your profile.';
      setError(msg);
      toast.show(msg, 'error');
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + SPACING.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <BauhausText style={styles.label}>Name</BauhausText>
        <BauhausInput value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />

        <BauhausCard color={COLORS.bg} style={styles.section}>
          <BauhausText style={styles.sectionTitle}>Email & password</BauhausText>
          <BauhausText style={styles.hint}>
            {user?.email ? `Signed in as ${user.email}. ` : ''}Your email and password are managed by your secure
            login. Use “Forgot password?” on the login screen to change your password.
          </BauhausText>
        </BauhausCard>

        {error ? <BauhausText style={styles.error}>{error}</BauhausText> : null}

        <BauhausButton
          label={busy ? 'Saving…' : 'Save Changes'}
          disabled={busy || !dirty}
          onPress={onSave}
          style={{ marginTop: SPACING.lg }}
        />
        <BauhausButton
          label="Cancel"
          color={theme.white}
          onPress={() => router.back()}
          style={{ marginTop: SPACING.sm }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { padding: SPACING.lg },
  label: { fontSize: 13, marginTop: SPACING.md, marginBottom: SPACING.sm, opacity: 0.7 },
  section: { padding: SPACING.md, marginTop: SPACING.lg },
  sectionTitle: { fontFamily: fonts.header, fontSize: 16 },
  hint: { fontSize: 12, opacity: 0.6, marginTop: SPACING.xs, lineHeight: 18 },
  error: { color: theme.absent, marginTop: SPACING.md, fontFamily: fonts.bodySemibold },
});
