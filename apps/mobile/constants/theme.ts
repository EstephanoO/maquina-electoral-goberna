/**
 * Design tokens centralizados para mobile.
 *
 * Importar SIEMPRE desde acá en vez de hardcodear hex/sizes en cada screen:
 *   import { Brand, Neutral, Status, Spacing, Typography } from '@/constants/theme';
 *
 * Cualquier color/spacing/tipo que aparezca repetido en ≥ 2 screens vive acá.
 * Si necesitás algo nuevo, agregalo acá primero, no inline.
 */

import { Platform, type TextStyle } from 'react-native';

// ─── Brand (identidad Goberna) ──────────────────────────────────
export const Brand = {
  /** Azul Goberna — primary action, headings, logo background */
  blue: '#163960',
  /** Amarillo Goberna — accent, CTAs secundarios, logo letter */
  yellow: '#FFC800',
  /** Verde WhatsApp — solo botones/badges del flow OTP */
  whatsapp: '#25D366',
} as const;

// ─── Neutrals (grises + bg) ─────────────────────────────────────
// Escala slate de Tailwind, alineada con web para consistencia cross-platform.
export const Neutral = {
  white: '#FFFFFF',
  /** Background sutil de inputs / cards */
  bg: '#F8FAFC',         // slate-50
  /** Background neutro de chips/tags */
  bgMuted: '#F1F5F9',    // slate-100
  /** Borders por defecto */
  border: '#E1E6F0',
  /** Border al hacer focus */
  borderFocus: '#4A8AC4',
  /** Borders muy sutiles (separadores) */
  borderSoft: '#E2E8F0', // slate-200
  /** Icons disabled / placeholders */
  iconMuted: '#CBD5E1',  // slate-300
  /** Texto muted secundario (≈ rgba(22,57,96,0.5) usado antes) */
  textMuted: '#94A3B8',  // slate-400
  /** Texto secundario más legible */
  textSecondary: '#64748B', // slate-500
  /** Texto principal — siempre Brand.blue, alias para legibilidad */
  textPrimary: '#163960',
  /** Texto sobre fondos oscuros */
  textOnDark: '#1E293B', // slate-800
} as const;

// ─── Status (semantic) ──────────────────────────────────────────
export const Status = {
  success: '#22C55E',
  successBg: '#F0FDF4',
  warning: '#F59E0B',
  danger: '#DC2626',
  dangerBg: '#FEE2E2',
  info: '#3B82F6',
} as const;

// ─── Medals (ranking) ───────────────────────────────────────────
export const Medal = {
  gold: '#FBBF24',
  silver: '#94A3B8',
  bronze: '#D97706',
} as const;

// ─── Spacing scale (8pt base) ───────────────────────────────────
// Usá estos en padding/margin/gap en vez de números mágicos.
export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

// ─── Radius ─────────────────────────────────────────────────────
export const Radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  pill: 9999,
} as const;

// ─── Font families ──────────────────────────────────────────────
export const FontFamily = {
  bold: 'Montserrat-Bold',
  regular: 'Montserrat-Regular',
} as const;

// ─── Typography scale ───────────────────────────────────────────
// Cada entrada es un TextStyle base (fontSize + family + lineHeight).
// Usalo con `style={Typography.h1}` o spreadeá: `style={{ ...Typography.body, color: Brand.blue }}`.
export const Typography = {
  h1: {
    fontSize: 28,
    fontFamily: FontFamily.bold,
    lineHeight: 36,
    letterSpacing: 1,
  },
  h2: {
    fontSize: 22,
    fontFamily: FontFamily.bold,
    lineHeight: 28,
  },
  h3: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
    lineHeight: 24,
  },
  body: {
    fontSize: 16,
    fontFamily: FontFamily.regular,
    lineHeight: 22,
  },
  bodyBold: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
  },
  /** Label uppercase de form fields, tabs */
  label: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  helper: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    lineHeight: 16,
  },
  /** Para códigos OTP, números grandes con letterSpacing */
  display: {
    fontSize: 28,
    fontFamily: FontFamily.bold,
    letterSpacing: 8,
  },
} satisfies Record<string, TextStyle>;

// ─── Shadows ────────────────────────────────────────────────────
// Plat-aware: iOS usa shadowOpacity, Android usa elevation. Spreadeá en style.
export const Shadow = {
  sm: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2 },
    android: { elevation: 1 },
    default: {},
  }),
  md: Platform.select({
    ios: { shadowColor: Brand.blue, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 },
    android: { elevation: 3 },
    default: {},
  }),
  lg: Platform.select({
    ios: { shadowColor: Brand.blue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
    android: { elevation: 6 },
    default: {},
  }),
} as const;

// ─── Backwards compat (Expo template defaults) ──────────────────
// No se usa activamente pero por si Expo Router o algún plugin lo espera.
const tintColorLight = Brand.blue;
const tintColorDark = Brand.yellow;

export const Colors = {
  light: {
    text: Brand.blue,
    background: Neutral.white,
    tint: tintColorLight,
    icon: Brand.blue,
    tabIconDefault: Brand.blue,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: Neutral.white,
    background: Brand.blue,
    tint: tintColorDark,
    icon: Brand.yellow,
    tabIconDefault: Brand.yellow,
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: { sans: FontFamily.bold, serif: FontFamily.bold, rounded: FontFamily.bold, mono: FontFamily.bold },
  default: { sans: FontFamily.bold, serif: FontFamily.bold, rounded: FontFamily.bold, mono: FontFamily.bold },
  web: {
    sans: "'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    serif: "'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    rounded: "'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
});
