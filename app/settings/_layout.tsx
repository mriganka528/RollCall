import { Stack } from 'expo-router';
import { theme, fonts } from '../../components/BauhausCard';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.primary },
        headerShadowVisible: false,
        headerTintColor: theme.white,
        headerTitleStyle: { fontFamily: fonts.header, color: theme.white },
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <Stack.Screen name="edit-profile" options={{ title: 'Edit profile' }} />
      <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
    </Stack>
  );
}
