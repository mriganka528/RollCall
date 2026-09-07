import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, fonts } from '../../components/BauhausCard';
import { AccountMenu } from '../../components/AccountMenu';
import { COLORS } from '../../lib/theme';

export default function StudentLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.primary },
        headerShadowVisible: false,
        headerTintColor: theme.white,
        headerTitleStyle: { fontFamily: fonts.header, color: theme.white },
        headerRight: () => <AccountMenu />,
        sceneStyle: { backgroundColor: theme.bg },
        tabBarActiveTintColor: theme.ink,
        tabBarInactiveTintColor: theme.muted,
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11 },
        tabBarStyle: { backgroundColor: COLORS.yellow, borderTopWidth: 1.5, borderTopColor: COLORS.ink },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'My classes',
          tabBarLabel: 'Classes',
          tabBarIcon: ({ color, size }) => <Ionicons name="albums" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="join"
        options={{
          title: 'Join class',
          tabBarLabel: 'Join',
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" size={size} color={color} />,
        }}
      />

      {/* Class-scoped screens: reachable only from inside a class, hidden from the tab bar (§10). */}
      <Tabs.Screen name="class/[id]/index" options={{ href: null, title: 'Class' }} />
      <Tabs.Screen name="class/[id]/scan" options={{ href: null, title: 'Scan attendance' }} />
      <Tabs.Screen name="class/[id]/analytics" options={{ href: null, title: 'My attendance' }} />
      <Tabs.Screen name="class/[id]/history" options={{ href: null, title: 'History' }} />
    </Tabs>
  );
}
