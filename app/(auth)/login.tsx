import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import { useSignIn } from '@clerk/expo';
import { BauhausButton, BauhausInput, BauhausText, fonts, theme } from '../../components/BauhausCard';
import { GoogleAuthButton } from '../../components/GoogleAuthButton';
import { useToast } from '../../components/Toast';
import { haptics } from '../../lib/haptics';

// Pull a human-readable message out of a Clerk error (it nests them under
// `errors[]`), falling back to a generic line.
function clerkError(e: any): string {
  return (
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    e?.message ??
    'Something went wrong. Please try again.'
  );
}

export default function Login() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Diagnostic: surface whether Clerk's sign-in resource has initialised. If this
  // logs `false` and never flips to `true`, Clerk itself isn't loading (check the
  // publishable key / network / allowed origins) — that's what used to grey out
  // the button. The button no longer depends on it, but this log makes a stuck
  // Clerk easy to spot in the console.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(`[auth] login — Clerk useSignIn isLoaded: ${isLoaded}`);
  }, [isLoaded]);

  async function onLogin() {
    if (!isLoaded || !signIn || !setActive) {
      toast.show('Still connecting to the sign-in service — one moment, then tap again.', 'info');
      return;
    }
    if (!email.trim() || !password) {
      toast.show('Enter your email and password.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await signIn.create({ identifier: email.trim(), password });
      if (res.status === 'complete') {
        await setActive({ session: res.createdSessionId });
        haptics.success();
        toast.show('Welcome back!', 'success');
        // RootNavigator redirects once the Clerk session + profile resolve.
      } else {
        // Password sign-in should complete in one step; anything else is unusual.
        toast.show('Additional verification needed. Please try again.', 'error');
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
          <BauhausButton label={busy ? 'Logging in…' : 'Log In'} onPress={onLogin} disabled={busy} />

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
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.bg },
  logo: { width: 220, height: 264, alignSelf: 'center', marginBottom: 24 },
  form: { gap: 16 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: -2 },
  orLine: { flex: 1, height: 1.25, backgroundColor: theme.ink, opacity: 0.15 },
  orText: { fontSize: 13, color: theme.muted, fontFamily: fonts.bodyMedium },
  link: { alignSelf: 'center', marginTop: 4 },
  linkText: { textDecorationLine: 'underline', fontSize: 14, fontFamily: fonts.bodyMedium },
});
