import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BauhausCard, BauhausButton, BauhausHeader, BauhausText, fonts, theme } from '../../../../components/BauhausCard';
import { LoadingScreen } from '../../../../components/LoadingScreen';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import { api, ApiError } from '../../../../lib/api';
import { ActiveSession, StudentClassMe } from '../../../../lib/types';
import { COLORS, SPACING } from '../../../../lib/theme';

export default function StudentClassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const confirm = useConfirm();

  const [me, setMe] = useState<StudentClassMe | null>(null);
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Re-check only the live-session gate — cheap enough to poll while focused.
  const loadActive = useCallback(async () => {
    try {
      setActive(await api.get<ActiveSession>(`/classes/${id}/active-session`));
    } catch {
      // leave the last known state; a full load surfaces hard errors
    }
  }, [id]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      try {
        const [m, a] = await Promise.all([
          api.get<StudentClassMe>(`/classes/${id}/me`),
          api.get<ActiveSession>(`/classes/${id}/active-session`),
        ]);
        setMe(m);
        setActive(a);
      } catch (e) {
        toast.show(e instanceof ApiError ? e.message : 'Could not load this class.', 'error');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, toast]
  );

  // Load on focus; poll the session gate every 15s (matches token rotation) and
  // clear the interval on blur/unmount (§13: no dangling timers).
  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(loadActive, 15_000);
      return () => clearInterval(t);
    }, [load, loadActive])
  );

  async function confirmLeave() {
    const ok = await confirm({
      title: 'Leave this class?',
      message: 'You’ll be removed from the roster and lose access to its attendance here.',
      confirmLabel: 'Leave',
      destructive: true,
    });
    if (ok) void leave();
  }

  async function leave() {
    setLeaving(true);
    try {
      await api.post(`/classes/${id}/unenroll`);
      toast.show('Left the class.', 'success');
      router.replace('/(student)/dashboard');
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Could not leave the class.', 'error');
      setLeaving(false);
    }
  }

  if (loading) return <LoadingScreen label="Loading class…" />;

  if (!me) {
    return (
      <View style={styles.center}>
        <BauhausText style={styles.muted}>This class isn’t available.</BauhausText>
        <BauhausButton label="Back to Classes" color={theme.white} onPress={() => router.replace('/(student)/dashboard')} />
      </View>
    );
  }

  const canScan = !!active?.active;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + SPACING.xl }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <BauhausCard color={theme.primary} style={styles.summary}>
        <BauhausHeader style={styles.className}>{me.name}</BauhausHeader>
        <BauhausText style={styles.identity}>
          {me.myName}
          {me.myRollNo ? `  ·  Roll ${me.myRollNo}` : ''}
        </BauhausText>
      </BauhausCard>

      <BauhausCard color={canScan ? COLORS.success : COLORS.bg} style={styles.statusCard}>
        <BauhausText style={[styles.statusText, { color: canScan ? theme.white : theme.ink }]}>
          {canScan ? '● A session is live right now' : '○ No live session yet'}
        </BauhausText>
      </BauhausCard>

      <BauhausButton
        label={canScan ? 'Scan Attendance' : 'Waiting for Session'}
        disabled={!canScan}
        onPress={() => router.push(`/(student)/class/${id}/scan`)}
        style={{ marginTop: SPACING.md }}
      />
      {!canScan ? (
        <BauhausText style={styles.hint}>Your teacher hasn’t started a session yet — pull down to refresh.</BauhausText>
      ) : null}

      <BauhausButton
        label="My Attendance"
        color={theme.info}
        onPress={() => router.push(`/(student)/class/${id}/analytics`)}
        style={{ marginTop: SPACING.lg }}
      />
      <BauhausButton
        label="History"
        color={theme.white}
        onPress={() => router.push(`/(student)/class/${id}/history`)}
        style={{ marginTop: SPACING.sm }}
      />

      <BauhausButton
        label={leaving ? 'Leaving…' : 'Leave Class'}
        color={theme.absent}
        disabled={leaving}
        onPress={confirmLeave}
        style={{ marginTop: SPACING.xl }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { padding: SPACING.lg },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg, gap: SPACING.md },
  summary: { padding: SPACING.lg, alignItems: 'center' },
  className: { fontSize: 24, textAlign: 'center', color: theme.white },
  identity: { marginTop: SPACING.sm, textAlign: 'center', color: theme.white, opacity: 0.9 },
  statusCard: { padding: SPACING.md, marginTop: SPACING.lg, alignItems: 'center' },
  statusText: { fontFamily: fonts.bodySemibold, color: theme.ink },
  hint: { fontSize: 13, opacity: 0.65, textAlign: 'center', marginTop: SPACING.sm },
  muted: { color: theme.muted },
});
