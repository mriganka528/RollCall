import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { BauhausCard, BauhausButton, BauhausHeader, BauhausInput, BauhausText, fonts, theme } from '../../../../components/BauhausCard';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import RosterImportReview, { RosterRow } from '../../../../components/RosterImportReview';
import { api, ApiError } from '../../../../lib/api';
import { haptics } from '../../../../lib/haptics';
import { ClassSummary, ImportResponse, RosterEntry } from '../../../../lib/types';

export default function Roster() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const confirm = useConfirm();
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewRows, setReviewRows] = useState<RosterRow[] | null>(null);

  // Search/filter (Improvement 2) — case-insensitive match on name OR roll no.
  const [search, setSearch] = useState('');
  // Multi-select (Improvement 3) — a set of selected roster-entry ids plus a
  // mode flag so the list only turns "selectable" when the teacher asks for it.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Copy-roster (§H2) — when this class opens empty and the teacher has students
  // in other classes, offer to copy one of those rosters in. `copySources` is the
  // list of eligible classes; `offeredRef` makes the auto-prompt fire at most once
  // per screen mount so dismissing it ("Not now") doesn't re-pop on every reload.
  const [copyModal, setCopyModal] = useState(false);
  const [copySources, setCopySources] = useState<ClassSummary[]>([]);
  const [copyBusy, setCopyBusy] = useState(false);
  const offeredRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const list = await api.get<RosterEntry[]>(`/classes/${id}/roster`);
      setRoster(list);
      // Auto-offer a roster copy the first time we find this class empty and the
      // teacher owns other classes that already have students. Silent if there's
      // nothing to copy from — the teacher just sees the normal empty roster.
      if (list.length === 0 && !offeredRef.current) {
        offeredRef.current = true;
        try {
          const classes = await api.get<ClassSummary[]>('/classes');
          const sources = classes.filter((c) => c.id !== id && (c.studentCount ?? 0) > 0);
          if (sources.length > 0) {
            setCopySources(sources);
            setCopyModal(true);
          }
        } catch {
          // Couldn't list classes — skip the offer; manual add still works.
        }
      }
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Could not load roster.', 'error');
    }
  }, [id, toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Manual entry point for the copy picker (the "Copy from another class" button
  // shown while the roster is empty), for when the auto-prompt was dismissed.
  // Unlike the silent auto-offer, this tells the teacher when there's nothing to
  // copy from.
  async function openCopyPicker() {
    try {
      const classes = await api.get<ClassSummary[]>('/classes');
      const sources = classes.filter((c) => c.id !== id && (c.studentCount ?? 0) > 0);
      if (sources.length === 0) {
        toast.show('No other classes with students to copy from.', 'info');
        return;
      }
      haptics.light();
      setCopySources(sources);
      setCopyModal(true);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Could not load your classes.', 'error');
    }
  }

  // Copy a chosen source class's students into this one. The backend skips roll
  // numbers already present here, so it's safe to run more than once.
  async function copyFrom(sourceId: string, sourceName: string) {
    setCopyBusy(true);
    try {
      const res = await api.post<{ added: number; skipped: number; sourceCount: number }>(
        `/classes/${id}/roster/copy-from`,
        { sourceClassId: sourceId }
      );
      setCopyModal(false);
      if (res.added > 0) {
        haptics.success();
        const skip = res.skipped > 0 ? `, skipped ${res.skipped} duplicate${res.skipped === 1 ? '' : 's'}` : '';
        toast.show(`Copied ${res.added} student${res.added === 1 ? '' : 's'} from ${sourceName}${skip}.`, 'success');
      } else {
        toast.show('Those students are already in this class.', 'info');
      }
      load();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Could not copy students.', 'error');
    } finally {
      setCopyBusy(false);
    }
  }

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return roster;
    return roster.filter(
      (e) => e.name.toLowerCase().includes(query) || e.rollNo.toLowerCase().includes(query)
    );
  }, [roster, query]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.id));

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

  // ---- Multi-select helpers (Improvement 3) ----
  function toggleSelectMode() {
    haptics.light();
    setSelectMode((m) => {
      if (m) setSelected(new Set()); // leaving select mode clears the selection
      return !m;
    });
  }

  function toggleSelect(entryId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  // Select-all operates on the currently VISIBLE (filtered) rows, so it does the
  // intuitive thing whether or not a search is active. Tapping again clears them.
  function toggleSelectAll() {
    haptics.light();
    setSelected((prev) => {
      const next = new Set(prev);
      if (filtered.length > 0 && filtered.every((e) => next.has(e.id))) {
        filtered.forEach((e) => next.delete(e.id));
      } else {
        filtered.forEach((e) => next.add(e.id));
      }
      return next;
    });
  }

  // Delete many at once. Prefer the transactional bulk endpoint; if the deployed
  // server doesn't have it yet (404), fall back to deleting one-by-one so the
  // feature works even before the backend is redeployed.
  async function deleteMany(ids: string[]) {
    try {
      await api.post(`/classes/${id}/roster/bulk-delete`, { ids });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        for (const entryId of ids) {
          await api.del(`/classes/${id}/roster/${entryId}`);
        }
      } else {
        throw e;
      }
    }
  }

  async function bulkRemove() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const plural = ids.length === 1 ? '' : 's';
    const ok = await confirm({
      title: `Remove ${ids.length} student${plural}?`,
      message: `This removes ${ids.length === 1 ? 'this student' : 'these students'} from the roster. Their roll number${plural} become available again.`,
      confirmLabel: `Remove ${ids.length}`,
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteMany(ids);
      haptics.success();
      toast.show(`Removed ${ids.length} student${plural}.`, 'success');
      setSelected(new Set());
      setSelectMode(false);
      load();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Could not remove the selected students.', 'error');
    } finally {
      setBusy(false);
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

  const studentsLabel =
    query && filtered.length !== roster.length
      ? `Students (${filtered.length} of ${roster.length})`
      : `Students (${roster.length})`;

  return (
    <View style={styles.flex}>
      <FlatList
        data={filtered}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <BauhausHeader style={styles.title}>Add Student</BauhausHeader>
            <BauhausInput placeholder="Name" value={name} onChangeText={setName} />
            <BauhausInput placeholder="Roll No" value={rollNo} onChangeText={setRollNo} containerStyle={{ marginTop: 12 }} />
            <BauhausButton label={busy ? 'Adding…' : 'Add'} onPress={addOne} disabled={busy} style={{ marginTop: 12 }} />
            <BauhausButton label="Import from File" color={theme.info} onPress={pickAndImport} disabled={busy} style={{ marginTop: 12 }} />
            {roster.length === 0 && (
              <BauhausButton
                label="Copy from another class"
                color={theme.white}
                onPress={openCopyPicker}
                disabled={busy}
                style={{ marginTop: 12 }}
              />
            )}

            <View style={styles.studentsHead}>
              <BauhausHeader style={styles.studentsTitle}>{studentsLabel}</BauhausHeader>
              {roster.length > 0 && (
                <BauhausButton
                  label={selectMode ? 'Done' : 'Select'}
                  color={theme.white}
                  fullWidth={false}
                  disabled={busy}
                  onPress={toggleSelectMode}
                  style={styles.smallBtn}
                />
              )}
            </View>

            {roster.length > 0 && (
              <BauhausInput
                placeholder="Search by name or roll no"
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
                containerStyle={{ marginTop: 12 }}
              />
            )}

            {selectMode && (
              <View style={styles.selectBar}>
                <BauhausButton
                  label={allFilteredSelected ? 'Deselect all' : 'Select all'}
                  color={theme.white}
                  fullWidth={false}
                  disabled={busy || filtered.length === 0}
                  onPress={toggleSelectAll}
                  style={styles.selectBarBtn}
                />
                <BauhausButton
                  label={busy ? 'Removing…' : `Remove (${selected.size})`}
                  color={theme.absent}
                  fullWidth={false}
                  disabled={busy || selected.size === 0}
                  onPress={bulkRemove}
                  style={styles.selectBarBtn}
                />
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isSel = selected.has(item.id);
          return (
            <BauhausCard
              color={selectMode && isSel ? theme.blueTint : theme.white}
              borderColor={selectMode && isSel ? theme.blue : theme.ink}
              onPress={selectMode ? () => toggleSelect(item.id) : undefined}
              style={styles.row}
            >
              {selectMode && (
                <View style={[styles.checkbox, isSel && styles.checkboxOn]}>
                  {isSel && <BauhausText style={styles.checkboxTick}>✓</BauhausText>}
                </View>
              )}
              <View style={{ flex: 1 }}>
                <BauhausText style={styles.rowName}>{item.name}</BauhausText>
                <BauhausText style={styles.rowMeta}>
                  {item.rollNo} {item.linked ? '· ✓ claimed' : '· unclaimed'}
                </BauhausText>
              </View>
              {!selectMode && (
                <BauhausButton label="✕" color={theme.absent} fullWidth={false} onPress={() => confirmRemove(item.id, item.name)} style={styles.delBtn} />
              )}
            </BauhausCard>
          );
        }}
        ListEmptyComponent={
          <BauhausText style={styles.empty}>
            {roster.length === 0 ? 'No students yet.' : `No students match “${search.trim()}”.`}
          </BauhausText>
        }
      />

      <Modal visible={reviewRows !== null} animationType="slide">
        {reviewRows && (
          <RosterImportReview rows={reviewRows} onConfirm={confirmImport} onCancel={() => setReviewRows(null)} />
        )}
      </Modal>

      {/* Copy-roster picker (§H2): pick which of your other classes to copy
          students from. Auto-opens once when this class is empty; also reachable
          via the "Copy from another class" button. */}
      <Modal
        visible={copyModal}
        animationType="fade"
        transparent
        onRequestClose={() => { if (!copyBusy) setCopyModal(false); }}
      >
        <View style={styles.copyBackdrop}>
          <View style={styles.copySheet}>
            <BauhausHeader style={styles.copyTitle}>Copy students?</BauhausHeader>
            <BauhausText style={styles.copySub}>
              This class has no students yet. Copy the roster from one of your other classes — any roll numbers already here are skipped.
            </BauhausText>
            <ScrollView style={styles.copyList} contentContainerStyle={styles.copyListContent}>
              {copySources.map((c) => (
                <BauhausCard
                  key={c.id}
                  color={theme.white}
                  onPress={copyBusy ? undefined : () => copyFrom(c.id, c.name)}
                  disabled={copyBusy}
                  style={styles.copyRow}
                >
                  <View style={{ flex: 1 }}>
                    <BauhausText style={styles.copyRowName}>{c.name}</BauhausText>
                    <BauhausText style={styles.copyRowMeta}>
                      {c.studentCount} student{c.studentCount === 1 ? '' : 's'}
                    </BauhausText>
                  </View>
                  <Ionicons name="copy-outline" size={20} color={theme.blue} />
                </BauhausCard>
              ))}
            </ScrollView>
            <BauhausButton
              label={copyBusy ? 'Copying…' : 'Not now'}
              color={theme.white}
              onPress={() => setCopyModal(false)}
              disabled={copyBusy}
              style={{ marginTop: 4 }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { padding: 24, paddingBottom: 48, gap: 12 },
  header: { gap: 0 },
  title: { fontSize: 18, marginBottom: 12 },
  studentsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 },
  studentsTitle: { fontSize: 18 },
  smallBtn: { paddingVertical: 8, paddingHorizontal: 18 },
  selectBar: { flexDirection: 'row', gap: 12, marginTop: 12 },
  selectBarBtn: { flex: 1, paddingVertical: 11, paddingHorizontal: 12 },
  row: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: theme.ink, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.white },
  checkboxOn: { backgroundColor: theme.blue, borderColor: theme.blue },
  checkboxTick: { color: theme.white, fontSize: 15, fontFamily: fonts.bodySemibold, lineHeight: 18 },
  rowName: { fontSize: 16, fontFamily: fonts.bodySemibold },
  rowMeta: { fontSize: 13, color: theme.muted, marginTop: 2 },
  delBtn: { paddingVertical: 10, paddingHorizontal: 14 },
  empty: { textAlign: 'center', color: theme.muted, marginTop: 20 },
  // Copy-roster picker (§H2)
  copyBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  copySheet: { backgroundColor: theme.bg, borderRadius: theme.radius, borderWidth: 1.25, borderColor: theme.ink, padding: 20, maxHeight: '80%', gap: 14 },
  copyTitle: { fontSize: 20 },
  copySub: { fontSize: 14, color: theme.muted, lineHeight: 20 },
  copyList: { flexGrow: 0 },
  copyListContent: { gap: 12, paddingVertical: 2 },
  copyRow: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copyRowName: { fontSize: 16, fontFamily: fonts.bodySemibold },
  copyRowMeta: { fontSize: 13, color: theme.muted, marginTop: 2 },
});
