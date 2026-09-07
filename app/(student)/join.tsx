import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BauhausButton, BauhausInput, BauhausText, fonts, theme } from '../../components/BauhausCard';
import { useToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';
import { ClassSummary } from '../../lib/types';
import { SPACING } from '../../lib/theme';

export default function JoinClass() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [joinCode, setJoinCode] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (!joinCode.trim() || !rollNo.trim()) {
      setError('Enter both the join code and your roll number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const c = await api.post<ClassSummary>('/classes/join', {
        joinCode: joinCode.trim(),
        rollNo: rollNo.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(`Joined ${c.name}.`, 'success');
      router.replace(`/(student)/class/${c.id}`);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof ApiError ? e.message : 'Could not join this class.');
    } finally {
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
        <BauhausText style={styles.label}>Join code</BauhausText>
        <BauhausInput
          placeholder="e.g. MATH-3F9K"
          autoCapitalize="characters"
          autoCorrect={false}
          value={joinCode}
          onChangeText={setJoinCode}
        />

        <BauhausText style={[styles.label, { marginTop: SPACING.lg }]}>Your roll number</BauhausText>
        <BauhausInput
          placeholder="e.g. 42"
          autoCapitalize="characters"
          autoCorrect={false}
          value={rollNo}
          onChangeText={setRollNo}
        />

        {error ? <BauhausText style={styles.error}>{error}</BauhausText> : null}

        <BauhausButton
          label={busy ? 'Joining…' : 'Join Class'}
          disabled={busy}
          onPress={join}
          style={{ marginTop: SPACING.lg }}
        />

        <BauhausText style={styles.hint}>
          Your teacher shares the join code. Pick the roll number they assigned you on the roster — each roll number can
          be claimed once.
        </BauhausText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { padding: SPACING.lg },
  label: { fontSize: 13, marginBottom: SPACING.sm, opacity: 0.7 },
  error: { color: theme.absent, marginTop: SPACING.md, fontFamily: fonts.bodySemibold },
  hint: { color: theme.muted, marginTop: SPACING.lg, lineHeight: 20, fontSize: 13 },
});
