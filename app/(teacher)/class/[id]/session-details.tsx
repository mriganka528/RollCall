import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BauhausCard, BauhausButton, BauhausHeader, BauhausText, fonts, theme } from '../../../../components/BauhausCard';
import { LoadingScreen } from '../../../../components/LoadingScreen';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import { api, ApiError } from '../../../../lib/api';
import { haptics } from '../../../../lib/haptics';
import { SessionDetails } from '../../../../lib/types';
import { SPACING } from '../../../../lib/theme';

// Human-friendly duration from milliseconds (e.g. "1h 05m", "12m 30s", "45s").
function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/**
 * Session Details (§13-16). Read-only summary of one session, driven entirely by
 * GET /sessions/:id (only fields that exist in the data model are shown).
 *   • Ongoing   → status "Ongoing"; Continue reopens the live screen, End finalizes
 *                 it (with the required confirmation). No "start new session".
 *   • Completed → status "Completed"; shows start/end/duration + stats, and never
 *                 offers a misleading Continue.
 */
export default function SessionDetailsScreen() {
  const { id, sessionId } = useLocalSearchParams<{ id: string; sessionId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const confirm = useConfirm();

  const [data, setData] = useState<SessionDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get<SessionDetails>(`/sessions/${sessionId}`));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load session.');
    }
  }, [sessionId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function continueSession() {
    router.push(`/(teacher)/class/${id}/session?sessionId=${sessionId}`);
  }

  // §2: exact required confirmation wording before the irreversible end.
  async function confirmEnd() {
    const ok = await confirm({
      title: 'End session?',
      message: 'Are you sure you want to end this attendance session? Once ended, the session cannot be continued.',
      confirmLabel: 'End Session',
      destructive: true,
    });
    if (ok) void endSession();
  }

  async function endSession() {
    setBusy(true);
    try {
      await api.post(`/sessions/${sessionId}/end`);
      haptics.success();
      toast.show('Session ended.', 'success');
      await load(); // refresh in place → now renders as Completed
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Could not end the session. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    if (error) {
      return (
        <View style={styles.center}>
          <BauhausText style={styles.errorText}>{error}</BauhausText>
          <BauhausButton label="Retry" color={theme.info} onPress={load} style={{ marginTop: SPACING.md }} />
        </View>
      );
    }
    return <LoadingScreen label="Loading session…" />;
  }

  const started = new Date(data.startedAt);
  const ended = data.endedAt ? new Date(data.endedAt) : null;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + SPACING.xl }]}
    >
      <BauhausCard color={theme.primary} style={styles.headerCard}>
        <BauhausText style={styles.className}>{data.className}</BauhausText>
        <View style={[styles.badge, { backgroundColor: data.isActive ? theme.blue : theme.white }]}>
          <BauhausText style={[styles.badgeText, { color: data.isActive ? theme.white : theme.ink }]}>{data.isActive ? 'Ongoing' : 'Completed'}</BauhausText>
        </View>
        <BauhausHeader style={styles.bigPct}>{data.percentage}%</BauhausHeader>
        <BauhausText style={styles.subtle}>attendance</BauhausText>
      </BauhausCard>

      <BauhausCard color={theme.white} style={styles.card}>
        <BauhausHeader style={styles.cardTitle}>Attendance</BauhausHeader>
        <Row label="Present" value={`${data.presentCount}`} />
        <Row label="Absent" value={`${data.absentCount}`} />
        <Row label="Students" value={`${data.rosterCount}`} last />
      </BauhausCard>

      <BauhausCard color={theme.white} style={styles.card}>
        <BauhausHeader style={styles.cardTitle}>Timing</BauhausHeader>
        <Row label="Started" value={started.toLocaleString()} />
        <Row label="Ended" value={ended ? ended.toLocaleString() : 'In progress'} />
        <Row
          label="Duration"
          value={data.durationMs != null ? formatDuration(data.durationMs) : '—'}
          last
        />
      </BauhausCard>

      {data.isActive ? (
        <>
          <BauhausButton label="Continue Session" color={theme.present} onPress={continueSession} style={{ marginTop: SPACING.lg }} />
          <BauhausButton label={busy ? 'Ending…' : 'End Session'} color={theme.absent} disabled={busy} onPress={confirmEnd} style={{ marginTop: SPACING.md }} />
        </>
      ) : (
        <BauhausButton label="Back to Class" color={theme.white} onPress={() => router.replace(`/(teacher)/class/${id}`)} style={{ marginTop: SPACING.lg }} />
      )}
    </ScrollView>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <BauhausText style={styles.rowLabel}>{label}</BauhausText>
      <BauhausText style={styles.rowValue}>{value}</BauhausText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { padding: SPACING.lg, gap: SPACING.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, padding: SPACING.lg },
  errorText: { color: theme.absent, fontFamily: fonts.bodySemibold, textAlign: 'center' },
  headerCard: { padding: SPACING.lg, alignItems: 'center' },
  className: { fontSize: 16, fontFamily: fonts.bodySemibold, color: theme.white },
  badge: { marginTop: SPACING.sm, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4, borderWidth: 1.5, borderColor: theme.ink },
  badgeText: { fontSize: 11, fontFamily: fonts.bodySemibold },
  bigPct: { fontSize: 44, marginTop: SPACING.md, color: theme.white },
  subtle: { fontSize: 12, color: theme.white, opacity: 0.9 },
  card: { padding: SPACING.lg },
  cardTitle: { fontSize: 18, marginBottom: SPACING.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(22,22,22,0.12)' },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 14, color: theme.muted },
  rowValue: { fontSize: 15, fontFamily: fonts.bodySemibold },
});
