import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { BauhausButton, BauhausCard, BauhausHeader, BauhausText, fonts, theme } from './BauhausCard';
import { COLORS, SPACING } from '../lib/theme';

/**
 * Cross-platform confirmation dialog (§8/§10).
 *
 * WHY THIS EXISTS: `Alert.alert` with more than one button is a no-op on
 * react-native-web — the button callbacks never fire — and on Android an Alert
 * shown while a Modal is still dismissing can be dropped. That silently broke
 * every "confirm → do it" action (Sign Out, End Session, Delete Account, …).
 * This dialog is a real in-app RN Modal, so its buttons work identically on web,
 * iOS and Android.
 *
 * USAGE:
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: 'End session?', message: '…',
 *                              confirmLabel: 'End Session', destructive: true });
 *   if (ok) await endSession();
 */
export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean; // renders the confirm button in the danger colour
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

/** Returns an async confirm() that resolves true (confirmed) or false (cancelled). */
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpts(options);
    });
  }, []);

  // Close the dialog and settle the pending promise exactly once.
  const close = useCallback((result: boolean) => {
    setOpts(null);
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(result);
  }, []);

  const visible = opts !== null;
  const confirmLabel = opts?.confirmLabel ?? 'Confirm';
  const cancelLabel = opts?.cancelLabel ?? 'Cancel';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => close(false)}
      >
        <View style={styles.root}>
          {/* Tap-outside to cancel. Rendered behind the card so card taps don't reach it. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => close(false)}
            accessibilityLabel="Dismiss dialog"
          />
          <BauhausCard color={COLORS.white} style={styles.card}>
            {opts ? <BauhausHeader style={styles.title}>{opts.title}</BauhausHeader> : null}
            {opts?.message ? <BauhausText style={styles.message}>{opts.message}</BauhausText> : null}
            <BauhausButton
              label={confirmLabel}
              color={opts?.destructive ? theme.red : theme.blue}
              onPress={() => close(true)}
              style={{ marginTop: SPACING.lg }}
            />
            <BauhausButton
              label={cancelLabel}
              color={theme.white}
              onPress={() => close(false)}
              style={{ marginTop: SPACING.sm }}
            />
          </BauhausCard>
        </View>
      </Modal>
    </ConfirmContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    backgroundColor: 'rgba(26,26,46,0.45)', // dim ink backdrop
  },
  card: { width: '100%', maxWidth: 380, padding: SPACING.lg },
  title: { fontSize: 22, color: theme.ink },
  message: { marginTop: SPACING.sm, lineHeight: 21, color: theme.ink, opacity: 0.8, fontFamily: fonts.body },
});

export default ConfirmProvider;
