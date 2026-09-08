import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/expo';
import { BauhausButton, BauhausHeader, BauhausInput, BauhausText, fonts, theme } from '../../components/BauhausCard';
import { useToast } from '../../components/Toast';
import { haptics } from '../../lib/haptics';

// Pull a human-readable message out of a Clerk error. The signals/future API
// returns a ClerkError object with `longMessage`/`message`/`code`; older thrown
// errors nested them under `errors[]`. Handle both.
function clerkError(e: any): string {
  return (
    e?.longMessage ??
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    e?.message ??
    'Something went wrong. Please try again.'
  );
}

// Clerk password reset. Phase 1 emails a code; phase 2 verifies it together with
// the new password and, on success, signs the user straight in.
export default function ForgotPassword() {
  // Signals/future API (see login.tsx): no `isLoaded`, no `setActive`. Reset is a
  // three-step flow on signIn.resetPasswordEmailCode, then finalize().
  const { signIn } = useSignIn();
  const router = useRouter();
  const toast = useToast();

  const [phase, setPhase] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    if (!email.trim()) {
      toast.show('Enter your email.', 'error');
      return;
    }
    setBusy(true);
    try {
      // Future API: establish the sign-in with the identifier, then send the
      // reset-password email code. (The old single-call
      // create({ strategy: 'reset_password_email_code' }) no longer exists.)
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) {
        toast.show(clerkError(created.error), 'error');
        return;
      }
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) {
        toast.show(clerkError(sent.error), 'error');
        return;
      }
      haptics.light();
      setPhase('reset');
      toast.show('We emailed you a 6-digit code.', 'info');
    } catch (e) {
      toast.show(clerkError(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!code.trim()) {
      toast.show('Enter the code from your email.', 'error');
      return;
    }
    if (password.length < 8) {
      toast.show('New password must be at least 8 characters.', 'error');
      return;
    }
    setBusy(true);
    try {
      // Verify the emailed code, then submit the new password, then finalize()
      // to activate the session (replaces setActive). Each step resolves with
      // `{ error }` rather than throwing.
      const verified = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (verified.error) {
        toast.show(clerkError(verified.error), 'error');
        return;
      }
      const submitted = await signIn.resetPasswordEmailCode.submitPassword({ password });
      if (submitted.error) {
        toast.show(clerkError(submitted.error), 'error');
        return;
      }
      const fin = await signIn.finalize();
      if (fin.error) {
        toast.show(clerkError(fin.error), 'error');
        return;
      }
      haptics.success();
      toast.show('Password reset. You’re signed in!', 'success');
      // RootNavigator takes over from here.
    } catch (e) {
      toast.show(clerkError(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <BauhausHeader style={styles.title}>Reset password</BauhausHeader>

        {phase === 'email' ? (
          <>
            <BauhausText style={styles.sub}>We'll email you a 6-digit code.</BauhausText>
            <View style={styles.form}>
              <BauhausInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
              />
              <BauhausButton label={busy ? 'Sending…' : 'Send Code'} onPress={sendCode} disabled={busy} />
              <BauhausButton label="Back to login" color={theme.white} onPress={() => router.replace('/(auth)/login')} disabled={busy} />
            </View>
          </>
        ) : (
          <>
            <BauhausText style={styles.sub}>Enter the code we sent to {email.trim()} and your new password.</BauhausText>
            <View style={styles.form}>
              <BauhausInput
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                keyboardType="number-pad"
                maxLength={6}
              />
              <BauhausInput
                value={password}
                onChangeText={setPassword}
                placeholder="New password"
                secureTextEntry
              />
              <BauhausButton label={busy ? 'Resetting…' : 'Reset Password'} onPress={resetPassword} disabled={busy} />
              <BauhausButton label="Use a different email" color={theme.white} onPress={() => setPhase('email')} disabled={busy} />
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.bg },
  title: { fontSize: 30, textAlign: 'center' },
  sub: { textAlign: 'center', marginTop: 8, marginBottom: 28, color: theme.muted },
  form: { gap: 16 },
});
