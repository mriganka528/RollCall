import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOW } from '../lib/theme';

// ---- ROLLCALL palette ----
// Sourced from lib/theme.ts (single source of truth). Now a warmer, multi-colour
// scheme: the brand triad (blue/red/yellow) plus extended accents (green/teal/
// violet/orange/pink/sky) and soft pastel tints. The alias names
// (primary/present/absent/info) are kept so existing screens keep resolving.
export const theme = {
  ink: COLORS.ink,
  bg: COLORS.bg,
  white: COLORS.white,
  blue: COLORS.blue,
  red: COLORS.red,
  yellow: COLORS.yellow,
  muted: COLORS.muted,
  // extended multi-colour palette
  green: COLORS.green,
  teal: COLORS.teal,
  violet: COLORS.violet,
  orange: COLORS.orange,
  pink: COLORS.pink,
  sky: COLORS.sky,
  // soft tints for pastel card backgrounds
  blueTint: COLORS.blueTint,
  greenTint: COLORS.greenTint,
  yellowTint: COLORS.yellowTint,
  redTint: COLORS.redTint,
  violetTint: COLORS.violetTint,
  orangeTint: COLORS.orangeTint,
  tealTint: COLORS.tealTint,
  // back-compat aliases
  primary: COLORS.blue, // primary is blue
  present: COLORS.blue, // "present" reads via a blue circle (kept for stability)
  absent: COLORS.red,
  success: COLORS.green, // success now reads as a friendly green
  info: COLORS.blue,
  radius: RADIUS.md,
};

export const fonts = {
  header: 'ArchivoBlack',
  body: 'Poppins',
  bodyMedium: 'PoppinsMedium',
  bodySemibold: 'PoppinsSemiBold',
};

/**
 * Pick ink or white text for legibility on a given fill. Bauhaus fills are
 * flat and few, so a simple relative-luminance test is plenty: dark fills
 * (blue, red, ink) get white text; light fills (yellow, white, bg) get ink.
 */
export function textOn(fill: string): string {
  const hex = fill.replace('#', '');
  if (hex.length !== 6) return theme.ink;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.6 ? COLORS.white : COLORS.ink;
}

interface BauhausCardProps {
  children?: React.ReactNode;
  color?: string; // fill
  borderColor?: string; // defaults to ink; pass a category color for tinted cards
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  // When true, no soft shadow is drawn (used for inputs and inline chips where a
  // lifted look is undesirable). Default surfaces are gently elevated.
  flat?: boolean;
  // Accepted but intentionally ignored — the old neobrutalist props. Keeping
  // them in the type means existing call sites compile untouched during the
  // sweep; there is no offset/hard-shadow/rotation to draw in this design.
  offset?: number;
  shadowColor?: string;
  rotate?: number;
}

/**
 * BauhausCard — the single rounded surface primitive.
 * A bordered rounded rectangle: hairline border, softly rounded corners, and a
 * gentle drop shadow for depth (unless `flat`). When `onPress` is provided it
 * becomes a button: a quick scale-dip (0.97, ~100ms) on press-in plus a medium
 * haptic tick.
 */
export function BauhausCard({
  children,
  color = theme.white,
  borderColor = theme.ink,
  borderRadius = RADIUS.md,
  style,
  onPress,
  disabled = false,
  fullWidth = false,
  flat = false,
}: BauhausCardProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const dip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(scale, { toValue: 0.97, duration: 100, useNativeDriver: true }).start();
  };
  const rise = () => {
    Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }).start();
  };

  const card = (
    <Animated.View
      style={[
        {
          backgroundColor: color,
          borderColor,
          borderWidth: 1.25,
          borderRadius,
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale }],
        },
        flat ? undefined : SHADOW,
        fullWidth ? { alignSelf: 'stretch' } : undefined,
        style,
      ]}
    >
      {children}
    </Animated.View>
  );

  if (!onPress) return card;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={disabled ? undefined : dip}
      onPressOut={disabled ? undefined : rise}
      disabled={disabled}
      style={fullWidth ? { alignSelf: 'stretch' } : undefined}
    >
      {card}
    </Pressable>
  );
}

/** Solid color-filled button. Primary = blue, destructive = red, live = yellow. */
export function BauhausButton({
  label,
  onPress,
  color = theme.blue,
  disabled = false,
  fullWidth = true,
  style,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <BauhausCard color={color} onPress={onPress} disabled={disabled} fullWidth={fullWidth} style={[btn.card, style]}>
      <Text style={[btn.label, { color: textOn(color) }]}>{label}</Text>
    </BauhausCard>
  );
}

/** White input, hairline border, rounded corners (flat — no lift). When
 * `secureTextEntry` is set it grows an eye toggle on the right so the user can
 * peek at what they typed; tapping it fires a light haptic. */
export function BauhausInput(props: TextInputProps & { containerStyle?: StyleProp<ViewStyle> }) {
  const { containerStyle, style, secureTextEntry, ...rest } = props;
  const isPassword = !!secureTextEntry;
  const [hidden, setHidden] = React.useState(true);

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHidden((h) => !h);
  };

  return (
    <BauhausCard color={theme.white} flat fullWidth style={[input.wrap, containerStyle as any]}>
      <View style={input.row}>
        <TextInput
          placeholderTextColor={theme.muted}
          {...rest}
          secureTextEntry={isPassword ? hidden : false}
          style={[input.field, input.fieldFlex, style]}
        />
        {isPassword && (
          <Pressable
            onPress={toggle}
            hitSlop={10}
            style={input.eye}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={theme.muted} />
          </Pressable>
        )}
      </View>
    </BauhausCard>
  );
}

/** Archivo Black header — sentence case (Bauhaus doesn't shout). */
export function BauhausHeader({ children, style, ...rest }: TextProps & { children: React.ReactNode }) {
  return (
    <Text {...rest} style={[header.text, style]}>
      {children}
    </Text>
  );
}

/** Poppins body text. */
export function BauhausText({ children, style, ...rest }: TextProps & { children: React.ReactNode }) {
  return (
    <Text {...rest} style={[body.text, style]}>
      {children}
    </Text>
  );
}

// ---- Shape language (§Part 2) --------------------------------------------
// Small solid instances used as STATUS indicators next to text, never as
// background decoration:
//   • Circle   = presence / success   (present tag, scan success, live pulse)
//   • Square   = a class / container  (class cards, roster row markers)
//   • Triangle = pending / attention  (about-to-expire, below-threshold)

export function Circle({ size = 14, color = theme.blue, style }: { size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

export function Square({ size = 14, color = theme.ink, style }: { size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: size, height: size, borderRadius: 4, backgroundColor: color }, style]} />;
}

export function Triangle({ size = 14, color = theme.yellow, style }: { size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  // CSS-triangle trick: a zero-size box with transparent side borders and one
  // solid bottom border renders an upward triangle.
  return (
    <View
      style={[
        {
          width: 0,
          height: 0,
          borderLeftWidth: size / 2,
          borderRightWidth: size / 2,
          borderBottomWidth: size,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
          backgroundColor: 'transparent',
        },
        style,
      ]}
    />
  );
}

const btn = StyleSheet.create({
  card: { paddingVertical: 15, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 16, fontFamily: fonts.header, letterSpacing: 0.3 },
});

const input = StyleSheet.create({
  wrap: { paddingHorizontal: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  field: { paddingVertical: 14, paddingHorizontal: 14, fontSize: 16, color: COLORS.ink, fontFamily: fonts.body },
  fieldFlex: { flex: 1 },
  eye: { paddingHorizontal: 14, paddingVertical: 14 },
});

const header = StyleSheet.create({
  text: { fontFamily: fonts.header, color: COLORS.ink, fontSize: 28 },
});

const body = StyleSheet.create({
  text: { fontFamily: fonts.body, color: COLORS.ink, fontSize: 15 },
});

// ---- Deprecated neobrutalist aliases -------------------------------------
// The app is being swept from Brutal* → Bauhaus* names. These aliases keep any
// not-yet-swept screen compiling and rendering with the new flat look. Prefer
// the Bauhaus* names in new/edited code.
export const BrutalBlock = BauhausCard;
export const BrutalButton = BauhausButton;
export const BrutalInput = BauhausInput;
export const BrutalHeader = BauhausHeader;
export const BrutalText = BauhausText;
