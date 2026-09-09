import { useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import { useSignUp } from '@clerk/expo';
import { BauhausBackdrop, BauhausButton, BauhausHeader, BauhausInput, BauhausText, fonts, theme } from '../../components/BauhausCard';
import { GoogleAuthButton } from '../../components/GoogleAuthButton';
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

export default function Signup() {
  // Signals/future API (see login.tsx): useSignUp() returns { signUp, errors,
  // fetchStatus } — no `isLoaded`, no `setActive`. `signUp` is always present.
  const { signUp } = useSignUp();
  const toast = useToast();

  // Two phases in one screen: collect credentials, then verify the emailed code.
  const [phase, setPhase] = useState<'form' | 'verify'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  // Guards the auto-submit so a burst of onChangeText events (or a paste)
  // can't fire verification twice.
  const submittingRef = useRef(false);

  async function onSubmit() {
    if (!email.trim()) {
      toast.show('Enter your email.', 'error');
      return;
    }
    if (password.length < 8) {
      toast.show('Password must be at least 8 characters.', 'error');
      return;
    }
    if (password !== confirm) {
      toast.show('Passwords don’t match.', 'error');
      return;
    }
    setBusy(true);
    try {
      // Future API: create() then send the email verification code. Both resolve
      // with `{ error }` instead of throwing, so check `error` after each step.
      const created = await signUp.create({ emailAddress: email.trim(), password });
      if (created.error) {
        toast.show(clerkError(created.error), 'error');
        return;
      }
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) {
        toast.show(clerkError(sent.error), 'error');
        return;
      }
      haptics.light();
      setPhase('verify');
      toast.show('We emailed you a 6-digit code.', 'info');
    } catch (e) {
      toast.show(clerkError(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  // Verifies the emailed code. Called automatically the moment the sixth digit
  // is entered (see the code input's onChangeText), or manually via the button.
  // Accepts the code directly to avoid a stale-state read on the auto-fire.
  async function onVerify(codeArg?: string) {
    const c = (codeArg ?? code).replace(/\D/g, '');
    if (c.length !== 6) {
      toast.show('Enter the 6-digit code from your email.', 'error');
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const verified = await signUp.verifications.verifyEmailCode({ code: c });
      if (verified.error) {
        toast.show(clerkError(verified.error), 'error');
        return;
      }
      // finalize() activates the session (replaces setActive). With no Profile
      // yet, RootNavigator then sends the user to the role picker.
      const fin = await signUp.finalize();
      if (fin.error) {
        toast.show(clerkError(fin.error), 'error');
        return;
      }
      haptics.success();
      toast.show('Email verified!', 'success');
    } catch (e) {
      toast.show(clerkError(e), 'error');
    } finally {
      setBusy(false);
      submittingRef.current = false;
    }
  }

  async function onResend() {
    try {
      const { error } = await signUp.verifications.sendEmailCode();
      if (error) {
        toast.show(clerkError(error), 'error');
        return;
      }
      toast.show('New code sent.', 'info');
    } catch (e) {
      toast.show(clerkError(e), 'error');
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BauhausBackdrop />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Image
          source={require('../../assets/images/rollcall-logo-full.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        {phase === 'form' ? (
          <View style={styles.form}>
            <BauhausInput
              placeholder="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <BauhausInput placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
            <BauhausInput
              placeholder="Confirm password"
              secureTextEntry
              value={confirm}
              onChangeText={setConfirm}
            />
            {/* Enabled from first render; only disabled while a request is in
                flight (`busy`). No premature-tap loop because there's no
                "loaded" gate to wait on. */}
            <BauhausButton
              label={busy ? 'Creating…' : 'Sign Up'}
              onPress={onSubmit}
              disabled={busy}
            />

            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <BauhausText style={styles.orText}>or</BauhausText>
              <View style={styles.orLine} />
            </View>

            <GoogleAuthButton disabled={busy} />

            <Link href="/(auth)/login" style={styles.link}>
              <BauhausText style={styles.linkText}>Already have an account? Log in</BauhausText>
            </Link>

            {/* Clerk renders its bot-protection CAPTCHA (Cloudflare Turnstile)
                into this element on web. A CUSTOM sign-up flow (signUp.create)
                must provide it, otherwise Clerk uses an invisible fallback that
                can fail with "CAPTCHA failed to load" (blocked by an extension /
                unsupported context). Web-only: on native this renders nothing
                and Clerk handles bot protection itself. Harmless if bot
                protection is disabled in the dashboard. */}
            {Platform.OS === 'web' && <View nativeID="clerk-captcha" style={styles.captcha} />}
          </View>
        ) : (
          <View style={styles.form}>
            <BauhausHeader style={styles.title}>Verify your email</BauhausHeader>
            <BauhausText style={styles.sub}>Enter the 6-digit code we sent to {email.trim()}. It verifies automatically.</BauhausText>
            <BauhausInput
              placeholder="6-digit code"
              keyboardType="number-pad"
              value={code}
              onChangeText={(t) => {
                const digits = t.replace(/\D/g, '').slice(0, 6);
                setCode(digits);
                if (digits.length === 6) onVerify(digits);
              }}
              maxLength={6}
            />
            <BauhausButton
              label={busy ? 'Verifying…' : 'Verify'}
              onPress={() => onVerify()}
              disabled={busy}
            />
            <BauhausButton label="Resend code" color={theme.white} onPress={onResend} disabled={busy} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: 'transparent' },
  logo: { width: 180, height: 216, alignSelf: 'center', marginBottom: 24 },
  form: { gap: 16 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: -2 },
  orLine: { flex: 1, height: 1.25, backgroundColor: theme.ink, opacity: 0.15 },
  orText: { fontSize: 13, color: theme.muted, fontFamily: fonts.bodyMedium },
  title: { fontSize: 26, textAlign: 'center' },
  sub: { textAlign: 'center', marginTop: -4, marginBottom: 8, color: theme.muted },
  link: { alignSelf: 'center', marginTop: 4 },
  linkText: { textDecorationLine: 'underline', fontSize: 14, fontFamily: fonts.bodyMedium },
  // Web-only mount point for Clerk's CAPTCHA widget; keep it visible (don't clip
  // a rendered Turnstile challenge) and centered.
  captcha: { alignSelf: 'center', marginTop: 4, overflow: 'visible' },
});
