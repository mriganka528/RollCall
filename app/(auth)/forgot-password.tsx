import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/expo';
import { BauhausButton, BauhausHeader, BauhausInput, BauhausText, fonts, theme } from '../../components/BauhausCard';
import { useToast } from '../../components/Toast';
import { haptics } from '../../lib/haptics';

function clerkError(e: any): string {
  return (
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    e?.message ??
    'Something went wrong. Please try again.'
  );
}

// Clerk password reset. Phase 1 emails a code; phase 2 verifies it together with
// the new password and, on success, signs the user straight in.
export default function ForgotPassword() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const toast = useToast();

  const [phase, setPhase] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    if (!isLoaded || !signIn) {
      toast.show('Still connecting to the sign-in service — one moment, then tap again.', 'info');
      return;
    }
    if (!email.trim()) {
      toast.show('Enter your email.', 'error');
      return;
    }
    setBusy(true);
    try {
      await signIn.create({ strategy: 'reset_password_email_code', identifier: email.trim() });
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
    if (!isLoaded || !signIn || !setActive) {
      toast.show('Still connecting to the sign-in service — one moment, then tap again.', 'info');
      return;
    }
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
      const res = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
        password,
      });
      if (res.status === 'complete') {
        await setActive({ session: res.createdSessionId });
        haptics.success();
        toast.show('Password reset. You’re signed in!', 'success');
        // RootNavigator takes over from here.
      } else {
        toast.show('Reset incomplete — additional verification is required.', 'error');
      }
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
