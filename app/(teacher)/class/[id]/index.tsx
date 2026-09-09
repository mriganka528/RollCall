import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BauhausCard, BauhausButton, BauhausHeader, BauhausText, fonts, theme } from '../../../../components/BauhausCard';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import { api, ApiError } from '../../../../lib/api';
import { haptics } from '../../../../lib/haptics';
import { copyToClipboard } from '../../../../lib/clipboard';
import { ClassDetail as ClassDetailType, SessionInfo } from '../../../../lib/types';

export default function ClassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<ClassDetailType | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setData(await api.get<ClassDetailType>(`/classes/${id}`));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not load class.';
      // Keep the message on screen (with a Retry) instead of only flashing a
      // toast and dead-ending on "Loading…" — this is the "tapped a class and it
      // didn't load" case, usually a Vercel cold-start timeout.
      setLoadError(msg);
      toast.show(msg, 'error');
    }
  }, [id, toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Start a session, or resume the active one. The backend is idempotent (§1):
  // if a session is already active it returns that same one, never a duplicate.
  async function startSession() {
    setBusy(true);
    try {
      const s = await api.post<SessionInfo>(`/classes/${id}/sessions`);
      haptics.success();
      router.push(`/(teacher)/class/${id}/session?sessionId=${s.id}`);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Could not start session.', 'error');
    } finally {
      setBusy(false);
    }
  }

  // Reopen the existing ongoing session (live QR screen) — never creates one (§1).
  function continueSession(sessionId: string) {
    router.push(`/(teacher)/class/${id}/session?sessionId=${sessionId}`);
  }

  // Read-only details for a finished (or ongoing) session (§13).
  function viewDetails(sessionId: string) {
    router.push(`/(teacher)/class/${id}/session-details?sessionId=${sessionId}`);
  }

  // Tap-to-copy the join code (§H5). Copies just the code to the clipboard for a
  // quick paste, with a haptic + toast so the tap feels acknowledged. The Share
  // button below is still there for sending the full invite message.
  async function copyCode() {
    if (!data) return;
    const ok = await copyToClipboard(data.joinCode);
    if (ok) {
      haptics.success();
      toast.show('Class code copied', 'success');
    } else {
      toast.show('Couldn’t copy the code.', 'error');
    }
  }

  // Share the join code to any app (WhatsApp, SMS, email, …) via the OS share
  // sheet — which also offers "Copy" on both iOS and Android, so the code is both
  // shareable and copyable. Uses React Native's built-in Share (no extra deps).
  async function shareCode() {
    if (!data) return;
    haptics.light();
    try {
      await Share.share({
        message:
          `Join my class “${data.name}” on ROLLCALL.\n\n` +
          `Join code: ${data.joinCode}\n\n` +
          `In the ROLLCALL app: Join a class → enter this code and your roll number.`,
      });
    } catch {
      // Sheet dismissed or unavailable — nothing to do.
    }
  }

  // Deleting a class is irreversible and cascades to every session, roster row,
  // and attendance record — so confirm with clear wording before calling the
  // transactional DELETE endpoint.
  async function confirmDelete() {
    if (!data) return;
    const ok = await confirm({
      title: 'Delete class?',
      message: `This permanently deletes “${data.name}”, along with all its sessions, roster, and attendance records. This cannot be undone.`,
      confirmLabel: 'Delete Class',
      destructive: true,
    });
    if (ok) void deleteClass();
  }

  async function deleteClass() {
    setDeleting(true);
    try {
      await api.del(`/classes/${id}`);
      haptics.success();
      toast.show('Class deleted.', 'success');
      router.replace('/(teacher)/dashboard');
    } catch (e) {
      setDeleting(false);
      toast.show(e instanceof ApiError ? e.message : 'Could not delete the class. Please try again.', 'error');
    }
  }

  if (!data) {
    return (
      <View style={styles.loadingBox}>
        {loadError ? (
          <>
            <BauhausText style={styles.loadErr}>{loadError}</BauhausText>
            <BauhausButton label="Try again" onPress={load} fullWidth={false} />
          </>
        ) : (
          <BauhausText style={styles.muted}>Loading…</BauhausText>
        )}
      </View>
    );
  }

  const hasActive = data.activeSessionId != null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <BauhausCard color={theme.primary} style={styles.card}>
        <BauhausHeader style={styles.name}>{data.name}</BauhausHeader>
        <Pressable
          onPress={copyCode}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Copy class code ${data.joinCode}`}
          style={({ pressed }) => [styles.codeRow, pressed && styles.codePressed]}
        >
          <BauhausHeader style={styles.code}>{data.joinCode}</BauhausHeader>
          <Ionicons name="copy-outline" size={20} color={theme.white} style={styles.copyIcon} />
        </Pressable>
        <BauhausText style={styles.heroSub}>{data.studentCount} students</BauhausText>
        <BauhausText style={styles.heroHint}>Tap the code to copy it, or share it so students can claim their roll number.</BauhausText>
        <BauhausButton label="Share code" color={theme.white} onPress={shareCode} style={styles.shareBtn} />
      </BauhausCard>

      {hasActive ? (
        <BauhausButton
          label="Continue Session"
          color={theme.present}
          disabled={busy || deleting}
          onPress={() => continueSession(data.activeSessionId!)}
          style={{ marginTop: 24 }}
        />
      ) : (
        <BauhausButton label={busy ? 'Starting…' : 'Start Session'} disabled={busy || deleting} onPress={startSession} style={{ marginTop: 24 }} />
      )}
      <BauhausButton label="Students" color={theme.white} disabled={deleting} onPress={() => router.push(`/(teacher)/class/${id}/roster`)} style={{ marginTop: 12 }} />
      <BauhausButton label="History" color={theme.white} disabled={deleting} onPress={() => router.push(`/(teacher)/class/${id}/history`)} style={{ marginTop: 12 }} />
      <BauhausButton label="Analytics" color={theme.info} disabled={deleting} onPress={() => router.push(`/(teacher)/class/${id}/analytics`)} style={{ marginTop: 12 }} />

      {data.sessions.length > 0 ? <BauhausHeader style={styles.sectionTitle}>Recent Sessions</BauhausHeader> : null}
      <View style={{ gap: 12 }}>
        {data.sessions.slice(0, 5).map((s) => (
          <BauhausCard
            key={s.id}
            color={theme.white}
            onPress={() => (s.isActive ? continueSession(s.id) : viewDetails(s.id))}
            style={styles.sessionRow}
          >
            <View style={{ flex: 1 }}>
              <BauhausText style={styles.sessionDate}>{new Date(s.startedAt ?? s.expiresAt).toLocaleString()}</BauhausText>
              <BauhausText style={styles.sessionHint}>{s.isActive ? 'Tap to continue →' : 'Tap for details →'}</BauhausText>
            </View>
            <View style={[styles.badge, { backgroundColor: s.isActive ? theme.blue : theme.white }]}>
              <BauhausText style={[styles.badgeText, { color: s.isActive ? theme.white : theme.ink }]}>{s.isActive ? 'Ongoing' : 'Completed'}</BauhausText>
            </View>
          </BauhausCard>
        ))}
      </View>

      {/* Danger zone — permanently remove the class (§ delete-class). */}
      <View style={styles.danger}>
        <BauhausButton
          label={deleting ? 'Deleting…' : 'Delete Class'}
          color={theme.red}
          disabled={deleting || busy}
          onPress={confirmDelete}
        />
        <BauhausText style={styles.dangerHint}>Removes the class and all its sessions, roster, and attendance. This can’t be undone.</BauhausText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { padding: 24, paddingBottom: 48 },
  loadingBox: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  loadErr: { color: theme.red, textAlign: 'center', fontSize: 15 },
  card: { padding: 24, alignItems: 'center' },
  shareBtn: { marginTop: 18, alignSelf: 'stretch' },
  name: { fontSize: 22, color: theme.white },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginVertical: 10 },
  codePressed: { opacity: 0.6 },
  copyIcon: { opacity: 0.9 },
  code: { fontSize: 30, letterSpacing: 2, color: theme.white },
  muted: { color: theme.muted },
  heroSub: { color: theme.white, opacity: 0.9 },
  heroHint: { color: theme.white, opacity: 0.9, marginTop: 8, fontSize: 13, textAlign: 'center' },
  sectionTitle: { fontSize: 18, marginTop: 28, marginBottom: 14 },
  sessionRow: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sessionDate: { fontSize: 14 },
  sessionHint: { fontSize: 12, color: theme.muted, marginTop: 3 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, borderWidth: 1.5, borderColor: theme.ink },
  badgeText: { fontSize: 11, fontFamily: fonts.bodySemibold },
  danger: { marginTop: 36, paddingTop: 20, borderTopWidth: 1.25, borderTopColor: theme.muted, gap: 10 },
  dangerHint: { fontSize: 12, color: theme.muted, textAlign: 'center' },
});
