import React, { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { BauhausCard, BauhausButton, BauhausInput, BauhausText, fonts, theme } from './BauhausCard';

export interface RosterRow {
  name: string;
  rollNo: string;
}

interface Props {
  rows: RosterRow[];
  onConfirm: (rows: RosterRow[]) => void;
  onCancel: () => void;
}

/**
 * Editable roster review before confirming the import (§7 two-step flow).
 */
export default function RosterImportReview({ rows: initial, onConfirm, onCancel }: Props) {
  const [rows, setRows] = useState<RosterRow[]>(initial);

  const update = (idx: number, field: keyof RosterRow, value: string) => {
    const next = [...rows];
    next[idx] = { ...next[idx], [field]: value };
    setRows(next);
  };

  const remove = (idx: number) => {
    setRows(rows.filter((_, i) => i !== idx));
  };

  return (
    <View style={styles.container}>
      <BauhausText style={styles.header}>
        Review {rows.length} {rows.length === 1 ? 'entry' : 'entries'} before adding to your students:
      </BauhausText>
      <FlatList
        data={rows}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <BauhausCard color={theme.white} style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 8 }}>
                <BauhausInput
                  value={item.name}
                  onChangeText={(v) => update(index, 'name', v)}
                  placeholder="Name"
                  containerStyle={{ paddingHorizontal: 0 }}
                />
                <BauhausInput
                  value={item.rollNo}
                  onChangeText={(v) => update(index, 'rollNo', v)}
                  placeholder="Roll No"
                  containerStyle={{ paddingHorizontal: 0 }}
                />
              </View>
              <BauhausButton
                label="✕"
                onPress={() => remove(index)}
                color={theme.absent}
                fullWidth={false}
                style={styles.delBtn}
              />
            </View>
          </BauhausCard>
        )}
      />
      <View style={styles.actions}>
        <BauhausButton label="Cancel" onPress={onCancel} color={theme.white} style={{ flex: 1 }} />
        <BauhausButton
          label="Confirm"
          onPress={() => onConfirm(rows)}
          disabled={rows.length === 0}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: theme.bg },
  header: { fontSize: 16, marginBottom: 16, fontFamily: fonts.bodySemibold },
  list: { gap: 12, paddingBottom: 16 },
  card: { padding: 12 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  delBtn: { paddingVertical: 12, paddingHorizontal: 14, marginTop: 0 },
  actions: { flexDirection: 'row', gap: 12, paddingTop: 12 },
});
