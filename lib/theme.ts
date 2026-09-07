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
  shadowColor: '#1A1A2E',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.1,
  shadowRadius: 14,
  elevation: 4,
} as const;

// ROLLCALL palette — a warmer, multi-colour scheme built around the brand
// triad from the app icon (navy / red / yellow) with an extended set of
// accent colours + soft pastel tints for a friendlier, more colourful UI.
//
// The semantic names (blue/red/yellow/green/…) are canonical; the alias names
// (accent/success/danger/info) are kept so the many existing `COLORS.accent` /
// `theme.present` call sites keep resolving without a rewrite.
export const COLORS = {
  // ---- brand triad (matches the app icon) ----
  ink: '#1A1A2E', // text, primary borders (a soft near-black, slight blue cast)
  blue: '#1D3F72', // primary — buttons, active states, headers
  red: '#E23E57', // danger / absent / destructive (warm, slightly brighter red)
  yellow: '#F4C430', // accent — live / pending / highlight
  bg: '#F6F7FB', // page background — a soft cool white
  white: '#FFFFFF', // card surfaces
  muted: '#6B6B78', // secondary text

  // ---- extended multi-colour palette (category variety, tiles, shapes) ----
  green: '#2E9E5B', // presence / success — a real, intuitive green
  teal: '#149A8C',
  violet: '#6C4AB6',
  orange: '#F08A24',
  pink: '#E85D9A',
  sky: '#3E92CC',

  // ---- soft pastel tints (card backgrounds, subtle fills) ----
  blueTint: '#E8EEF9',
  greenTint: '#E3F4EA',
  yellowTint: '#FCF3D6',
  redTint: '#FCE6EA',
  violetTint: '#EDE8F7',
  orangeTint: '#FCEEDD',
  tealTint: '#DFF3F0',

  // ---- back-compat aliases (map onto the palette above) ----
  accent: '#F4C430', // Bauhaus yellow
  success: '#2E9E5B', // success now reads as a friendly green (was blue)
  danger: '#E23E57',
  info: '#1D3F72',
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
