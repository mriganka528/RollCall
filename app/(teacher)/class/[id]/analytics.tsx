import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AttendanceBarChart,
  PresencePie,
  RangeFilter,
  rangeQuery,
  StatTile,
  StudentList,
} from '../../../../components/AnalyticsCharts';
import { BauhausCard, BauhausButton, BauhausText, fonts, theme } from '../../../../components/BauhausCard';
import { LoadingScreen } from '../../../../components/LoadingScreen';
import { useToast } from '../../../../components/Toast';
import { api, ApiError } from '../../../../lib/api';
import { AnalyticsRange, AnalyticsSummary, RangeSelection, StudentAnalyticsRow } from '../../../../lib/types';
import { AT_RISK_BELOW, SPACING } from '../../../../lib/theme';

export default function TeacherAnalytics() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { width } = useWindowDimensions();

  const [selection, setSelection] = useState<RangeSelection>({ kind: 'preset', preset: 'week' });
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [students, setStudents] = useState<StudentAnalyticsRow[]>([]);
  const [firstLoad, setFirstLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (sel: RangeSelection, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      try {
        const q = rangeQuery(sel);
        const [s, st] = await Promise.all([
          api.get<AnalyticsSummary>(`/classes/${id}/analytics/summary?${q}`),
          api.get<StudentAnalyticsRow[]>(`/classes/${id}/analytics/students?${q}`),
        ]);
        setSummary(s);
        setStudents(st);
        setError(null);
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'Could not load analytics.';
        setError(msg);
        toast.show(msg, 'error');
      } finally {
        setFirstLoad(false);
        setRefreshing(false);
      }
    },
    [id, toast]
  );

  // Reloads on focus and whenever the selection changes (§10/§11).
  useFocusEffect(useCallback(() => { load(selection); }, [load, selection]));

  const onSelectPreset = (preset: AnalyticsRange) => setSelection({ kind: 'preset', preset });
  const onApplyCustom = (start: string, end: string) => setSelection({ kind: 'custom', start, end });
  const onClear = () => setSelection({ kind: 'preset', preset: 'week' });

  if (firstLoad) return <LoadingScreen label="Crunching numbers…" />;

  const contentW = width - SPACING.lg * 2;
  const cols = width > 700 ? 3 : 2;
  const tileW = Math.floor((contentW - SPACING.md * (cols - 1)) / cols);
  const present = summary ? summary.buckets.reduce((s, b) => s + b.present, 0) : 0;
  const total = summary ? summary.buckets.reduce((s, b) => s + b.total, 0) : 0;
  const atRisk = students.filter((s) => s.percentage < AT_RISK_BELOW).length;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + SPACING.xl }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(selection, true)} />}
    >
      <RangeFilter
        selection={selection}
        onSelectPreset={onSelectPreset}
        onApplyCustom={onApplyCustom}
        onClear={onClear}
      />

      {error && !summary ? (
        <BauhausCard color={theme.white} style={styles.errorCard}>
          <BauhausText style={styles.errorText}>{error}</BauhausText>
          <BauhausButton label="Retry" color={theme.info} onPress={() => load(selection)} style={{ marginTop: SPACING.md }} />
        </BauhausCard>
      ) : (
        <>
          <View style={styles.tiles}>
            <StatTile label="Class avg" value={`${Math.round(summary?.averagePercentage ?? 0)}%`} tileWidth={tileW} />
            <StatTile
              label="Today"
              value={`${summary?.today.present ?? 0}/${summary?.today.total ?? 0}`}
              color={theme.info}
              tileWidth={tileW}
            />
            <StatTile
              label="At risk"
              value={`${atRisk}`}
              color={atRisk > 0 ? theme.absent : theme.present}
              tileWidth={tileW}
            />
          </View>

          <AttendanceBarChart title="Attendance by period" buckets={summary?.buckets ?? []} width={contentW} />
          <PresencePie title="Present vs. absent" present={present} total={total} width={contentW} />
          <StudentList rows={students} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { padding: SPACING.lg, gap: SPACING.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  errorCard: { padding: SPACING.lg },
  errorText: { color: theme.absent, fontFamily: fonts.bodySemibold },
});
