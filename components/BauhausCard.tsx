import React, { useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Path, Circle as SvgCircle, Rect as SvgRect } from 'react-native-svg';
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
  line: COLORS.line, // soft hairline border (pastel reskin) — replaces heavy ink borders
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
  borderColor = theme.line,
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

// ---- Background decoration: doodle wallpaper -----------------------------
// A full-bleed, non-interactive "wallpaper" of small hand-drawn doodles — a mix
// of school/attendance motifs (pencil, book, cap, clock, calendar, QR, ruler,
// bulb, star, check, smiley, paperclip) and light geometric marks (ring,
// square, triangle, plus, wave). They tile edge-to-edge on a brick grid, each
// cell getting a deterministically-varied doodle, colour, rotation, size and
// opacity, so it reads as a lively-but-calm pattern (its own motifs, in the
// spirit of a tiled chat wallpaper). Painted over the soft pastel page bg.
//
// Usage is unchanged: make it the FIRST child of a `flex: 1` root View and give
// the real content container a `transparent` background so the doodles show
// through behind the cards:
//
//   <View style={{ flex: 1 }}>
//     <BauhausBackdrop />
//     <ScrollView contentContainerStyle={{ backgroundColor: 'transparent' }}>…
//
// `pointerEvents="none"` means it never eats touches and it renders no text, so
// it's inert for screen readers.

// Each doodle is authored in a 24×24 box as a list of primitives. `f` marks a
// filled primitive (e.g. a dot); everything else is drawn as a rounded stroke.
type DoodlePrim =
  | { t: 'p'; d: string; f?: boolean }
  | { t: 'c'; cx: number; cy: number; r: number; f?: boolean }
  | { t: 'r'; x: number; y: number; w: number; h: number; rx?: number; f?: boolean };

const DOODLES: DoodlePrim[][] = [
  // — geometric marks —
  [{ t: 'c', cx: 12, cy: 12, r: 8 }], // ring
  [{ t: 'r', x: 4, y: 4, w: 16, h: 16, rx: 3 }], // rounded square
  [{ t: 'p', d: 'M12 4 L20 19 L4 19 Z' }], // triangle
  [{ t: 'p', d: 'M12 5 V19 M5 12 H19' }], // plus
  [{ t: 'p', d: 'M3 14 Q6.5 8 10 14 T17 14' }], // wave
  [{ t: 'p', d: 'M4 13 L10 18.5 L20 6' }], // check
  [{ t: 'p', d: 'M12 3 L14.5 9.2 L21 9.7 L16 13.9 L17.6 20 L12 16.5 L6.4 20 L8 13.9 L3 9.7 L9.5 9.2 Z' }], // star
  // — school / attendance motifs —
  [{ t: 'p', d: 'M3 21 L4.6 16.4 L14.5 6.5 L17.5 9.5 L7.6 19.4 Z' }, { t: 'p', d: 'M12.6 8.4 L15.6 11.4' }], // pencil
  [
    { t: 'p', d: 'M12 6 C9 4 5.5 4 3.5 5 L3.5 18 C5.5 17 9 17 12 19 C15 17 18.5 17 20.5 18 L20.5 5 C18.5 4 15 4 12 6 Z' },
    { t: 'p', d: 'M12 6 L12 19' },
  ], // open book
  [
    { t: 'p', d: 'M12 6 L22 10 L12 14 L2 10 Z' },
    { t: 'p', d: 'M6 11.5 L6 16 C7.5 17.6 16.5 17.6 18 16 L18 11.5' },
    { t: 'p', d: 'M22 10 L22 15' },
  ], // graduation cap
  [{ t: 'c', cx: 12, cy: 12, r: 8 }, { t: 'p', d: 'M12 7.5 L12 12 L15 14' }], // clock
  [
    { t: 'r', x: 4, y: 5, w: 16, h: 15, rx: 2 },
    { t: 'p', d: 'M4 9.5 H20 M8 3 V6 M16 3 V6' },
    { t: 'c', cx: 9, cy: 13.5, r: 1, f: true },
  ], // calendar
  [
    { t: 'r', x: 4, y: 4, w: 7, h: 7, rx: 1 },
    { t: 'r', x: 13, y: 4, w: 7, h: 7, rx: 1 },
    { t: 'r', x: 4, y: 13, w: 7, h: 7, rx: 1 },
    { t: 'r', x: 14.2, y: 14.2, w: 2.4, h: 2.4, f: true },
    { t: 'r', x: 17.6, y: 17.6, w: 2.4, h: 2.4, f: true },
  ], // QR code (a nod to the app)
  [
    { t: 'p', d: 'M8.6 15.4 C5.6 13 6 8.6 9 7 C12 5.3 16 7.2 16 10.3 C16 12.2 14.9 14 13.8 15.4' },
    { t: 'p', d: 'M9 16.6 L14 16.6 M10 19 L13 19' },
  ], // lightbulb
  [
    { t: 'r', x: 2, y: 9, w: 20, h: 6, rx: 1 },
    { t: 'p', d: 'M6 9 V12 M9 9 V11 M12 9 V12 M15 9 V11 M18 9 V12' },
  ], // ruler
  [
    { t: 'c', cx: 12, cy: 12, r: 8 },
    { t: 'c', cx: 9.3, cy: 10, r: 0.9, f: true },
    { t: 'c', cx: 14.7, cy: 10, r: 0.9, f: true },
    { t: 'p', d: 'M8.5 14 C10 16.3 14 16.3 15.5 14' },
  ], // smiley
  [{ t: 'p', d: 'M8 7 L8 16.5 C8 18.4 11 18.4 11 16.5 L11 6.5 C11 4.2 15 4.2 15 6.5 L15 15.5 C15 19 6.5 19 6.5 15.5 L6.5 9.5' }], // paperclip
];

// Faint, colourful doodle inks drawn from the brand palette.
const DOODLE_INKS = [theme.blue, theme.violet, theme.teal, theme.orange, theme.pink, theme.green, theme.sky];

function renderPrims(prims: DoodlePrim[], color: string) {
  return prims.map((p, i) => {
    if (p.t === 'c') return <SvgCircle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.f ? color : 'none'} />;
    if (p.t === 'r') return <SvgRect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx ?? 0} fill={p.f ? color : 'none'} />;
    return <Path key={i} d={p.d} fill={p.f ? color : 'none'} />;
  });
}

export function BauhausBackdrop({ style }: { style?: StyleProp<ViewStyle> }) {
  const { width, height } = useWindowDimensions();

  const cells = useMemo(() => {
    const CELL = 78; // tile size — smaller = denser wallpaper
    const cols = Math.ceil(width / CELL) + 2;
    const rows = Math.ceil(height / CELL) + 2;
    const out: React.ReactNode[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Deterministic per-cell hash → stable across renders, but scattered.
        const n = ((r * 73856093) ^ (c * 19349663)) >>> 0;
        const doodle = DOODLES[n % DOODLES.length];
        const color = DOODLE_INKS[(n >>> 4) % DOODLE_INKS.length];
        const rot = ((n >>> 8) % 30) - 15; // -15°..+14°
        const jx = ((n >>> 13) % 14) - 7; // ±7px jitter
        const jy = ((n >>> 17) % 14) - 7;
        const size = 24 + ((n >>> 21) % 12); // 24..35px
        const opacity = 0.1 + ((n >>> 25) % 8) / 100; // 0.10..0.17
        const s = size / 24;
        // Brick layout: shift every other row half a tile.
        const x = c * CELL + (r % 2 ? CELL / 2 : 0) + jx - CELL;
        const y = r * CELL + jy - CELL;
        out.push(
          <G
            key={`${r}-${c}`}
            x={x}
            y={y}
            scale={s}
            rotation={rot}
            originX={12}
            originY={12}
            stroke={color}
            strokeWidth={1.7 / s}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={opacity}
          >
            {renderPrims(doodle, color)}
          </G>,
        );
      }
    }
    return out;
  }, [width, height]);

  return (
    <View style={[backdrop.fill, style]} pointerEvents="none">
      <Svg width={width} height={height}>
        {cells}
      </Svg>
    </View>
  );
}

const backdrop = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.bg, overflow: 'hidden' },
});

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
