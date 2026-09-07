import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BauhausCard, BauhausButton, BauhausHeader, BauhausText, fonts, theme } from '../../../../components/BauhausCard';
import { api, ApiError } from '../../../../lib/api';
import { QRPayload, ScanResult } from '../../../../lib/types';
import { SPACING } from '../../../../lib/theme';

export default function ClassScan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scanLockRef = useRef(false); // prevents duplicate rapid scans (§10)

  async function onScanned(data: string) {
    if (scanLockRef.current || busy) return;
    scanLockRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const payload = JSON.parse(data) as QRPayload;
      if (!payload.session_id || !payload.token) {
        throw new Error('That’s not a valid attendance QR.');
      }
      // classId is sent so the server rejects a QR from a different class (§10).
      const res = await api.post<ScanResult>('/sessions/scan', {
        sessionId: payload.session_id,
        token: payload.token,
        classId: id,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(res);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // ApiError carries a human `reason`/`message`; JSON.parse errors get a generic one.
      const msg = e instanceof ApiError ? e.message : e?.message ?? 'Could not read that code.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function scanAgain() {
    scanLockRef.current = false;
    setResult(null);
    setError(null);
  }

  // --- Permission gates (§10) ---
  if (!permission) {
    return <View style={styles.center} />;
  }
  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <View style={[styles.center, { paddingTop: insets.top + SPACING.lg, paddingBottom: insets.bottom + SPACING.lg }]}>
        <BauhausText style={styles.info}>
          {blocked
            ? 'Camera access is turned off. Enable it in Settings to scan attendance QR codes.'
            : 'Camera access is needed to scan attendance QR codes.'}
        </BauhausText>
        {blocked ? (
          <BauhausButton label="Open Settings" onPress={() => void Linking.openSettings()} />
        ) : (
          <BauhausButton label="Grant Camera Access" onPress={requestPermission} />
        )}
        <BauhausButton label="Back" color={theme.white} onPress={() => router.back()} />
      </View>
    );
  }

  // --- Result state ---
  if (result?.success) {
    const time = result.markedAt ? new Date(result.markedAt).toLocaleTimeString() : '';
    return (
      <View style={[styles.center, { paddingTop: insets.top + SPACING.lg, paddingBottom: insets.bottom + SPACING.lg }]}>
        <BauhausCard color={theme.present} style={styles.resultCard}>
          <BauhausHeader style={styles.check}>✓</BauhausHeader>
          <BauhausHeader style={styles.resultTitle}>{result.already ? 'Already Marked' : 'Marked Present'}</BauhausHeader>
          <BauhausText style={styles.resultSub}>
            {result.className}
            {time ? ` · ${time}` : ''}
          </BauhausText>
        </BauhausCard>
        <BauhausButton label="Scan Again" color={theme.white} onPress={scanAgain} style={{ marginTop: SPACING.lg }} />
        <BauhausButton label="Done" onPress={() => router.back()} style={{ marginTop: SPACING.sm }} />
      </View>
    );
  }

  // --- Camera state ---
  return (
    <View style={styles.flex}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={busy ? undefined : (r: BarcodeScanningResult) => onScanned(r.data)}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.frame} />
        <BauhausText style={styles.camHint}>Point the camera at the attendance QR</BauhausText>

        {error ? (
          <View style={[styles.errorWrap, { bottom: insets.bottom + SPACING.xl }]}>
            <BauhausCard color={theme.absent} style={styles.errorCard}>
              <BauhausText style={styles.errorText}>{error}</BauhausText>
            </BauhausCard>
            <BauhausButton label="Try Again" color={theme.white} onPress={scanAgain} style={{ marginTop: SPACING.sm }} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.md },
  info: { fontSize: 16, textAlign: 'center' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  frame: { width: 240, height: 240, borderWidth: 4, borderColor: theme.primary, borderRadius: 24, backgroundColor: 'transparent' },
  camHint: { color: '#fff', marginTop: SPACING.lg, fontFamily: fonts.bodySemibold, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4 },
  resultCard: { padding: SPACING.xl, alignItems: 'center' },
  check: { fontSize: 56, color: theme.white },
  resultTitle: { fontSize: 22, marginTop: SPACING.sm, color: theme.white },
  resultSub: { marginTop: SPACING.xs, textAlign: 'center', color: theme.white, opacity: 0.9 },
  errorWrap: { position: 'absolute', left: SPACING.lg, right: SPACING.lg },
  errorCard: { padding: SPACING.lg, alignItems: 'center' },
  errorText: { color: theme.white, textAlign: 'center', fontFamily: fonts.bodySemibold },
});
