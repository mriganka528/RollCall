import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../lib/auth-context';
import { theme } from '../components/BauhausCard';

export default function Index() {
  const { user, loading, isSignedIn, needsRole } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.ink} size="large" />
      </View>
    );
  }

  if (!isSignedIn) return <Redirect href="/(auth)/login" />;
  if (needsRole) return <Redirect href="/(auth)/role" />;
  if (!user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.ink} size="large" />
      </View>
    );
  }

  return (
    <Redirect href={user.role === 'teacher' ? '/(teacher)/dashboard' : '/(student)/dashboard'} />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
});
