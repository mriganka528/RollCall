import React, { useCallback, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BauhausButton, BauhausCard, BauhausText, fonts, theme } from './BauhausCard';
import { COLORS, SPACING } from '../lib/theme';
import { useToast } from './Toast';
import { useAuth } from '../lib/auth-context';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * AccountMenu — the top-right Account Center (§8). A small round Bauhaus
 * button (initials, or a person icon before the profile has loaded) that opens
 * a top-right anchored dropdown with Edit Profile / Delete Account / Sign Out.
 *
 * Edit Profile and Delete Account navigate to their screens (which own the
 * PATCH / DELETE confirmations). Sign Out is confirmed in-place here (the menu
 * swaps to a "Sign out?" view) and fires the signOut call directly.
 */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  // The dropdown shows either the menu rows or an in-place "Sign out?" confirm.
  const [mode, setMode] = useState<'menu' | 'signout'>('menu');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, signOut } = useAuth();

  const initials = initialsOf(user?.name ?? '');

  // Follow-up action queued while the menu closes. On iOS, presenting an Alert
  // or navigating *while the Modal is still dismissing* is silently dropped
  // (a view controller is mid-dismiss) — that's exactly why tapping Sign Out
  // showed no confirmation and Delete Account didn't navigate. So close the
  // menu first and run the action only once it's actually gone: on iOS from the
  // Modal's onDismiss, on Android immediately (Android has no such conflict).
  const pendingActionRef = useRef<(() => void) | null>(null);

  const runAfterMenuCloses = useCallback((action: () => void) => {
    if (Platform.OS === 'ios') {
      pendingActionRef.current = action;
      setOpen(false);
    } else {
      setOpen(false);
      action();
    }
  }, []);

  const onModalDismissed = useCallback(() => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  }, []);

  const go = (path: '/settings/edit-profile' | '/settings/delete-account') => {
    // eslint-disable-next-line no-console
    console.log(`[AccountMenu] menu item tapped → navigating to ${path}`);
    runAfterMenuCloses(() => router.push(path));
  };

  // Sign Out is confirmed *inside* this menu's Modal (an in-place content swap),
  // not via Alert.alert (whose buttons no-op on react-native-web) and not via a
  // second Modal (nested Modals are unreliable on Android). Once confirmed, close
  // the menu and clear the session; RootNavigator redirects to login when user
  // becomes null, and the explicit replace makes the transition immediate (§5).
  const doSignOut = useCallback(() => {
    runAfterMenuCloses(() => {
      void (async () => {
        try {
          await signOut();
          toast.show('Signed out.', 'success');
          router.replace('/(auth)/login');
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[AccountMenu] sign out failed:', err);
          toast.show('Could not sign out. Please try again.', 'error');
        }
      })();
    });
  }, [runAfterMenuCloses, signOut, toast, router]);

  return (
    <>
      <Pressable onPress={() => { setMode('menu'); setOpen(true); }} hitSlop={8} accessibilityLabel="Account menu">
        <BauhausCard color={COLORS.blue} borderColor={COLORS.ink} borderRadius={19} style={styles.avatar}>
          {initials ? (
            <BauhausText style={styles.initials}>{initials}</BauhausText>
          ) : (
            <Ionicons name="person" size={18} color={COLORS.white} />
          )}
        </BauhausCard>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => { setOpen(false); setMode('menu'); }}
        onDismiss={onModalDismissed}
      >
        {/* Tap-outside backdrop to dismiss. */}
        <Pressable style={styles.backdrop} onPress={() => { setOpen(false); setMode('menu'); }} />
        <View style={[styles.anchor, { top: insets.top + 48, right: SPACING.md }]}>
          <BauhausCard color={COLORS.white} style={styles.card}>
            {mode === 'menu' ? (
              <>
                <MenuRow icon="create-outline" label="Edit Profile" onPress={() => go('/settings/edit-profile')} />
                <View style={styles.divider} />
                <MenuRow
                  icon="trash-outline"
                  label="Delete Account"
                  color={COLORS.red}
                  onPress={() => go('/settings/delete-account')}
                />
                <View style={styles.divider} />
                <MenuRow icon="log-out-outline" label="Sign Out" onPress={() => setMode('signout')} />
              </>
            ) : (
              <View style={styles.confirm}>
                <BauhausText style={styles.confirmTitle}>Sign out?</BauhausText>
                <BauhausText style={styles.confirmMsg}>You’ll need to sign in again to use ROLLCALL.</BauhausText>
                <BauhausButton label="Sign Out" color={theme.red} onPress={doSignOut} style={{ marginTop: SPACING.md }} />
                <BauhausButton label="Cancel" color={theme.white} onPress={() => setMode('menu')} style={{ marginTop: SPACING.sm }} />
              </View>
            )}
          </BauhausCard>
        </View>
      </Modal>
    </>
  );
}

function MenuRow({
  icon,
  label,
  color = theme.ink,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row} android_ripple={{ color: '#00000012' }}>
      <Ionicons name={icon} size={18} color={color} />
      <BauhausText style={[styles.rowLabel, { color }]}>{label}</BauhausText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.xs },
  initials: { fontFamily: fonts.header, fontSize: 13, color: COLORS.white },
  backdrop: { ...StyleSheet.absoluteFillObject },
  anchor: { position: 'absolute', width: 210 },
  card: { paddingVertical: SPACING.xs },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, paddingHorizontal: SPACING.md, gap: SPACING.sm },
  rowLabel: { fontFamily: fonts.bodyMedium, fontSize: 15 },
  divider: { height: 1.5, backgroundColor: COLORS.ink, opacity: 0.12, marginHorizontal: SPACING.sm },
  confirm: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  confirmTitle: { fontFamily: fonts.bodySemibold, fontSize: 16, color: theme.ink },
  confirmMsg: { fontSize: 13, color: theme.muted, marginTop: SPACING.xs, lineHeight: 18 },
});

export default AccountMenu;
