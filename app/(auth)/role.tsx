import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useUser } from '@clerk/expo';
import { BauhausButton, BauhausCard, BauhausHeader, BauhausInput, BauhausText, fonts, theme } from '../../components/BauhausCard';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../lib/auth-context';
import { haptics } from '../../lib/haptics';
import { Role } from '../../lib/types';

// Shown once, right after a Clerk account exists but before a Profile does. The
// choice here creates the backend Profile (keyed by the Clerk user id) that the
// rest of the app routes on.
export default function RolePicker() {
  const { chooseRole, signOut } = useAuth();
  const { user: clerkUser } = useUser();
  const toast = useToast();

  const [name, setName] = useState(clerkUser?.fullName ?? '');
  const [role, setRole] = useState<Role>('teacher');
  const [busy, setBusy] = useState(false);

  async function onContinue() {
    if (!name.trim()) {
      toast.show('Enter your name.', 'error');
      return;
    }
    setBusy(true);
    try {
      await chooseRole(role, name.trim());
      haptics.success();
      toast.show(`You're all set as a ${role}!`, 'success');
      // RootNavigator redirects to the matching dashboard once the profile lands.
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not finish setup. Please try again.', 'error');
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <BauhausHeader style={styles.title}>One last step</BauhausHeader>
        <BauhausText style={styles.sub}>Tell us who you are so we can set up the right screens.</BauhausText>

        <View style={styles.form}>
          <BauhausText style={styles.label}>Your name</BauhausText>
          <BauhausInput
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            autoCapitalize="words"
          />

          <BauhausText style={styles.label}>I am a…</BauhausText>
          <View style={styles.roleRow}>
            <RolePill label="Teacher" color={theme.blue} active={role === 'teacher'} onPress={() => { haptics.selection(); setRole('teacher'); }} />
            <RolePill label="Student" color={theme.violet} active={role === 'student'} onPress={() => { haptics.selection(); setRole('student'); }} />
          </View>

          <BauhausButton
            label={busy ? 'Setting up…' : 'Continue'}
            onPress={onContinue}
            disabled={busy}
            style={{ marginTop: 8 }}
          />
          <BauhausButton label="Sign out" color={theme.white} onPress={() => void signOut()} disabled={busy} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function RolePill({ label, color, active, onPress }: { label: string; color: string; active: boolean; onPress: () => void }) {
  return (
    <BauhausCard
      color={active ? color : theme.white}
      borderColor={active ? color : theme.ink}
      onPress={onPress}
      fullWidth={false}
      style={styles.pill}
    >
      <BauhausText style={[styles.pillText, { color: active ? theme.white : theme.ink }]}>{label}</BauhausText>
    </BauhausCard>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.bg },
  title: { fontSize: 30, textAlign: 'center' },
  sub: { textAlign: 'center', marginTop: 8, marginBottom: 28, color: theme.muted },
  form: { gap: 16 },
  label: { fontSize: 13, marginBottom: -4, color: theme.muted, fontFamily: fonts.bodyMedium },
  roleRow: { flexDirection: 'row', gap: 12 },
  pill: { flex: 1, paddingVertical: 16, alignItems: 'center' },
  pillText: { fontSize: 15, fontFamily: fonts.bodySemibold },
});
