import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import { useSignIn } from '@clerk/expo';
import { BauhausBackdrop, BauhausButton, BauhausInput, BauhausText, fonts, theme } from '../../components/BauhausCard';
import { GoogleAuthButton } from '../../components/GoogleAuthButton';
import { useToast } from '../../components/Toast';
import { haptics } from '../../lib/haptics';

// Pull a human-readable message out of a Clerk error. The signals/future API
// returns a ClerkError object with `longMessage`/`message`/`code`; older thrown
// errors nested them under `errors[]`. Handle both so any shape reads cleanly.
function clerkError(e: any): string {
  return (
    e?.longMessage ??
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    e?.message ??
    'Something went wrong. Please try again.'
  );
}

export default function Login() {
  // @clerk/expo (Core 3) exposes the signals/future API: useSignIn() returns
  // { signIn, errors, fetchStatus } — there is NO `isLoaded` and NO `setActive`.
  // `signIn` is always present, so we never gate the button on a "loaded" flag
  // (doing that with an always-undefined `isLoaded` is what previously left the
  // button permanently disabled and made email/password login look broken).
  const { signIn } = useSignIn();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onLogin() {
    if (!email.trim() || !password) {
      toast.show('Enter your email and password.', 'error');
      return;
    }
    setBusy(true);
    try {
      // Future API: submit the password in one call. These methods RESOLVE with
      // `{ error }` (they don't throw for auth failures), so check `error`
      // rather than relying on try/catch for a wrong password.
      const { error } = await signIn.password({ identifier: email.trim(), password });
      if (error) {
        toast.show(clerkError(error), 'error');
        return;
      }
      // finalize() converts the now-complete sign-in into the active session
      // (the replacement for the old setActive). RootNavigator then redirects
      // once the Clerk session + profile resolve.
      const fin = await signIn.finalize();
      if (fin.error) {
        toast.show(clerkError(fin.error), 'error');
        return;
      }
      haptics.success();
      toast.show('Welcome back!', 'success');
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
        <Image
          source={require('../../assets/images/rollcall-logo-full.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <View style={styles.form}>
          <BauhausInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <BauhausInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
          />
          {/* Enabled as soon as the screen renders; only disabled while a login
              is in flight (`busy`). Google stays enabled throughout (useSSO
              awaits Clerk internally), so there's always a working path. */}
          <BauhausButton
            label={busy ? 'Logging in…' : 'Log In'}
            onPress={onLogin}
            disabled={busy}
          />

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <BauhausText style={styles.orText}>or</BauhausText>
            <View style={styles.orLine} />
          </View>

          <GoogleAuthButton disabled={busy} />

          <Link href="/(auth)/forgot-password" style={styles.link}>
            <BauhausText style={styles.linkText}>Forgot password?</BauhausText>
          </Link>
          <Link href="/(auth)/signup" style={styles.link}>
            <BauhausText style={styles.linkText}>No account? Sign up</BauhausText>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: 'transparent' },
  logo: { width: 220, height: 264, alignSelf: 'center', marginBottom: 24 },
  form: { gap: 16 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: -2 },
  orLine: { flex: 1, height: 1.25, backgroundColor: theme.ink, opacity: 0.15 },
  orText: { fontSize: 13, color: theme.muted, fontFamily: fonts.bodyMedium },
  link: { alignSelf: 'center', marginTop: 4 },
  linkText: { textDecorationLine: 'underline', fontSize: 14, fontFamily: fonts.bodyMedium },
});
