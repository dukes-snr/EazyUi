import { apiClient, type ProjectDesignSystem } from '../api/client';
import { buildFigmaPastePayload } from './htmlToFigmaScene';

type ExportScreen = {
    screenId: string;
    name: string;
    html: string;
    width: number;
    height: number;
    status?: 'streaming' | 'complete';
};

type ExportSelection = {
    selectedBoardId?: string | null;
    selectedNodeIds?: string[];
};

type SelectionScope = 'selected' | 'all';

const textEncoder = new TextEncoder();
const RENDER_IMAGE_API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '/api';
const IMAGE_PROXY_API_BASE = `${RENDER_IMAGE_API_BASE}/proxy-image`;

function toBytes(input: string): Uint8Array {
    return textEncoder.encode(input);
}

function sanitizeFilePart(input: string): string {
    return (input || 'screen')
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'screen';
}

function escapeHtml(input: string): string {
    return String(input || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function resolveActiveDesignSystemTokens(designSystem: ProjectDesignSystem): ProjectDesignSystem['tokens'] {
    const mode = designSystem.themeMode === 'dark' ? 'dark' : 'light';
    return designSystem.tokenModes?.[mode] || designSystem.tokens;
}

function buildGoogleFontsHref(fonts: string[]): string | null {
    const unique = Array.from(new Set(fonts
        .map((font) => String(font || '').split(',')[0]?.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)));
    if (unique.length === 0) return null;
    const families = unique
        .map((font) => `family=${encodeURIComponent(font).replace(/%20/g, '+')}:wght@400;500;600;700`)
        .join('&');
    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

function parseTypographyScale(scale: string | undefined, fallbackPx: number) {
    const raw = String(scale || '');
    const bracketMatch = raw.match(/text-\[(\d+(?:\.\d+)?)px\]/i);
    const tailwindSizeMatch = raw.match(/text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/i);
    const weightMatch = raw.match(/font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/i);
    const trackingTight = /\btracking-tight\b/i.test(raw);
    const trackingWider = /\btracking-wider\b/i.test(raw);
    const uppercase = /\buppercase\b/i.test(raw);

    const sizeMap: Record<string, number> = {
        xs: 12,
        sm: 14,
        base: 16,
        lg: 18,
        xl: 20,
        '2xl': 24,
        '3xl': 30,
        '4xl': 36,
        '5xl': 48,
        '6xl': 60,
        '7xl': 72,
        '8xl': 96,
        '9xl': 128,
    };
    const weightMap: Record<string, number> = {
        thin: 100,
        extralight: 200,
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        extrabold: 800,
        black: 900,
    };

    const sizePx = bracketMatch
        ? Number.parseFloat(bracketMatch[1])
        : tailwindSizeMatch
            ? sizeMap[tailwindSizeMatch[1]] || fallbackPx
            : fallbackPx;
    const weight = weightMatch ? weightMap[weightMatch[1]] || 400 : 400;
    const letterSpacing = trackingWider ? '0.08em' : trackingTight ? '-0.03em' : 'normal';

    return {
        sizePx,
        weight,
        letterSpacing,
        uppercase,
        label: `${Math.round(sizePx)}px`,
    };
}

function deriveDesignSystemBoardCopy(_designSystem: ProjectDesignSystem) {
    return {
        title: 'Typography\n& Colors',
        subtitle: 'A static specimen board that reflects the active design tokens, typography, and radius system.',
        displayWord: 'Aa',
        fontCaption: 'Type System',
        scaleSamples: {
            display: 'Typography',
            h1: 'Headline',
            h2: 'Primary',
            body: 'Body copy shows rhythm, tone, and spacing.',
            caption: 'Caption',
        },
        notes: ['Primary', 'Secondary', 'Inverted', 'Outlined'],
        searchLabel: 'Search',
        chipLabel: 'Label',
    };
}

function parseRadiusValue(input: string | undefined, fallback: number): number {
    const parsed = Number.parseFloat(String(input || '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
}

/*
function _legacyDeriveDesignSystemBoardCopyBlockForRemoval() {
    if (/\bproposal|contract|client|follow-up|agreement\b/.test('')) {
        return {
            title: 'Typography\n& Colors',
            subtitle: 'A proposal workflow system for drafting, sending, and tracking client-ready documents.',
            displayWord: 'Aa',
            fontCaption: 'Proposal UI',
            scaleSamples: {
                display: 'Proposal sent',
                h1: 'Client is viewing',
                h2: 'Follow-up ready',
                body: 'Track views, drafts, and signatures in one calm workspace.',
                caption: 'Viewed 10:42 AM',
            },
            notes: ['Proposal detail', 'Templates', 'Client status', 'Follow-up'],
            searchLabel: 'Search ',
            chipLabel: 'Draft ready',
        };
    }

    if (/\btemplate|library|catalog\b/.test(corpus)) {
        return {
            eyebrow: baseBrand,
            title: 'Typography\n& Colors',
            subtitle: 'A template-first product system focused on speed, clarity, and high-utility browsing.',
            displayWord: 'Aa',
            fontCaption: 'Template UI',
            scaleSamples: {
                display: 'Template library',
                h1: 'Popular template',
                h2: 'Ready to use',
                body: 'Browse polished, reusable patterns with clear hierarchy and strong contrast.',
                caption: '12 categories',
            },
            notes: ['Browse', 'Filter', 'Preview', 'Reuse'],
            searchLabel: 'Search templates',
            chipLabel: 'Most used',
        };
    }

    if (/\bdashboard|analytics|metrics|pipeline\b/.test(corpus)) {
        return {
            eyebrow: baseBrand,
            title: 'Typography\n& Colors',
            subtitle: 'A focused dashboard system designed for fast scanning, hierarchy, and confidence.',
            displayWord: 'Aa',
            fontCaption: 'Dashboard UI',
            scaleSamples: {
                display: 'Pipeline value',
                h1: 'Today overview',
                h2: 'Recent activity',
                body: 'Key actions, metrics, and progress states stay legible at a glance.',
                caption: 'Updated 2m ago',
            },
            notes: ['Metrics', 'Activity', 'Actions', 'Status'],
            searchLabel: 'Search activity',
            chipLabel: 'Live status',
        };
    }

    return {
        eyebrow: baseBrand,
        title: 'Typography\n& Colors',
        subtitle: designSystem.intentSummary || 'A product interface system with strong hierarchy, clean surfaces, and clear token structure.',
        displayWord: 'Aa',
        fontCaption: designSystem.platform === 'mobile' ? 'Mobile UI' : 'Product UI',
        scaleSamples: {
            display: `${baseBrand} UI`,
            h1: 'Primary screen',
            h2: 'Core action',
            body: 'This system balances readability, spacing, and token consistency across the product.',
            caption: `${designSystem.stylePreset} · ${designSystem.platform}`,
        },
        notes: ['Tokens', 'Type', 'Spacing', 'Radius'],
        searchLabel: `Search ${baseBrand.toLowerCase()}`,
        chipLabel: 'Core action',
    };
}
*/

function parseColorChannels(input: string): { r: number; g: number; b: number } | null {
    const raw = String(input || '').trim();
    const hexMatch = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        const hex = hexMatch[1];
        if (hex.length === 3) {
            return {
                r: Number.parseInt(hex[0] + hex[0], 16),
                g: Number.parseInt(hex[1] + hex[1], 16),
                b: Number.parseInt(hex[2] + hex[2], 16),
            };
        }
        return {
            r: Number.parseInt(hex.slice(0, 2), 16),
            g: Number.parseInt(hex.slice(2, 4), 16),
            b: Number.parseInt(hex.slice(4, 6), 16),
        };
    }

    const rgbMatch = raw.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
        if (parts.length >= 3 && parts.every((value, index) => index > 2 || Number.isFinite(value))) {
            return {
                r: Math.max(0, Math.min(255, Math.round(parts[0]))),
                g: Math.max(0, Math.min(255, Math.round(parts[1]))),
                b: Math.max(0, Math.min(255, Math.round(parts[2]))),
            };
        }
    }

    return null;
}

function mixColors(from: string, to: string, weight: number): string {
    const a = parseColorChannels(from);
    const b = parseColorChannels(to);
    if (!a || !b) return from;
    const t = Math.max(0, Math.min(1, weight));
    const mix = (start: number, end: number) => Math.round(start + ((end - start) * t));
    const r = mix(a.r, b.r);
    const g = mix(a.g, b.g);
    const blue = mix(a.b, b.b);
    return `rgb(${r}, ${g}, ${blue})`;
}

function buildDesignSystemBoardScreen(designSystem: ProjectDesignSystem): ExportScreen {
    const tokens = resolveActiveDesignSystemTokens(designSystem);
    const displayFont = String(designSystem.typography.displayFont || 'sans-serif');
    const bodyFont = String(designSystem.typography.bodyFont || 'sans-serif');
    const fontHref = buildGoogleFontsHref([displayFont, bodyFont]);
    const boardCopy = deriveDesignSystemBoardCopy(designSystem);
    const searchPlaceholder = boardCopy.searchLabel;
    const displayFontName = String(displayFont).split(',')[0].replace(/^['"]|['"]$/g, '') || 'Display';
    const bodyFontName = String(bodyFont).split(',')[0].replace(/^['"]|['"]$/g, '') || 'Body';
    const softShadow = String(designSystem.shadows.soft || 'none').trim() || 'none';
    const glowShadow = String(designSystem.shadows.glow || 'none').trim() || 'none';
    const cardRadius = parseRadiusValue(designSystem.radius.card, 18);
    const controlRadius = parseRadiusValue(designSystem.radius.control, 16);
    const pillRadius = parseRadiusValue(designSystem.radius.pill, 999);
    const boardRadius = cardRadius;
    const microRadius = controlRadius;
    const typographyTone = String(designSystem.typography.tone || '').trim() || 'balanced';
    const paletteSummary = designSystem.savedPalette
        ? `${designSystem.savedPalette.label} · ${designSystem.savedPalette.key}`
        : 'Custom palette';
    const savedPaletteDescription = designSystem.savedPalette?.description?.trim() || 'Custom palette values';
    const tokenModeLight = designSystem.tokenModes?.light;
    const tokenModeDark = designSystem.tokenModes?.dark;
    const savedPaletteLight = designSystem.savedPalette?.light;
    const savedPaletteDark = designSystem.savedPalette?.dark;
    const serializeTokenSet = (modeTokens: ProjectDesignSystem['tokens']) => Object.entries(modeTokens)
        .map(([key, value]) => `${key} ${String(value)}`)
        .join(' · ');
    const miniTokenRow = (
        label: string,
        modeTokens: ProjectDesignSystem['tokens'] | undefined,
    ) => modeTokens ? `
        <div class="meta-token-block">
          <div class="meta-token-label">${escapeHtml(label)}</div>
          <div class="meta-token-text">${escapeHtml(serializeTokenSet(modeTokens))}</div>
        </div>
    ` : '';
    const swatchOrder: Array<keyof ProjectDesignSystem['tokens']> = ['accent', 'accent2', 'text', 'muted'];
    const swatchCards = swatchOrder.map((token) => {
        const value = String(tokens[token] || '').trim();
        const textColor = token === 'accent' || token === 'accent2' || token === 'text'
            ? tokens.surface
            : tokens.text;
        const tones = [
            mixColors(value, tokens.text, 0.82),
            mixColors(value, tokens.text, 0.62),
            mixColors(value, tokens.text, 0.38),
            value,
            mixColors(value, tokens.surface, 0.28),
            mixColors(value, tokens.surface, 0.5),
            mixColors(value, tokens.surface, 0.72),
            mixColors(value, tokens.surface, 0.88),
        ].map((tone, index) => `<span class="swatch-tone tone-${index}" style="background:${escapeHtml(tone)};"></span>`).join('');
        return `
            <div class="palette-card palette-${token}" data-editable="true" data-uid="swatch-${token}">
                <div class="palette-head" style="background:${escapeHtml(value)}; color:${escapeHtml(textColor)};">
                    <div class="palette-meta">
                        <div class="palette-name">${escapeHtml(token === 'accent' ? 'Primary' : token === 'accent2' ? 'Secondary' : token === 'text' ? 'Tertiary' : 'Neutral')}</div>
                        <div class="palette-value">${escapeHtml(value.toUpperCase())}</div>
                    </div>
                </div>
                <div class="palette-tones">
                    ${tones}
                </div>
            </div>
        `;
    }).join('');

    const displayScale = parseTypographyScale(designSystem.typography.scale.display, 96);
    const h1Scale = parseTypographyScale(designSystem.typography.scale.h1, 42);
    const h2Scale = parseTypographyScale(designSystem.typography.scale.h2, 24);
    const bodyScale = parseTypographyScale(designSystem.typography.scale.body, 16);
    const captionScale = parseTypographyScale(designSystem.typography.scale.caption, 13);
    const displayShowSize = Math.max(88, Math.min(126, displayScale.sizePx));
    const bodyShowSize = Math.max(82, Math.min(112, Math.round(bodyScale.sizePx * 6.2)));
    const labelShowSize = Math.max(72, Math.min(102, Math.round(captionScale.sizePx * 7.2)));
    const displaySampleSize = Math.max(24, Math.min(32, Math.round(displayScale.sizePx * 0.32)));
    const headlineSampleSize = Math.max(18, Math.min(28, Math.round(h1Scale.sizePx * 0.82)));
    const bodySampleSize = Math.max(14, Math.min(18, bodyScale.sizePx));
    const labelSampleSize = Math.max(12, Math.min(16, captionScale.sizePx));
    const homeIcon = `<svg class="icon-svg" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 7.2L8 3L13 7.2V13H10V9.8H6V13H3V7.2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    const searchIcon = `<svg class="icon-svg" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="4.2" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 10.5L13.4 13.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    const userIcon = `<svg class="icon-svg" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="5.3" r="2.3" stroke="currentColor" stroke-width="1.6"/><path d="M3.2 13C4.1 10.9 5.8 9.9 8 9.9C10.2 9.9 11.9 10.9 12.8 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    const pencilIcon = `<svg class="icon-svg" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 11.7L4 9L10.8 2.2L13.8 5.2L7 12L4.3 13L3 11.7Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.8 3.2L12.8 6.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
    const sparkIcon = `<svg class="icon-svg" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2.2L9.1 5.2L12.1 6.3L9.1 7.4L8 10.4L6.9 7.4L3.9 6.3L6.9 5.2L8 2.2Z" fill="currentColor"/></svg>`;
    const gridIcon = `<svg class="icon-svg" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="2.5" width="4.2" height="4.2" rx="0.8" fill="currentColor"/><rect x="9.3" y="2.5" width="4.2" height="4.2" rx="0.8" fill="currentColor"/><rect x="2.5" y="9.3" width="4.2" height="4.2" rx="0.8" fill="currentColor"/><rect x="9.3" y="9.3" width="4.2" height="4.2" rx="0.8" fill="currentColor"/></svg>`;
    const tagIcon = `<svg class="icon-svg" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 7.1V3H7.1L12.7 8.6L8.6 12.7L3 7.1Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="5.2" cy="5.2" r="0.9" fill="currentColor"/></svg>`;
    const trashIcon = `<svg class="icon-svg" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 4.6H12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5.2 4.6V3.4H10.8V4.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4.7 6.2V12.6H11.3V6.2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M6.6 7.6V11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M9.4 7.6V11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(designSystem.systemName)} Design System</title>
  ${fontHref ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${fontHref}" rel="stylesheet">` : ''}
  <style>
    :root {
      --bg: ${escapeHtml(tokens.bg)};
      --surface: ${escapeHtml(tokens.surface)};
      --surface2: ${escapeHtml(tokens.surface2)};
      --text: ${escapeHtml(tokens.text)};
      --muted: ${escapeHtml(tokens.muted)};
      --stroke: ${escapeHtml(tokens.stroke)};
      --accent: ${escapeHtml(tokens.accent)};
      --accent2: ${escapeHtml(tokens.accent2)};
      --display-font: ${escapeHtml(displayFont)}, sans-serif;
      --body-font: ${escapeHtml(bodyFont)}, sans-serif;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      min-height: 100%;
      background: ${escapeHtml(tokens.bg)};
      color: var(--text);
      font-family: var(--body-font);
      -webkit-font-smoothing: antialiased;
    }
    body {
      padding: 0;
    }
    .board {
      width: 1180px;
      height: 920px;
      background: ${escapeHtml(mixColors(tokens.surface, tokens.bg, 0.4))};
      border-radius: ${boardRadius}px;
      padding: 14px;
      display: grid;
      grid-template-columns: 238px 1fr 1fr 1fr;
      grid-template-rows: 210px 160px 190px 308px;
      gap: 8px;
      box-shadow: ${escapeHtml(softShadow)};
    }
    .panel {
      background: ${escapeHtml(tokens.surface)};
      border-radius: ${cardRadius}px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
      border: 1px solid rgba(0,0,0,0.04);
      box-shadow: ${escapeHtml(softShadow)};
    }
    .palette-rail {
      grid-column: 1;
      grid-row: 1 / span 4;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: transparent;
      padding: 0;
      border: none;
    }
    .palette-card {
      border-radius: ${cardRadius}px;
      overflow: hidden;
      background: ${escapeHtml(tokens.surface)};
      border: 1px solid rgba(0,0,0,0.04);
      flex: 1;
    }
    .palette-head {
      height: 58%;
      padding: 14px 16px 12px;
      display: flex;
      align-items: flex-start;
    }
    .palette-meta {
      width: 100%;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 13px;
      font-weight: 700;
    }
    .palette-tones {
      display: flex;
      height: 42%;
      padding: 0 0 0 1px;
    }
    .swatch-tone {
      flex: 1;
    }
    .headline-panel {
      grid-column: 2;
      grid-row: 1;
      justify-content: flex-start;
    }
    .buttons-panel {
      grid-column: 3;
      grid-row: 1;
      justify-content: center;
    }
    .search-panel {
      grid-column: 4;
      grid-row: 1;
      justify-content: center;
    }
    .body-panel {
      grid-column: 2;
      grid-row: 2;
      justify-content: flex-start;
    }
    .lines-panel {
      grid-column: 3;
      grid-row: 2;
      justify-content: center;
      gap: 10px;
    }
    .nav-panel {
      grid-column: 4;
      grid-row: 2;
      justify-content: center;
    }
    .label-panel {
      grid-column: 2;
      grid-row: 3;
      justify-content: flex-start;
    }
    .micro-panel {
      grid-column: 3;
      grid-row: 3;
      display: grid;
      grid-template-columns: 128px 1fr;
      gap: 8px;
      padding: 0;
      background: transparent;
      border: none;
    }
    .micro-card {
      background: ${escapeHtml(tokens.surface)};
      border-radius: ${cardRadius}px;
      border: 1px solid rgba(0,0,0,0.04);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .icon-row-panel {
      grid-column: 4;
      grid-row: 3;
      justify-content: center;
    }
    .meta-panel {
      grid-column: 2 / span 3;
      grid-row: 4;
      display: grid;
      grid-template-columns: 1.05fr 1fr 1.2fr;
      grid-template-rows: auto auto;
      gap: 12px;
      align-items: start;
    }
    .meta-section {
      min-width: 0;
      background: ${escapeHtml(tokens.surface2)};
      border: 1px solid ${escapeHtml(tokens.stroke)};
      border-radius: ${cardRadius}px;
      padding: 12px 13px;
      align-self: stretch;
    }
    .meta-section.palette {
      grid-column: 1 / span 3;
    }
    .meta-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${escapeHtml(tokens.muted)};
      margin-bottom: 6px;
    }
    .meta-copy {
      font-size: 10px;
      line-height: 1.35;
      color: ${escapeHtml(tokens.text)};
    }
    .meta-copy.subtle {
      color: ${escapeHtml(tokens.muted)};
    }
    .meta-stack {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .meta-inline {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .meta-chip {
      min-height: 20px;
      padding: 0 8px;
      border-radius: ${controlRadius}px;
      display: inline-flex;
      align-items: center;
      background: ${escapeHtml(tokens.surface)};
      color: ${escapeHtml(tokens.text)};
      border: 1px solid ${escapeHtml(tokens.stroke)};
      font-size: 9px;
      line-height: 1;
      white-space: normal;
    }
    .meta-chip.do {
      background: ${escapeHtml(mixColors(tokens.accent, tokens.surface, 0.82))};
      color: ${escapeHtml(tokens.text)};
    }
    .meta-chip.dont {
      background: ${escapeHtml(mixColors(tokens.accent2, tokens.surface, 0.82))};
      color: ${escapeHtml(tokens.text)};
    }
    .meta-token-block {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid ${escapeHtml(mixColors(tokens.stroke, tokens.surface2, 0.4))};
    }
    .meta-token-label {
      font-size: 9px;
      color: ${escapeHtml(tokens.muted)};
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 3px;
    }
    .meta-token-text {
      font-size: 9px;
      line-height: 1.35;
      color: ${escapeHtml(tokens.text)};
    }
    .tile-label {
      font-size: 13px;
      color: #8f8378;
      margin-bottom: 10px;
    }
    .type-aa {
      font-family: var(--display-font);
      font-size: ${displayShowSize}px;
      line-height: 0.88;
      letter-spacing: -0.06em;
      color: var(--text);
      align-self: flex-end;
      margin: 2px 0 8px auto;
      transform: none;
    }
    .type-aa.body {
      font-family: var(--body-font);
      color: ${escapeHtml(mixColors(tokens.text, tokens.accent2, 0.35))};
      font-size: ${bodyShowSize}px;
    }
    .type-aa.label {
      font-size: ${labelShowSize}px;
      color: ${escapeHtml(mixColors(tokens.text, tokens.accent2, 0.35))};
    }
    .type-foot {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: auto;
    }
    .font-note {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .font-mark {
      font-size: 18px;
      font-weight: 700;
      color: ${escapeHtml(mixColors(tokens.text, tokens.surface2, 0.18))};
    }
    .font-family {
      font-size: 12px;
      font-weight: 700;
      color: ${escapeHtml(tokens.text)};
    }
    .font-copy {
      font-size: 10px;
      line-height: 1.25;
      color: ${escapeHtml(tokens.muted)};
      max-width: 170px;
    }
    .sample-row {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .sample-item {
      min-width: 88px;
    }
    .sample-kicker {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${escapeHtml(tokens.muted)};
      margin-bottom: 4px;
    }
    .sample-copy {
      color: ${escapeHtml(tokens.text)};
      line-height: 1.05;
      letter-spacing: -0.03em;
      white-space: nowrap;
    }
    .button-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: auto;
      margin-bottom: auto;
    }
    .button-chip {
      min-height: 34px;
      border-radius: ${pillRadius}px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 13px;
      font-weight: 600;
      padding: 0 18px;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .search-shell {
      height: 48px;
      border-radius: ${pillRadius}px;
      border: 1px solid ${escapeHtml(mixColors(tokens.stroke, tokens.accent2, 0.36))};
      background: transparent;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 18px;
      color: ${escapeHtml(mixColors(tokens.muted, tokens.text, 0.4))};
      font-size: 14px;
      margin: auto 0;
    }
    .search-glyph {
      width: 16px;
      height: 16px;
      position: relative;
      flex: 0 0 auto;
    }
    .icon-svg {
      width: 16px;
      height: 16px;
      display: block;
      flex: 0 0 auto;
    }
    .micro-icon .icon-svg,
    .nav-pill .icon-svg,
    .icon-dot .icon-svg {
      width: 15px;
      height: 15px;
    }
    .search-ring {
      position: absolute;
      width: 12px;
      height: 12px;
      border: 2px solid currentColor;
      border-radius: 999px;
      left: 0;
      top: 0;
    }
    .search-handle {
      position: absolute;
      width: 6px;
      height: 2px;
      border-radius: 999px;
      background: currentColor;
      right: 0;
      bottom: 1px;
      transform: rotate(45deg);
      transform-origin: center;
    }
    .line-stack {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
      margin: auto 0;
    }
    .metric-line {
      height: 6px;
      border-radius: ${pillRadius}px;
      background: rgba(0,0,0,0.03);
      width: 100%;
      overflow: hidden;
    }
    .metric-line > span {
      display: block;
      height: 100%;
      border-radius: inherit;
    }
    .nav-shell {
      width: 100%;
      height: 56px;
      border-radius: ${controlRadius}px;
      background: ${escapeHtml(mixColors(tokens.surface2, tokens.surface, 0.45))};
      display: flex;
      align-items: center;
      justify-content: space-around;
      margin: auto 0;
      padding: 0 16px;
    }
    .nav-pill {
      width: 36px;
      height: 36px;
      border-radius: ${pillRadius}px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      color: ${escapeHtml(tokens.text)};
      border: 1px solid transparent;
    }
    .nav-pill.active {
      background: ${escapeHtml(tokens.accent2)};
      color: ${escapeHtml(tokens.surface)};
    }
    .label-chip {
      min-height: 38px;
      padding: 0 18px;
      border-radius: ${pillRadius}px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: ${escapeHtml(mixColors(tokens.accent, tokens.surface, 0.22))};
      color: ${escapeHtml(tokens.text)};
      font-size: 13px;
      font-weight: 600;
      margin: auto;
    }
    .micro-icon {
      width: 40px;
      height: 40px;
      border-radius: ${microRadius}px;
      background: ${escapeHtml(mixColors(tokens.accent2, tokens.surface, 0.58))};
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${escapeHtml(tokens.accent2)};
      font-size: 16px;
      font-weight: 700;
    }
    .icon-row {
      display: flex;
      gap: 12px;
      margin: auto;
    }
    .icon-dot {
      width: 36px;
      height: 36px;
      border-radius: ${pillRadius}px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${escapeHtml(tokens.surface)};
      font-size: 14px;
      font-weight: 700;
    }
  </style>
</head>
<body data-screen-root="true" data-editable="true" data-uid="design-system-board">
  <main class="board" data-editable="true" data-uid="design-system-main">
    <section class="palette-rail" data-editable="true" data-uid="design-system-palette-rail">
      ${swatchCards}
    </section>
    <section class="panel headline-panel" data-editable="true" data-uid="design-system-headline-panel">
      <div class="tile-label">Headline</div>
      <div class="type-aa">Aa</div>
      <div class="type-foot">
        <div class="font-note">
          <div class="font-mark">Aa</div>
          <div>
            <div class="font-family">${escapeHtml(displayFontName)}</div>
            <div class="font-copy">${escapeHtml(boardCopy.fontCaption)}</div>
          </div>
        </div>
        <div class="sample-row">
          <div class="sample-item">
            <div class="sample-kicker">Display ${escapeHtml(displayScale.label)}</div>
            <div class="sample-copy" style="font-size:${displaySampleSize}px; font-weight:${displayScale.weight};">${escapeHtml(boardCopy.scaleSamples.display)}</div>
          </div>
          <div class="sample-item">
            <div class="sample-kicker">H1 ${escapeHtml(h1Scale.label)}</div>
            <div class="sample-copy" style="font-size:${headlineSampleSize}px; font-weight:${h1Scale.weight};">${escapeHtml(boardCopy.scaleSamples.h1)}</div>
          </div>
        </div>
      </div>
    </section>
    <section class="panel buttons-panel" data-editable="true" data-uid="design-system-buttons-panel">
      <div class="button-grid">
        <div class="button-chip" style="background:${escapeHtml(tokens.accent2)}; color:${escapeHtml(tokens.surface)}; box-shadow:${escapeHtml(glowShadow)};">Primary</div>
        <div class="button-chip" style="background:${escapeHtml(mixColors(tokens.surface2, tokens.surface, 0.3))}; color:${escapeHtml(tokens.text)};">Secondary</div>
        <div class="button-chip" style="background:${escapeHtml(mixColors(tokens.text, tokens.surface, 0.12))}; color:${escapeHtml(tokens.surface)};">Inverted</div>
        <div class="button-chip" style="background:transparent; color:${escapeHtml(tokens.text)}; border-color:${escapeHtml(mixColors(tokens.stroke, tokens.text, 0.28))};">Outlined</div>
      </div>
    </section>
    <section class="panel search-panel" data-editable="true" data-uid="design-system-search-panel">
      <div class="search-shell">
        <span class="search-glyph">
          <span class="search-ring"></span>
          <span class="search-handle"></span>
        </span>
        <span>${escapeHtml(searchPlaceholder)}</span>
      </div>
    </section>
    <section class="panel body-panel" data-editable="true" data-uid="design-system-body-panel">
      <div class="tile-label">Body</div>
      <div class="type-aa body">Aa</div>
      <div class="type-foot">
        <div class="font-note">
          <div class="font-mark">Aa</div>
          <div>
            <div class="font-family">${escapeHtml(bodyFontName)}</div>
            <div class="font-copy">${escapeHtml(boardCopy.scaleSamples.body)}</div>
          </div>
        </div>
        <div class="sample-row">
          <div class="sample-item">
            <div class="sample-kicker">Body ${escapeHtml(bodyScale.label)}</div>
            <div class="sample-copy" style="font-size:${bodySampleSize}px; font-weight:${bodyScale.weight}; letter-spacing:${escapeHtml(bodyScale.letterSpacing)};">${escapeHtml(boardCopy.scaleSamples.body)}</div>
          </div>
        </div>
      </div>
    </section>
    <section class="panel lines-panel" data-editable="true" data-uid="design-system-lines-panel">
      <div class="line-stack">
        <div class="metric-line"><span style="width:72%; background:${escapeHtml(tokens.accent2)};"></span></div>
        <div class="metric-line"><span style="width:86%; background:${escapeHtml(tokens.accent)};"></span></div>
        <div class="metric-line"><span style="width:58%; background:${escapeHtml(mixColors(tokens.accent, '#7c6cff', 0.72))};"></span></div>
      </div>
    </section>
    <section class="panel nav-panel" data-editable="true" data-uid="design-system-nav-panel">
      <div class="nav-shell">
        <div class="nav-pill active">${homeIcon}</div>
        <div class="nav-pill">${searchIcon}</div>
        <div class="nav-pill">${userIcon}</div>
      </div>
    </section>
    <section class="panel label-panel" data-editable="true" data-uid="design-system-label-panel">
      <div class="tile-label">Label</div>
      <div class="type-aa label">Aa</div>
      <div class="type-foot">
        <div class="sample-row">
          <div class="sample-item">
            <div class="sample-kicker">Caption ${escapeHtml(captionScale.label)}</div>
            <div class="sample-copy" style="font-size:${labelSampleSize}px; font-weight:${captionScale.weight}; letter-spacing:${escapeHtml(captionScale.letterSpacing)};">${escapeHtml(boardCopy.scaleSamples.caption)}</div>
          </div>
          <div class="sample-item">
            <div class="sample-kicker">H2 ${escapeHtml(h2Scale.label)}</div>
            <div class="sample-copy" style="font-size:${Math.max(16, Math.min(22, h2Scale.sizePx))}px; font-weight:${h2Scale.weight};">${escapeHtml(boardCopy.scaleSamples.h2)}</div>
          </div>
        </div>
      </div>
    </section>
    <section class="micro-panel" data-editable="true" data-uid="design-system-micro-panel">
      <div class="micro-card" data-editable="true" data-uid="design-system-micro-icon-card">
        <div class="micro-icon" style="box-shadow:${escapeHtml(glowShadow)};">${pencilIcon}</div>
      </div>
      <div class="micro-card" data-editable="true" data-uid="design-system-micro-chip-card">
        <div class="label-chip">
          <span>${escapeHtml(boardCopy.chipLabel)}</span>
        </div>
      </div>
    </section>
    <section class="panel icon-row-panel" data-editable="true" data-uid="design-system-icon-row-panel">
      <div class="icon-row">
        <div class="icon-dot" style="background:${escapeHtml(tokens.accent2)};">${sparkIcon}</div>
        <div class="icon-dot" style="background:${escapeHtml(tokens.accent)};">${gridIcon}</div>
        <div class="icon-dot" style="background:${escapeHtml(mixColors(tokens.accent, '#6d5ef5', 0.7))};">${tagIcon}</div>
        <div class="icon-dot" style="background:${escapeHtml(mixColors(tokens.accent2, '#d03030', 0.65))};">${trashIcon}</div>
      </div>
    </section>
    <section class="panel meta-panel" data-editable="true" data-uid="design-system-meta-panel">
      <div class="meta-section">
        <div class="meta-title">System</div>
        <div class="meta-stack">
          <div class="meta-copy">Version ${escapeHtml(String(designSystem.version))}</div>
          <div class="meta-copy">${escapeHtml(designSystem.stylePreset)} · ${escapeHtml(designSystem.platform)} · ${escapeHtml(designSystem.themeMode)}</div>
          <div class="meta-copy subtle">${escapeHtml(designSystem.intentSummary || 'No summary provided')}</div>
          <div class="meta-copy subtle">Tone: ${escapeHtml(typographyTone)}</div>
        </div>
      </div>
      <div class="meta-section">
        <div class="meta-title">Foundations</div>
        <div class="meta-stack">
          <div class="meta-copy">Base ${escapeHtml(String(designSystem.spacing.baseUnit))}px · ${escapeHtml(designSystem.spacing.density)} · ${escapeHtml(designSystem.spacing.rhythm)}</div>
          <div class="meta-copy">Motion ${escapeHtml(designSystem.motion.style)} · ${escapeHtml(String(designSystem.motion.durationFastMs))}ms / ${escapeHtml(String(designSystem.motion.durationBaseMs))}ms</div>
          <div class="meta-copy">Radius ${escapeHtml(designSystem.radius.card)} / ${escapeHtml(designSystem.radius.control)} / ${escapeHtml(designSystem.radius.pill)}</div>
          <div class="meta-copy subtle">Shadows: soft + glow applied</div>
        </div>
      </div>
      <div class="meta-section">
        <div class="meta-title">Language Rules</div>
        <div class="meta-inline">
          <span class="meta-chip">${escapeHtml(designSystem.componentLanguage.button)}</span>
          <span class="meta-chip">${escapeHtml(designSystem.componentLanguage.card)}</span>
          <span class="meta-chip">${escapeHtml(designSystem.componentLanguage.input)}</span>
          <span class="meta-chip">${escapeHtml(designSystem.componentLanguage.nav)}</span>
          <span class="meta-chip">${escapeHtml(designSystem.componentLanguage.chips)}</span>
        </div>
        <div class="meta-title" style="margin-top:10px;">Rules</div>
        <div class="meta-inline">
          ${designSystem.rules.do.map((rule) => `<span class="meta-chip do">${escapeHtml(rule)}</span>`).join('')}
          ${designSystem.rules.dont.map((rule) => `<span class="meta-chip dont">${escapeHtml(rule)}</span>`).join('')}
        </div>
      </div>
      <div class="meta-section palette">
        <div class="meta-title">Palette Modes</div>
        <div class="meta-copy">${escapeHtml(paletteSummary)}</div>
        <div class="meta-copy subtle">${escapeHtml(savedPaletteDescription)}</div>
        ${miniTokenRow('Light', tokenModeLight)}
        ${miniTokenRow('Dark', tokenModeDark)}
        ${miniTokenRow('P Light', savedPaletteLight)}
        ${miniTokenRow('P Dark', savedPaletteDark)}
      </div>
    </section>
  </main>
</body>
</html>`;

    return {
        screenId: `design-system-${sanitizeFilePart(designSystem.systemName || 'board')}`,
        name: `${designSystem.systemName || 'Design System'} v${designSystem.version} Board`,
        html,
        width: 1180,
        height: 920,
        status: 'complete',
    };
}

function pad2(v: number): string {
    return String(v).padStart(2, '0');
}

function nowStamp() {
    const d = new Date();
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
        crc ^= bytes[i];
        for (let j = 0; j < 8; j += 1) {
            const mask = -(crc & 1);
            crc = (crc >>> 1) ^ (0xedb88320 & mask);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
    const year = Math.max(1980, date.getFullYear());
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);
    const dosTime = (hours << 11) | (minutes << 5) | seconds;
    const dosDate = ((year - 1980) << 9) | (month << 5) | day;
    return { dosDate, dosTime };
}

function writeU16(view: DataView, offset: number, value: number) {
    view.setUint16(offset, value & 0xffff, true);
}

function writeU32(view: DataView, offset: number, value: number) {
    view.setUint32(offset, value >>> 0, true);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

type ZipEntry = { path: string; data: Uint8Array };

function createZipBlob(entries: ZipEntry[]): Blob {
    const now = new Date();
    const { dosDate, dosTime } = dosDateTime(now);
    const localChunks: Uint8Array[] = [];
    const centralChunks: Uint8Array[] = [];
    let offset = 0;

    entries.forEach((entry) => {
        const nameBytes = toBytes(entry.path);
        const dataBytes = entry.data;
        const crc = crc32(dataBytes);

        const localHeader = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(localHeader.buffer);
        writeU32(lv, 0, 0x04034b50);
        writeU16(lv, 4, 20);
        writeU16(lv, 6, 0);
        writeU16(lv, 8, 0);
        writeU16(lv, 10, dosTime);
        writeU16(lv, 12, dosDate);
        writeU32(lv, 14, crc);
        writeU32(lv, 18, dataBytes.length);
        writeU32(lv, 22, dataBytes.length);
        writeU16(lv, 26, nameBytes.length);
        writeU16(lv, 28, 0);
        localHeader.set(nameBytes, 30);

        localChunks.push(localHeader, dataBytes);

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(centralHeader.buffer);
        writeU32(cv, 0, 0x02014b50);
        writeU16(cv, 4, 20);
        writeU16(cv, 6, 20);
        writeU16(cv, 8, 0);
        writeU16(cv, 10, 0);
        writeU16(cv, 12, dosTime);
        writeU16(cv, 14, dosDate);
        writeU32(cv, 16, crc);
        writeU32(cv, 20, dataBytes.length);
        writeU32(cv, 24, dataBytes.length);
        writeU16(cv, 28, nameBytes.length);
        writeU16(cv, 30, 0);
        writeU16(cv, 32, 0);
        writeU16(cv, 34, 0);
        writeU16(cv, 36, 0);
        writeU32(cv, 38, 0);
        writeU32(cv, 42, offset);
        centralHeader.set(nameBytes, 46);
        centralChunks.push(centralHeader);

        offset += localHeader.length + dataBytes.length;
    });

    const centralSize = centralChunks.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    writeU32(ev, 0, 0x06054b50);
    writeU16(ev, 4, 0);
    writeU16(ev, 6, 0);
    writeU16(ev, 8, entries.length);
    writeU16(ev, 10, entries.length);
    writeU32(ev, 12, centralSize);
    writeU32(ev, 16, offset);
    writeU16(ev, 20, 0);

    const blobParts: ArrayBuffer[] = [...localChunks.map(toArrayBuffer), ...centralChunks.map(toArrayBuffer), toArrayBuffer(end)];
    return new Blob(blobParts, { type: 'application/zip' });
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function htmlToCodeBlock(screen: ExportScreen): string {
    return [
        `<!-- Screen: ${screen.name} (${screen.screenId}) -->`,
        screen.html,
        '',
    ].join('\n');
}

function escapeXml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function proxiedImageUrl(raw: string): string {
    const input = (raw || '').trim();
    if (!input) return '';
    if (input.startsWith('data:') || input.startsWith('blob:')) return input;
    if (input.startsWith(IMAGE_PROXY_API_BASE) || input.startsWith('/api/proxy-image')) {
        return input.includes('?url=') ? input : '';
    }
    if (/^https?:\/\//i.test(input)) {
        return `${IMAGE_PROXY_API_BASE}?url=${encodeURIComponent(input)}`;
    }
    if (/^\/\//.test(input)) {
        return `${IMAGE_PROXY_API_BASE}?url=${encodeURIComponent(`https:${input}`)}`;
    }
    if (/^(javascript:|about:|file:)/i.test(input)) return '';
    return input;
}

function rewriteExternalImageUrls(html: string): string {
    if (!html) return html;
    let next = html;
    const blankPixel = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

    // img/src
    next = next.replace(/(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'])/gi, (_, p1: string, src: string, p3: string) => {
        const rewritten = proxiedImageUrl(src) || blankPixel;
        return `${p1}${rewritten}${p3}`;
    });

    // source/srcset (best-effort: rewrite each URL token before descriptor)
    next = next.replace(/(<source\b[^>]*\bsrcset\s*=\s*["'])([^"']+)(["'])/gi, (_, p1: string, srcset: string, p3: string) => {
        const rewritten = srcset
            .split(',')
            .map((entry) => {
                const trimmed = entry.trim();
                if (!trimmed) return trimmed;
                const [url, descriptor] = trimmed.split(/\s+/, 2);
                const proxied = proxiedImageUrl(url);
                if (!proxied) return '';
                return descriptor ? `${proxied} ${descriptor}` : proxied;
            })
            .filter(Boolean)
            .join(', ');
        return `${p1}${rewritten || blankPixel}${p3}`;
    });

    return next;
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read blob.'));
        reader.readAsDataURL(blob);
    });
}

function parseCssUrls(value: string): string[] {
    const urls: string[] = [];
    const re = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) {
        if (m[2]) urls.push(m[2]);
    }
    return urls;
}

function replaceCssUrls(value: string, map: Map<string, string>): string {
    return value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (full, quote: string, raw: string) => {
        const next = map.get(raw) || map.get(raw.trim());
        if (!next) return full;
        return `url(${quote || ''}${next}${quote || ''})`;
    });
}

function shouldInlineAsset(url: string): boolean {
    const v = (url || '').trim();
    if (!v) return false;
    if (v.startsWith('data:') || v.startsWith('blob:')) return false;
    if (/^(javascript:|about:|file:)/i.test(v)) return false;
    return true;
}

async function toInlineDataUrl(url: string, cache: Map<string, string>): Promise<string | null> {
    const key = url.trim();
    if (!shouldInlineAsset(key)) return null;
    if (cache.has(key)) return cache.get(key) || null;

    const fetchUrl = /^https?:\/\//i.test(key) || /^\/\//.test(key)
        ? proxiedImageUrl(key)
        : key;
    if (!fetchUrl) return null;

    try {
        const response = await fetch(fetchUrl);
        if (!response.ok) return null;
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) return null;
        const dataUrl = await blobToDataUrl(await response.blob());
        cache.set(key, dataUrl);
        return dataUrl;
    } catch {
        return null;
    }
}

async function inlineAssetsForRaster(html: string): Promise<string> {
    if (!html || typeof DOMParser === 'undefined') return html;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const cache = new Map<string, string>();

    // Remove executable scripts for deterministic offline raster.
    doc.querySelectorAll('script').forEach((node) => node.remove());

    const imgNodes = Array.from(doc.querySelectorAll('img[src]'));
    for (const node of imgNodes) {
        const raw = node.getAttribute('src') || '';
        const inlined = await toInlineDataUrl(raw, cache);
        if (inlined) node.setAttribute('src', inlined);
    }

    const sourceNodes = Array.from(doc.querySelectorAll('source[srcset]'));
    for (const node of sourceNodes) {
        const srcset = node.getAttribute('srcset') || '';
        const parts = srcset.split(',').map((s) => s.trim()).filter(Boolean);
        const rewritten: string[] = [];
        for (const part of parts) {
            const [url, descriptor] = part.split(/\s+/, 2);
            const inlined = await toInlineDataUrl(url, cache);
            const next = inlined || proxiedImageUrl(url) || '';
            if (!next) continue;
            rewritten.push(descriptor ? `${next} ${descriptor}` : next);
        }
        if (rewritten.length > 0) node.setAttribute('srcset', rewritten.join(', '));
    }

    const styleAttrNodes = Array.from(doc.querySelectorAll<HTMLElement>('[style]'));
    for (const node of styleAttrNodes) {
        const styleValue = node.getAttribute('style') || '';
        const urls = parseCssUrls(styleValue);
        if (urls.length === 0) continue;
        const localMap = new Map<string, string>();
        for (const url of urls) {
            const inlined = await toInlineDataUrl(url, cache);
            if (inlined) localMap.set(url, inlined);
        }
        if (localMap.size > 0) node.setAttribute('style', replaceCssUrls(styleValue, localMap));
    }

    const styleTags = Array.from(doc.querySelectorAll('style'));
    for (const tag of styleTags) {
        const cssText = tag.textContent || '';
        const urls = parseCssUrls(cssText);
        if (urls.length === 0) continue;
        const localMap = new Map<string, string>();
        for (const url of urls) {
            const inlined = await toInlineDataUrl(url, cache);
            if (inlined) localMap.set(url, inlined);
        }
        if (localMap.size > 0) tag.textContent = replaceCssUrls(cssText, localMap);
    }

    return doc.documentElement?.outerHTML || html;
}

function screenToSvgMarkup(screen: ExportScreen, x: number, y: number): string {
    const body = escapeXml(screen.html);
    return [
        `<g transform="translate(${x},${y})">`,
        `<rect x="0" y="0" width="${screen.width}" height="${screen.height}" rx="16" fill="#fff" stroke="#d0d7e2"/>`,
        `<foreignObject x="0" y="0" width="${screen.width}" height="${screen.height}">`,
        `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${screen.width}px;height:${screen.height}px;overflow:hidden;background:#fff;">${body}</div>`,
        `</foreignObject>`,
        `</g>`,
    ].join('');
}

function buildCombinedFigmaSvg(screens: ExportScreen[]): string {
    const gap = 48;
    const padding = 24;
    const width = Math.max(...screens.map((s) => s.width)) + padding * 2;
    let cursorY = padding;
    const chunks: string[] = [];

    screens.forEach((screen) => {
        chunks.push(screenToSvgMarkup(screen, padding, cursorY));
        cursorY += screen.height + gap;
    });

    const height = cursorY - gap + padding;
    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `<rect width="${width}" height="${height}" fill="#f4f6fb" />`,
        ...chunks,
        `</svg>`,
    ].join('');
}

export function getExportTargetScreens(
    spec: { screens: ExportScreen[] } | null,
    selection: ExportSelection,
): { screens: ExportScreen[]; scope: SelectionScope } {
    if (!spec || !Array.isArray(spec.screens) || spec.screens.length === 0) {
        return { screens: [], scope: 'all' };
    }

    const selectedIds = new Set<string>();
    (selection.selectedNodeIds || []).forEach((id) => {
        if (id) selectedIds.add(id);
    });
    if (selection.selectedBoardId) selectedIds.add(selection.selectedBoardId);

    if (selectedIds.size > 0) {
        const selected = spec.screens.filter((screen) => selectedIds.has(screen.screenId));
        if (selected.length > 0) {
            return { screens: selected, scope: 'selected' };
        }
    }

    return { screens: [...spec.screens], scope: 'all' };
}

export async function copyScreensCodeToClipboard(screens: ExportScreen[]): Promise<void> {
    if (screens.length === 0) throw new Error('No screens to copy.');
    const code = screens.length === 1
        ? screens[0].html
        : screens.map(htmlToCodeBlock).join('\n');
    await navigator.clipboard.writeText(code);
}

export async function copyFigmaPayloadToClipboard(
    screens: ExportScreen[],
    designSystem?: ProjectDesignSystem | null,
): Promise<{ screenCount: number }> {
    if (screens.length === 0) throw new Error('No screens to export.');
    const payload = await buildFigmaPastePayload(screens, designSystem);
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    return { screenCount: payload.screens.length };
}

export async function copyDesignSystemBoardToFigmaClipboard(
    designSystem: ProjectDesignSystem,
): Promise<{ screenCount: number }> {
    const screen = buildDesignSystemBoardScreen(designSystem);
    const payload = await buildFigmaPastePayload([screen], designSystem);
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    return { screenCount: payload.screens.length };
}

export function exportScreensAsZip(
    screens: ExportScreen[],
    designName = 'eazyui-design',
): { filename: string } {
    if (screens.length === 0) throw new Error('No screens to export.');

    const root = `${sanitizeFilePart(designName)}-${nowStamp()}`;
    const entries: ZipEntry[] = [];
    const manifest = {
        designName,
        exportedAt: new Date().toISOString(),
        totalScreens: screens.length,
        screens: screens.map((screen, idx) => ({
            index: idx + 1,
            screenId: screen.screenId,
            name: screen.name,
            file: `screens/${String(idx + 1).padStart(2, '0')}-${sanitizeFilePart(screen.name)}.html`,
            width: screen.width,
            height: screen.height,
            status: screen.status || 'complete',
        })),
    };

    entries.push({
        path: `${root}/manifest.json`,
        data: toBytes(JSON.stringify(manifest, null, 2)),
    });

    screens.forEach((screen, idx) => {
        entries.push({
            path: `${root}/screens/${String(idx + 1).padStart(2, '0')}-${sanitizeFilePart(screen.name)}.html`,
            data: toBytes(screen.html),
        });
    });

    const readme = [
        '# EazyUI Export',
        '',
        `Design: ${designName}`,
        `Exported: ${new Date().toISOString()}`,
        `Screens: ${screens.length}`,
        '',
        'Each screen is exported as a standalone HTML file in /screens.',
    ].join('\n');
    entries.push({ path: `${root}/README.md`, data: toBytes(readme) });

    const zip = createZipBlob(entries);
    const filename = `${root}.zip`;
    downloadBlob(zip, filename);
    return { filename };
}

async function buildSingleScreenSvg(screen: ExportScreen): Promise<string> {
    const preparedHtml = await inlineAssetsForRaster(rewriteExternalImageUrls(screen.html));
    const body = escapeXml(preparedHtml);
    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${screen.width}" height="${screen.height}" viewBox="0 0 ${screen.width} ${screen.height}">`,
        `<foreignObject x="0" y="0" width="${screen.width}" height="${screen.height}">`,
        `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${screen.width}px;height:${screen.height}px;overflow:hidden;background:#fff;">${body}</div>`,
        `</foreignObject>`,
        `</svg>`,
    ].join('');
}

async function svgToPngBytes(svg: string, width: number, height: number, scale = 2): Promise<Uint8Array> {
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Failed to rasterize SVG.'));
            image.src = svgUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(width * scale));
        canvas.height = Math.max(1, Math.floor(height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context not available.');
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.drawImage(img, 0, 0, width, height);

        const pngBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('PNG conversion failed (possibly blocked by cross-origin assets).'));
                    return;
                }
                resolve(blob);
            }, 'image/png');
        });

        const buffer = await pngBlob.arrayBuffer();
        return new Uint8Array(buffer);
    } finally {
        URL.revokeObjectURL(svgUrl);
    }
}

async function renderScreenPngViaApi(screen: ExportScreen, scale = 2): Promise<Uint8Array | null> {
    try {
        const response = await fetch(`${RENDER_IMAGE_API_BASE}/render-screen-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                html: screen.html,
                width: screen.width,
                height: screen.height,
                scale,
            }),
        });
        if (!response.ok) return null;
        const payload = await response.json() as { pngBase64?: string };
        if (!payload.pngBase64) return null;
        const binary = atob(payload.pngBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch {
        return null;
    }
}

export async function exportScreensAsImagesZip(
    screens: ExportScreen[],
    designName = 'eazyui-design',
): Promise<{ filename: string; pngCount: number; svgFallbackCount: number; exportMode: 'png-only' | 'mixed' | 'svg-only' }> {
    if (screens.length === 0) throw new Error('No screens to export.');

    const root = `${sanitizeFilePart(designName)}-images-${nowStamp()}`;
    const entries: ZipEntry[] = [];
    const manifest = {
        designName,
        exportedAt: new Date().toISOString(),
        totalScreens: screens.length,
        format: 'mixed' as 'png-only' | 'mixed' | 'svg-only',
        scale: 2,
        screens: [] as Array<{
            index: number;
            screenId: string;
            name: string;
            file: string;
            format: 'png' | 'svg';
            width: number;
            height: number;
            status: string;
        }>,
    };
    let pngCount = 0;
    let svgFallbackCount = 0;

    for (let i = 0; i < screens.length; i += 1) {
        const screen = screens[i];
        const baseName = `${String(i + 1).padStart(2, '0')}-${sanitizeFilePart(screen.name)}`;
        const svg = await buildSingleScreenSvg(screen);
        try {
            const serverPngBytes = await renderScreenPngViaApi(screen, 2);
            const pngBytes = serverPngBytes || await svgToPngBytes(svg, screen.width, screen.height, 2);
            const filename = `${baseName}.png`;
            entries.push({
                path: `${root}/images/${filename}`,
                data: pngBytes,
            });
            manifest.screens.push({
                index: i + 1,
                screenId: screen.screenId,
                name: screen.name,
                file: `images/${filename}`,
                format: 'png',
                width: screen.width,
                height: screen.height,
                status: screen.status || 'complete',
            });
            pngCount += 1;
        } catch {
            const filename = `${baseName}.svg`;
            entries.push({
                path: `${root}/images/${filename}`,
                data: toBytes(svg),
            });
            manifest.screens.push({
                index: i + 1,
                screenId: screen.screenId,
                name: screen.name,
                file: `images/${filename}`,
                format: 'svg',
                width: screen.width,
                height: screen.height,
                status: screen.status || 'complete',
            });
            svgFallbackCount += 1;
        }
    }

    const exportMode: 'png-only' | 'mixed' | 'svg-only' = pngCount === 0
        ? 'svg-only'
        : svgFallbackCount > 0
            ? 'mixed'
            : 'png-only';
    manifest.format = exportMode;

    entries.push({
        path: `${root}/manifest.json`,
        data: toBytes(JSON.stringify(manifest, null, 2)),
    });
    entries.push({
        path: `${root}/README.md`,
        data: toBytes([
            '# EazyUI Image Export',
            '',
            `Design: ${designName}`,
            `Screens: ${screens.length}`,
            `Export Mode: ${exportMode}`,
            'Requested Format: PNG',
            'Scale: 2x',
            'Fallback: SVG when browser blocks rasterization (tainted canvas/CORS).',
        ].join('\n')),
    });

    const zip = createZipBlob(entries);
    const zipName = `${root}.zip`;
    downloadBlob(zip, zipName);
    return { filename: zipName, pngCount, svgFallbackCount, exportMode };
}

export async function exportScreensToFigmaClipboard(
    screens: ExportScreen[],
    designSystem?: ProjectDesignSystem | null,
): Promise<{ mode: 'clipboard' | 'download'; filename?: string }> {
    if (screens.length === 0) throw new Error('No screens to export.');
    const [payload, svg] = await Promise.all([
        buildFigmaPastePayload(screens, designSystem),
        Promise.resolve(buildCombinedFigmaSvg(screens)),
    ]);
    const payloadJson = JSON.stringify(payload, null, 2);

    if (typeof window !== 'undefined' && 'ClipboardItem' in window && navigator.clipboard?.write) {
        const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
        const textBlob = new Blob([payloadJson], { type: 'text/plain' });
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore ClipboardItem is runtime-guarded above
        await navigator.clipboard.write([new ClipboardItem({
            'image/svg+xml': svgBlob,
            'text/plain': textBlob,
        })]);
        return { mode: 'clipboard' };
    }

    const root = `figma-payload-${nowStamp()}`;
    const filename = `${root}.zip`;
    const zip = createZipBlob([
        {
            path: `${root}/payload.json`,
            data: toBytes(payloadJson),
        },
        {
            path: `${root}/preview.svg`,
            data: toBytes(svg),
        },
    ]);
    downloadBlob(zip, filename);
    return { mode: 'download', filename };
}

export async function sendScreensToFigmaPlugin(
    screens: ExportScreen[],
    designSystem?: ProjectDesignSystem | null,
    source?: {
        projectId?: string;
        projectName?: string;
    },
): Promise<{ screenCount: number }> {
    if (screens.length === 0) throw new Error('No screens to export.');

    const payload = await buildFigmaPastePayload(screens, designSystem);
    await apiClient.stagePluginImport(payload, {
        projectId: source?.projectId,
        projectName: source?.projectName,
        screenIds: screens.map((screen) => screen.screenId),
        screenNames: screens.map((screen) => screen.name),
    });

    return { screenCount: payload.screens.length };
}
