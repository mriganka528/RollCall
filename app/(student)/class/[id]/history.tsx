import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import AttendanceList, { AttendanceRow } from '../../../../components/AttendanceList';
import { BauhausCard, BauhausHeader, BauhausText, fonts, theme } from '../../../../components/BauhausCard';
import { api } from '../../../../lib/api';
import { StudentHistory } from '../../../../lib/types';

export default function StudentClassHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<StudentHistory['classes'][number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const h = await api.get<StudentHistory>('/students/me/history');
      setEntry(h.classes.find((c) => c.classId === id) ?? null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load history');
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!loaded) {
    return (
      <View style={styles.center}>
        <BauhausText style={styles.muted}>Loading…</BauhausText>
      </View>
    );
  }

  if (error || !entry) {
    return (
      <View style={styles.center}>
        <BauhausText style={styles.error}>{error ?? 'No history for this class.'}</BauhausText>
      </View>
    );
  }

  const rows: AttendanceRow[] = entry.sessions.map((s) => ({
    id: s.id,
    name: new Date(s.startedAt).toLocaleString(),
    present: s.present,
  }));

  const atRisk = entry.percent < 75;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <BauhausCard color={atRisk ? theme.absent : theme.primary} style={styles.summary}>
        <BauhausHeader style={styles.className}>{entry.name}</BauhausHeader>
        <BauhausHeader style={styles.percent}>{entry.percent}%</BauhausHeader>
        <BauhausText style={styles.summaryMeta}>
          Present at {entry.present} of {entry.total} session{entry.total === 1 ? '' : 's'}
          {'  ·  '}Roll {entry.rollNo}
        </BauhausText>
        {atRisk ? <BauhausText style={styles.warn}>⚠ Below 75% — attendance at risk</BauhausText> : null}
      </BauhausCard>

      <BauhausHeader style={styles.sectionTitle}>Sessions</BauhausHeader>
      <AttendanceList rows={rows} emptyText="No sessions held yet." />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  container: { padding: 24, paddingBottom: 48 },
  summary: { padding: 24, alignItems: 'center' },
  className: { fontSize: 20, textAlign: 'center' },
  percent: { fontSize: 44, marginVertical: 6 },
  summaryMeta: { textAlign: 'center', color: theme.ink },
  warn: { marginTop: 10, fontFamily: fonts.bodySemibold, color: theme.ink },
  muted: { color: theme.muted },
  sectionTitle: { fontSize: 18, marginTop: 28, marginBottom: 14 },
  error: { color: theme.absent, textAlign: 'center', fontFamily: fonts.bodySemibold },
});
