// ROLLCALL design tokens — the single source of truth (§5).
// Every screen imports SPACING / RADIUS / COLORS from here; nobody hardcodes
// a pixel number or a hex colour. Chart & multi-column widths are derived from
// useWindowDimensions() at the screen level, never hardcoded (see §5 rules).

export const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

// Softened, rounded corners (was a sharp 2 / 4 / 6). Friendly but not fully
// pill; `pill` is available for chips/badges that should read as fully rounded.
export const RADIUS = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

// A soft, reusable card shadow so rounded surfaces read as gently lifted rather
// than flat outlines. Cross-platform: iOS uses the shadow* keys, Android uses
// elevation. Kept subtle on purpose — depth, not drama.
export const SHADOW = {
  shadowColor: '#3B3560',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 3,
} as const;

// ROLLCALL palette — a warmer, multi-colour scheme built around the brand
// triad from the app icon (navy / red / yellow) with an extended set of
// accent colours + soft pastel tints for a friendlier, more colourful UI.
//
// The semantic names (blue/red/yellow/green/…) are canonical; the alias names
// (accent/success/danger/info) are kept so the many existing `COLORS.accent` /
// `theme.present` call sites keep resolving without a rewrite.
export const COLORS = {
  // ---- brand triad (lightened into a soft pastel scheme) ----
  ink: '#2C2A3D', // text & strong marks — a soft near-black with a gentle violet cast (still high-contrast on light surfaces)
  blue: '#4B63D4', // primary — a friendlier, lighter indigo (was dark navy); still holds white label text
  red: '#E24A6A', // danger / absent — a soft rose-red
  yellow: '#F5C64B', // accent — live / pending / highlight
  bg: '#F4F3FB', // page background — a soft lavender paper: airy and light
  white: '#FFFFFF', // card surfaces
  muted: '#7A7A8E', // secondary text
  line: '#E7E4F2', // hairline borders — a soft lavender-grey (replaces heavy dark-ink borders)

  // ---- extended multi-colour palette (category variety, tiles, doodles) ----
  green: '#2FA268', // presence / success — a real, intuitive green
  teal: '#17A29A',
  violet: '#7A5AD6',
  orange: '#F2903A',
  pink: '#EA6AA6',
  sky: '#4FA3DA',

  // ---- soft pastel tints (card backgrounds, subtle fills) ----
  blueTint: '#EAEDFB',
  greenTint: '#E5F5ED',
  yellowTint: '#FCF4DA',
  redTint: '#FCE7EC',
  violetTint: '#EFEAFB',
  orangeTint: '#FCEEDD',
  tealTint: '#E1F4F1',

  // ---- back-compat aliases (map onto the palette above) ----
  accent: '#F5C64B', // pastel yellow
  success: '#2FA268', // success reads as a friendly green
  danger: '#E24A6A',
  info: '#4B63D4',
} as const;

// Rotating accent colours for category variety — e.g. giving each class card a
// stable-but-different colour. Use `accentFor(key)` for a deterministic pick.
export const ACCENTS = [
  COLORS.blue,
  COLORS.green,
  COLORS.violet,
  COLORS.orange,
  COLORS.teal,
  COLORS.pink,
  COLORS.sky,
] as const;

// Matching soft tint for each accent (same index order as ACCENTS).
export const ACCENT_TINTS = [
  COLORS.blueTint,
  COLORS.greenTint,
  COLORS.violetTint,
  COLORS.orangeTint,
  COLORS.tealTint,
  COLORS.redTint,
  COLORS.blueTint,
] as const;

// Deterministically map any string (a class id/name) to a stable accent colour
// so the same class always gets the same colour across screens & reloads.
export function accentFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

// The soft tint that pairs with `accentFor(key)`.
export function accentTintFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ACCENT_TINTS[h % ACCENT_TINTS.length];
}

// Attendance "at risk" threshold (§11) — anyone below this shows in danger colour.
export const AT_RISK_BELOW = 75;
