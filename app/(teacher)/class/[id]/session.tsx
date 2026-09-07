import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, View } from 'react-native';
import QRDisplay from '../../../../components/QRDisplay';
import { BauhausCard, BauhausButton, BauhausHeader, BauhausText, Circle, fonts, theme } from '../../../../components/BauhausCard';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import { api, ApiError } from '../../../../lib/api';
import { LiveResponse, TokenResponse } from '../../../../lib/types';

const TOKEN_POLL_MS = 15_000;
const LIVE_POLL_MS = 4_000;

export default function LiveSession() {
  const { id, sessionId } = useLocalSearchParams<{ id: string; sessionId: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [token, setToken] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [present, setPresent] = useState<LiveResponse['present']>([]);
  const [ending, setEnding] = useState(false);

  const tokenTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulse = useRef(new Animated.Value(0.4)).current;

  // Live-session pulse: a yellow circle that breathes while the session is
  // active (§Part 2 — circle = presence/live indicator).
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const fetchToken = useCallback(async () => {
    try {
      const r = await api.get<TokenResponse>(`/sessions/${sessionId}/token`);
      setToken(r.token);
      setActive(r.isActive);
      if (!r.isActive && tokenTimer.current) clearInterval(tokenTimer.current);
    } catch {
      // transient
    }
  }, [sessionId]);

  const fetchLive = useCallback(async () => {
    try {
      const r = await api.get<LiveResponse>(`/sessions/${sessionId}/live`);
      setCount(r.count);
      setTotal(r.total);
      setPresent(r.present);
    } catch {
      // transient
    }
  }, [sessionId]);

  useEffect(() => {
    fetchToken();
    fetchLive();
    tokenTimer.current = setInterval(fetchToken, TOKEN_POLL_MS);
    liveTimer.current = setInterval(fetchLive, LIVE_POLL_MS);
    return () => {
      if (tokenTimer.current) clearInterval(tokenTimer.current);
      if (liveTimer.current) clearInterval(liveTimer.current);
    };
  }, [fetchToken, fetchLive]);

  // §2: ending is irreversible, so confirm first with the exact required wording.
  // Uses the in-app confirm dialog (not Alert.alert, which no-ops on web).
  async function confirmEnd() {
    const ok = await confirm({
      title: 'End session?',
      message: 'Are you sure you want to end this attendance session? Once ended, the session cannot be continued.',
      confirmLabel: 'End Session',
      destructive: true,
    });
    if (ok) void endSession();
  }

  async function endSession() {
    // §2: "End Session doing nothing" is the classic silent-failure — if the
    // POST fails we must surface it, not swallow it. Only navigate away on a
    // confirmed success so the teacher never thinks a session ended when it
    // didn't.
    setEnding(true);
    try {
      await api.post(`/sessions/${sessionId}/end`);
      if (tokenTimer.current) clearInterval(tokenTimer.current);
      if (liveTimer.current) clearInterval(liveTimer.current);
      toast.show('Session ended.', 'success');
      router.replace(`/(teacher)/class/${id}`);
    } catch (e) {
      setEnding(false);
      toast.show(e instanceof ApiError ? e.message : 'Could not end the session. Please try again.', 'error');
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      {active && (
        <View style={styles.liveRow}>
          <Animated.View style={{ opacity: pulse }}>
            <Circle size={12} color={theme.yellow} />
          </Animated.View>
          <BauhausText style={styles.liveLabel}>Live</BauhausText>
        </View>
      )}

      {token && active ? (
        <QRDisplay payload={{ session_id: sessionId!, token }} />
      ) : (
        <BauhausCard color={theme.white} style={styles.expired}>
          <BauhausText style={styles.expiredText}>{active ? 'Loading QR…' : 'Session ended'}</BauhausText>
        </BauhausCard>
      )}

      <BauhausText style={styles.rotateHint}>Code refreshes every 15s — students must scan the current one.</BauhausText>

      <BauhausCard color={theme.blue} style={styles.counter}>
        <BauhausHeader style={styles.countNum}>
          {count}/{total}
        </BauhausHeader>
        <BauhausText style={styles.countLabel}>Present</BauhausText>
      </BauhausCard>

      {present.length > 0 ? (
        <View style={styles.presentList}>
          {present.map((p) => (
            <BauhausCard key={p.id} color={theme.white} style={styles.presentRow}>
              <Circle size={12} color={theme.blue} />
              <View style={{ flex: 1 }}>
                <BauhausText style={styles.presentName}>
                  {p.name} · {p.rollNo}
                </BauhausText>
              </View>
              <BauhausText style={styles.presentTime}>{new Date(p.markedAt).toLocaleTimeString()}</BauhausText>
            </BauhausCard>
          ))}
        </View>
      ) : null}

      {active ? (
        <BauhausButton label={ending ? 'Ending…' : 'End Session'} color={theme.red} disabled={ending} onPress={confirmEnd} style={{ marginTop: 28 }} />
      ) : (
        <BauhausButton label="Back to Class" onPress={() => router.replace(`/(teacher)/class/${id}`)} style={{ marginTop: 28 }} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { padding: 24, paddingBottom: 48, alignItems: 'stretch' },
  liveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 },
  liveLabel: { fontFamily: fonts.bodySemibold, fontSize: 13, color: theme.ink, letterSpacing: 0.5 },
  expired: { padding: 60, alignItems: 'center', alignSelf: 'center' },
  expiredText: { fontSize: 16, fontFamily: fonts.bodyMedium },
  rotateHint: { textAlign: 'center', color: theme.muted, fontSize: 12, marginTop: 16 },
  counter: { marginTop: 24, padding: 20, alignItems: 'center' },
  countNum: { fontSize: 40, color: theme.white },
  countLabel: { fontFamily: fonts.bodyMedium, marginTop: 2, color: theme.white },
  presentList: { marginTop: 20, gap: 10 },
  presentRow: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  presentName: { fontFamily: fonts.bodyMedium },
  presentTime: { fontSize: 13, color: theme.muted },
});
