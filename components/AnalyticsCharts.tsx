import React, { useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import { BauhausCard, BauhausButton, BauhausHeader, BauhausInput, BauhausText, fonts, textOn, theme } from './BauhausCard';
import { AnalyticsBucket, AnalyticsRange, RangeSelection, StudentAnalyticsRow } from '../lib/types';
import { AT_RISK_BELOW, COLORS, RADIUS, SPACING } from '../lib/theme';

/**
 * Shared, width-aware analytics building blocks (§5/§11). Every chart takes a
 * `width` = the content width available to it (screen width minus the screen's
 * horizontal padding); the wrapper subtracts its own card padding and a y-axis
 * allowance so charts never overflow on a small phone. Callers derive `width`
 * from useWindowDimensions so layouts reflow on rotation / large screens.
 */

const Y_AXIS_ALLOWANCE = 40;
const chartPlotWidth = (width: number) => Math.max(160, width - SPACING.lg * 2 - Y_AXIS_ALLOWANCE);

export const RANGES: { key: AnalyticsRange; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: '6months', label: '6 Months' },
  { key: 'year', label: 'Year' },
];

// Turn the current selection into the query string the analytics endpoints expect
// (§10: the backend does the date filtering, so we only ever send the window).
export function rangeQuery(sel: RangeSelection): string {
  return sel.kind === 'preset'
    ? `range=${sel.preset}`
    : `start=${encodeURIComponent(sel.start)}&end=${encodeURIComponent(sel.end)}`;
}

// Mirror of the backend's date check so bad input is rejected before any request:
// must be YYYY-MM-DD AND a real calendar date (rejects 2026-02-31 etc.).
function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * Range selector (§10/§11): the four presets PLUS a custom Start/End date range.
 * Dates are typed as YYYY-MM-DD (the project has no date-picker dependency). Apply
 * validates locally — both dates required, real calendar dates, End ≥ Start — and
 * only then reports the custom range up. Clear resets to the default preset.
 */
export function RangeFilter({
  selection,
  onSelectPreset,
  onApplyCustom,
  onClear,
}: {
  selection: RangeSelection;
  onSelectPreset: (r: AnalyticsRange) => void;
  onApplyCustom: (start: string, end: string) => void;
  onClear: () => void;
}) {
  const isCustom = selection.kind === 'custom';
  const [start, setStart] = useState(isCustom ? selection.start : '');
  const [end, setEnd] = useState(isCustom ? selection.end : '');
  const [err, setErr] = useState<string | null>(null);

  function apply() {
    const s = start.trim();
    const e = end.trim();
    if (!s || !e) return setErr('Enter both a start and end date.');
    if (!isValidYmd(s) || !isValidYmd(e)) return setErr('Use the format YYYY-MM-DD.');
    // Zero-padded ISO dates compare correctly as plain strings.
    if (e < s) return setErr('End date can’t be before start date.');
    setErr(null);
    onApplyCustom(s, e);
  }

  function clear() {
    setStart('');
    setEnd('');
    setErr(null);
    onClear();
  }

  return (
    <View style={styles.filterWrap}>
      <View style={styles.filterRow}>
        {RANGES.map((r) => {
          const active = selection.kind === 'preset' && r.key === selection.preset;
          return (
            <BauhausCard
              key={r.key}
              color={active ? theme.primary : theme.white}
              borderRadius={RADIUS.sm}
              onPress={() => onSelectPreset(r.key)}
              style={styles.pill}
            >
              <BauhausText style={[styles.pillText, active && styles.pillTextActive]}>{r.label}</BauhausText>
            </BauhausCard>
          );
        })}
      </View>

      <View style={styles.customRow}>
        <View style={styles.dateField}>
          <BauhausText style={styles.dateLabel}>Start</BauhausText>
          <BauhausInput
            placeholder="YYYY-MM-DD"
            value={start}
            onChangeText={setStart}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={styles.dateField}>
          <BauhausText style={styles.dateLabel}>End</BauhausText>
          <BauhausInput
            placeholder="YYYY-MM-DD"
            value={end}
            onChangeText={setEnd}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>

      {err ? <BauhausText style={styles.filterErr}>{err}</BauhausText> : null}

      <View style={styles.customActions}>
        <View style={styles.actionBtn}>
          <BauhausButton label="Apply" color={theme.info} onPress={apply} />
        </View>
        {isCustom ? (
          <View style={styles.actionBtn}>
            <BauhausButton label="Clear" color={theme.white} onPress={clear} />
          </View>
        ) : null}
      </View>

      {isCustom ? (
        <BauhausText style={styles.customNote}>
          Showing {selection.start} → {selection.end}
        </BauhausText>
      ) : null}
    </View>
  );
}

/** A single stat tile. Caller supplies `tileWidth` (px) for 48%/31% layouts. */
export function StatTile({
  label,
  value,
  color = theme.primary,
  tileWidth,
}: {
  label: string;
  value: string;
  color?: string;
  tileWidth?: number;
}) {
  return (
    <View style={tileWidth != null ? { width: tileWidth } : undefined}>
      <BauhausCard color={color} fullWidth style={styles.tile}>
        <BauhausText style={[styles.tileLabel, { color: textOn(color) }]}>{label}</BauhausText>
        <BauhausHeader style={[styles.tileValue, { color: textOn(color) }]}>{value}</BauhausHeader>
      </BauhausCard>
    </View>
  );
}

function fitLine(width: number, n: number) {
  const initial = 16;
  if (n <= 1) return { spacing: 0, initialSpacing: Math.max(16, width / 2) };
  const spacing = Math.max(18, (width - initial * 2) / (n - 1));
  return { spacing, initialSpacing: initial };
}

/** Attendance-percentage trend over the range's buckets. */
export function AttendanceLineChart({
  title,
  buckets,
  width,
  color = theme.info,
}: {
  title: string;
  buckets: AnalyticsBucket[];
  width: number;
  color?: string;
}) {
  const chartW = chartPlotWidth(width);
  const data = buckets.map((b) => ({ value: Math.round(b.percentage), label: b.label }));
  const { spacing, initialSpacing } = fitLine(chartW, data.length);
  return (
    <BauhausCard color={theme.white} style={styles.card}>
      <BauhausHeader style={styles.cardTitle}>{title}</BauhausHeader>
      {data.length === 0 ? (
        <BauhausText style={styles.empty}>No sessions in this range yet.</BauhausText>
      ) : (
        <LineChart
          data={data}
          width={chartW}
          height={180}
          maxValue={100}
          noOfSections={4}
          color={color}
          thickness={3}
          spacing={spacing}
          initialSpacing={initialSpacing}
          yAxisThickness={0}
          xAxisThickness={2}
          xAxisColor={theme.ink}
          yAxisTextStyle={styles.axis}
          xAxisLabelTextStyle={styles.axisSmall}
          hideRules
          areaChart
          startFillColor={color}
          endFillColor={color}
          startOpacity={0.12}
          endOpacity={0.12}
          dataPointsColor={theme.ink}
        />
      )}
    </BauhausCard>
  );
}

function fitBar(width: number, n: number) {
  if (n <= 0) return { barWidth: 20, spacing: 10, initialSpacing: 10 };
  const barWidth = Math.max(10, Math.min(40, Math.floor((width / n) * 0.5)));
  const spacing = Math.max(6, Math.floor((width - n * barWidth) / (n + 1)));
  return { barWidth, spacing, initialSpacing: spacing };
}

/** Attendance-percentage per bucket as bars. */
export function AttendanceBarChart({
  title,
  buckets,
  width,
  color = theme.primary,
}: {
  title: string;
  buckets: AnalyticsBucket[];
  width: number;
  color?: string;
}) {
  const chartW = chartPlotWidth(width);
  const data = buckets.map((b) => ({ value: Math.round(b.percentage), label: b.label, frontColor: color }));
  const { barWidth, spacing, initialSpacing } = fitBar(chartW, data.length);
  return (
    <BauhausCard color={theme.white} style={styles.card}>
      <BauhausHeader style={styles.cardTitle}>{title}</BauhausHeader>
      {data.length === 0 ? (
        <BauhausText style={styles.empty}>No sessions in this range yet.</BauhausText>
      ) : (
        <BarChart
          data={data}
          width={chartW}
          height={180}
          maxValue={100}
          noOfSections={4}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={initialSpacing}
          barBorderRadius={0}
          yAxisThickness={0}
          xAxisThickness={2}
          xAxisColor={theme.ink}
          yAxisTextStyle={styles.axis}
          xAxisLabelTextStyle={styles.axisSmall}
          hideRules
        />
      )}
    </BauhausCard>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <BauhausText style={styles.legendLabel}>{label}</BauhausText>
    </View>
  );
}

/** Present vs. absent donut with a big % in the middle. */
export function PresencePie({
  title,
  present,
  total,
  width,
}: {
  title: string;
  present: number;
  total: number;
  width: number;
}) {
  const absent = Math.max(0, total - present);
  const pct = total === 0 ? 0 : Math.round((present / total) * 100);
  const radius = Math.min(96, Math.max(64, Math.floor(width / 4)));
  const pieData =
    total === 0
      ? [{ value: 1, color: '#ECECEC' }]
      : [
          { value: present, color: COLORS.success },
          { value: absent, color: COLORS.danger },
        ];
  return (
    <BauhausCard color={theme.white} style={styles.card}>
      <BauhausHeader style={styles.cardTitle}>{title}</BauhausHeader>
      <View style={styles.pieRow}>
        <PieChart
          data={pieData}
          radius={radius}
          donut
          innerRadius={Math.floor(radius * 0.56)}
          innerCircleColor={theme.white}
          centerLabelComponent={() => <BauhausHeader style={styles.pieCenter}>{pct}%</BauhausHeader>}
        />
        <View style={styles.legend}>
          <Legend color={COLORS.success} label={`Present · ${present}`} />
          <Legend color={COLORS.danger} label={`Absent · ${absent}`} />
        </View>
      </View>
    </BauhausCard>
  );
}

/** Per-student list, expected pre-sorted ascending; flags < AT_RISK_BELOW. */
export function StudentList({ rows, style }: { rows: StudentAnalyticsRow[]; style?: StyleProp<ViewStyle> }) {
  return (
    <BauhausCard color={theme.white} style={[styles.card, style]}>
      <BauhausHeader style={styles.cardTitle}>Students</BauhausHeader>
      {rows.length === 0 ? (
        <BauhausText style={styles.empty}>No students yet.</BauhausText>
      ) : (
        rows.map((s) => {
          const risk = s.percentage < AT_RISK_BELOW;
          return (
            <View key={s.rosterEntryId} style={styles.studentRow}>
              <View style={styles.studentInfo}>
                <BauhausText style={styles.studentName}>{s.name}</BauhausText>
                <BauhausText style={styles.studentRoll}>Roll {s.rollNo}</BauhausText>
              </View>
              <BauhausText style={[styles.studentPct, risk && styles.studentPctRisk]}>
                {Math.round(s.percentage)}%
              </BauhausText>
            </View>
          );
        })
      )}
    </BauhausCard>
  );
}

const styles = StyleSheet.create({
  filterWrap: { gap: SPACING.sm },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  pill: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: theme.ink },
  pillTextActive: { fontFamily: fonts.header, color: theme.white },
  customRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  dateField: { flex: 1, gap: SPACING.xs },
  dateLabel: { fontSize: 11, opacity: 0.7, fontFamily: fonts.bodyMedium, marginLeft: 2 },
  filterErr: { color: theme.absent, fontSize: 13, fontFamily: fonts.bodyMedium },
  customActions: { flexDirection: 'row', gap: SPACING.sm },
  actionBtn: { flex: 1 },
  customNote: { fontSize: 12, opacity: 0.7 },

  tile: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.md, alignItems: 'center' },
  tileLabel: { fontSize: 12, marginBottom: SPACING.xs, opacity: 0.7 },
  tileValue: { fontSize: 30 },

  card: { padding: SPACING.lg },
  cardTitle: { fontSize: 18, marginBottom: SPACING.md },
  empty: { color: theme.muted },
  axis: { color: theme.ink, fontSize: 11 },
  axisSmall: { color: theme.ink, fontSize: 9 },

  pieRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.lg },
  pieCenter: { fontSize: 22 },
  legend: { gap: SPACING.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  legendDot: { width: 16, height: 16, borderRadius: 4, borderWidth: 2, borderColor: theme.ink },
  legendLabel: { fontSize: 14 },

  studentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(22,22,22,0.12)' },
  studentInfo: { flex: 1, paddingRight: SPACING.sm },
  studentName: { fontSize: 15, fontFamily: fonts.bodyMedium },
  studentRoll: { fontSize: 12, color: theme.muted, marginTop: 2 },
  studentPct: { fontSize: 18, fontFamily: fonts.bodySemibold },
  studentPctRisk: { color: theme.absent, fontFamily: fonts.bodySemibold },
});
