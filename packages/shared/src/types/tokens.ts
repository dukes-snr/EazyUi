// ============================================================================
// Design Tokens - Color palette, typography, spacing, radius, shadows
// ============================================================================

import { z } from 'zod';

// Color Palette Schema
export const ColorPaletteSchema = z.object({
    primary: z.string().describe('Primary brand color'),
    primaryLight: z.string().describe('Lighter primary variant'),
    primaryDark: z.string().describe('Darker primary variant'),
    secondary: z.string().describe('Secondary accent color'),
    secondaryLight: z.string().describe('Lighter secondary variant'),
    secondaryDark: z.string().describe('Darker secondary variant'),
    background: z.string().describe('Main background color'),
    surface: z.string().describe('Surface/card background color'),
    surfaceHover: z.string().describe('Surface hover state'),
    text: z.string().describe('Primary text color'),
    textMuted: z.string().describe('Secondary/muted text color'),
    textInverse: z.string().describe('Text on dark backgrounds'),
    border: z.string().describe('Border color'),
    borderLight: z.string().describe('Light border variant'),
    success: z.string().describe('Success/positive color'),
    warning: z.string().describe('Warning color'),
    error: z.string().describe('Error/danger color'),
    info: z.string().describe('Info color'),
});

export type ColorPalette = z.infer<typeof ColorPaletteSchema>;

// Typography Style Schema
export const TypographyStyleSchema = z.object({
    fontFamily: z.string(),
    fontSize: z.number(),
    fontWeight: z.union([z.number(), z.enum(['normal', 'bold', 'light', 'medium', 'semibold'])]),
    lineHeight: z.number().optional(),
    letterSpacing: z.number().optional(),
});

export type TypographyStyle = z.infer<typeof TypographyStyleSchema>;

// Typography Scale Schema
export const TypographyScaleSchema = z.object({
    displayLarge: TypographyStyleSchema,
    displayMedium: TypographyStyleSchema,
    displaySmall: TypographyStyleSchema,
    headingLarge: TypographyStyleSchema,
    headingMedium: TypographyStyleSchema,
    headingSmall: TypographyStyleSchema,
    bodyLarge: TypographyStyleSchema,
    bodyMedium: TypographyStyleSchema,
    bodySmall: TypographyStyleSchema,
    caption: TypographyStyleSchema,
    label: TypographyStyleSchema,
});

export type TypographyScale = z.infer<typeof TypographyScaleSchema>;

// Spacing Scale Schema
export const SpacingScaleSchema = z.object({
    xxs: z.number().describe('Extra extra small: 2px'),
    xs: z.number().describe('Extra small: 4px'),
    sm: z.number().describe('Small: 8px'),
    md: z.number().describe('Medium: 16px'),
    lg: z.number().describe('Large: 24px'),
    xl: z.number().describe('Extra large: 32px'),
    xxl: z.number().describe('Extra extra large: 48px'),
    xxxl: z.number().describe('Extra extra extra large: 64px'),
});

export type SpacingScale = z.infer<typeof SpacingScaleSchema>;

// Radius Scale Schema
export const RadiusScaleSchema = z.object({
    none: z.number().describe('No radius: 0'),
    xs: z.number().describe('Extra small: 2px'),
    sm: z.number().describe('Small: 4px'),
    md: z.number().describe('Medium: 8px'),
    lg: z.number().describe('Large: 12px'),
    xl: z.number().describe('Extra large: 16px'),
    xxl: z.number().describe('Extra extra large: 24px'),
    full: z.number().describe('Full/Pill: 9999px'),
});

export type RadiusScale = z.infer<typeof RadiusScaleSchema>;

// Shadow Preset Schema
export const ShadowPresetSchema = z.object({
    offsetX: z.number(),
    offsetY: z.number(),
    blur: z.number(),
    spread: z.number(),
    color: z.string(),
});

export type ShadowPreset = z.infer<typeof ShadowPresetSchema>;

// Shadow Scale Schema
export const ShadowScaleSchema = z.object({
    none: ShadowPresetSchema,
    sm: ShadowPresetSchema,
    md: ShadowPresetSchema,
    lg: ShadowPresetSchema,
    xl: ShadowPresetSchema,
});

export type ShadowScale = z.infer<typeof ShadowScaleSchema>;

// Density Level
export const DensityLevelSchema = z.enum(['compact', 'default', 'comfortable']);
export type DensityLevel = z.infer<typeof DensityLevelSchema>;

// Complete Design Tokens Schema
export const DesignTokensSchema = z.object({
    colors: ColorPaletteSchema,
    typography: TypographyScaleSchema,
    spacing: SpacingScaleSchema,
    radius: RadiusScaleSchema,
    shadows: ShadowScaleSchema,
    density: DensityLevelSchema,
});

export type DesignTokens = z.infer<typeof DesignTokensSchema>;

// Default tokens for initialization
export const defaultTokens: DesignTokens = {
    colors: {
        primary: '#6366F1',
        primaryLight: '#818CF8',
        primaryDark: '#4F46E5',
        secondary: '#8B5CF6',
        secondaryLight: '#A78BFA',
        secondaryDark: '#7C3AED',
        background: '#0F172A',
        surface: '#1E293B',
        surfaceHover: '#334155',
        text: '#F8FAFC',
        textMuted: '#94A3B8',
        textInverse: '#0F172A',
        border: '#334155',
        borderLight: '#475569',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
    },
    typography: {
        displayLarge: { fontFamily: 'Inter', fontSize: 48, fontWeight: 700, lineHeight: 1.1 },
        displayMedium: { fontFamily: 'Inter', fontSize: 36, fontWeight: 700, lineHeight: 1.15 },
        displaySmall: { fontFamily: 'Inter', fontSize: 28, fontWeight: 600, lineHeight: 1.2 },
        headingLarge: { fontFamily: 'Inter', fontSize: 24, fontWeight: 600, lineHeight: 1.25 },
        headingMedium: { fontFamily: 'Inter', fontSize: 20, fontWeight: 600, lineHeight: 1.3 },
        headingSmall: { fontFamily: 'Inter', fontSize: 16, fontWeight: 600, lineHeight: 1.35 },
        bodyLarge: { fontFamily: 'Inter', fontSize: 18, fontWeight: 400, lineHeight: 1.5 },
        bodyMedium: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.5 },
        bodySmall: { fontFamily: 'Inter', fontSize: 14, fontWeight: 400, lineHeight: 1.5 },
        caption: { fontFamily: 'Inter', fontSize: 12, fontWeight: 400, lineHeight: 1.4 },
        label: { fontFamily: 'Inter', fontSize: 14, fontWeight: 500, lineHeight: 1.4 },
    },
    spacing: {
        xxs: 2,
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
        xxl: 48,
        xxxl: 64,
    },
    radius: {
        none: 0,
        xs: 2,
        sm: 4,
        md: 8,
        lg: 12,
        xl: 16,
        xxl: 24,
        full: 9999,
    },
    shadows: {
        none: { offsetX: 0, offsetY: 0, blur: 0, spread: 0, color: 'rgba(0,0,0,0)' },
        sm: { offsetX: 0, offsetY: 1, blur: 2, spread: 0, color: 'rgba(0,0,0,0.05)' },
        md: { offsetX: 0, offsetY: 4, blur: 6, spread: -1, color: 'rgba(0,0,0,0.1)' },
        lg: { offsetX: 0, offsetY: 10, blur: 15, spread: -3, color: 'rgba(0,0,0,0.15)' },
        xl: { offsetX: 0, offsetY: 20, blur: 25, spread: -5, color: 'rgba(0,0,0,0.2)' },
    },
    density: 'default',
};
