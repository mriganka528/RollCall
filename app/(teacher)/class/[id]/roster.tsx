import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Modal, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { BauhausCard, BauhausButton, BauhausHeader, BauhausInput, BauhausText, fonts, theme } from '../../../../components/BauhausCard';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import RosterImportReview, { RosterRow } from '../../../../components/RosterImportReview';
import { api, ApiError } from '../../../../lib/api';
import { haptics } from '../../../../lib/haptics';
import { ImportResponse, RosterEntry } from '../../../../lib/types';

export default function Roster() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const confirm = useConfirm();
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewRows, setReviewRows] = useState<RosterRow[] | null>(null);

  const load = useCallback(async () => {
    try {
      setRoster(await api.get<RosterEntry[]>(`/classes/${id}/roster`));
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Could not load roster.', 'error');
    }
  }, [id, toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function addOne() {
    if (!name.trim() || !rollNo.trim()) {
      toast.show('Enter name and roll number.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/classes/${id}/roster`, { name: name.trim(), rollNo: rollNo.trim() });
      haptics.success();
      toast.show(`Added ${name.trim()}.`, 'success');
      setName('');
      setRollNo('');
      load();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Could not add student.', 'error');
    } finally {
      setBusy(false);
    }
  }

  // Removing a roster entry frees the roll number (and unlinks a claimed
  // student), so confirm before the destructive call.
  async function confirmRemove(entryId: string, entryName: string) {
    const ok = await confirm({
      title: 'Remove student?',
      message: `Remove ${entryName} from the roster? Their roll number becomes available again.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (ok) void remove(entryId);
  }

  async function remove(entryId: string) {
    try {
      await api.del(`/classes/${id}/roster/${entryId}`);
      haptics.success();
      toast.show('Student removed.', 'success');
      load();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Could not remove student.', 'error');
    }
  }

  async function pickAndImport() {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'text/csv',
        'text/comma-separated-values',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/pdf',
      ],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setBusy(true);
    try {
      const res = await api.upload<ImportResponse>(`/classes/${id}/roster/import`, {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
      });
      if (!res.rows.length) {
        toast.show('Could not read any rows from that file.', 'error');
        return;
      }
      setReviewRows(res.rows);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Import failed — try another file.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport(rows: RosterRow[]) {
    setBusy(true);
    try {
      const res = await api.post<{ added: number; skipped: number }>(
        `/classes/${id}/roster/import/confirm`,
        { rows }
      );
      setReviewRows(null);
      haptics.success();
      toast.show(`Added ${res.added}, skipped ${res.skipped} duplicate(s).`, 'success');
      load();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Could not import.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.flex}>
      <FlatList
        data={roster}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View style={styles.header}>
            <BauhausHeader style={styles.title}>Add Student</BauhausHeader>
            <BauhausInput placeholder="Name" value={name} onChangeText={setName} />
            <BauhausInput placeholder="Roll No" value={rollNo} onChangeText={setRollNo} containerStyle={{ marginTop: 12 }} />
            <BauhausButton label={busy ? 'Adding…' : 'Add'} onPress={addOne} disabled={busy} style={{ marginTop: 12 }} />
            <BauhausButton label="Import from File" color={theme.info} onPress={pickAndImport} disabled={busy} style={{ marginTop: 12 }} />
            <BauhausHeader style={[styles.title, { marginTop: 28 }]}>Students ({roster.length})</BauhausHeader>
          </View>
        }
        renderItem={({ item }) => (
          <BauhausCard color={theme.white} style={styles.row}>
            <View style={{ flex: 1 }}>
              <BauhausText style={styles.rowName}>{item.name}</BauhausText>
              <BauhausText style={styles.rowMeta}>
                {item.rollNo} {item.linked ? '· ✓ claimed' : '· unclaimed'}
              </BauhausText>
            </View>
            <BauhausButton label="✕" color={theme.absent} fullWidth={false} onPress={() => confirmRemove(item.id, item.name)} style={styles.delBtn} />
          </BauhausCard>
        )}
        ListEmptyComponent={<BauhausText style={styles.empty}>No students yet.</BauhausText>}
      />

      <Modal visible={reviewRows !== null} animationType="slide">
        {reviewRows && (
          <RosterImportReview rows={reviewRows} onConfirm={confirmImport} onCancel={() => setReviewRows(null)} />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { padding: 24, paddingBottom: 48, gap: 12 },
  header: { gap: 0 },
  title: { fontSize: 18, marginBottom: 12 },
  row: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowName: { fontSize: 16, fontFamily: fonts.bodySemibold },
  rowMeta: { fontSize: 13, color: theme.muted, marginTop: 2 },
  delBtn: { paddingVertical: 10, paddingHorizontal: 14 },
  empty: { textAlign: 'center', color: theme.muted, marginTop: 20 },
});
