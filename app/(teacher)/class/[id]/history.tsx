import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { BauhausCard, BauhausButton, BauhausHeader, BauhausText, fonts, theme } from '../../../../components/BauhausCard';
import { api } from '../../../../lib/api';
import { ClassHistory } from '../../../../lib/types';

export default function ClassHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<ClassHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get<ClassHistory>(`/classes/${id}/history`));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load history');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function buildCsv(h: ClassHistory): string {
    const header = [
      'Roll No',
      'Student',
      ...h.sessions.map((s) => new Date(s.startedAt).toLocaleDateString()),
      'Percent',
    ];
    const lines = [header.join(',')];
    for (const st of h.students) {
      const cells = [
        escapeCsv(st.rollNo),
        escapeCsv(st.name),
        ...st.present.map((p) => (p ? 'P' : 'A')),
        `${st.percent}%`,
      ];
      lines.push(cells.join(','));
    }
    return lines.join('\n');
  }

  async function exportCsv() {
    if (!data) return;
    setBusy(true);
    try {
      const csv = buildCsv(data);
      const safe = data.class.name.replace(/[^a-z0-9]/gi, '_');
      const uri = `${FileSystem.cacheDirectory}${safe}_attendance.csv`;
      await FileSystem.writeAsStringAsync(uri, csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export attendance CSV' });
      } else {
        setError('Sharing not available on this device');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <BauhausText style={error ? styles.error : styles.muted}>{error ?? 'Loading…'}</BauhausText>
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <BauhausHeader style={styles.title}>{data.class.name}</BauhausHeader>
      <BauhausText style={styles.muted}>
        {data.sessions.length} session{data.sessions.length === 1 ? '' : 's'} ·{' '}
        {data.students.length} student{data.students.length === 1 ? '' : 's'}
      </BauhausText>

      <BauhausButton
        label={busy ? 'Exporting…' : 'Export CSV'}
        color={theme.info}
        disabled={busy}
        onPress={exportCsv}
        style={{ marginTop: 20 }}
      />

      {error ? <BauhausText style={styles.error}>{error}</BauhausText> : null}

      <View style={styles.list}>
        {data.students.map((st, i) => (
          <BauhausCard key={st.id} color={theme.white} style={styles.row}>
            <View style={{ flex: 1 }}>
              <BauhausText style={styles.name}>{st.name}</BauhausText>
              <BauhausText style={styles.sub}>
                {st.rollNo} · {st.presentCount}/{st.totalSessions} sessions
              </BauhausText>
            </View>
            <View style={[styles.pctBadge, { backgroundColor: st.percent < 75 ? theme.absent : theme.present }]}>
              <BauhausText style={styles.pct}>{st.percent}%</BauhausText>
            </View>
          </BauhausCard>
        ))}
        {data.students.length === 0 ? (
          <BauhausText style={styles.muted}>No students yet.</BauhausText>
        ) : null}
      </View>
    </ScrollView>
  );
}

function escapeCsv(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  container: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 22 },
  muted: { color: theme.muted, marginTop: 4 },
  error: { color: theme.absent, marginVertical: 10, fontFamily: fonts.bodySemibold },
  list: { gap: 12, marginTop: 20 },
  row: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontFamily: fonts.bodySemibold },
  sub: { color: theme.muted, fontSize: 13, marginTop: 2 },
  pctBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, borderWidth: 1.5, borderColor: theme.ink },
  pct: { fontSize: 16, fontFamily: fonts.bodySemibold, color: theme.white },
});
