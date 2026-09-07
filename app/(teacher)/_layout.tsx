import { Stack } from 'expo-router';
import { theme, fonts } from '../../components/BauhausCard';
import { AccountMenu } from '../../components/AccountMenu';

export default function TeacherLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.primary },
        headerShadowVisible: false,
        headerTintColor: theme.white,
        headerTitleStyle: { fontFamily: fonts.header, color: theme.white },
        contentStyle: { backgroundColor: theme.bg },
        headerRight: () => <AccountMenu />,
      }}
    >
      <Stack.Screen name="dashboard" options={{ title: 'My classes' }} />
      <Stack.Screen name="class/new" options={{ title: 'New class' }} />
      <Stack.Screen name="class/[id]/index" options={{ title: 'Class' }} />
      <Stack.Screen name="class/[id]/roster" options={{ title: 'Students' }} />
      <Stack.Screen name="class/[id]/session" options={{ title: 'Live session' }} />
      <Stack.Screen name="class/[id]/session-details" options={{ title: 'Session details' }} />
      <Stack.Screen name="class/[id]/history" options={{ title: 'History' }} />
      <Stack.Screen name="class/[id]/analytics" options={{ title: 'Analytics' }} />
    </Stack>
  );
}
