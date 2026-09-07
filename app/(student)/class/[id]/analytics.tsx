import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AttendanceLineChart,
  PresencePie,
  RangeFilter,
  rangeQuery,
  StatTile,
} from '../../../../components/AnalyticsCharts';
import { BauhausCard, BauhausButton, BauhausText, fonts, theme } from '../../../../components/BauhausCard';
import { LoadingScreen } from '../../../../components/LoadingScreen';
import { useToast } from '../../../../components/Toast';
import { api, ApiError } from '../../../../lib/api';
import { AnalyticsRange, AnalyticsSummary, RangeSelection } from '../../../../lib/types';
import { SPACING } from '../../../../lib/theme';

export default function StudentAnalytics() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { width } = useWindowDimensions();

  const [selection, setSelection] = useState<RangeSelection>({ kind: 'preset', preset: 'week' });
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [firstLoad, setFirstLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (sel: RangeSelection, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      try {
        setData(await api.get<AnalyticsSummary>(`/classes/${id}/analytics/me?${rangeQuery(sel)}`));
        setError(null);
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'Could not load your attendance.';
        setError(msg);
        toast.show(msg, 'error');
      } finally {
        setFirstLoad(false);
        setRefreshing(false);
      }
    },
    [id, toast]
  );

  useFocusEffect(useCallback(() => { load(selection); }, [load, selection]));

  const onSelectPreset = (preset: AnalyticsRange) => setSelection({ kind: 'preset', preset });
  const onApplyCustom = (start: string, end: string) => setSelection({ kind: 'custom', start, end });
  const onClear = () => setSelection({ kind: 'preset', preset: 'week' });

  if (firstLoad) return <LoadingScreen label="Loading attendance…" />;

  const contentW = width - SPACING.lg * 2;
  const tileW = Math.floor((contentW - SPACING.md) / 2);
  const present = data ? data.buckets.reduce((s, b) => s + b.present, 0) : 0;
  const total = data ? data.buckets.reduce((s, b) => s + b.total, 0) : 0;

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

      {error && !data ? (
        <BauhausCard color={theme.white} style={styles.errorCard}>
          <BauhausText style={styles.errorText}>{error}</BauhausText>
          <BauhausButton label="Retry" color={theme.info} onPress={() => load(selection)} style={{ marginTop: SPACING.md }} />
        </BauhausCard>
      ) : (
        <>
          <View style={styles.tiles}>
            <StatTile label="Overall" value={`${Math.round(data?.averagePercentage ?? 0)}%`} tileWidth={tileW} />
            <StatTile
              label="Today"
              value={`${data?.today.present ?? 0}/${data?.today.total ?? 0}`}
              color={theme.info}
              tileWidth={tileW}
            />
          </View>

          <AttendanceLineChart title="Attendance trend" buckets={data?.buckets ?? []} width={contentW} />
          <PresencePie title="Present vs. absent" present={present} total={total} width={contentW} />

          <BauhausText style={styles.note}>
            Percentages are your own attendance across sessions held in the selected range.
          </BauhausText>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { padding: SPACING.lg, gap: SPACING.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  note: { fontSize: 12, opacity: 0.6, textAlign: 'center' },
  errorCard: { padding: SPACING.lg },
  errorText: { color: theme.absent, fontFamily: fonts.bodySemibold },
});
