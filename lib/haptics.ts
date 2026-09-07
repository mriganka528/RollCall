// Centralised haptic feedback (§13). One import, semantic names, fire-and-forget.
// Every call is safe to invoke without awaiting; on platforms/devices without a
// haptic engine the underlying expo-haptics calls no-op quietly.
import * as Haptics from 'expo-haptics';

export const haptics = {
  /** Light tick — selections, taps, opening a sheet. */
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  /** Medium tap — primary button presses. */
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  /** Heavy thud — significant/irreversible confirmations. */
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  /** Success buzz — a create/save/mark completed. */
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  /** Warning buzz — a destructive prompt, an at-risk state. */
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  /** Error buzz — a failed request or validation error. */
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  /** Selection change — toggles, segmented controls, pickers. */
  selection: () => Haptics.selectionAsync(),
};

export default haptics;
