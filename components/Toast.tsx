import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BauhausCard, BauhausText, fonts, textOn } from './BauhausCard';
import { COLORS, SPACING } from '../lib/theme';
import { haptics } from '../lib/haptics';

type ToastType = 'success' | 'error' | 'info';
interface ToastState {
  message: string;
  type: ToastType;
}
interface ToastContextValue {
  show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

/** useToast().show('Attendance marked', 'success') — passive banners only (§13). */
export function useToast() {
  return useContext(ToastContext);
}

/**
 * ToastProvider — mounts once at the app root. Renders a single bottom-anchored
 * Bauhaus banner that auto-dismisses after ~2.5s (§13). Reserve Alert.alert
 * for confirmations (§8/§10); use toasts for passive success/error messages.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback(
    (message: string, type: ToastType = 'info') => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      // Every toast carries a matching haptic so passive events are also *felt*
      // (§13) — success buzzes, error buzzes harder, info is a light tick.
      if (type === 'success') haptics.success();
      else if (type === 'error') haptics.error();
      else haptics.light();
      setToast({ message, type });
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(
          ({ finished }) => finished && setToast(null)
        );
      }, 2500);
    },
    [opacity]
  );

  // Clear the pending dismiss timer on unmount (§13: no dangling timers).
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  // success → green, error → red, info → ink. Each is a flat filled card; text
  // color adapts for contrast via textOn().
  const bg =
    toast?.type === 'success' ? COLORS.green : toast?.type === 'error' ? COLORS.red : COLORS.ink;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[styles.wrap, { opacity, bottom: insets.bottom + SPACING.lg }]}
        >
          <BauhausCard color={bg} style={styles.card}>
            <BauhausText style={[styles.text, { color: textOn(bg) }]}>{toast.message}</BauhausText>
          </BauhausCard>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: SPACING.md, right: SPACING.md, alignItems: 'stretch' },
  card: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.md },
  text: { fontFamily: fonts.bodyMedium, fontSize: 15, textAlign: 'center' },
});

export default ToastProvider;
