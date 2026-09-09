import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/expo';
import { BauhausBackdrop, BauhausButton, BauhausHeader, BauhausInput, BauhausText, theme } from '../../components/BauhausCard';
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

// Clerk password reset, split into three steps so the emailed code
// AUTO-VERIFIES the moment all six digits are entered:
//   email    → send the reset code
//   code     → verify the 6-digit code automatically (no button press needed)
//   password → set the new password and sign straight in
// verifyCode() and submitPassword() are distinct steps on the
// resetPasswordEmailCode strategy, so the signIn resource holds the verified
// state between the two screens.
export default function ForgotPassword() {
  const { signIn } = useSignIn();
  const router = useRouter();
  const toast = useToast();

  const [phase, setPhase] = useState<'email' | 'code' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // Guards the auto-submit so a burst of onChangeText events (or a paste)
  // can't fire verification twice.
  const verifyingRef = useRef(false);

  async function sendCode() {
    if (!email.trim()) {
      toast.show('Enter your email.', 'error');
      return;
    }
    setBusy(true);
    try {
      // Future API: establish the sign-in with the identifier, then send the
      // reset-password email code.
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
      setCode('');
      setPhase('code');
      toast.show('We emailed you a 6-digit code.', 'info');
    } catch (e) {
      toast.show(clerkError(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  // Verifies the reset code on its own. Fired automatically when the sixth
  // digit lands (see the code input's onChangeText), or manually via the
  // button. Accepts the code directly to avoid a stale-state read.
  async function verifyOtp(codeArg?: string) {
    const c = (codeArg ?? code).replace(/\D/g, '');
    if (c.length !== 6) {
      toast.show('Enter the 6-digit code from your email.', 'error');
      return;
    }
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setBusy(true);
    try {
      const verified = await signIn.resetPasswordEmailCode.verifyCode({ code: c });
      if (verified.error) {
        toast.show(clerkError(verified.error), 'error');
        return;
      }
      haptics.success();
      toast.show('Code verified — set a new password.', 'success');
      setPhase('password');
    } catch (e) {
      toast.show(clerkError(e), 'error');
    } finally {
      setBusy(false);
      verifyingRef.current = false;
    }
  }

  async function submitNewPassword() {
    if (password.length < 8) {
      toast.show('New password must be at least 8 characters.', 'error');
      return;
    }
    setBusy(true);
    try {
      // Code is already verified; submit the new password, then finalize() to
      // activate the session (replaces setActive).
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
      <BauhausBackdrop />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <BauhausHeader style={styles.title}>Reset password</BauhausHeader>

        {phase === 'email' && (
          <>
            <BauhausText style={styles.sub}>We&apos;ll email you a 6-digit code.</BauhausText>
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
        )}

        {phase === 'code' && (
          <>
            <BauhausText style={styles.sub}>Enter the code we sent to {email.trim()}. It verifies automatically.</BauhausText>
            <View style={styles.form}>
              <BauhausInput
                value={code}
                onChangeText={(t) => {
                  const digits = t.replace(/\D/g, '').slice(0, 6);
                  setCode(digits);
                  if (digits.length === 6) verifyOtp(digits);
                }}
                placeholder="6-digit code"
                keyboardType="number-pad"
                maxLength={6}
              />
              <BauhausButton label={busy ? 'Verifying…' : 'Verify'} onPress={() => verifyOtp()} disabled={busy} />
              <BauhausButton label="Use a different email" color={theme.white} onPress={() => setPhase('email')} disabled={busy} />
            </View>
          </>
        )}

        {phase === 'password' && (
          <>
            <BauhausText style={styles.sub}>Choose a new password for {email.trim()}.</BauhausText>
            <View style={styles.form}>
              <BauhausInput
                value={password}
                onChangeText={setPassword}
                placeholder="New password"
                secureTextEntry
              />
              <BauhausButton label={busy ? 'Resetting…' : 'Reset Password'} onPress={submitNewPassword} disabled={busy} />
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: 'transparent' },
  title: { fontSize: 30, textAlign: 'center' },
  sub: { textAlign: 'center', marginTop: 8, marginBottom: 28, color: theme.muted },
  form: { gap: 16 },
});
