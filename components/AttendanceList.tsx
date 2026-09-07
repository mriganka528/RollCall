import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BauhausCard, BauhausText, Circle, Triangle, fonts, theme } from './BauhausCard';

export interface AttendanceRow {
  id: string;
  name: string;
  rollNo?: string;
  detail?: string;
  present?: boolean;
}

/**
 * AttendanceList — a dense record list, kept deliberately neutral (§Part 2):
 * white cards, ink text, no color-blocking. Status is carried by a small shape
 * + label only — a blue circle for present, a red triangle for absent — so the
 * list stays legible at length.
 */
export default function AttendanceList({
  rows,
  emptyText = 'No records yet.',
}: {
  rows: AttendanceRow[];
  emptyText?: string;
}) {
  if (rows.length === 0) {
    return <BauhausText style={styles.empty}>{emptyText}</BauhausText>;
  }

  return (
    <View style={styles.list}>
      {rows.map((item) => (
        <BauhausCard key={item.id} color={theme.white} style={styles.rowCard}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <BauhausText style={styles.name}>{item.name}</BauhausText>
              {item.rollNo ? <BauhausText style={styles.detail}>{item.rollNo}</BauhausText> : null}
              {item.detail ? <BauhausText style={styles.detail}>{item.detail}</BauhausText> : null}
            </View>
            {item.present !== undefined && (
              <View style={styles.status}>
                {item.present ? (
                  <Circle size={12} color={theme.blue} />
                ) : (
                  <Triangle size={12} color={theme.red} />
                )}
                <BauhausText style={[styles.statusText, { color: item.present ? theme.blue : theme.red }]}>
                  {item.present ? 'Present' : 'Absent'}
                </BauhausText>
              </View>
            )}
          </View>
        </BauhausCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  rowCard: { paddingVertical: 14, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontFamily: fonts.bodyMedium },
  detail: { fontSize: 13, color: theme.muted, marginTop: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { fontSize: 12, fontFamily: fonts.bodySemibold },
  empty: { textAlign: 'center', color: theme.muted, marginTop: 40 },
});
