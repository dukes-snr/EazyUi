// ============================================================================
// Chat Panel Component - Streaming Version
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useChatStore, useDesignStore, useCanvasStore, useEditStore, useUiStore, useProjectStore, useProjectMemoryStore } from '../../stores';
import { apiClient, type PlannerPlanResponse, type PlannerPostgenResponse, type PlannerRequest, type PlannerRouteResponse, type HtmlScreen, type ProjectDesignSystem, type ProjectMemory, type ReferenceContextMeta } from '../../api/client';
import { v4 as uuidv4 } from 'uuid';
import { ArrowUp, ArrowDown, Plus, Monitor, Smartphone, Sparkles, Tablet, X, Loader2, ChevronLeft, ChevronDown, PanelLeftClose, PanelLeftOpen, Square, Copy, Check, ThumbsUp, ThumbsDown, Share2, Lightbulb, CircleStar, Mic, Zap, LineSquiggle, Palette, Gem, Smile, AlertTriangle, Pencil, Sun, Moon } from 'lucide-react';
import { getPreferredTextModel, type DesignModelProfile } from '../../constants/designModels';
import { notifyWhenInBackground, requestBrowserNotificationPermissionIfNeeded } from '../../utils/browserNotifications';
import { getUserFacingError, toTaggedErrorMessage } from '../../utils/userFacingErrors';
import { useOrbVisuals, type OrbActivityState } from '../../utils/orbVisuals';
import {
    extractComposerInlineReferences,
    findComposerReferenceTrigger,
    formatComposerScreenReferenceToken,
    getComposerReferenceHostname,
    formatComposerUrlReferenceToken,
    getFilteredComposerReferenceRootOptions,
    normalizeComposerReferenceUrl,
    replaceComposerReferenceTrigger,
    type ComposerReferenceTextRange,
} from '../../utils/composerReferences';
import { ComposerInlineReferenceInput, type ComposerInlineReferenceInputHandle } from '../ui/ComposerInlineReferenceInput';
import { ComposerAttachmentStack, MAX_COMPOSER_ATTACHMENTS } from '../ui/ComposerAttachmentStack';
import { Orb } from '../ui/Orb';
import { ComposerReferenceMenu } from '../ui/ComposerReferenceMenu';
import appLogo from '../../assets/Ui-logo.png';

const FEEDBACK_BUCKETS = {
    early: [
        'Warming up the studio...',
        'Sharpening pencils...',
        'Rolling out the canvas...',
        'Mixing the color palette...',
        'Tuning the grid...',
    ],
    working: [
        'Blocking the layout...',
        'Carving the hierarchy...',
        'Composing the hero...',
        'Dialing in typography...',
        'Staging the cards...',
        'Polishing interactions...',
        'Balancing the spacing...',
    ],
    late: [
        'Adding finishing touches...',
        'Refining the micro-details...',
        'Final pass on contrast...',
        'Tightening the alignment...',
        'Sealing the polish...',
    ],
    wrap: [
        'Packaging the screens...',
        'Putting on the final coat...',
        'Framing the presentation...',
        'Wrapping it up...',
    ],
};

const INITIAL_MESSAGE_RENDER_COUNT = 36;
const MESSAGE_RENDER_STEP = 24;

function injectThumbScrollbarHide(html: string) {
    // Keep style-critical Tailwind runtime scripts so thumbnails preserve visual styling,
    // but strip unrelated scripts and inline event handlers.
    const rawHtml = String(html || '');
    const sanitizedHtml = rawHtml
        .replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs = '', body = '') => {
            const attrText = String(attrs).toLowerCase();
            const bodyText = String(body).toLowerCase();
            const hasTailwindSrc = /src\s*=\s*["'][^"']*cdn\.tailwindcss\.com[^"']*["']/.test(attrText);
            const isTailwindConfig = bodyText.includes('tailwind.config');
            return (hasTailwindSrc || isTailwindConfig) ? full : '';
        })
        .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
    const warningFilterScript = `
<script>
  (function () {
    const blocked = 'cdn.tailwindcss.com should not be used in production';
    const originalWarn = console.warn;
    console.warn = function (...args) {
      const first = String(args && args.length ? args[0] : '');
      if (first.includes(blocked)) return;
      return originalWarn.apply(console, args);
    };
  })();
</script>`;
    const styleTag = `
<style>
  ::-webkit-scrollbar { width: 0; height: 0; }
  ::-webkit-scrollbar-thumb { background: transparent; }
  html, body { -ms-overflow-style: none; scrollbar-width: none; overflow: hidden; }
</style>`;

    if (/<head[^>]*>/i.test(sanitizedHtml)) {
        return sanitizedHtml.replace(/<head([^>]*)>/i, `<head$1>${warningFilterScript}\n${styleTag}`);
    }
    if (sanitizedHtml.includes('</head>')) {
        return sanitizedHtml.replace('</head>', `${warningFilterScript}\n${styleTag}\n</head>`);
    }
    return `${warningFilterScript}\n${styleTag}\n${sanitizedHtml}`;
}

function normalizeEscapedHtmlAttributes(html: string): string {
    const raw = String(html || '');
    if (!raw.includes('\\"') && !raw.includes("\\'")) return raw;
    const looksLikeEscapedMarkup = /<[^>]*\\\"[^>]*>/.test(raw)
        || /viewBox=\\\"/i.test(raw)
        || /\\\"M[0-9]/.test(raw);
    if (!looksLikeEscapedMarkup) return raw;
    return raw.replace(/\\\"/g, '"').replace(/\\'/g, "'");
}

function normalizePlaceholderCatalogInHtml(html: string): string {
    const normalizedHtml = normalizeEscapedHtmlAttributes(html);
    if (!normalizedHtml || !/<img\b/i.test(normalizedHtml)) return normalizedHtml;
    const map = [
        'https://placehold.net/map-1200x600.png',
        'https://placehold.net/map-600x400.png',
        'https://placehold.net/map-400x600.png',
        'https://placehold.net/map-600x600.png',
        'https://placehold.net/map-400x400.png',
    ];
    let m = 0;

    return normalizedHtml.replace(/<img\b[^>]*>/gi, (tag) => {
        const srcMatch = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
        const currentSrc = (srcMatch?.[2] || '').trim();
        const context = `${tag} ${currentSrc}`.toLowerCase();
        const isMap = /map|location|route|pin|geo/.test(context);
        if (!isMap) return tag;
        const dims = currentSrc.match(/(\d{2,4})x(\d{2,4})/i);
        const w = dims ? Number(dims[1]) : 0;
        const h = dims ? Number(dims[2]) : 0;
        const ratio = w > 0 && h > 0 ? w / h : 1;

        const nextSrc = ratio >= 1.8
            ? map[0]
            : ratio >= 1.3
                ? map[1]
                : ratio <= 0.78
                    ? map[2]
                    : ratio > 0.9 && ratio < 1.1
                        ? map[3]
                        : map[m++ % map.length];

        if (srcMatch) {
            return tag.replace(/\bsrc\s*=\s*(["'])(.*?)\1/i, `src="${nextSrc}"`);
        }
        return tag.replace(/<img\b/i, `<img src="${nextSrc}"`);
    });
}

function stripMarkdownBold(text: string): string {
    return text.replace(/\*\*(.*?)\*\*/g, '$1');
}

function stripUiTags(text: string): string {
    return text.replace(/\[(\/)?(h1|h2|h3|p|li|b|i)\]/gi, '');
}

type DesignTokenKey = keyof ProjectDesignSystem['tokens'];

type DesignTokenColorPatch = {
    token: DesignTokenKey;
    from: string;
    to: string;
};

function escapeRegExpLiteral(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTokenColorValue(value: string | undefined): string {
    return String(value || '').trim();
}

function areTokenColorsEquivalent(left: string, right: string): boolean {
    return normalizeTokenColorValue(left).toLowerCase() === normalizeTokenColorValue(right).toLowerCase();
}

function buildDesignTokenColorPatches(
    previous: ProjectDesignSystem | undefined,
    next: ProjectDesignSystem
): DesignTokenColorPatch[] {
    if (!previous?.tokens || !next?.tokens) return [];
    const keys = Object.keys(next.tokens) as DesignTokenKey[];
    return keys.reduce<DesignTokenColorPatch[]>((acc, token) => {
        const from = normalizeTokenColorValue(previous.tokens[token]);
        const to = normalizeTokenColorValue(next.tokens[token]);
        if (!from || !to || areTokenColorsEquivalent(from, to)) return acc;
        acc.push({ token, from, to });
        return acc;
    }, []);
}

function applyDesignTokenColorPatchesToHtml(
    html: string,
    patches: DesignTokenColorPatch[]
): { html: string; changed: boolean } {
    if (!patches.length) return { html, changed: false };
    let nextHtml = String(html || '');
    let changed = false;
    const replacementTable: Array<{ placeholder: string; value: string }> = [];

    patches.forEach((patch, index) => {
        const placeholder = `__EAZYUI_TOKEN_PATCH_${index}__`;
        const pattern = new RegExp(escapeRegExpLiteral(patch.from), 'gi');
        nextHtml = nextHtml.replace(pattern, () => {
            changed = true;
            return placeholder;
        });
        replacementTable.push({ placeholder, value: patch.to });
    });

    replacementTable.forEach((entry) => {
        nextHtml = nextHtml.split(entry.placeholder).join(entry.value);
    });

    return { html: nextHtml, changed };
}

const DESIGN_FONT_STACK_PRESETS = [
    'Plus Jakarta Sans, sans-serif',
    'Inter, sans-serif',
    'Manrope, sans-serif',
    'DM Sans, sans-serif',
    'Sora, sans-serif',
    'Space Grotesk, sans-serif',
    'Urbanist, sans-serif',
    'Outfit, sans-serif',
    'Poppins, sans-serif',
    'Montserrat, sans-serif',
    'Nunito Sans, sans-serif',
    'Lato, sans-serif',
    'Open Sans, sans-serif',
    'Work Sans, sans-serif',
    'Rubik, sans-serif',
    'Archivo, sans-serif',
    'IBM Plex Sans, sans-serif',
    'Public Sans, sans-serif',
    'Noto Sans, sans-serif',
    'Source Sans 3, sans-serif',
    'Raleway, sans-serif',
    'Figtree, sans-serif',
    'Onest, sans-serif',
    'Kanit, sans-serif',
    'Bricolage Grotesque, sans-serif',
    'Syne, sans-serif',
    'Merriweather, serif',
    'Playfair Display, serif',
    'Lora, serif',
];

const DESIGN_RADIUS_PRESETS = ['8px', '10px', '12px', '14px', '16px', '20px', '24px', '999px'];
const DESIGN_RADIUS_STYLE_PRESETS = [
    { key: 'sharp', label: 'Sharp edge', value: '0px' },
    { key: 'slight', label: 'Slight radius', value: '8px' },
    { key: 'normal', label: 'Normal radius', value: '16px' },
    { key: 'full', label: 'Full radius', value: '999px' },
] as const;

const GENERIC_FONT_FAMILIES = new Set([
    'sans-serif',
    'serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-sans-serif',
    'ui-serif',
    'ui-monospace',
    'emoji',
    'math',
    'fangsong',
]);

function normalizeFontStackValue(value: string | undefined): string {
    return String(value || '')
        .replace(/["'`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function normalizePickerHexColor(value: string | undefined, fallback = '#F9A825'): string {
    const raw = String(value || '').trim();
    if (/^#([0-9a-f]{6})$/i.test(raw)) return raw.toUpperCase();
    if (/^#([0-9a-f]{3})$/i.test(raw)) {
        const [, short] = raw.match(/^#([0-9a-f]{3})$/i) || [];
        if (short) {
            return `#${short.split('').map((char) => `${char}${char}`).join('')}`.toUpperCase();
        }
    }
    return fallback;
}

function hexToPickerRgb(value: string): { r: number; g: number; b: number } {
    const normalized = normalizePickerHexColor(value);
    return {
        r: Number.parseInt(normalized.slice(1, 3), 16),
        g: Number.parseInt(normalized.slice(3, 5), 16),
        b: Number.parseInt(normalized.slice(5, 7), 16),
    };
}

function rgbToPickerHex(r: number, g: number, b: number): string {
    return `#${[r, g, b]
        .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
        .join('')}`.toUpperCase();
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    let hue = 0;

    if (delta > 0) {
        if (max === red) hue = 60 * (((green - blue) / delta) % 6);
        else if (max === green) hue = 60 * (((blue - red) / delta) + 2);
        else hue = 60 * (((red - green) / delta) + 4);
    }

    return {
        h: hue < 0 ? hue + 360 : hue,
        s: max === 0 ? 0 : delta / max,
        v: max,
    };
}

function hexToPickerHsv(value: string): { h: number; s: number; v: number } {
    const { r, g, b } = hexToPickerRgb(value);
    return rgbToHsv(r, g, b);
}

function hsvToPickerHex(h: number, s: number, v: number): string {
    const hue = ((h % 360) + 360) % 360;
    const saturation = clamp(s, 0, 1);
    const brightness = clamp(v, 0, 1);
    const chroma = brightness * saturation;
    const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const match = brightness - chroma;
    let red = 0;
    let green = 0;
    let blue = 0;

    if (hue < 60) [red, green, blue] = [chroma, x, 0];
    else if (hue < 120) [red, green, blue] = [x, chroma, 0];
    else if (hue < 180) [red, green, blue] = [0, chroma, x];
    else if (hue < 240) [red, green, blue] = [0, x, chroma];
    else if (hue < 300) [red, green, blue] = [x, 0, chroma];
    else [red, green, blue] = [chroma, 0, x];

    return rgbToPickerHex((red + match) * 255, (green + match) * 255, (blue + match) * 255);
}

function areFontStacksEquivalent(left: string | undefined, right: string | undefined): boolean {
    return normalizeFontStackValue(left) === normalizeFontStackValue(right);
}

function extractPrimaryFontFamily(value: string | undefined): string {
    const raw = String(value || '').split(',')[0] || '';
    return raw.replace(/["'`]/g, '').trim();
}

function isGenericFontFamily(value: string): boolean {
    return GENERIC_FONT_FAMILIES.has(value.trim().toLowerCase());
}

function buildGoogleFontStylesheetHref(fontStacks: string[]): string | null {
    const unique: string[] = [];
    const seen = new Set<string>();

    fontStacks.forEach((stack) => {
        const primary = extractPrimaryFontFamily(stack);
        if (!primary || isGenericFontFamily(primary)) return;
        const normalized = primary.toLowerCase();
        if (seen.has(normalized)) return;
        seen.add(normalized);
        unique.push(primary);
    });

    if (unique.length === 0) return null;

    const families = unique
        .map((family) => `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;500;600;700;800`)
        .join('&');
    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

function applyTypographyToScreenHtml(html: string, displayStack: string, bodyStack: string): { html: string; changed: boolean } {
    let nextHtml = String(html || '');
    let changed = false;

    const displayPrimary = extractPrimaryFontFamily(displayStack);
    const bodyPrimary = extractPrimaryFontFamily(bodyStack);

    if (displayPrimary) {
        const nextDisplayLine = `display: ["${displayPrimary}", "sans-serif"]`;
        const updated = nextHtml.replace(/display\s*:\s*\[[^\]]*\]/i, () => {
            changed = true;
            return nextDisplayLine;
        });
        nextHtml = updated;
    }

    if (bodyPrimary) {
        const nextSansLine = `sans: ["${bodyPrimary}", "sans-serif"]`;
        const updated = nextHtml.replace(/\bsans\s*:\s*\[[^\]]*\]/i, () => {
            changed = true;
            return nextSansLine;
        });
        nextHtml = updated;
    }

    const fontsHref = buildGoogleFontStylesheetHref([displayStack, bodyStack]);
    if (fontsHref) {
        let linkReplaced = false;
        nextHtml = nextHtml.replace(/<link\b[^>]*href=(["'])(https:\/\/fonts\.googleapis\.com\/css2\?[^"']+)\1[^>]*>/gi, (full, _quote: string, href: string) => {
            const lowered = String(href).toLowerCase();
            if (lowered.includes('material+symbols')) return full;
            if (!lowered.includes('family=')) return full;
            if (linkReplaced) return full;
            linkReplaced = true;
            if (href === fontsHref) return full;
            changed = true;
            return full.replace(href, fontsHref);
        });

        if (!linkReplaced && /<\/head>/i.test(nextHtml)) {
            changed = true;
            nextHtml = nextHtml.replace(/<\/head>/i, `    <link href="${fontsHref}" rel="stylesheet">\n</head>`);
        }
    }

    return { html: nextHtml, changed };
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function parseHexColor(value: string): { r: number; g: number; b: number } | null {
    const clean = String(value || '').trim().replace('#', '');
    if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(clean)) return null;
    const full = clean.length === 3 ? clean.split('').map((part) => `${part}${part}`).join('') : clean;
    const n = Number.parseInt(full, 16);
    return {
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: n & 255,
    };
}

function rgbToHex(r: number, g: number, b: number): string {
    return `#${[r, g, b].map((part) => clampNumber(Math.round(part), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function relativeLuminance(r: number, g: number, b: number): number {
    const toLinear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const rr = toLinear(r);
    const gg = toLinear(g);
    const bb = toLinear(b);
    return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}

function normalizeHexColor(value: string): string | null {
    const parsed = parseHexColor(value);
    if (!parsed) return null;
    return rgbToHex(parsed.r, parsed.g, parsed.b).toLowerCase();
}

function hasClassPrefix(classList: string[], prefix: string): boolean {
    return classList.some((item) => item === prefix || item.startsWith(`${prefix}/`));
}

function applyThemeVariantClassRepairsToHtml(
    html: string,
    designSystem: ProjectDesignSystem
): { html: string; changed: boolean } {
    let nextHtml = String(html || '');
    let changed = false;

    const tokenModes = resolveDesignSystemTokenModes(designSystem);
    const darkTokens = tokenModes.dark;

    nextHtml = nextHtml.replace(/\bdark\s*:\s*\{[\s\S]*?\}\s*,?/gi, (full) => {
        if (!full.trim().startsWith('dark:')) return full;
        changed = true;
        return '';
    });

    nextHtml = nextHtml.replace(/\bclass\s*=\s*(["'])([\s\S]*?)\1/gi, (full, quote: string, classValue: string) => {
        const classes = String(classValue || '').split(/\s+/).filter(Boolean);
        if (classes.length === 0) return full;

        const roleForBg: DesignTokenKey =
            hasClassPrefix(classes, 'bg-bg') ? 'bg'
                : hasClassPrefix(classes, 'bg-surface2') ? 'surface2'
                    : hasClassPrefix(classes, 'bg-surface') || classes.includes('bg-white') ? 'surface'
                        : 'surface';
        const roleForText: DesignTokenKey = hasClassPrefix(classes, 'text-muted') ? 'muted' : 'text';
        const roleForBorder: DesignTokenKey = 'stroke';

        const rewritten = classes.map((token) => {
            const match = token.match(/^dark:(bg|text|border|from|to|via)-\[#([0-9a-fA-F]{3,8})\](\/\d{1,3})?$/);
            const named = token.match(/^dark:(bg|text|border|from|to|via)-(white|black)(\/\d{1,3})?$/);
            const rawHex = match ? `#${match[2]}` : named ? (named[2] === 'white' ? '#ffffff' : '#000000') : null;
            if (!rawHex) return token;
            const normalizedHex = normalizeHexColor(rawHex);
            if (!normalizedHex) return token;
            const parsed = parseHexColor(normalizedHex);
            if (!parsed) return token;
            const lum = relativeLuminance(parsed.r, parsed.g, parsed.b);
            const property = (match?.[1] || named?.[1]) as 'bg' | 'text' | 'border' | 'from' | 'to' | 'via';
            const opacity = (match?.[3] || named?.[3] || '');

            if (property === 'bg' || property === 'from' || property === 'to' || property === 'via') {
                if (lum > 0.62 || token === 'dark:bg-black') {
                    changed = true;
                    return `dark:${property}-[${darkTokens[roleForBg]}]${opacity}`;
                }
                return token;
            }
            if (property === 'text') {
                if (lum < 0.45 || token === 'dark:text-black') {
                    changed = true;
                    return `dark:text-[${darkTokens[roleForText]}]${opacity}`;
                }
                if (lum > 0.72 && roleForText === 'muted') {
                    changed = true;
                    return `dark:text-[${darkTokens.muted}]${opacity}`;
                }
                return token;
            }
            if (property === 'border') {
                if (lum > 0.58 || token === 'dark:border-white') {
                    changed = true;
                    return `dark:border-[${darkTokens[roleForBorder]}]${opacity}`;
                }
                return token;
            }
            return token;
        });

        if (rewritten.join(' ') === classes.join(' ')) return full;
        return `class=${quote}${rewritten.join(' ')}${quote}`;
    });

    return { html: nextHtml, changed };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const delta = max - min;
    let h = 0;
    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs((2 * l) - 1));
    if (delta !== 0) {
        if (max === rr) h = ((gg - bb) / delta) % 6;
        else if (max === gg) h = ((bb - rr) / delta) + 2;
        else h = ((rr - gg) / delta) + 4;
    }
    const normalizedHue = Math.round((h * 60 + 360) % 360);
    return {
        h: normalizedHue,
        s: clampNumber(s * 100, 0, 100),
        l: clampNumber(l * 100, 0, 100),
    };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    const hh = ((h % 360) + 360) % 360;
    const ss = clampNumber(s, 0, 100) / 100;
    const ll = clampNumber(l, 0, 100) / 100;

    const c = (1 - Math.abs((2 * ll) - 1)) * ss;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = ll - (c / 2);

    let rr = 0;
    let gg = 0;
    let bb = 0;
    if (hh < 60) {
        rr = c; gg = x; bb = 0;
    } else if (hh < 120) {
        rr = x; gg = c; bb = 0;
    } else if (hh < 180) {
        rr = 0; gg = c; bb = x;
    } else if (hh < 240) {
        rr = 0; gg = x; bb = c;
    } else if (hh < 300) {
        rr = x; gg = 0; bb = c;
    } else {
        rr = c; gg = 0; bb = x;
    }

    return {
        r: Math.round((rr + m) * 255),
        g: Math.round((gg + m) * 255),
        b: Math.round((bb + m) * 255),
    };
}

function mapTokenToThemeVariant(
    tokenName: DesignTokenKey,
    colorValue: string,
    targetMode: 'light' | 'dark'
): string {
    if (tokenName === 'accent' || tokenName === 'accent2') return colorValue;
    const parsed = parseHexColor(colorValue);
    if (!parsed) return colorValue;
    const hsl = rgbToHsl(parsed.r, parsed.g, parsed.b);
    const targetLightnessDark: Record<DesignTokenKey, number> = {
        bg: 7,
        surface: 12,
        surface2: 17,
        text: 95,
        muted: 68,
        stroke: 30,
        accent: hsl.l,
        accent2: hsl.l,
    };
    const targetLightnessLight: Record<DesignTokenKey, number> = {
        bg: 97,
        surface: 100,
        surface2: 94,
        text: 10,
        muted: 45,
        stroke: 90,
        accent: hsl.l,
        accent2: hsl.l,
    };

    const targetLightness = targetMode === 'dark'
        ? targetLightnessDark[tokenName]
        : targetLightnessLight[tokenName];
    const targetSaturation = tokenName === 'text' || tokenName === 'muted' || tokenName === 'stroke'
        ? Math.min(hsl.s, 24)
        : Math.min(hsl.s, 18);
    const rgb = hslToRgb(hsl.h, targetSaturation, targetLightness);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function buildThemeVariantTokens(
    tokens: ProjectDesignSystem['tokens'],
    targetMode: 'light' | 'dark'
): ProjectDesignSystem['tokens'] {
    return {
        ...tokens,
        bg: mapTokenToThemeVariant('bg', tokens.bg, targetMode),
        surface: mapTokenToThemeVariant('surface', tokens.surface, targetMode),
        surface2: mapTokenToThemeVariant('surface2', tokens.surface2, targetMode),
        text: mapTokenToThemeVariant('text', tokens.text, targetMode),
        muted: mapTokenToThemeVariant('muted', tokens.muted, targetMode),
        stroke: mapTokenToThemeVariant('stroke', tokens.stroke, targetMode),
        accent: tokens.accent,
        accent2: tokens.accent2,
    };
}

function resolveActiveThemeMode(themeMode: ProjectDesignSystem['themeMode']): 'light' | 'dark' {
    return themeMode === 'dark' ? 'dark' : 'light';
}

function resolveDesignSystemTokenModes(
    system: ProjectDesignSystem
): { light: ProjectDesignSystem['tokens']; dark: ProjectDesignSystem['tokens'] } {
    if (system.tokenModes?.light && system.tokenModes?.dark) {
        return {
            light: { ...system.tokenModes.light },
            dark: { ...system.tokenModes.dark },
        };
    }
    const activeMode = resolveActiveThemeMode(system.themeMode);
    if (activeMode === 'dark') {
        return {
            dark: { ...system.tokens },
            light: buildThemeVariantTokens(system.tokens, 'light'),
        };
    }
    return {
        light: { ...system.tokens },
        dark: buildThemeVariantTokens(system.tokens, 'dark'),
    };
}

function normalizeProjectDesignSystemModes(system: ProjectDesignSystem): ProjectDesignSystem {
    const tokenModes = resolveDesignSystemTokenModes(system);
    const activeMode = resolveActiveThemeMode(system.themeMode);
    return {
        ...system,
        tokenModes,
        tokens: activeMode === 'dark' ? { ...tokenModes.dark } : { ...tokenModes.light },
    };
}

function areRadiusValuesEquivalent(left: string | undefined, right: string | undefined): boolean {
    return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

function applyRadiusToScreenHtml(
    html: string,
    radius: ProjectDesignSystem['radius']
): { html: string; changed: boolean } {
    let nextHtml = String(html || '');
    let changed = false;

    nextHtml = nextHtml.replace(/(\bxl\s*:\s*)(["'`])([^"'`]+)\2/i, (full, prefix: string, quote: string, current: string) => {
        if (areRadiusValuesEquivalent(current, radius.control)) return full;
        changed = true;
        return `${prefix}${quote}${radius.control}${quote}`;
    });

    nextHtml = nextHtml.replace(/((["']?)2xl\2\s*:\s*)(["'`])([^"'`]+)\3/i, (full, prefix: string, _keyQuote: string, quote: string, current: string) => {
        if (areRadiusValuesEquivalent(current, radius.card)) return full;
        changed = true;
        return `${prefix}${quote}${radius.card}${quote}`;
    });

    nextHtml = nextHtml.replace(/((["']?)3xl\2\s*:\s*)(["'`])([^"'`]+)\3/i, (full, prefix: string, _keyQuote: string, quote: string, current: string) => {
        if (areRadiusValuesEquivalent(current, radius.pill)) return full;
        changed = true;
        return `${prefix}${quote}${radius.pill}${quote}`;
    });

    return { html: nextHtml, changed };
}

function makePlannerTargetedGenerationPrompt(basePrompt: string, screenNames: string[], existingScreenNames: string[]): string {
    const targets = screenNames.map((name) => `- ${name}`).join('\n');
    const existing = existingScreenNames.length > 0
        ? existingScreenNames.map((name) => `- ${name}`).join('\n')
        : '- none';

    return `${basePrompt}

Follow-up generation task:
Generate EXACTLY these screens:
${targets}

Do NOT regenerate existing screens:
${existing}

Maintain visual consistency with existing screens:
- keep the same token palette
- keep the same motif and typography direction
- keep the same navigation language`;
}

function makePlannerTargetedGenerationPromptWithStyle(
    basePrompt: string,
    screenNames: string[],
    existingScreenNames: string[],
    styleReference?: string
): string {
    const base = makePlannerTargetedGenerationPrompt(basePrompt, screenNames, existingScreenNames);
    if (!styleReference?.trim()) return base;
    return `${base}

Style continuity requirements (STRICT):
- Reuse the same light/dark theme direction as existing screens.
- Reuse the same token palette mapping (bg/surface/surface2/text/muted/stroke/accent/accent2).
- Match the same radii, spacing rhythm, card treatments, and nav language.
- Continue as the same design system, not a new theme.

Reference style tokens/snippets:
${styleReference}`;
}

function formatPostgenSuggestionText(postgen: PlannerPostgenResponse): string {
    const gaps = postgen.gapsDetected.slice(0, 3).map((gap) => `[li]${gap}[/li]`).join('\n');
    const next = postgen.nextScreenSuggestions
        .slice(0, 3)
        .map((item) => `[li][b]${item.name}[/b]: ${item.why}[/li]`)
        .join('\n');

    return `[h2]Recommended Next Screens[/h2]
[p]Based on what is already generated, these are the highest-impact next moves.[/p]
[h3]Gaps detected[/h3]
${gaps || '[li]No critical gaps detected.[/li]'}
[h3]Suggested next screens[/h3]
${next || '[li]No additional screen suggestions.[/li]'}`;
}

type PlannerCtaPayload = {
    callToAction?: {
        primary?: { label: string; screenNames: string[] };
        secondary?: { label: string; screenNames: string[] };
    };
    nextScreenSuggestions?: Array<{ name: string; why: string; priority: number; details?: string }>;
};

type PlannerSuggestionContext = {
    appPrompt: string;
    platform: 'mobile' | 'tablet' | 'desktop';
    stylePreset: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
    modelProfile: DesignModelProfile;
    existingScreenNames: string[];
    styleReference?: string;
    referenceUrls?: string[];
};

type DesignSystemProposalContext = {
    prompt: string;
    appPromptForPlanning: string;
    images?: string[];
    referenceUrls?: string[];
    referenceImageUrls?: string[];
    platform: 'mobile' | 'tablet' | 'desktop';
    stylePreset: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
    modelProfile: DesignModelProfile;
    referenceScreens: ComposerScreenReference[];
    parentUserId: string;
};

type ComposerScreenReference = {
    screenId: string;
    name: string;
};

type ComposerSuggestion = {
    key: string;
    messageId: string;
    label: string;
    screenNames: string[];
    tone: 'primary' | 'secondary';
    details?: string;
};

type CreditAwareOperation = 'design_system' | 'generate' | 'generate_stream' | 'edit';

function buildComposerSuggestionKey(screenNames: string[]): string {
    return screenNames.map((name) => name.trim().toLowerCase()).filter(Boolean).join('|');
}

function deriveMessageSuggestions(
    messageId: string,
    postgen: PlannerPostgenResponse | PlannerCtaPayload | undefined,
    usedKeys: Set<string>
): ComposerSuggestion[] {
    if (!postgen) return [];

    const next: ComposerSuggestion[] = [];
    const seen = new Set<string>();

    const pushSuggestion = (label: string, screenNames: string[], tone: 'primary' | 'secondary', details?: string) => {
        if (!screenNames.length) return;
        const key = buildComposerSuggestionKey(screenNames);
        if (!key || seen.has(key) || usedKeys.has(key)) return;
        seen.add(key);
        next.push({
            key,
            messageId,
            label,
            screenNames,
            tone,
            ...(details ? { details } : {}),
        });
    };

    const extra = (postgen as (PlannerPostgenResponse | PlannerCtaPayload | undefined))?.nextScreenSuggestions || [];
    const detailByName = new Map(
        extra.map((item) => [item.name.trim().toLowerCase(), item.details || item.why || ''])
    );

    if (postgen?.callToAction?.primary) {
        const primaryDetails = postgen.callToAction.primary.screenNames.length === 1
            ? detailByName.get(postgen.callToAction.primary.screenNames[0].trim().toLowerCase())
            : '';
        pushSuggestion(postgen.callToAction.primary.label, postgen.callToAction.primary.screenNames, 'primary', primaryDetails);
        if (postgen.callToAction.primary.screenNames.length > 1) {
            postgen.callToAction.primary.screenNames.forEach((name) => {
                pushSuggestion(`Generate ${name}`, [name], 'secondary', detailByName.get(name.trim().toLowerCase()));
            });
        }
    }
    if (postgen?.callToAction?.secondary) {
        const secondaryDetails = postgen.callToAction.secondary.screenNames.length === 1
            ? detailByName.get(postgen.callToAction.secondary.screenNames[0].trim().toLowerCase())
            : '';
        pushSuggestion(postgen.callToAction.secondary.label, postgen.callToAction.secondary.screenNames, 'secondary', secondaryDetails);
        if (postgen.callToAction.secondary.screenNames.length > 1) {
            postgen.callToAction.secondary.screenNames.forEach((name) => {
                pushSuggestion(`Generate ${name}`, [name], 'secondary', detailByName.get(name.trim().toLowerCase()));
            });
        }
    }
    extra.forEach((item) => {
        pushSuggestion(`Generate ${item.name}`, [item.name], 'secondary', item.details || item.why);
    });

    return next.slice(0, 8);
}

function extractTailwindTokenSnippet(html: string): string {
    const match = html.match(/<script[^>]*>[\s\S]*?tailwind\.config[\s\S]*?<\/script>/i);
    if (!match) return '';
    return match[0].slice(0, 2800);
}

function buildContinuationStyleReference(screens: HtmlScreen[]): string {
    const chunks = screens
        .slice(0, 3)
        .map((screen) => {
            const tokenSnippet = extractTailwindTokenSnippet(screen.html);
            if (!tokenSnippet) return '';
            return `Screen "${screen.name}" token/style snippet:\n${tokenSnippet}`;
        })
        .filter(Boolean);
    return chunks.join('\n\n');
}

function buildReferencedScreensPromptContext(screens: HtmlScreen[]): string {
    if (!Array.isArray(screens) || screens.length === 0) return '';
    const lines = screens.map((screen) => `- ${screen.name}`);
    const snippets = screens
        .slice(0, 2)
        .map((screen) => {
            const tokenSnippet = extractTailwindTokenSnippet(screen.html);
            if (!tokenSnippet) return '';
            return `Reference tokens from "${screen.name}":\n${tokenSnippet}`;
        })
        .filter(Boolean);
    const snippetBlock = snippets.length > 0 ? `\n\n${snippets.join('\n\n')}` : '';
    return `Referenced canvas screens (treat as attached context):\n${lines.join('\n')}

Use these references to keep stylistic continuity with existing screens unless explicitly overridden.${snippetBlock}`;
}

function buildScreenReferenceMeta(screens: HtmlScreen[]): {
    screenIds: string[];
    screenSnapshots: Record<string, { screenId: string; name: string; html: string; width: number; height: number }>;
} {
    const unique: HtmlScreen[] = [];
    const seen = new Set<string>();
    screens.forEach((screen) => {
        if (seen.has(screen.screenId)) return;
        seen.add(screen.screenId);
        unique.push(screen);
    });
    return {
        screenIds: unique.map((screen) => screen.screenId),
        screenSnapshots: unique.reduce<Record<string, { screenId: string; name: string; html: string; width: number; height: number }>>((acc, screen) => {
            acc[screen.screenId] = {
                screenId: screen.screenId,
                name: screen.name,
                html: screen.html,
                width: screen.width,
                height: screen.height,
            };
            return acc;
        }, {}),
    };
}

function buildPlanCallToAction(plan: PlannerPlanResponse): PlannerCtaPayload['callToAction'] | undefined {
    const requested = (plan.generationSuggestion?.generateTheseNow || []).filter(Boolean);
    const recommended = plan.recommendedScreens
        .slice()
        .sort((a, b) => (a.priority || 99) - (b.priority || 99))
        .map((item) => item.name)
        .filter(Boolean);

    const unique = [...new Set([...(requested.length > 0 ? requested : []), ...recommended])];
    const primary = unique[0];
    const secondary = unique[1];
    if (!primary && !secondary) return undefined;

    return {
        primary: primary
            ? {
                label: `Generate ${primary}`,
                screenNames: [primary],
            }
            : undefined,
        secondary: secondary
            ? {
                label: `Generate ${secondary}`,
                screenNames: [secondary],
            }
            : undefined,
    };
}

function normalizeSuggestedProjectName(value: string | undefined): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const firstClause = raw.split(/[|:;,]/)[0] || raw;
    const withoutQuotes = firstClause.replace(/^["'`]+|["'`]+$/g, '').trim();
    const compact = withoutQuotes
        .replace(/\bdesign\s+system\b/gi, ' ')
        .replace(/\bproject\s+design\b/gi, ' ')
        .replace(/^(create|build|design|generate|make|craft|an?|the)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    const beforeQualifiers = compact.split(/\b(with|for|like|featuring|including|that|where)\b/i)[0] || compact;
    const cleaned = beforeQualifiers
        .replace(/[^\w\s&-]/g, ' ')
        .replace(/\b(app|application|ui|ux|screen|screens|page|pages|mobile|web|website)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const words = cleaned.split(' ').filter(Boolean).slice(0, 4);
    const candidate = words.join(' ').trim();
    if (!candidate) return '';
    return candidate.slice(0, 72).trim();
}

function deriveProjectNameFromPrompt(prompt: string): string {
    const compact = String(prompt || '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!compact) return '';

    const withoutLead = compact
        .replace(/^(create|build|design|generate|make|craft)\s+/i, '')
        .replace(/^(an?|the)\s+/i, '');

    const cleaned = withoutLead
        .replace(/[^\w\s&-]/g, ' ')
        .replace(/\b(app|screen|screens|ui|design|website|mobile)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const candidate = cleaned
        .split(' ')
        .filter(Boolean)
        .slice(0, 6)
        .join(' ');

    return normalizeSuggestedProjectName(candidate || compact.slice(0, 42));
}

function isGenericProjectName(value: string | undefined): boolean {
    const name = String(value || '').trim().toLowerCase();
    if (!name) return true;
    return ['untitled', 'untitled project', 'new design', 'new project', 'chat'].includes(name);
}

function buildRouteChatSuggestionPayload(route: {
    recommendNextScreens?: boolean;
    nextScreenSuggestions?: Array<{ name: string; why: string; priority?: number; details?: string }>;
}): PlannerCtaPayload | undefined {
    const next = (route.nextScreenSuggestions || [])
        .slice(0, 6)
        .map((item, index) => ({
            name: item.name,
            why: item.why || 'Recommended next step.',
            priority: item.priority || index + 1,
            details: item.details || item.why || 'Recommended next step.',
        }))
        .filter((item) => item.name);
    if (next.length === 0) return undefined;
    return {
        nextScreenSuggestions: next,
        callToAction: {
            primary: {
                label: `Generate ${next[0].name}`,
                screenNames: [next[0].name],
            },
            secondary: next[1]
                ? {
                    label: `Generate ${next[1].name}`,
                    screenNames: [next[1].name],
                }
                : undefined,
        },
    };
}

function formatPlanSuggestionText(plan: PlannerPlanResponse): string {
    const assumptions = plan.assumptions.slice(0, 4).map((item) => `[li]${item}[/li]`).join('\n');
    const screens = plan.recommendedScreens
        .slice()
        .sort((a, b) => (a.priority || 99) - (b.priority || 99))
        .slice(0, 4)
        .map((item) => `[li][b]${item.name}[/b]: ${item.goal || item.why || 'Core screen in the product flow.'}[/li]`)
        .join('\n');
    const questions = plan.questions.slice(0, 4).map((item) => `[li]${item.q}[/li]`).join('\n');

    return `[h2]Plan Ready${plan.appName ? `: ${plan.appName}` : ''}[/h2]
[p]${plan.oneLineConcept || 'Core concept and flow defined from your prompt.'}[/p]
[h3]Recommended screens[/h3]
${screens || '[li]No screens suggested.[/li]'}
[h3]Assumptions[/h3]
${assumptions || '[li]No explicit assumptions.[/li]'}
[h3]Questions to refine[/h3]
${questions || '[li]No blocking questions.[/li]'}`;
}

type RoutingScreenDetail = { screenId: string; name: string; htmlSummary: string };

type ConsistencyIssue = {
    code: 'navbar-mismatch' | 'navbar-missing' | 'design-token-missing';
    message: string;
    severity: 'warn' | 'error';
};

function summarizeHtmlForRouting(html: string): string {
    const text = String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.slice(0, 280);
}

const ROUTE_MATCH_STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you',
    'screen', 'screens', 'page', 'pages', 'make', 'build', 'create', 'generate', 'add',
    'new', 'please', 'need', 'want', 'have', 'show', 'give', 'can', 'could', 'would',
    'should', 'just', 'then', 'also', 'like',
]);

function tokenizeRouteMatchText(input: string): string[] {
    return String(input || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !ROUTE_MATCH_STOP_WORDS.has(token));
}

function scoreRouteReferenceCandidate(prompt: string, screen: HtmlScreen): number {
    const promptLower = String(prompt || '').toLowerCase();
    const promptTokens = tokenizeRouteMatchText(promptLower);
    if (promptTokens.length === 0) return 0;

    const name = String(screen.name || '').toLowerCase();
    const summary = summarizeHtmlForRouting(screen.html).toLowerCase();
    const navLabels = extractNavbarLabelsFromHtml(screen.html).join(' ').toLowerCase();
    const quickCorpus = `${name} ${summary} ${navLabels}`;
    const htmlLower = String(screen.html || '').toLowerCase();

    let score = 0;
    promptTokens.forEach((token) => {
        if (name.includes(token)) score += 6;
        if (quickCorpus.includes(token)) score += 2.5;
        if (token.length >= 5 && htmlLower.includes(token)) score += 0.7;
    });

    if (/(create|add|build|generate|new)/i.test(promptLower) && /<nav\b/i.test(screen.html || '')) {
        score += 1.4;
    }
    if (/(profile|account|settings|user|me)/i.test(promptLower) && /(profile|account|settings|avatar|user)/i.test(quickCorpus)) {
        score += 3;
    }
    if (/\b(dashboard|home)\b/i.test(name)) {
        score += 0.6;
    }
    if (!/\bdetail\b/i.test(promptLower) && /\bdetail\b/i.test(name)) {
        score -= 0.5;
    }
    return score;
}

function mergeReferenceScreens(primary: HtmlScreen[], secondary: HtmlScreen[], limit = 2): HtmlScreen[] {
    const merged: HtmlScreen[] = [];
    const seen = new Set<string>();
    [...primary, ...secondary].forEach((screen) => {
        if (!screen || seen.has(screen.screenId)) return;
        seen.add(screen.screenId);
        merged.push(screen);
    });
    return merged.slice(0, limit);
}

function pickRouteReferenceScreens(prompt: string, allScreens: HtmlScreen[], explicitReferences: HtmlScreen[] = []): HtmlScreen[] {
    const validScreens = (allScreens || []).filter(Boolean);
    if (validScreens.length === 0) return [];

    const byId = new Map(validScreens.map((screen) => [screen.screenId, screen] as const));
    const explicit = explicitReferences
        .map((screen) => byId.get(screen.screenId))
        .filter(Boolean) as HtmlScreen[];
    if (explicit.length > 0) return explicit.slice(0, 1);

    const scored = validScreens
        .map((screen) => ({ screen, score: scoreRouteReferenceCandidate(prompt, screen) }))
        .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return [];
    if (scored[0].score > 0.1) return [scored[0].screen];

    const dashboardLike = validScreens.find((screen) => /\b(dashboard|home)\b/i.test(screen.name));
    if (dashboardLike) return [dashboardLike];
    return [validScreens[0]];
}

function buildRoutingScreenDetails(screens: HtmlScreen[]): RoutingScreenDetail[] {
    return screens.slice(0, 24).map((screen) => ({
        screenId: screen.screenId,
        name: screen.name,
        htmlSummary: summarizeHtmlForRouting(screen.html),
    }));
}

function buildRecentConversation(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>) {
    return messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .slice(-8)
        .map((message) => ({
            role: message.role as 'user' | 'assistant',
            content: String(message.content || '').replace(/\s+/g, ' ').trim().slice(0, 260),
        }))
        .filter((message) => message.content.length > 0);
}

function buildProjectMemorySummary(memory: ProjectMemory | null | undefined, screens: HtmlScreen[], messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>): string {
    const source = memory || null;
    const screenNames = source?.summary?.screenNames?.length
        ? source.summary.screenNames
        : screens.map((screen) => screen.name).slice(0, 12);
    const lastRequests = source?.summary?.lastUserRequests?.length
        ? source.summary.lastUserRequests
        : messages.filter((message) => message.role === 'user').map((message) => message.content).slice(-8);
    const navbarLabels = source?.components?.navbar?.labels || [];
    const tokenKeys = source?.style?.tokenKeys || [];
    const lines = [
        `screenCount=${source?.summary?.screenCount ?? screens.length}`,
        `screenNames=${screenNames.join(', ') || 'none'}`,
        `recentUserRequests=${lastRequests.map((item) => item.replace(/\s+/g, ' ').trim().slice(0, 140)).join(' || ') || 'none'}`,
        `canonicalNavbarLabels=${navbarLabels.join(', ') || 'none'}`,
        `tokenKeys=${tokenKeys.join(', ') || 'none'}`,
    ];
    return lines.join('\n').slice(0, 2400);
}

function deriveProjectMemoryFromState(screens: HtmlScreen[], messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>, designSystem?: ProjectDesignSystem): ProjectMemory {
    const navbarSource = screens
        .map((screen) => ({
            screenId: screen.screenId,
            screenName: screen.name,
            labels: extractNavbarLabelsFromHtml(screen.html),
        }))
        .find((entry) => entry.labels.length >= 2);
    return {
        version: 1,
        updatedAt: new Date().toISOString(),
        summary: {
            screenCount: screens.length,
            screenNames: screens.map((screen) => screen.name).slice(0, 24),
            lastUserRequests: messages
                .filter((message) => message.role === 'user')
                .map((message) => String(message.content || '').replace(/\s+/g, ' ').trim().slice(0, 220))
                .filter(Boolean)
                .slice(-16),
        },
        components: navbarSource
            ? {
                navbar: {
                    sourceScreenId: navbarSource.screenId,
                    sourceScreenName: navbarSource.screenName,
                    labels: navbarSource.labels.slice(0, 8),
                    signature: navbarSource.labels.map((label) => label.toLowerCase()).join('|'),
                },
            }
            : undefined,
        style: {
            themeMode: designSystem?.themeMode,
            displayFont: designSystem?.typography?.displayFont,
            bodyFont: designSystem?.typography?.bodyFont,
            tokenKeys: designSystem?.tokens ? Object.keys(designSystem.tokens).slice(0, 12) : [],
        },
    };
}

function resolveRoutedScreens(route: PlannerRouteResponse, screens: HtmlScreen[], referencedScreens: HtmlScreen[] = []): HtmlScreen[] {
    const byId = new Map(screens.map((screen) => [screen.screenId, screen] as const));
    const ordered: HtmlScreen[] = [];
    const seen = new Set<string>();
    const push = (screen: HtmlScreen | null | undefined) => {
        if (!screen || seen.has(screen.screenId)) return;
        seen.add(screen.screenId);
        ordered.push(screen);
    };

    const candidateNames = Array.from(new Set([
        ...(route.matchedExistingScreenNames || []),
        ...(route.targetScreenNames || []),
        route.matchedExistingScreenName || '',
        route.targetScreenName || '',
        route.referenceExistingScreenName || '',
    ]
        .map((name) => String(name || '').trim().toLowerCase())
        .filter(Boolean)));

    const all = screens.slice();
    for (const candidate of candidateNames) {
        const exact = all.find((screen) => screen.name.trim().toLowerCase() === candidate);
        if (exact) push(exact);
    }
    for (const candidate of candidateNames) {
        const partial = all.find((screen) => screen.name.trim().toLowerCase().includes(candidate) || candidate.includes(screen.name.trim().toLowerCase()));
        if (partial) push(partial);
    }

    // Only use referenced screens as fallback when planner did not provide usable target names.
    if (ordered.length === 0) {
        for (const referenced of referencedScreens) {
            push(byId.get(referenced.screenId));
        }
    }

    return ordered;
}

function extractNavbarLabelsFromHtml(html: string): string[] {
    const navMatch = String(html || '').match(/<nav\b[\s\S]*?<\/nav>/i);
    if (!navMatch) return [];
    const labels: string[] = [];
    const seen = new Set<string>();
    const regex = />([^<>]{1,48})</g;
    let match: RegExpExecArray | null = regex.exec(navMatch[0]);
    while (match) {
        const label = String(match[1] || '').replace(/\s+/g, ' ').trim();
        const normalized = label.toLowerCase();
        if (label.length >= 2 && !seen.has(normalized) && /[a-z]/i.test(normalized)) {
            labels.push(label);
            seen.add(normalized);
        }
        if (labels.length >= 8) break;
        match = regex.exec(navMatch[0]);
    }
    return labels;
}

function getLabelSimilarityScore(current: string[], canonical: string[]): number {
    if (current.length === 0 || canonical.length === 0) return 0;
    const a = new Set(current.map((item) => item.toLowerCase()));
    const b = new Set(canonical.map((item) => item.toLowerCase()));
    const union = new Set([...a, ...b]);
    if (union.size === 0) return 0;
    let overlap = 0;
    a.forEach((item) => {
        if (b.has(item)) overlap += 1;
    });
    return overlap / union.size;
}

function validateScreenConsistency(params: {
    html: string;
    memory: ProjectMemory | null | undefined;
    designSystem?: ProjectDesignSystem;
}): ConsistencyIssue[] {
    const { html, memory, designSystem } = params;
    const issues: ConsistencyIssue[] = [];
    const canonicalNavbar = memory?.components?.navbar;
    const currentNavbarLabels = extractNavbarLabelsFromHtml(html);

    if (canonicalNavbar?.labels?.length) {
        if (currentNavbarLabels.length === 0) {
            issues.push({
                code: 'navbar-missing',
                message: 'Screen is missing a navbar while project has a canonical navbar pattern.',
                severity: 'warn',
            });
        } else {
            const similarity = getLabelSimilarityScore(currentNavbarLabels, canonicalNavbar.labels);
            if (similarity < 0.34) {
                issues.push({
                    code: 'navbar-mismatch',
                    message: `Navbar labels diverge from project pattern (${currentNavbarLabels.join(', ')} vs ${canonicalNavbar.labels.join(', ')}).`,
                    severity: 'error',
                });
            }
        }
    }

    if (designSystem && !/tailwind\.config/i.test(html)) {
        issues.push({
            code: 'design-token-missing',
            message: 'Screen is missing tailwind token config, which can break design-system consistency.',
            severity: 'warn',
        });
    }

    return issues;
}

function getThinkingSeconds(message: any): number | null {
    const explicit = Number(message?.meta?.thinkingMs);
    if (Number.isFinite(explicit) && explicit > 0) {
        return Math.max(1, Math.round(explicit / 1000));
    }
    const startedAt = Number(message?.meta?.feedbackStart);
    if (Number.isFinite(startedAt) && startedAt > 0 && message?.status === 'streaming') {
        return Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    }
    return null;
}

function toTokenInt(value: unknown): number | null {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return null;
    return Math.round(numeric);
}

function getBillingTotalTokens(billing: unknown): number | null {
    if (!billing || typeof billing !== 'object') return null;
    const bill = billing as {
        usage?: { totalTokens?: unknown };
        usageQuote?: { totals?: { totalTokens?: unknown } };
    };
    const fromUsage = toTokenInt(bill.usage?.totalTokens);
    if (fromUsage !== null) return fromUsage;
    const fromQuote = toTokenInt(bill.usageQuote?.totals?.totalTokens);
    if (fromQuote !== null) return fromQuote;
    return null;
}

function getMessageTokenUsageTotal(message: any): number | null {
    const direct = toTokenInt(message?.meta?.tokenUsageTotal);
    if (direct !== null) return direct;
    const nested = toTokenInt(message?.meta?.tokenUsage?.totalTokens);
    if (nested !== null) return nested;
    return null;
}

function formatTokenUsageLabel(totalTokens: number | null): string {
    if (totalTokens === null) return 'Tokens used: —';
    return `Tokens used: ${totalTokens.toLocaleString()}`;
}

type ProcessStepLabel = {
    present: string;
    past: string;
};

function getProcessSteps(message: any): ProcessStepLabel[] {
    const isEditFlow = Boolean(message?.screenRef);
    if (isEditFlow) {
        return [
            { present: 'Analyzing selected screen', past: 'Analyzed selected screen' },
            { present: 'Planning targeted updates', past: 'Planned targeted updates' },
            { present: 'Applying structure and styles', past: 'Applied structure and styles' },
            { present: 'Finalizing edit output', past: 'Finalized edit output' },
        ];
    }
    return [
        { present: 'Analyzing user intent', past: 'Analyzed user intent' },
        { present: 'Exploring visual trends', past: 'Explored visual trends' },
        { present: 'Collecting references', past: 'Collected references' },
        { present: 'Rendering screens', past: 'Rendered screens' },
    ];
}

function getProcessProgress(message: any, steps: ProcessStepLabel[]): { doneUntil: number; activeAt: number } {
    if (message?.status === 'complete') {
        return { doneUntil: steps.length - 1, activeAt: -1 };
    }
    if (message?.status === 'pending') {
        return { doneUntil: -1, activeAt: 0 };
    }
    if (message?.status === 'streaming') {
        if (message?.meta?.thinkingStopped) {
            return { doneUntil: Math.max(0, steps.length - 2), activeAt: steps.length - 1 };
        }
        const startMs = Number(message?.meta?.feedbackStart || 0);
        const elapsedMs = startMs > 0 ? Math.max(0, Date.now() - startMs) : 0;
        // Reveal a new step about every 12s so all 4 are visible well before 50s.
        const activeAt = Math.min(steps.length - 1, Math.floor(elapsedMs / 12000));
        return { doneUntil: activeAt - 1, activeAt };
    }
    return { doneUntil: -1, activeAt: -1 };
}

function getProcessVisibleCount(message: any, steps: ProcessStepLabel[]): number {
    const progress = getProcessProgress(message, steps);
    if (progress.activeAt >= 0) return Math.min(steps.length, progress.activeAt + 1);
    if (progress.doneUntil >= 0) return Math.min(steps.length, progress.doneUntil + 1);
    return 1;
}

type ScreenPreviewLike = {
    name?: string;
    html?: string;
    width?: number;
    height?: number;
};

function ScreenReferenceThumb({
    screenId,
    preview,
    label,
    thumbWidth,
    onFocus,
}: {
    screenId: string;
    preview: ScreenPreviewLike | null;
    label: string;
    thumbWidth: number;
    onFocus: (id: string) => void;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [mountIframe, setMountIframe] = useState(false);

    useEffect(() => {
        if (mountIframe) return;
        const target = containerRef.current;
        if (!target) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setMountIframe(true);
                    observer.disconnect();
                }
            },
            { root: null, rootMargin: '260px 0px' }
        );
        observer.observe(target);
        return () => observer.disconnect();
    }, [mountIframe]);

    const sourceW = Math.max(280, Math.min(1440, preview?.width || 402));
    const rawSourceH = preview?.height || 874;
    // Clamp very tall captured screens so thumbnails remain readable and stable.
    const sourceH = Math.max(Math.round(sourceW * 1.1), Math.min(rawSourceH, Math.round(sourceW * 2.2)));
    const thumbH = preview
        ? Math.max(96, Math.min(150, Math.round(thumbWidth * (sourceH / sourceW))))
        : 120;
    const scale = Math.min(thumbWidth / sourceW, thumbH / sourceH);
    const scaledW = Math.max(1, Math.floor(sourceW * scale));
    const scaledH = Math.max(1, Math.floor(sourceH * scale));
    const offsetX = Math.floor((thumbWidth - scaledW) / 2);
    const offsetY = Math.floor((thumbH - scaledH) / 2);

    return (
        <button
            key={screenId}
            onClick={() => onFocus(screenId)}
            className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] backdrop-blur-sm p-1.5 transition-all hover:bg-[var(--ui-surface-3)] hover:border-[var(--ui-border-light)] active:scale-[0.99]"
            style={{ width: thumbWidth + 12 }}
            title={`Focus ${label} on canvas`}
        >
            <div
                ref={containerRef}
                className="rounded-lg overflow-hidden border border-[var(--ui-border)] bg-transparent relative"
                style={{ width: thumbWidth, height: thumbH }}
            >
                {preview?.html ? (
                    mountIframe ? (
                        <div className="absolute left-0 top-0" style={{ width: thumbWidth, height: thumbH }}>
                            <iframe
                                srcDoc={injectThumbScrollbarHide(preview.html)}
                                title={`preview-${screenId}`}
                                sandbox="allow-scripts"
                                scrolling="no"
                                className="pointer-events-none absolute"
                                style={{
                                    width: sourceW,
                                    height: sourceH,
                                    transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
                                    transformOrigin: 'top left',
                                    border: '0',
                                }}
                            />
                        </div>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-[var(--ui-text-subtle)]">
                            Preview
                        </div>
                    )
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-[var(--ui-text-subtle)]">No preview</div>
                )}
            </div>
            <div className="mt-1 text-[10px] text-[var(--ui-text-muted)] font-semibold truncate">{label}</div>
        </button>
    );
}

function DesignSystemReferenceStrip({
    screenIds,
    designSystem,
    onFocus,
}: {
    screenIds: string[];
    designSystem?: ProjectDesignSystem | null;
    onFocus: (id: string) => void;
}) {
    const palette = [
        designSystem?.tokens.bg,
        designSystem?.tokens.surface,
        designSystem?.tokens.surface2,
        designSystem?.tokens.accent,
        designSystem?.tokens.accent2,
        designSystem?.tokens.text,
    ].filter(Boolean) as string[];
    const uniquePalette = [...new Set(palette)];
    const swatches = (uniquePalette.length > 0 ? uniquePalette : ['#111827', '#1F2937', '#374151', '#6366F1', '#14B8A6']).slice(0, 6);
    const targetId = screenIds[0] || '';

    return (
        <button
            type="button"
            onClick={() => {
                if (targetId) onFocus(targetId);
            }}
            className="inline-flex items-center gap-2 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2.5 py-2 shadow-sm transition-all hover:bg-[var(--ui-surface-3)] hover:border-[var(--ui-border-light)]"
            title="Using project style context from the canvas"
        >
            <div className="flex overflow-hidden rounded-xl border border-[var(--ui-border)]">
                {swatches.map((color, index) => (
                    <span
                        key={`reference-strip-${index}-${color}`}
                        className="h-7 w-7"
                        style={{ background: color }}
                    />
                ))}
            </div>
            <div className="text-right leading-tight">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Style Context</p>
                <p className="text-[11px] text-[var(--ui-text-muted)]">Project palette</p>
            </div>
        </button>
    );
}

function renderInlineRichText(text: string): ReactNode[] {
    const nodes: ReactNode[] = [];
    const pattern = /\[(b|i)\]([\s\S]*?)\[\/\1\]/gi;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    const renderColorTokens = (input: string, prefix: string): ReactNode[] => {
        const out: ReactNode[] = [];
        const colorPattern = /(#[0-9A-Fa-f]{3,8}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)|hsla?\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?%\s*,\s*\d+(?:\.\d+)?%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))/g;
        let cursor = 0;
        let tokenMatch: RegExpExecArray | null;
        let tokenIndex = 0;

        while ((tokenMatch = colorPattern.exec(input)) !== null) {
            if (tokenMatch.index > cursor) {
                out.push(input.slice(cursor, tokenMatch.index));
            }
            const token = tokenMatch[0];
            out.push(
                <span key={`${prefix}-color-${tokenIndex++}`} className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-[var(--ui-surface-3)] border border-[var(--ui-border)] align-middle">
                    <span
                        className="inline-block w-2.5 h-2.5 rounded-full border border-[var(--ui-border-light)]"
                        style={{ backgroundColor: token }}
                    />
                    <code className="text-[11px] leading-none text-[var(--ui-primary)]">{token}</code>
                </span>
            );
            cursor = tokenMatch.index + token.length;
        }

        if (cursor < input.length) {
            out.push(input.slice(cursor));
        }

        return out;
    };

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            nodes.push(...renderColorTokens(text.slice(lastIndex, match.index), `plain-${key}`));
        }
        const tag = match[1].toLowerCase();
        const content = match[2];
        if (tag === 'b') nodes.push(<strong key={`rb-${key++}`} className="font-semibold text-[var(--ui-primary-hover)]">{renderColorTokens(content, `b-${key}`)}</strong>);
        if (tag === 'i') nodes.push(<em key={`ri-${key++}`} className="italic text-[var(--ui-text-muted)]">{renderColorTokens(content, `i-${key}`)}</em>);
        lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
        nodes.push(...renderColorTokens(text.slice(lastIndex), `tail-${key}`));
    }

    return nodes;
}

function renderPlainChunk(text: string, keyPrefix: string): ReactNode[] {
    const lines = text
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    return lines.map((line, idx) => {
        if (line.startsWith('- ')) {
            return <li key={`${keyPrefix}-li-${idx}`} className="ml-5 list-disc mb-1 text-[var(--ui-text)]">{renderInlineRichText(line.slice(2).trim())}</li>;
        }
        return <p key={`${keyPrefix}-p-${idx}`} className="mb-2 text-[var(--ui-text)] leading-relaxed">{renderInlineRichText(line)}</p>;
    });
}

function normalizeSupportedHtmlTags(text: string): string {
    return text
        .replace(/<\s*ul(?:\s[^>]*)?>/gi, '[ul]')
        .replace(/<\s*\/\s*ul\s*>/gi, '[/ul]')
        .replace(/<\s*li(?:\s[^>]*)?>/gi, '[li]')
        .replace(/<\s*\/\s*li\s*>/gi, '[/li]');
}

function renderListItems(text: string, keyPrefix: string): ReactNode[] {
    const items: ReactNode[] = [];
    const liPattern = /\[li\]([\s\S]*?)\[\/li\]/gi;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = liPattern.exec(text)) !== null) {
        const content = match[1].trim();
        if (!content) continue;
        items.push(
            <li key={`${keyPrefix}-li-${key++}`} className="text-[13px] text-[var(--ui-text)] leading-relaxed">
                {renderInlineRichText(content)}
            </li>
        );
    }

    if (items.length > 0) {
        return items;
    }

    return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('- '))
        .map((line, idx) => (
            <li key={`${keyPrefix}-li-fallback-${idx}`} className="text-[13px] text-[var(--ui-text)] leading-relaxed">
                {renderInlineRichText(line.slice(2).trim())}
            </li>
        ));
}

function renderTaggedDescription(text: string): ReactNode {
    const source = normalizeSupportedHtmlTags(text || '');
    const blockPattern = /\[(h1|h2|h3|p|li|ul)\]([\s\S]*?)\[\/\1\]/gi;
    const nodes: ReactNode[] = [];
    let match: RegExpExecArray | null;
    let key = 0;
    let cursor = 0;

    while ((match = blockPattern.exec(source)) !== null) {
        const plainBefore = source.slice(cursor, match.index);
        if (plainBefore.trim()) {
            nodes.push(...renderPlainChunk(plainBefore, `plain-${key++}`));
        }

        const tag = match[1].toLowerCase();
        const content = match[2].trim();
        const inline = renderInlineRichText(content);
        if (tag === 'h1') nodes.push(<h1 key={`h1-${key++}`} className="text-base font-semibold text-[var(--ui-text)] mb-1.5">{inline}</h1>);
        if (tag === 'h2') nodes.push(<h2 key={`h2-${key++}`} className="text-[14px] font-semibold text-[var(--ui-text)] mb-1">{inline}</h2>);
        if (tag === 'h3') nodes.push(<h3 key={`h3-${key++}`} className="text-[13px] font-semibold text-[var(--ui-text)] mb-1">{inline}</h3>);
        if (tag === 'p') nodes.push(<p key={`p-${key++}`} className="mb-1.5 text-[13px] text-[var(--ui-text)] leading-relaxed">{inline}</p>);
        if (tag === 'li') nodes.push(<li key={`li-${key++}`} className="ml-4 list-disc mb-1 text-[13px] text-[var(--ui-text)]">{inline}</li>);
        if (tag === 'ul') {
            const listItems = renderListItems(content, `ul-${key}`);
            if (listItems.length > 0) {
                nodes.push(
                    <ul key={`ul-${key++}`} className="mb-2 ml-5 list-disc space-y-1 marker:text-[var(--ui-text-muted)]">
                        {listItems}
                    </ul>
                );
            }
        }
        cursor = match.index + match[0].length;
    }

    const plainAfter = source.slice(cursor);
    if (plainAfter.trim()) {
        nodes.push(...renderPlainChunk(plainAfter, `plain-tail-${key++}`));
    }

    if (nodes.length > 0) {
        return <div>{nodes}</div>;
    }

    return (
        <>
            {source.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                part.startsWith('**') && part.endsWith('**')
                    ? <strong key={i} className="font-semibold text-[var(--ui-text)]">{part.slice(2, -2)}</strong>
                    : part
            )}
        </>
    );
}

function TypedTaggedText({
    text,
    className,
    speed = 14,
    onDone,
}: {
    text: string;
    className?: string;
    speed?: number;
    onDone?: () => void;
}) {
    const [visibleCount, setVisibleCount] = useState(0);
    const doneRef = useRef(false);
    const onDoneRef = useRef(onDone);

    useEffect(() => {
        onDoneRef.current = onDone;
    }, [onDone]);

    useEffect(() => {
        doneRef.current = false;
        setVisibleCount(0);
        const timer = window.setInterval(() => {
            setVisibleCount((prev) => {
                if (prev >= text.length) {
                    window.clearInterval(timer);
                    if (!doneRef.current) {
                        doneRef.current = true;
                        onDoneRef.current?.();
                    }
                    return prev;
                }
                return prev + 1;
            });
        }, speed);
        if (!text.length) {
            doneRef.current = true;
            onDoneRef.current?.();
        }
        return () => window.clearInterval(timer);
    }, [text, speed]);

    return <div className={className}>{renderTaggedDescription(text.slice(0, visibleCount))}</div>;
}

type StreamParserState = {
    buffer: string;
    openScreenName: string | null;
    openScreenSeq: number | null;
    nextSeq: number;
    descriptionSeen: boolean;
};

type StreamParseEvent =
    | { type: 'description'; text: string }
    | { type: 'screen_start'; seq: number; name: string }
    | { type: 'screen_preview'; seq: number; name: string; html: string }
    | { type: 'screen_complete'; seq: number; name: string; html: string; rawPartial: string }
    | { type: 'screen_incomplete'; seq: number; name: string; html: string; rawPartial: string; valid: boolean };

function createStreamParserState(): StreamParserState {
    return {
        buffer: '',
        openScreenName: null,
        openScreenSeq: null,
        nextSeq: 0,
        descriptionSeen: false,
    };
}

function isValidHtmlScreen(html: string): boolean {
    return /<!doctype html>/i.test(html)
        && /<html[\s>]/i.test(html)
        && /<head[\s>]/i.test(html)
        && /<body[\s>]/i.test(html)
        && /<\/html>/i.test(html);
}

function extractLikelyHtml(content: string): string {
    const doctypeIdx = content.search(/<!doctype html>/i);
    if (doctypeIdx >= 0) return content.slice(doctypeIdx).trim();

    const htmlIdx = content.search(/<html[\s>]/i);
    if (htmlIdx >= 0) return content.slice(htmlIdx).trim();

    return content.trim();
}

function stripDanglingBlocks(input: string, tagName: 'script' | 'style'): string {
    const openRegex = new RegExp(`<${tagName}\\b[^>]*>`, 'ig');
    const closeRegex = new RegExp(`</${tagName}>`, 'ig');
    const openMatches = [...input.matchAll(openRegex)];
    const closeMatches = [...input.matchAll(closeRegex)];
    if (openMatches.length === 0) return input;

    const closeIndexes = closeMatches.map((m) => m.index as number).sort((a, b) => a - b);
    const stack: number[] = [];
    let closeCursor = 0;

    for (const match of openMatches) {
        const openIndex = match.index as number;
        while (closeCursor < closeIndexes.length && closeIndexes[closeCursor] < openIndex) {
            if (stack.length > 0) stack.pop();
            closeCursor += 1;
        }
        stack.push(openIndex);
        while (closeCursor < closeIndexes.length) {
            if (stack.length === 0) break;
            const closeIndex = closeIndexes[closeCursor];
            const topOpen = stack[stack.length - 1];
            if (closeIndex > topOpen) {
                stack.pop();
                closeCursor += 1;
            } else {
                break;
            }
        }
    }

    if (stack.length === 0) return input;
    const cutAt = stack[0];
    return input.slice(0, cutAt);
}

function sanitizeStreamingHtml(input: string): string {
    let html = input;
    // If a trailing tag is incomplete, cut it to avoid iframe parser glitches.
    const lastLt = html.lastIndexOf('<');
    const lastGt = html.lastIndexOf('>');
    if (lastLt > lastGt) {
        html = html.slice(0, lastLt);
    }

    // Drop unmatched block comments.
    const lastCommentOpen = html.lastIndexOf('<!--');
    const lastCommentClose = html.lastIndexOf('-->');
    if (lastCommentOpen > lastCommentClose) {
        html = html.slice(0, lastCommentOpen);
    }

    // Unclosed script/style blocks can swallow all remaining markup and cause flashing.
    html = stripDanglingBlocks(html, 'script');
    html = stripDanglingBlocks(html, 'style');

    return html;
}

function isStreamingPreviewRenderable(content: string): boolean {
    const source = sanitizeStreamingHtml(extractLikelyHtml(content));
    if (!source) return false;
    if (!/<head[\s>]/i.test(source) || !/<\/head>/i.test(source)) return false;
    if (!/<body[\s>]/i.test(source)) return false;

    const hasTailwindCdn = /<script\b[^>]*src=(["'])[^"']*cdn\.tailwindcss\.com[^"']*\1[^>]*><\/script>/i.test(source);
    const hasInlineStyles = /<style\b[^>]*>[\s\S]*<\/style>/i.test(source);
    return hasTailwindCdn || hasInlineStyles;
}

function bestEffortCompleteHtml(content: string): string {
    let html = sanitizeStreamingHtml(extractLikelyHtml(content));
    if (!html) return '';

    if (!/<html[\s>]/i.test(html)) {
        html = `<html><head></head><body>${html}</body></html>`;
    }
    if (!/<!doctype html>/i.test(html)) {
        html = `<!DOCTYPE html>\n${html}`;
    }
    if (!/<head[\s>]/i.test(html)) {
        html = html.replace(/<html([^>]*)>/i, '<html$1><head></head>');
    }
    if (!/<body[\s>]/i.test(html)) {
        if (/<\/head>/i.test(html)) {
            html = html.replace(/<\/head>/i, '</head><body>');
        } else {
            html = html.replace(/<html([^>]*)>/i, '<html$1><body>');
        }
    }
    if (!/<\/body>/i.test(html)) {
        html += '\n</body>';
    }
    if (!/<\/html>/i.test(html)) {
        html += '\n</html>';
    }

    return html.trim();
}

function findScreenStart(buffer: string): { index: number; tag: string; name: string } | null {
    const match = /<screen\s+name=(['"])(.*?)\1\s*>/i.exec(buffer);
    if (!match || match.index === undefined) return null;
    return {
        index: match.index,
        tag: match[0],
        name: (match[2] || '').trim() || 'Generated Screen',
    };
}

function parseDescription(buffer: string): { start: number; end: number; text: string } | null {
    const openMatch = /<description(?:\s[^>]*)?>/i.exec(buffer);
    if (!openMatch || openMatch.index === undefined) return null;
    const start = openMatch.index;
    const openTag = openMatch[0];
    const closeTag = '</description>';
    const end = buffer.indexOf(closeTag, start + openTag.length);
    if (end < 0) return null;
    return {
        start,
        end: end + closeTag.length,
        text: buffer.slice(start + openTag.length, end).trim(),
    };
}

function parseStreamChunk(state: StreamParserState, chunk: string): StreamParseEvent[] {
    const events: StreamParseEvent[] = [];
    state.buffer += chunk;

    while (true) {
        if (!state.openScreenName) {
            const description = parseDescription(state.buffer);
            const screenStart = findScreenStart(state.buffer);

            if (description && (!screenStart || description.start < screenStart.index)) {
                if (!state.descriptionSeen && description.text) {
                    events.push({ type: 'description', text: description.text });
                    state.descriptionSeen = true;
                }
                state.buffer = state.buffer.slice(description.end);
                continue;
            }

            if (!screenStart) {
                const descriptionStart = state.buffer.search(/<description(?:\s[^>]*)?>/i);
                if (descriptionStart >= 0) {
                    if (descriptionStart > 0) {
                        state.buffer = state.buffer.slice(descriptionStart);
                    }
                } else if (state.buffer.length > 20000) {
                    state.buffer = state.buffer.slice(-8000);
                }
                break;
            }

            const seq = state.nextSeq++;
            state.openScreenName = screenStart.name;
            state.openScreenSeq = seq;
            state.buffer = state.buffer.slice(screenStart.index + screenStart.tag.length);
            events.push({ type: 'screen_start', seq, name: screenStart.name });
            continue;
        }

        const endIdx = state.buffer.indexOf('</screen>');
        if (endIdx < 0) {
            if (!isStreamingPreviewRenderable(state.buffer)) {
                if (state.buffer.length > 200000) {
                    state.buffer = state.buffer.slice(-200000);
                }
                break;
            }
            const previewHtml = bestEffortCompleteHtml(state.buffer);
            if (previewHtml) {
                events.push({
                    type: 'screen_preview',
                    seq: state.openScreenSeq as number,
                    name: state.openScreenName,
                    html: previewHtml,
                });
            }
            if (state.buffer.length > 200000) {
                state.buffer = state.buffer.slice(-200000);
            }
            break;
        }

        const rawPartial = state.buffer.slice(0, endIdx);
        const html = bestEffortCompleteHtml(rawPartial);
        events.push({
            type: 'screen_complete',
            seq: state.openScreenSeq as number,
            name: state.openScreenName,
            html,
            rawPartial,
        });
        state.buffer = state.buffer.slice(endIdx + '</screen>'.length);
        state.openScreenName = null;
        state.openScreenSeq = null;
    }

    return events;
}

function finalizeStream(state: StreamParserState): StreamParseEvent[] {
    const events: StreamParseEvent[] = [];
    events.push(...parseStreamChunk(state, ''));

    if (!state.descriptionSeen) {
        const description = parseDescription(state.buffer);
        if (description?.text) {
            events.push({ type: 'description', text: description.text });
            state.descriptionSeen = true;
            state.buffer = state.buffer.slice(description.end);
        }
    }

    if (state.openScreenName && state.openScreenSeq !== null) {
        const rawPartial = state.buffer;
        const html = bestEffortCompleteHtml(rawPartial);
        events.push({
            type: 'screen_incomplete',
            seq: state.openScreenSeq,
            name: state.openScreenName,
            html,
            rawPartial,
            valid: isValidHtmlScreen(html),
        });
        state.openScreenName = null;
        state.openScreenSeq = null;
        state.buffer = '';
    }

    return events;
}

type EditStreamParserState = {
    buffer: string;
};

function createEditStreamParserState(): EditStreamParserState {
    return { buffer: '' };
}

function parseEditStreamChunk(state: EditStreamParserState, chunk: string): string | null {
    state.buffer += chunk;
    if (!isStreamingPreviewRenderable(state.buffer)) return null;
    const html = bestEffortCompleteHtml(state.buffer);
    return html || null;
}

function finalizeEditStream(state: EditStreamParserState): { html: string; valid: boolean } {
    const html = bestEffortCompleteHtml(state.buffer);
    return {
        html,
        valid: isValidHtmlScreen(html),
    };
}

type ChatPanelProps = {
    initialRequest?: {
        id: string;
        prompt: string;
        images?: string[];
        referenceUrls?: string[];
        referenceImageUrls?: string[];
        platform?: 'mobile' | 'tablet' | 'desktop';
        stylePreset?: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
        modelProfile?: DesignModelProfile;
        modelTemperature?: number;
    } | null;
};

export function ChatPanel({ initialRequest }: ChatPanelProps) {
    const PLAN_MODE_STORAGE_KEY = 'eazyui:plan-mode';
    const [prompt, setPrompt] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [planMode, setPlanMode] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.localStorage.getItem('eazyui:plan-mode') === '1';
    });
    const [stylePreset, setStylePreset] = useState<'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful'>('modern');
    const [showStyleMenu, setShowStyleMenu] = useState(false);
    const [modelTemperature, setModelTemperature] = useState(() => apiClient.getComposerTemperature());
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [copiedMessageIds, setCopiedMessageIds] = useState<Record<string, boolean>>({});
    const [typedDoneByMessageId, setTypedDoneByMessageId] = useState<Record<string, boolean>>({});
    const [isAwaitingAssistantDecision, setIsAwaitingAssistantDecision] = useState(false);
    const [usedSuggestionKeysByMessage, setUsedSuggestionKeysByMessage] = useState<Record<string, string[]>>({});
    const [activeAssistantByUser, setActiveAssistantByUser] = useState<Record<string, string>>({});
    const [viewerImage, setViewerImage] = useState<{ src: string; alt?: string } | null>(null);
    const [isMentionOpen, setIsMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
    const [referenceMenuMode, setReferenceMenuMode] = useState<'root' | 'url' | 'screen'>('root');
    const [referenceUrlDraft, setReferenceUrlDraft] = useState('');
    const [renderedMessageCount, setRenderedMessageCount] = useState(INITIAL_MESSAGE_RENDER_COUNT);
    const [isTitleEditing, setIsTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');
    const [isTitleSaving, setIsTitleSaving] = useState(false);
    const [showScrollToLatest, setShowScrollToLatest] = useState(false);
    const [chatPanelView, setChatPanelView] = useState<'chat' | 'design-system' | 'assets'>('chat');
    const [isDesignSystemEditing, setIsDesignSystemEditing] = useState(false);
    const [designSystemDraft, setDesignSystemDraft] = useState<ProjectDesignSystem | null>(null);
    const [activeTokenEditor, setActiveTokenEditor] = useState<DesignTokenKey | null>(null);
    const [designSystemInspectorTab, setDesignSystemInspectorTab] = useState<'colors' | 'fonts' | 'corners'>('colors');
    const [openFontDropdown, setOpenFontDropdown] = useState<'display' | 'body' | null>(null);
    const [openRadiusDropdown, setOpenRadiusDropdown] = useState<keyof ProjectDesignSystem['radius'] | null>(null);
    const [, setClockTick] = useState(0);
    const autoCollapsedRef = useRef(false);
    const copyResetTimersRef = useRef<Record<string, number>>({});
    const hydrationPinTimersRef = useRef<number[]>([]);
    const initialLoadAutoScrollTimersRef = useRef<number[]>([]);
    const fastFallbackTimersRef = useRef<number[]>([]);
    const autoScrollAfterLoadArmedRef = useRef(true);
    const initialRequestSubmittedRef = useRef<string | null>(null);
    const previousMessageLengthRef = useRef(0);
    const previousScrollMessageLengthRef = useRef(0);
    const shouldStickToLatestRef = useRef(true);
    const forceStickToLatestUntilHydratedRef = useRef(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<ComposerInlineReferenceInputHandle | null>(null);
    const styleMenuRef = useRef<HTMLDivElement>(null);
    const mentionMenuRef = useRef<HTMLDivElement>(null);
    const mentionSearchInputRef = useRef<HTMLInputElement>(null);
    const referenceUrlInputRef = useRef<HTMLInputElement>(null);
    const referenceTriggerRangeRef = useRef<ComposerReferenceTextRange | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const { messages, isGenerating, addMessage, updateMessage, setGenerating, setAbortController, abortGeneration } = useChatStore();
    const { updateScreen, spec, selectedPlatform, setPlatform, addScreens, removeScreen } = useDesignStore();
    const { setBoards, setFocusNodeId, setFocusNodeIds, removeBoard, doc } = useCanvasStore();
    const { isEditMode, screenId: editScreenId, setActiveScreen } = useEditStore();
    const { modelProfile, setModelProfile, pushToast, removeToast, requestConfirmation, updateConfirmationDialog, resolveConfirmation } = useUiStore();
    const { projectId, markSaved, setSaving } = useProjectStore();
    const setProjectMemory = useProjectMemoryStore((state) => state.setMemory);
    const assistantMsgIdRef = useRef<string>('');
    const notificationGuideShownRef = useRef(false);
    const generationLoadingToastRef = useRef<string | null>(null);
    const editLoadingToastRef = useRef<string | null>(null);
    const aiPersistenceQueueRef = useRef<Promise<void>>(Promise.resolve());

    const startLoadingToast = (targetRef: MutableRefObject<string | null>, title: string, message: string) => {
        if (targetRef.current) {
            removeToast(targetRef.current);
        }
        targetRef.current = pushToast({
            kind: 'loading',
            title,
            message,
            durationMs: 0,
        });
    };

    const clearLoadingToast = (targetRef: MutableRefObject<string | null>) => {
        if (!targetRef.current) return;
        removeToast(targetRef.current);
        targetRef.current = null;
    };


    const isNearBottom = () => {
        const el = messagesContainerRef.current;
        if (!el) return true;
        const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
        return distance <= 96;
    };

    const scrollToLatest = (behavior: ScrollBehavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    };

    const pinToLatest = (behavior: ScrollBehavior = 'auto') => {
        shouldStickToLatestRef.current = true;
        setShowScrollToLatest(false);
        window.requestAnimationFrame(() => {
            scrollToLatest(behavior);
        });
    };

    const triggerScrollToLatestFab = (behavior: ScrollBehavior = 'smooth') => {
        shouldStickToLatestRef.current = true;
        scrollToLatest(behavior);
        setShowScrollToLatest(false);
    };

    const ensureNotificationPermission = async () => {
        const permission = await requestBrowserNotificationPermissionIfNeeded();
        if ((permission === 'default' || permission === 'denied') && !notificationGuideShownRef.current) {
            notificationGuideShownRef.current = true;
            pushToast({
                kind: 'guide',
                title: 'Background alerts are off',
                message: 'Allow browser notifications if you want completion alerts while you are in another tab.',
                durationMs: 7000,
            });
        }
    };

    const toTokenToastMessage = (message: string, totalTokens?: number | null) => {
        return `${message} • ${formatTokenUsageLabel(totalTokens ?? null)}`;
    };

    const notifySuccess = (title: string, message: string, totalTokens?: number | null) => {
        const composed = toTokenToastMessage(message, totalTokens);
        pushToast({ kind: 'success', title, message: composed });
        notifyWhenInBackground(title, composed);
    };

    const notifyInfo = (title: string, message: string, totalTokens?: number | null) => {
        const composed = toTokenToastMessage(message, totalTokens);
        pushToast({ kind: 'info', title, message: composed });
        notifyWhenInBackground(title, composed);
    };

    const notifyError = (title: string, message: string, totalTokens?: number | null) => {
        const composed = toTokenToastMessage(message, totalTokens);
        pushToast({ kind: 'error', title, message: composed });
        notifyWhenInBackground(title, composed);
    };

    const applyReferenceContextFeedback = useCallback((messageId: string, referenceUrls: string[], referenceContext?: ReferenceContextMeta) => {
        if (referenceUrls.length === 0) return;
        const existingMeta = useChatStore.getState().messages.find((message) => message.id === messageId)?.meta || {};
        updateMessage(messageId, {
            meta: {
                ...existingMeta,
                referenceUrls,
                ...(referenceContext ? { referenceContext } : {}),
            },
        });

        if (!referenceContext) return;
        const firstLabel = getComposerReferenceHostname(referenceContext.normalizedUrls[0] || referenceUrls[0] || 'web reference');
        if (referenceContext.webContextApplied) {
            notifyInfo('Web context applied', `Scraped ${firstLabel} and added page context to this request.`);
            return;
        }
        const reason = referenceContext.warnings[0]
            || (referenceContext.skippedReason === 'missing_api_key'
                ? 'FIRECRAWL_API_KEY is not configured.'
                : referenceContext.skippedReason === 'no_valid_urls'
                    ? 'No valid URLs were detected.'
                    : 'Firecrawl could not build context from that page.');
        notifyError('Web context skipped', `${firstLabel}: ${reason}`);
    }, [notifyError, notifyInfo, updateMessage]);

    const clearFastFallbackTimers = () => {
        fastFallbackTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
        fastFallbackTimersRef.current = [];
    };

    const maybeSwitchToFastForLowCredits = async (params: {
        operation: CreditAwareOperation;
        currentModelProfile: DesignModelProfile;
        expectedScreenCount?: number;
        bundleIncludesDesignSystem?: boolean;
    }): Promise<DesignModelProfile | null> => {
        if (params.currentModelProfile === 'fast') return params.currentModelProfile;

        try {
            const currentPreferredModel = getPreferredTextModel(params.currentModelProfile);
            const fastPreferredModel = getPreferredTextModel('fast');
            const estimateRequest = {
                operation: params.operation,
                preferredModel: currentPreferredModel,
                ...(typeof params.expectedScreenCount === 'number' ? { expectedScreenCount: params.expectedScreenCount } : {}),
                ...(typeof params.bundleIncludesDesignSystem === 'boolean' ? { bundleIncludesDesignSystem: params.bundleIncludesDesignSystem } : {}),
            } as const;
            const currentEstimate = await apiClient.estimateBilling(estimateRequest);
            const availableCredits = currentEstimate.summary.balanceCredits;
            const currentRequired = currentEstimate.estimate.estimatedCredits;
            if (availableCredits >= currentRequired) return params.currentModelProfile;

            const fastEstimate = await apiClient.estimateBilling({
                ...estimateRequest,
                preferredModel: fastPreferredModel,
            });
            const fastRequired = fastEstimate.estimate.estimatedCredits;
            if (availableCredits < fastRequired) return params.currentModelProfile;

            notifyInfo(
                'Switching to fast is available',
                `This request needs ${currentRequired} credits on ${params.currentModelProfile}, but only ${fastRequired} on fast. Fast may look less polished.`
            );

            clearFastFallbackTimers();
            let countdown = 10;
            const confirmationPromise = requestConfirmation({
                title: 'Use fast model instead?',
                message: `You have ${availableCredits} credits. This request needs ${currentRequired} on ${params.currentModelProfile}, but ${fastRequired} on fast. Results may not look as good. Fast will start automatically in 10 seconds unless you cancel.`,
                confirmLabel: `Go on (${countdown}s)`,
                cancelLabel: 'Cancel',
            });

            const tick = () => {
                countdown -= 1;
                if (countdown <= 0) {
                    resolveConfirmation(true);
                    return;
                }
                updateConfirmationDialog({
                    confirmLabel: `Go on (${countdown}s)`,
                });
                const timerId = window.setTimeout(tick, 1000);
                fastFallbackTimersRef.current.push(timerId);
            };
            const firstTimerId = window.setTimeout(tick, 1000);
            fastFallbackTimersRef.current.push(firstTimerId);

            const accepted = await confirmationPromise;
            clearFastFallbackTimers();
            if (!accepted) {
                notifyInfo('Request canceled', 'Kept the current model selection.');
                return null;
            }

            setModelProfile('fast');
            notifyInfo('Using fast model', 'Proceeding on the fast model. Results may be less polished.');
            return 'fast';
        } catch (error) {
            console.warn('[UI] low-credit fast fallback preflight skipped', error);
            return params.currentModelProfile;
        }
    };

    const applyProjectName = (projectName: string) => {
        const nextName = normalizeSuggestedProjectName(projectName);
        if (!nextName) return;
        const currentSpec = useDesignStore.getState().spec;
        const now = new Date().toISOString();

        if (!currentSpec) {
            useDesignStore.getState().setSpec({
                id: uuidv4(),
                name: nextName,
                screens: [],
                createdAt: now,
                updatedAt: now,
            });
            return;
        }

        if (currentSpec.name?.trim() === nextName) return;
        useDesignStore.getState().setSpec({
            ...currentSpec,
            name: nextName,
            updatedAt: now,
        });
    };

    const applyProjectDesignSystem = (designSystem: ProjectDesignSystem | undefined) => {
        if (!designSystem) return;
        const normalizedDesignSystem = normalizeProjectDesignSystemModes(designSystem);
        const currentSpec = useDesignStore.getState().spec;
        if (!currentSpec) {
            const now = new Date().toISOString();
            useDesignStore.getState().setSpec({
                id: uuidv4(),
                name: 'Untitled project',
                screens: [],
                designSystem: normalizedDesignSystem,
                createdAt: now,
                updatedAt: now,
            });
            return;
        }
        useDesignStore.getState().setSpec({
            ...currentSpec,
            designSystem: normalizedDesignSystem,
            updatedAt: new Date().toISOString(),
        });
    };

    const getAuthoritativeProjectDesignSystem = () => {
        const stored = useDesignStore.getState().spec?.designSystem;
        return stored ? normalizeProjectDesignSystemModes(stored) : null;
    };

    const syncPendingDesignSystemProposal = (designSystem: ProjectDesignSystem) => {
        const normalizedDesignSystem = normalizeProjectDesignSystemModes(designSystem);
        const pendingProposal = [...useChatStore.getState().messages]
            .reverse()
            .find((message) => (
                message.role === 'assistant'
                && Boolean(message.meta?.designSystemProposalContext)
                && !Boolean((message.meta as any)?.designSystemProceedAt)
            ));
        if (!pendingProposal) return;

        updateMessage(pendingProposal.id, {
            meta: {
                ...(pendingProposal.meta || {}),
                designSystemProposal: normalizedDesignSystem,
            },
        });
    };

    const persistProjectAfterAiChange = useCallback((reason: string) => {
        const run = async () => {
            const latestSpec = useDesignStore.getState().spec;
            if (!latestSpec) return;

            try {
                setSaving(true);
                const saved = await apiClient.save({
                    projectId: useProjectStore.getState().projectId || undefined,
                    designSpec: latestSpec as any,
                    canvasDoc: useCanvasStore.getState().doc,
                    chatState: { messages: useChatStore.getState().messages },
                    mode: 'manual',
                });
                markSaved(saved.projectId, saved.savedAt);
            } catch (error) {
                setSaving(false);
                console.warn(`[UI] auto-save after ${reason} failed`, error);
                pushToast({
                    kind: 'error',
                    title: 'Auto-save failed',
                    message: (error as Error).message || 'Could not save the latest AI changes.',
                });
            }
        };

        const queued = aiPersistenceQueueRef.current.then(run, run);
        aiPersistenceQueueRef.current = queued.then(() => undefined, () => undefined);
        return queued;
    }, [markSaved, pushToast, setSaving]);

    const cloneDesignSystem = (source: ProjectDesignSystem): ProjectDesignSystem => {
        return JSON.parse(JSON.stringify(source)) as ProjectDesignSystem;
    };

    const openDesignSystemEditor = (source?: ProjectDesignSystem) => {
        const effective = source || useDesignStore.getState().spec?.designSystem;
        if (!effective) return;
        const normalized = normalizeProjectDesignSystemModes(effective);
        applyProjectDesignSystem(normalized);
        setDesignSystemDraft(cloneDesignSystem(normalized));
        setActiveTokenEditor(null);
        setIsDesignSystemEditing(true);
        setDesignSystemInspectorTab('colors');
        setOpenFontDropdown(null);
        setOpenRadiusDropdown(null);
        setChatPanelView('design-system');
    };

    const cancelDesignSystemEdit = () => {
        const current = useDesignStore.getState().spec?.designSystem;
        if (!current) return;
        const normalized = normalizeProjectDesignSystemModes(current);
        setDesignSystemDraft(cloneDesignSystem(normalized));
        setActiveTokenEditor(null);
        setOpenFontDropdown(null);
        setOpenRadiusDropdown(null);
    };

    const saveDesignSystemEdit = () => {
        if (!designSystemDraft) return;
        const currentSpec = useDesignStore.getState().spec;
        const normalizedDraft = normalizeProjectDesignSystemModes(designSystemDraft);
        const previousDesignSystem = currentSpec?.designSystem
            ? normalizeProjectDesignSystemModes(currentSpec.designSystem)
            : undefined;
        const tokenPatches = buildDesignTokenColorPatches(previousDesignSystem, normalizedDraft);
        const typographyChanged = Boolean(previousDesignSystem?.typography) && (
            !areFontStacksEquivalent(previousDesignSystem?.typography.displayFont, normalizedDraft.typography.displayFont)
            || !areFontStacksEquivalent(previousDesignSystem?.typography.bodyFont, normalizedDraft.typography.bodyFont)
        );
        const radiusChanged = Boolean(previousDesignSystem?.radius) && (
            !areRadiusValuesEquivalent(previousDesignSystem?.radius.card, normalizedDraft.radius.card)
            || !areRadiusValuesEquivalent(previousDesignSystem?.radius.control, normalizedDraft.radius.control)
            || !areRadiusValuesEquivalent(previousDesignSystem?.radius.pill, normalizedDraft.radius.pill)
        );
        let patchedScreenCount = 0;
        let patchedTypographyScreenCount = 0;
        let patchedRadiusScreenCount = 0;
        let patchedThemeScreenCount = 0;

        if (currentSpec) {
            const patchedScreens = currentSpec.screens.map((screen) => {
                let nextHtml = screen.html;
                let screenChanged = false;

                const colorResult = applyDesignTokenColorPatchesToHtml(nextHtml, tokenPatches);
                nextHtml = colorResult.html;
                screenChanged = screenChanged || colorResult.changed;

                if (typographyChanged) {
                    const typographyResult = applyTypographyToScreenHtml(
                        nextHtml,
                        normalizedDraft.typography.displayFont,
                        normalizedDraft.typography.bodyFont
                    );
                    nextHtml = typographyResult.html;
                    if (typographyResult.changed) {
                        patchedTypographyScreenCount += 1;
                        screenChanged = true;
                    }
                }

                if (radiusChanged) {
                    const radiusResult = applyRadiusToScreenHtml(nextHtml, normalizedDraft.radius);
                    nextHtml = radiusResult.html;
                    if (radiusResult.changed) {
                        patchedRadiusScreenCount += 1;
                        screenChanged = true;
                    }
                }

                const themeRepairResult = applyThemeVariantClassRepairsToHtml(nextHtml, normalizedDraft);
                nextHtml = themeRepairResult.html;
                if (themeRepairResult.changed) {
                    patchedThemeScreenCount += 1;
                    screenChanged = true;
                }

                if (!screenChanged) return screen;
                patchedScreenCount += 1;
                return {
                    ...screen,
                    html: nextHtml,
                };
            });
            useDesignStore.getState().setSpec({
                ...currentSpec,
                designSystem: normalizedDraft,
                screens: patchedScreens,
                updatedAt: new Date().toISOString(),
            });
        } else {
            applyProjectDesignSystem(normalizedDraft);
        }

        setIsDesignSystemEditing(true);
        setDesignSystemDraft(cloneDesignSystem(normalizedDraft));
        setOpenFontDropdown(null);
        setOpenRadiusDropdown(null);
        syncPendingDesignSystemProposal(normalizedDraft);
        void persistProjectAfterAiChange('design system edit');
        if ((tokenPatches.length > 0 || typographyChanged || radiusChanged) && patchedScreenCount > 0) {
            const applied: string[] = [];
            if (tokenPatches.length > 0) {
                applied.push(`${tokenPatches.length} color token update${tokenPatches.length === 1 ? '' : 's'}`);
            }
            if (typographyChanged) {
                applied.push(`typography updates on ${patchedTypographyScreenCount} screen${patchedTypographyScreenCount === 1 ? '' : 's'}`);
            }
            if (radiusChanged) {
                applied.push(`radius updates on ${patchedRadiusScreenCount} screen${patchedRadiusScreenCount === 1 ? '' : 's'}`);
            }
            if (patchedThemeScreenCount > 0) {
                applied.push(`theme class repairs on ${patchedThemeScreenCount} screen${patchedThemeScreenCount === 1 ? '' : 's'}`);
            }
            notifySuccess(
                'Design system updated',
                `Applied ${applied.join(' + ')} to ${patchedScreenCount} existing screen${patchedScreenCount === 1 ? '' : 's'} instantly.`
            );
            return;
        }
        notifySuccess('Design system updated', 'Future screens will follow the updated design system.');
    };

    const updateDesignSystemDraft = (updater: (current: ProjectDesignSystem) => ProjectDesignSystem) => {
        setDesignSystemDraft((current) => {
            if (!current) return current;
            return updater(current);
        });
    };

    const updateDesignSystemTokenDraft = (tokenName: DesignTokenKey, value: string) => {
        updateDesignSystemDraft((current) => {
            const tokenModes = resolveDesignSystemTokenModes(current);
            const activeMode = resolveActiveThemeMode(current.themeMode);
            const next = {
                ...current,
                tokens: {
                    ...current.tokens,
                    [tokenName]: value,
                },
                tokenModes: {
                    ...tokenModes,
                    [activeMode]: {
                        ...tokenModes[activeMode],
                        [tokenName]: value,
                    },
                },
            };
            return normalizeProjectDesignSystemModes(next);
        });
    };

    const updateDesignSystemTypographyDraft = (field: 'displayFont' | 'bodyFont', value: string) => {
        updateDesignSystemDraft((current) => ({
            ...current,
            typography: {
                ...current.typography,
                [field]: value,
            },
        }));
    };

    const updateDesignSystemRadiusDraft = (field: keyof ProjectDesignSystem['radius'], value: string) => {
        updateDesignSystemDraft((current) => ({
            ...current,
            radius: {
                ...current.radius,
                [field]: value,
            },
        }));
    };

    const toggleDesignSystemThemeVariant = () => {
        updateDesignSystemDraft((current) => {
            const tokenModes = resolveDesignSystemTokenModes(current);
            const currentMode = resolveActiveThemeMode(current.themeMode);
            const targetMode = currentMode === 'dark' ? 'light' : 'dark';
            return {
                ...current,
                themeMode: targetMode,
                tokenModes,
                tokens: { ...tokenModes[targetMode] },
            };
        });
    };

    const screenPreviewById = useMemo(() => {
        const map = new Map<string, HtmlScreen>();
        (spec?.screens || []).forEach((screen) => map.set(screen.screenId, screen));
        return map;
    }, [spec?.screens]);

    const getScreenPreview = (screenId: string) => screenPreviewById.get(screenId) || null;

    const THUMB_W = 68;

    const assistantBranchesByUser = useMemo(() => {
        const map: Record<string, string[]> = {};
        messages.forEach((message) => {
            if (message.role !== 'assistant') return;
            const parentUserId = String((message.meta as any)?.parentUserId || '').trim();
            if (!parentUserId) return;
            if (!map[parentUserId]) map[parentUserId] = [];
            map[parentUserId].push(message.id);
        });
        return map;
    }, [messages]);

    const availableMentionScreens = useMemo(() => {
        return (spec?.screens || []).map((screen) => ({
            screenId: screen.screenId,
            name: screen.name,
        }));
    }, [spec?.screens]);

    const filteredMentionScreens = useMemo(() => {
        if (!isMentionOpen || referenceMenuMode !== 'screen') return [];
        const query = mentionQuery.trim().toLowerCase();
        return availableMentionScreens
            .filter((screen) => !query || screen.name.toLowerCase().includes(query))
            .slice(0, 8);
    }, [availableMentionScreens, isMentionOpen, mentionQuery, referenceMenuMode]);

    const rootReferenceOptions = useMemo(() => {
        return getFilteredComposerReferenceRootOptions(mentionQuery, true);
    }, [mentionQuery]);

    useEffect(() => {
        setActiveAssistantByUser((prev) => {
            const next: Record<string, string> = {};
            let changed = false;
            Object.entries(assistantBranchesByUser).forEach(([userId, branchIds]) => {
                const existing = prev[userId];
                const preferredId = [...branchIds].reverse().find((id) => {
                    const msg = messages.find((m) => m.id === id);
                    if (!msg || msg.role !== 'assistant') return false;
                    const status = msg.status || 'complete';
                    if (status !== 'complete' && status !== 'error') return false;
                    return String(msg.content || '').trim().length > 0;
                }) || branchIds[branchIds.length - 1];
                const value = existing && branchIds.includes(existing) ? existing : preferredId;
                if (existing !== value) changed = true;
                if (value) next[userId] = value;
            });
            if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
            return changed ? next : prev;
        });
    }, [assistantBranchesByUser, messages]);

    useEffect(() => {
        if (isTitleEditing) return;
        setTitleDraft(spec?.name?.trim() || '');
    }, [spec?.name, isTitleEditing]);

    useEffect(() => {
        const screens = spec?.screens || [];
        if (!spec && messages.length === 0) {
            setProjectMemory(null);
            return;
        }
        setProjectMemory(deriveProjectMemoryFromState(screens, messages, spec?.designSystem));
    }, [spec, messages, setProjectMemory]);

    useEffect(() => {
        if (chatPanelView === 'design-system' && !spec?.designSystem && !designSystemDraft) {
            setChatPanelView('chat');
        }
    }, [chatPanelView, spec?.designSystem, designSystemDraft]);

    useEffect(() => {
        if (chatPanelView !== 'design-system') {
            setOpenFontDropdown(null);
            setOpenRadiusDropdown(null);
            return;
        }
        if (!spec?.designSystem && !designSystemDraft) {
            setChatPanelView('chat');
            return;
        }
        if (spec?.designSystem && !designSystemDraft) {
            const cloned = cloneDesignSystem(normalizeProjectDesignSystemModes(spec.designSystem));
            setDesignSystemDraft(cloned);
            setActiveTokenEditor((current) => current ?? null);
        }
        if (!isDesignSystemEditing) {
            setIsDesignSystemEditing(true);
        }
    }, [chatPanelView, isDesignSystemEditing, spec?.designSystem, designSystemDraft]);

    const commitProjectTitle = async () => {
        if (!spec) return;
        const nextName = titleDraft.trim();
        if (!nextName) {
            pushToast({
                kind: 'error',
                title: 'Project name required',
                message: 'Enter a project name before saving.',
            });
            return;
        }
        if (nextName === (spec.name || '').trim()) {
            setIsTitleEditing(false);
            return;
        }

        const renamedSpec = {
            ...spec,
            name: nextName,
            updatedAt: new Date().toISOString(),
        };
        useDesignStore.getState().setSpec(renamedSpec);
        setIsTitleEditing(false);

        try {
            setIsTitleSaving(true);
            setSaving(true);
            const saved = await apiClient.save({
                projectId: projectId || undefined,
                designSpec: renamedSpec as any,
                canvasDoc: doc,
                chatState: { messages: useChatStore.getState().messages },
                mode: 'manual',
            });
            markSaved(saved.projectId, saved.savedAt);
            pushToast({
                kind: 'success',
                title: 'Project renamed',
                message: `Saved as "${nextName}".`,
            });
        } catch (error) {
            setSaving(false);
            pushToast({
                kind: 'error',
                title: 'Rename save failed',
                message: (error as Error).message || 'Could not persist the new project name.',
            });
        } finally {
            setIsTitleSaving(false);
        }
    };

    const setActiveBranchForUser = (userId: string, assistantId: string) => {
        setActiveAssistantByUser((prev) => ({ ...prev, [userId]: assistantId }));
    };

    useEffect(() => {
        if (!viewerImage) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setViewerImage(null);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [viewerImage]);

    useEffect(() => {
        setMentionActiveIndex(0);
    }, [filteredMentionScreens.length, rootReferenceOptions.length, mentionQuery, referenceMenuMode]);

    useEffect(() => {
        if (!isMentionOpen) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (!mentionMenuRef.current) return;
            if (!mentionMenuRef.current.contains(event.target as Node) && !textareaRef.current?.element?.contains(event.target as Node)) {
                closeMentionMenu();
            }
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isMentionOpen]);

    useEffect(() => {
        if (!isMentionOpen || referenceMenuMode !== 'url') return;
        referenceUrlInputRef.current?.focus();
    }, [isMentionOpen, referenceMenuMode]);

    useEffect(() => {
        if (!isMentionOpen || referenceMenuMode !== 'screen') return;
        mentionSearchInputRef.current?.focus();
    }, [isMentionOpen, referenceMenuMode]);

    useEffect(() => {
        const validIds = new Set(messages.map((message) => message.id));
        setTypedDoneByMessageId((prev) => {
            let changed = false;
            const next: Record<string, boolean> = {};
            Object.keys(prev).forEach((id) => {
                if (validIds.has(id)) {
                    next[id] = prev[id];
                } else {
                    changed = true;
                }
            });
            return changed ? next : prev;
        });

        setUsedSuggestionKeysByMessage((prev) => {
            let changed = false;
            const next: Record<string, string[]> = {};
            Object.keys(prev).forEach((id) => {
                if (validIds.has(id)) {
                    next[id] = prev[id];
                } else {
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [messages]);

    useEffect(() => {
        autoScrollAfterLoadArmedRef.current = true;
        initialLoadAutoScrollTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
        initialLoadAutoScrollTimersRef.current = [];
    }, [projectId]);

    useEffect(() => {
        const previousLength = previousMessageLengthRef.current;
        const nextLength = messages.length;
        previousMessageLengthRef.current = nextLength;

        if (nextLength === 0) {
            autoScrollAfterLoadArmedRef.current = true;
            forceStickToLatestUntilHydratedRef.current = false;
            setRenderedMessageCount(INITIAL_MESSAGE_RENDER_COUNT);
            return;
        }

        if (previousLength === 0) {
            shouldStickToLatestRef.current = true;
            forceStickToLatestUntilHydratedRef.current = nextLength > INITIAL_MESSAGE_RENDER_COUNT;
        }

        // During normal chat usage, keep newly appended messages visible immediately.
        const appendedCount = nextLength - previousLength;
        if (appendedCount > 0 && previousLength > 0) {
            setRenderedMessageCount((current) => Math.min(nextLength, current + appendedCount));
            return;
        }

        // On hydration (large jump from 0 -> many), render a small batch first for faster first paint.
        if (previousLength === 0 && nextLength > INITIAL_MESSAGE_RENDER_COUNT) {
            setRenderedMessageCount(INITIAL_MESSAGE_RENDER_COUNT);
            return;
        }

        setRenderedMessageCount((current) => Math.min(nextLength, current));
    }, [messages.length]);

    useEffect(() => {
        if (renderedMessageCount >= messages.length) return;
        const timer = window.setTimeout(() => {
            setRenderedMessageCount((current) => Math.min(messages.length, current + MESSAGE_RENDER_STEP));
        }, 80);
        return () => window.clearTimeout(timer);
    }, [renderedMessageCount, messages.length]);

    useEffect(() => {
        if (!forceStickToLatestUntilHydratedRef.current) return;
        if (renderedMessageCount < messages.length) return;
        hydrationPinTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
        hydrationPinTimersRef.current = [];

        const frame = window.requestAnimationFrame(() => {
            pinToLatest('auto');
            [80, 220, 480, 900, 1500, 2200].forEach((delay) => {
                const timerId = window.setTimeout(() => {
                    pinToLatest('auto');
                }, delay);
                hydrationPinTimersRef.current.push(timerId);
            });
            const finalizeTimerId = window.setTimeout(() => {
                forceStickToLatestUntilHydratedRef.current = false;
                hydrationPinTimersRef.current = hydrationPinTimersRef.current.filter((id) => id !== finalizeTimerId);
            }, 2600);
            hydrationPinTimersRef.current.push(finalizeTimerId);
        });
        return () => {
            window.cancelAnimationFrame(frame);
            hydrationPinTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
            hydrationPinTimersRef.current = [];
        };
    }, [renderedMessageCount, messages.length]);

    const visibleMessages = useMemo(() => {
        if (messages.length <= renderedMessageCount) return messages;
        return messages.slice(-renderedMessageCount);
    }, [messages, renderedMessageCount]);

    const lastMessageActivitySignature = useMemo(() => {
        const last = visibleMessages[visibleMessages.length - 1];
        return [
            visibleMessages.length,
            last?.id || '',
            last?.status || '',
            (last?.content || '').length,
            last?.images?.length || 0,
            String((last?.meta as any)?.typedComplete ? 1 : 0),
        ].join(':');
    }, [visibleMessages]);

    // Auto-scroll to latest message on load/new message updates.
    useEffect(() => {
        if (chatPanelView !== 'chat') return;
        if (!messagesEndRef.current || !messagesContainerRef.current) return;
        const previousLength = previousScrollMessageLengthRef.current;
        const largeJump = messages.length - previousLength > 12;
        const appended = messages.length > previousLength;
        previousScrollMessageLengthRef.current = messages.length;
        if (!shouldStickToLatestRef.current && !forceStickToLatestUntilHydratedRef.current && !appended) return;
        scrollToLatest(largeJump ? 'auto' : 'smooth');
        setShowScrollToLatest(false);
    }, [messages.length, chatPanelView]);

    useEffect(() => {
        if (chatPanelView !== 'chat') return;
        if (!messagesContainerRef.current) return;
        if (!shouldStickToLatestRef.current && !forceStickToLatestUntilHydratedRef.current) return;
        const frame = window.requestAnimationFrame(() => {
            scrollToLatest('auto');
            setShowScrollToLatest(false);
        });
        return () => window.cancelAnimationFrame(frame);
    }, [lastMessageActivitySignature, isGenerating, isAwaitingAssistantDecision, renderedMessageCount, chatPanelView]);

    useEffect(() => {
        if (chatPanelView !== 'chat') return;
        const container = messagesContainerRef.current;
        const contentRoot = messagesEndRef.current?.parentElement;
        if (!container || !contentRoot || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => {
            if (!shouldStickToLatestRef.current && !forceStickToLatestUntilHydratedRef.current) return;
            pinToLatest('auto');
            setShowScrollToLatest(false);
        });
        observer.observe(contentRoot);
        return () => observer.disconnect();
    }, [chatPanelView, renderedMessageCount, isAwaitingAssistantDecision]);

    useEffect(() => {
        if (chatPanelView !== 'chat') return;
        if (!autoScrollAfterLoadArmedRef.current) return;
        if (messages.length === 0) return;
        if (renderedMessageCount < messages.length) return;
        if (isGenerating || isAwaitingAssistantDecision) return;
        if (typeof document === 'undefined') return;

        const scheduleFabAutoScroll = () => {
            initialLoadAutoScrollTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
            initialLoadAutoScrollTimersRef.current = [];
            autoScrollAfterLoadArmedRef.current = false;
            [0, 120, 320, 700, 1200].forEach((delay) => {
                const timerId = window.setTimeout(() => {
                    triggerScrollToLatestFab('auto');
                }, delay);
                initialLoadAutoScrollTimersRef.current.push(timerId);
            });
        };

        if (document.readyState === 'complete') {
            scheduleFabAutoScroll();
            return;
        }

        const onLoad = () => scheduleFabAutoScroll();
        window.addEventListener('load', onLoad, { once: true });
        return () => window.removeEventListener('load', onLoad);
    }, [chatPanelView, messages.length, renderedMessageCount, isGenerating, isAwaitingAssistantDecision, projectId]);

    useEffect(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const onScroll = () => {
            if (forceStickToLatestUntilHydratedRef.current) {
                setShowScrollToLatest(false);
                return;
            }
            const nearBottom = isNearBottom();
            shouldStickToLatestRef.current = nearBottom;
            setShowScrollToLatest(!nearBottom);
        };
        onScroll();
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [messages.length, renderedMessageCount, isCollapsed, chatPanelView]);

    useEffect(() => {
        if (!isGenerating) return;
        const timer = window.setInterval(() => setClockTick(v => v + 1), 1000);
        return () => window.clearInterval(timer);
    }, [isGenerating]);

    useEffect(() => {
        return () => {
            Object.values(copyResetTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
            hydrationPinTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
            initialLoadAutoScrollTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
            fastFallbackTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    // Auto-resize composer
    useEffect(() => {
        const element = textareaRef.current?.element;
        if (element) {
            element.style.height = 'auto';
            element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
        }
    }, [prompt]);

    // Close style menu on outside click or Escape
    useEffect(() => {
        if (!showStyleMenu) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!styleMenuRef.current) return;
            if (!styleMenuRef.current.contains(event.target as Node)) {
                setShowStyleMenu(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setShowStyleMenu(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [showStyleMenu]);

    useEffect(() => {
        apiClient.setComposerTemperature(modelTemperature);
    }, [modelTemperature]);

    // Auto-collapse chat when edit mode is active
    useEffect(() => {
        if (isEditMode && !isCollapsed) {
            autoCollapsedRef.current = true;
            setIsCollapsed(true);
        }
        if (!isEditMode && autoCollapsedRef.current) {
            autoCollapsedRef.current = false;
            setIsCollapsed(false);
        }
    }, [isEditMode, isCollapsed]);

    const closeMentionMenu = () => {
        setIsMentionOpen(false);
        setReferenceMenuMode('root');
        setMentionQuery('');
        setMentionActiveIndex(0);
        setReferenceUrlDraft('');
        referenceTriggerRangeRef.current = null;
    };

    const syncMentionState = (value: string, cursor: number) => {
        const match = findComposerReferenceTrigger(value, cursor);
        if (referenceMenuMode !== 'root' && isMentionOpen) {
            if (!match) {
                closeMentionMenu();
            }
            return;
        }
        if (!match) {
            closeMentionMenu();
            return;
        }
        referenceTriggerRangeRef.current = match.range;
        setMentionQuery(match.query);
        setReferenceMenuMode('root');
        setIsMentionOpen(true);
    };

    const openUrlReferenceInput = () => {
        setReferenceMenuMode('url');
        setMentionActiveIndex(0);
        setMentionQuery('');
        setReferenceUrlDraft('');
        setIsMentionOpen(true);
    };

    const openScreenReferenceInput = () => {
        setReferenceMenuMode('screen');
        setMentionActiveIndex(0);
        setMentionQuery('');
        setIsMentionOpen(true);
    };

    const submitUrlReference = () => {
        const normalized = normalizeComposerReferenceUrl(referenceUrlDraft);
        if (!normalized) return;
        const range = referenceTriggerRangeRef.current;
        if (!range) return;
        const source = textareaRef.current?.getValue() ?? prompt;
        const result = replaceComposerReferenceTrigger(source, range, formatComposerUrlReferenceToken(normalized));
        setPrompt(result.value);
        closeMentionMenu();
        window.setTimeout(() => {
            const target = textareaRef.current;
            if (!target) return;
            target.focus();
            target.setSelectionRange(result.cursor, result.cursor);
        }, 0);
    };

    const handleReferenceTokenClick = (reference: { kind: 'url' | 'screen'; range: { start: number; end: number }; url?: string }) => {
        referenceTriggerRangeRef.current = reference.range;
        if (reference.kind === 'url' && reference.url) {
            setReferenceMenuMode('url');
            setMentionActiveIndex(0);
            setMentionQuery('');
            setReferenceUrlDraft(reference.url);
            setIsMentionOpen(true);
            return;
        }
        if (reference.kind === 'screen') {
            setReferenceMenuMode('screen');
            setMentionActiveIndex(0);
            setMentionQuery('');
            setIsMentionOpen(true);
        }
    };

    const selectMentionScreen = (screen: ComposerScreenReference) => {
        const range = referenceTriggerRangeRef.current;
        if (!range) return;
        const source = textareaRef.current?.getValue() ?? prompt;
        const result = replaceComposerReferenceTrigger(source, range, formatComposerScreenReferenceToken(screen.name));
        setPrompt(result.value);
        closeMentionMenu();
        window.setTimeout(() => {
            const target = textareaRef.current;
            if (!target) return;
            target.focus();
            target.setSelectionRange(result.cursor, result.cursor);
        }, 0);
    };

    const getScreenReferencesFromComposer = (references: ComposerScreenReference[] = []): HtmlScreen[] => {
        if (!references.length) return [];
        const currentScreens = useDesignStore.getState().spec?.screens || [];
        const byId = new Map(currentScreens.map((screen) => [screen.screenId, screen]));
        return references
            .map((item) => byId.get(item.screenId))
            .filter(Boolean) as HtmlScreen[];
    };

    const resolveInlineComposerReferences = (value: string) => {
        const parsed = extractComposerInlineReferences(value, {
            allowScreen: true,
            screens: availableMentionScreens,
        });
        return {
            prompt: parsed.cleanedText.trim(),
            referenceUrls: parsed.urlReferences.map((item) => item.url),
            referenceScreens: getScreenReferencesFromComposer(parsed.screenReferences),
        };
    };

    const buildPlannerReferenceImages = async (screens: HtmlScreen[]): Promise<string[]> => {
        if (!screens.length) return [];
        const samples = screens.slice(0, 2);
        const images = await Promise.all(
            samples.map(async (screen) => {
                try {
                    const rendered = await apiClient.renderScreenImage({
                        html: screen.html,
                        width: Math.max(320, Math.min(1280, screen.width || 402)),
                        height: Math.max(480, Math.min(2200, screen.height || 874)),
                        scale: 1,
                    });
                    if (!rendered?.pngBase64) return null;
                    return `data:image/png;base64,${rendered.pngBase64}`;
                } catch {
                    return null;
                }
            })
        );
        return images.filter(Boolean) as string[];
    };

    const buildPlannerVisionInputs = async (screens: HtmlScreen[], attachments?: string[]): Promise<string[]> => {
        const rendered = await buildPlannerReferenceImages(screens);
        const uploaded = (attachments || [])
            .filter((src) => typeof src === 'string' && src.startsWith('data:image/'))
            .slice(0, 3);
        return [...new Set([...rendered, ...uploaded])].slice(0, 3);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const availableSlots = Math.max(0, MAX_COMPOSER_ATTACHMENTS - images.length);
        if (availableSlots === 0) {
            e.target.value = '';
            return;
        }

        Array.from(files).slice(0, availableSlots).forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                setImages(prev => (prev.length >= MAX_COMPOSER_ATTACHMENTS ? prev : [...prev, base64]));
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = typeof reader.result === 'string' ? reader.result : '';
                const base64 = result.split(',')[1] || '';
                if (!base64) {
                    reject(new Error('Failed to encode audio'));
                    return;
                }
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('Failed to read audio blob'));
            reader.readAsDataURL(blob);
        });
    };

    const cleanupRecording = () => {
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
        }
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        setIsRecording(false);
    };

    const handleMicToggle = async () => {
        if (isTranscribing) return;

        if (isRecording) {
            mediaRecorderRef.current?.stop();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
            const mimeType = preferred.find((type) => MediaRecorder.isTypeSupported(type));
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            recorder.onstop = async () => {
                try {
                    setIsTranscribing(true);
                    const type = recorder.mimeType || 'audio/webm';
                    const audioBlob = new Blob(audioChunksRef.current, { type });
                    const audioBase64 = await blobToBase64(audioBlob);
                    const result = await apiClient.transcribeAudio({
                        audioBase64,
                        mimeType: audioBlob.type || 'audio/webm',
                    });
                    if (result.text.trim()) {
                        setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${result.text.trim()}` : result.text.trim()));
                    }
                } catch (error) {
                    console.error('Voice transcription failed:', error);
                } finally {
                    setIsTranscribing(false);
                    cleanupRecording();
                }
            };

            recorder.start();
            setIsRecording(true);
        } catch (error) {
            console.error('Microphone access failed:', error);
            cleanupRecording();
        }
    };

    const handleCopyMessage = async (messageId: string, content: string) => {
        const text = stripUiTags(stripMarkdownBold(content || ''));
        if (!text.trim()) return;
        try {
            await navigator.clipboard.writeText(text);
            updateMessage(messageId, { meta: { ...(useChatStore.getState().messages.find(m => m.id === messageId)?.meta || {}), copiedAt: Date.now() } });
            setCopiedMessageIds(prev => ({ ...prev, [messageId]: true }));
            if (copyResetTimersRef.current[messageId]) {
                window.clearTimeout(copyResetTimersRef.current[messageId]);
            }
            copyResetTimersRef.current[messageId] = window.setTimeout(() => {
                setCopiedMessageIds(prev => ({ ...prev, [messageId]: false }));
                delete copyResetTimersRef.current[messageId];
            }, 2200);
        } catch (err) {
            console.warn('Failed to copy message', err);
        }
    };

    const handleReaction = (messageId: string, reaction: 'like' | 'dislike') => {
        updateMessage(messageId, {
            meta: {
                ...(useChatStore.getState().messages.find(m => m.id === messageId)?.meta || {}),
                reaction,
            }
        });
    };

    const handleShareMessage = async (messageId: string, content: string) => {
        const text = stripUiTags(stripMarkdownBold(content || ''));
        if (!text.trim()) return;
        try {
            if (navigator.share) {
                await navigator.share({ text });
                return;
            }
            await navigator.clipboard.writeText(text);
            updateMessage(messageId, { meta: { ...(useChatStore.getState().messages.find(m => m.id === messageId)?.meta || {}), sharedAt: Date.now() } });
        } catch (err) {
            console.warn('Failed to share message', err);
        }
    };

    const togglePlanMode = () => {
        setPlanMode((prev) => {
            const next = !prev;
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(PLAN_MODE_STORAGE_KEY, next ? '1' : '0');
            }
            pushToast({
                kind: 'info',
                title: next ? 'Plan mode enabled' : 'Plan mode disabled',
                message: next
                    ? 'Send now runs planner-first so you can pick what to generate next.'
                    : 'Send runs direct generation flow.',
                durationMs: 3200,
            });
            return next;
        });
    };

    const handlePlannerCta = (suggestion: ComposerSuggestion) => {
        if (!Array.isArray(suggestion.screenNames) || suggestion.screenNames.length === 0 || isGenerating) return;
        pinToLatest('smooth');
        const source = useChatStore.getState().messages.find((item) => item.id === suggestion.messageId);
        const suggestionContext = (source?.meta?.plannerContext || null) as PlannerSuggestionContext | null;
        const basePrompt = String(suggestionContext?.appPrompt || source?.meta?.plannerPrompt || '').trim();
        if (!basePrompt) return;
        const suggestionKey = buildComposerSuggestionKey(suggestion.screenNames);
        if (suggestionKey) {
            setUsedSuggestionKeysByMessage((prev) => {
                const existing = prev[suggestion.messageId] || [];
                if (existing.includes(suggestionKey)) return prev;
                return {
                    ...prev,
                    [suggestion.messageId]: [...existing, suggestionKey],
                };
            });
        }

        updateMessage(suggestion.messageId, {
            meta: {
                ...(source?.meta || {}),
                plannerActionAt: Date.now(),
                plannerActionScreens: suggestion.screenNames,
            }
        });

        const visiblePrompt = (suggestion.label || `Generate ${suggestion.screenNames.join(' + ')}`).trim();
        const targetPlatform = suggestionContext?.platform || selectedPlatform;
        const targetStyle = suggestionContext?.stylePreset || stylePreset;
        const targetModel = suggestionContext?.modelProfile || modelProfile;
        const targetExistingScreens = Array.isArray(suggestionContext?.existingScreenNames)
            ? suggestionContext!.existingScreenNames
            : [];
        const targetStyleReference = String(suggestionContext?.styleReference || '').trim();
        const basePromptWithDetails = suggestion.details?.trim()
            ? `${basePrompt}\n\nSpecific follow-up screen guidance:\n${suggestion.details.trim()}`
            : basePrompt;

        void handleGenerate(
            visiblePrompt,
            [],
            targetPlatform,
            targetStyle,
            targetModel,
            suggestion.screenNames,
            basePromptWithDetails,
            targetExistingScreens,
            targetStyleReference,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            suggestionContext?.referenceUrls || []
        );
    };

    const handleProceedWithDesignSystem = async (assistantMessageId: string) => {
        if (isGenerating) return;
        pinToLatest('smooth');
        const source = useChatStore.getState().messages.find((item) => item.id === assistantMessageId && item.role === 'assistant');
        if (!source) return;
        const proposedDesignSystem = (source.meta?.designSystemProposal || null) as ProjectDesignSystem | null;
        const context = (source.meta?.designSystemProposalContext || null) as DesignSystemProposalContext | null;
        const designSystem = getAuthoritativeProjectDesignSystem() || proposedDesignSystem;
        if (!designSystem || !context) return;
        const parentMessage = context.parentUserId
            ? useChatStore.getState().messages.find((item) => item.id === context.parentUserId && item.role === 'user')
            : null;
        const imagesToUse = Array.isArray(context.images) ? context.images : (parentMessage?.images || []);

        applyProjectDesignSystem(designSystem);
        updateMessage(assistantMessageId, {
            meta: {
                ...(source.meta || {}),
                designSystemProposal: designSystem,
                designSystemProceedAt: Date.now(),
            }
        });

        await handleGenerate(
            context.prompt,
            imagesToUse,
            context.platform,
            context.stylePreset,
            context.modelProfile,
            undefined,
            context.appPromptForPlanning || context.prompt,
            undefined,
            undefined,
            context.parentUserId,
            getScreenReferencesFromComposer(context.referenceScreens),
            false,
            true,
            undefined,
            context.referenceUrls || [],
            context.referenceImageUrls || []
        );
    };

    const runConsistencyRepairIfNeeded = async (
        screen: HtmlScreen,
        nextHtml: string,
        reasonContext: string,
        referenceScreens: HtmlScreen[],
        attachedImages?: string[]
    ): Promise<string> => {
        const localMemory = useProjectMemoryStore.getState().memory
            || deriveProjectMemoryFromState(useDesignStore.getState().spec?.screens || [], useChatStore.getState().messages, useDesignStore.getState().spec?.designSystem);
        const designSystem = useDesignStore.getState().spec?.designSystem;
        const issues = validateScreenConsistency({
            html: nextHtml,
            memory: localMemory,
            designSystem,
        });
        const severeIssues = issues.filter((issue) => issue.severity === 'error');
        if (severeIssues.length === 0) return nextHtml;

        const fallbackReferences = (useDesignStore.getState().spec?.screens || [])
            .filter((candidate) => candidate.screenId !== screen.screenId)
            .slice(0, 2);
        const finalReferences = (referenceScreens.length > 0 ? referenceScreens : fallbackReferences)
            .filter((candidate) => candidate.screenId !== screen.screenId)
            .slice(0, 2)
            .map((candidate) => ({
                screenId: candidate.screenId,
                name: candidate.name,
                html: candidate.html,
            }));

        try {
            const repair = await apiClient.edit({
                instruction: `Consistency repair pass for "${screen.name}".
Keep the screen's purpose and content intact.
Align component language with the project design system and existing screens.
Context: ${reasonContext}
Issues:
${issues.map((issue) => `- ${issue.message}`).join('\n')}
Return a polished, consistent screen without introducing a new navigation pattern.`,
                html: nextHtml,
                screenId: screen.screenId,
                images: attachedImages,
                preferredModel: getPreferredTextModel(modelProfile),
                projectDesignSystem: designSystem,
                projectId: projectId || undefined,
                consistencyProfile: {
                    canonicalNavbarLabels: localMemory?.components?.navbar?.labels || [],
                    canonicalNavbarSignature: localMemory?.components?.navbar?.signature || '',
                    rules: issues.map((issue) => issue.message),
                },
                referenceScreens: finalReferences,
            });
            return repair.html || nextHtml;
        } catch (error) {
            console.warn('[UI] consistency repair skipped due to edit failure', error);
            return nextHtml;
        }
    };

    const withProjectPlannerContext = (payload: PlannerRequest, routeReferenceScreens: HtmlScreen[] = []): PlannerRequest => {
        const currentScreens = useDesignStore.getState().spec?.screens || [];
        const currentMessages = useChatStore.getState().messages;
        const memorySnapshot = useProjectMemoryStore.getState().memory
            || deriveProjectMemoryFromState(currentScreens, currentMessages, useDesignStore.getState().spec?.designSystem);
        return {
            ...payload,
            screenDetails: buildRoutingScreenDetails(currentScreens),
            recentMessages: buildRecentConversation(currentMessages),
            projectMemorySummary: buildProjectMemorySummary(memorySnapshot, currentScreens, currentMessages),
            routeReferenceScreens: payload.phase === 'route'
                ? routeReferenceScreens.slice(0, 1).map((screen) => ({
                    screenId: screen.screenId,
                    name: screen.name,
                    html: screen.html,
                }))
                : payload.routeReferenceScreens,
        };
    };

    const handlePlanOnly = async (
        existingUserMessageId?: string,
        overridePrompt?: string,
        overrideImages?: string[],
        incomingReferenceScreens?: HtmlScreen[],
        incomingReferenceUrls?: string[]
    ) => {
        const resolvedComposerReferences = resolveInlineComposerReferences(overridePrompt ?? prompt);
        const requestPrompt = resolvedComposerReferences.prompt;
        setIsAwaitingAssistantDecision(false);
        if (!requestPrompt || isGenerating) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            notifyError('No internet connection', 'Reconnect and try planning again.');
            return;
        }

        const imagesToSend = overrideImages ? [...overrideImages] : [...images];
        const referenceScreens = incomingReferenceScreens || resolvedComposerReferences.referenceScreens;
        const referenceUrls = incomingReferenceUrls || resolvedComposerReferences.referenceUrls;
        const routeReferenceScreens = pickRouteReferenceScreens(
            requestPrompt,
            useDesignStore.getState().spec?.screens || [],
            referenceScreens
        );
        const requestPromptWithReferences = referenceScreens.length > 0
            ? `${requestPrompt}\n\n${buildReferencedScreensPromptContext(referenceScreens)}`
            : requestPrompt;
        const userMsgId = existingUserMessageId || addMessage('user', requestPrompt, imagesToSend);
        const assistantMsgId = addMessage('assistant', 'Planning your flow...');
        const referenceMeta = buildScreenReferenceMeta(referenceScreens);
        updateMessage(userMsgId, {
            meta: {
                ...(useChatStore.getState().messages.find((m) => m.id === userMsgId)?.meta || {}),
                livePreview: false,
                requestKind: 'plan',
                ...(referenceUrls.length > 0 ? { referenceUrls } : {}),
                ...(referenceMeta.screenIds.length > 0 ? referenceMeta : {}),
            }
        });
        updateMessage(assistantMsgId, {
            meta: {
                ...(useChatStore.getState().messages.find((m) => m.id === assistantMsgId)?.meta || {}),
                parentUserId: userMsgId,
                typedComplete: false,
            }
        });
        setActiveBranchForUser(userMsgId, assistantMsgId);

        if (!existingUserMessageId) {
            setPrompt('');
            setImages([]);
            closeMentionMenu();
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
        setGenerating(true);
        startLoadingToast(
            generationLoadingToastRef,
            'Planning feature flow',
            'Analyzing requirements and suggesting next screens...'
        );

        const startTime = Date.now();
        let tokenUsageTotal = 0;
        const captureBillingTokens = (billing: unknown) => {
            const tokens = getBillingTotalTokens(billing);
            if (tokens !== null) tokenUsageTotal += tokens;
            return tokens;
        };
        const hasScreens = Boolean(spec?.screens?.length);

        try {
            const plannerReferenceImages = await buildPlannerVisionInputs(referenceScreens, imagesToSend);
            const route = await apiClient.plan(withProjectPlannerContext({
                phase: 'route',
                appPrompt: requestPromptWithReferences,
                platform: selectedPlatform,
                stylePreset,
                screensGenerated: (spec?.screens || []).map((screen) => ({ name: screen.name })),
                referenceImages: plannerReferenceImages,
                referenceUrls,
                preferredModel: modelProfile === 'fast' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile',
            }, routeReferenceScreens));
            captureBillingTokens((route as any)?.billing);

            if (route.phase === 'route' && route.intent === 'chat_assist') {
                const routeSuggestions = buildRouteChatSuggestionPayload(route);
                const snapshotScreens = spec?.screens || [];
                const snapshotScreenNames = snapshotScreens.map((screen) => screen.name);
                const snapshotStyleReference = buildContinuationStyleReference(snapshotScreens);
                setIsAwaitingAssistantDecision(false);
                updateMessage(assistantMsgId, {
                    content: (route.assistantResponse || 'Here is a quick take:'),
                    status: 'complete',
                    meta: {
                        ...(useChatStore.getState().messages.find((m) => m.id === assistantMsgId)?.meta || {}),
                        thinkingMs: Date.now() - startTime,
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                        typedComplete: true,
                        plannerPrompt: requestPrompt,
                        plannerRoute: route,
                        plannerPostgen: routeSuggestions,
                        plannerContext: {
                            appPrompt: requestPrompt,
                            platform: selectedPlatform,
                            stylePreset,
                            modelProfile,
                            existingScreenNames: snapshotScreenNames,
                            styleReference: snapshotStyleReference,
                            referenceUrls,
                        } as PlannerSuggestionContext,
                    }
                });
                updateMessage(userMsgId, {
                    meta: {
                        ...(useChatStore.getState().messages.find((m) => m.id === userMsgId)?.meta || {}),
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                    }
                });
                notifySuccess('Assistant response ready', 'Planner answered directly based on your request.', tokenUsageTotal > 0 ? tokenUsageTotal : null);
                return;
            }

            const response = await apiClient.plan(withProjectPlannerContext({
                phase: hasScreens ? 'postgen' : 'plan',
                appPrompt: requestPromptWithReferences,
                platform: selectedPlatform,
                stylePreset,
                screenCountDesired: 2,
                screensGenerated: (spec?.screens || []).map((screen) => ({ name: screen.name })),
                referenceImages: plannerReferenceImages,
                referenceUrls,
                preferredModel: modelProfile === 'fast' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile',
            }));
            captureBillingTokens((response as any)?.billing);

            if (response.phase === 'postgen') {
                const snapshotScreens = useDesignStore.getState().spec?.screens || [];
                updateMessage(assistantMsgId, {
                    content: formatPostgenSuggestionText(response),
                    status: 'complete',
                    meta: {
                        ...(useChatStore.getState().messages.find((m) => m.id === assistantMsgId)?.meta || {}),
                        thinkingMs: Date.now() - startTime,
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                        plannerPrompt: requestPrompt,
                        plannerPostgen: response,
                        plannerContext: {
                            appPrompt: requestPrompt,
                            platform: selectedPlatform,
                            stylePreset,
                            modelProfile,
                            existingScreenNames: snapshotScreens.map((screen) => screen.name),
                            styleReference: buildContinuationStyleReference(snapshotScreens),
                            referenceUrls,
                        } as PlannerSuggestionContext,
                    }
                });
            } else if (response.phase === 'plan' || response.phase === 'discovery') {
                const plannedName = normalizeSuggestedProjectName(response.appName);
                if (plannedName) {
                    applyProjectName(plannedName);
                }
                const cta = buildPlanCallToAction(response);
                const snapshotScreens = useDesignStore.getState().spec?.screens || [];
                const planExtras = response.recommendedScreens
                    .slice()
                    .sort((a, b) => (a.priority || 99) - (b.priority || 99))
                    .slice(0, 6)
                    .map((item, index) => ({
                        name: item.name,
                        why: item.goal || item.why || 'High-value next screen from the plan.',
                        priority: item.priority || index + 1,
                    }));
                updateMessage(assistantMsgId, {
                    content: formatPlanSuggestionText(response),
                    status: 'complete',
                    meta: {
                        ...(useChatStore.getState().messages.find((m) => m.id === assistantMsgId)?.meta || {}),
                        thinkingMs: Date.now() - startTime,
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                        plannerPrompt: requestPrompt,
                        plannerPostgen: { callToAction: cta, nextScreenSuggestions: planExtras } as PlannerCtaPayload,
                        plannerPlan: response,
                        plannerContext: {
                            appPrompt: requestPrompt,
                            platform: selectedPlatform,
                            stylePreset,
                            modelProfile,
                            existingScreenNames: snapshotScreens.map((screen) => screen.name),
                            styleReference: buildContinuationStyleReference(snapshotScreens),
                            referenceUrls,
                        } as PlannerSuggestionContext,
                    }
                });
            } else {
                throw new Error('Unexpected planner response for plan mode.');
            }

            updateMessage(userMsgId, {
                meta: {
                    ...(useChatStore.getState().messages.find((m) => m.id === userMsgId)?.meta || {}),
                    ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                }
            });
            notifySuccess('Plan ready', 'Review suggested screens and generate from the CTA buttons.', tokenUsageTotal > 0 ? tokenUsageTotal : null);
        } catch (error) {
            const friendly = getUserFacingError(error);
            updateMessage(assistantMsgId, {
                content: toTaggedErrorMessage(error),
                status: 'error',
                meta: {
                    ...(useChatStore.getState().messages.find((m) => m.id === assistantMsgId)?.meta || {}),
                    thinkingMs: Date.now() - startTime,
                    tokenUsageTotal: tokenUsageTotal > 0 ? tokenUsageTotal : undefined,
                }
            });
            updateMessage(userMsgId, {
                meta: {
                    ...(useChatStore.getState().messages.find((m) => m.id === userMsgId)?.meta || {}),
                    ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                }
            });
            notifyError(friendly.title, friendly.summary, tokenUsageTotal > 0 ? tokenUsageTotal : null);
        } finally {
            setGenerating(false);
            clearLoadingToast(generationLoadingToastRef);
        }
    };

    const handleGenerate = async (
        incomingPrompt?: string,
        incomingImages?: string[],
        incomingPlatform?: 'mobile' | 'tablet' | 'desktop',
        incomingStylePreset?: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful',
        incomingModelProfile?: DesignModelProfile,
        incomingTargetScreens?: string[],
        incomingContextPrompt?: string,
        incomingExistingScreenNames?: string[],
        incomingStyleReference?: string,
        existingUserMessageId?: string,
        incomingReferenceScreens?: HtmlScreen[],
        allowPlannerFlow?: boolean,
        skipDesignSystemStep?: boolean,
        incomingReferencePreviewMode?: 'screen' | 'palette',
        incomingReferenceUrls?: string[],
        incomingReferenceImageUrls?: string[]
    ) => {
        const resolvedComposerReferences = extractComposerInlineReferences(incomingPrompt ?? prompt, {
            allowScreen: true,
            screens: availableMentionScreens,
        });
        const requestPrompt = resolvedComposerReferences.cleanedText.trim();
        setIsAwaitingAssistantDecision(false);
        if (!requestPrompt || isGenerating) return;
        const usePlanner = allowPlannerFlow ?? planMode;
        const hasPriorScreens = (spec?.screens?.length || 0) > 0;
        const hasPriorUserMessages = messages.some((message) => message.role === 'user');
        const shouldNameProjectOnFirstRequest = !hasPriorScreens && !hasPriorUserMessages && isGenericProjectName(spec?.name);
        const shouldBundleDesignSystemWithFirstGeneration = !hasPriorScreens;
        const shouldPauseForDesignSystemApproval = !skipDesignSystemStep
            && !existingUserMessageId
            && !hasPriorScreens
            && !hasPriorUserMessages
            && (!incomingTargetScreens || incomingTargetScreens.length === 0);
        const referenceScreens = incomingReferenceScreens || getScreenReferencesFromComposer(resolvedComposerReferences.screenReferences);
        const referenceUrls = incomingReferenceUrls || resolvedComposerReferences.urlReferences.map((item) => item.url);
        const referenceImageUrls = Array.isArray(incomingReferenceImageUrls)
            ? incomingReferenceImageUrls.filter((item) => typeof item === 'string' && item.trim().length > 0)
            : [];
        const referencePromptContext = buildReferencedScreensPromptContext(referenceScreens);
        const requestPromptWithReferences = referencePromptContext
            ? `${requestPrompt}\n\n${referencePromptContext}`
            : requestPrompt;
        const basePlanningPrompt = (incomingContextPrompt ?? requestPrompt).trim();
        const appPromptForPlanning = referencePromptContext
            ? `${basePlanningPrompt}\n\n${referencePromptContext}`
            : basePlanningPrompt;
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            notifyError('No internet connection', 'Reconnect and try generating again.');
            return;
        }
        void ensureNotificationPermission();

        const imagesToSend = incomingPrompt ? (incomingImages || []) : [...images];
        const platformToUse = incomingPlatform || selectedPlatform;
        const styleToUse = incomingStylePreset || stylePreset;
        const initialModelProfileToUse = incomingModelProfile || modelProfile;
        const requestedScreenCount = incomingTargetScreens && incomingTargetScreens.length > 0
            ? incomingTargetScreens.length
            : undefined;
        const resolvedModelProfile = await maybeSwitchToFastForLowCredits({
            operation: 'generate_stream',
            currentModelProfile: initialModelProfileToUse,
            expectedScreenCount: requestedScreenCount || 1,
            bundleIncludesDesignSystem: shouldBundleDesignSystemWithFirstGeneration,
        });
        if (!resolvedModelProfile) return;
        const modelProfileToUse = resolvedModelProfile;
        const preferredModel = getPreferredTextModel(modelProfileToUse);
        const shouldLockToImageReference = imagesToSend.length > 0
            && /(as seen|this image|this screenshot|match this|based on (the )?image|like this|same as this)/i.test(requestPrompt);
        const existingScreenNames = (incomingExistingScreenNames && incomingExistingScreenNames.length > 0)
            ? [...incomingExistingScreenNames]
            : (spec?.screens || []).map((screen) => screen.name);
        if (!incomingPrompt && !existingUserMessageId) {
            setImages([]);
        }

        const userMsgId = existingUserMessageId || addMessage('user', requestPrompt, imagesToSend);
        const assistantMsgId = addMessage('assistant', 'Warming up the studio...');
        assistantMsgIdRef.current = assistantMsgId;
        const referenceMeta = buildScreenReferenceMeta(referenceScreens);
        updateMessage(userMsgId, {
            meta: {
                ...(useChatStore.getState().messages.find(m => m.id === userMsgId)?.meta || {}),
                livePreview: false,
                requestKind: 'generate',
                ...(incomingReferencePreviewMode ? { referencePreviewMode: incomingReferencePreviewMode } : {}),
                ...(referenceUrls.length > 0 ? { referenceUrls } : {}),
                ...(referenceMeta.screenIds.length > 0 ? referenceMeta : {}),
            }
        });
        updateMessage(assistantMsgId, {
            meta: {
                ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                parentUserId: userMsgId,
                typedComplete: false,
            }
        });
        setActiveBranchForUser(userMsgId, assistantMsgId);

        startLoadingToast(
            generationLoadingToastRef,
            'Generating screens',
            'Working on your design. This can take a little while for richer screens.'
        );
        setPrompt('');
        if (!existingUserMessageId) {
            closeMentionMenu();
        }
        setGenerating(true);

        const effectiveDimensions = platformToUse === 'desktop'
            ? { width: 1280, height: 1200 }
            : platformToUse === 'tablet'
                ? { width: 768, height: 1024 }
                : { width: 402, height: 874 };
        let startTime = Date.now();
        let tokenUsageTotal = 0;
        const captureBillingTokens = (billing: unknown) => {
            const tokens = getBillingTotalTokens(billing);
            if (tokens !== null) tokenUsageTotal += tokens;
            return tokens;
        };
        let plannerPlan: PlannerPlanResponse | null = null;
        let plannerSuggestedProjectName = '';
        let generationPromptFromPlanner = requestPromptWithReferences;
        let plannerReferenceImages: string[] = [];
        let activeProjectDesignSystem: ProjectDesignSystem | undefined = useDesignStore.getState().spec?.designSystem;
        let firstRequestProjectNameLocked = false;

        try {
            console.info('[UI] generate: start (stream)', {
                prompt: requestPrompt,
                stylePreset: styleToUse,
                platform: platformToUse,
                images: imagesToSend,
                modelProfile: modelProfileToUse,
            });
            if (!activeProjectDesignSystem) {
                try {
                    const designSystemResponse = await apiClient.generateDesignSystem({
                        prompt: appPromptForPlanning,
                        stylePreset: styleToUse,
                        platform: platformToUse,
                        images: imagesToSend,
                        referenceUrls,
                        referenceImageUrls,
                        preferredModel,
                        bundleWithFirstGeneration: shouldBundleDesignSystemWithFirstGeneration,
                        projectId: projectId || undefined,
                    });
                    applyReferenceContextFeedback(userMsgId, referenceUrls, designSystemResponse.referenceContext);
                    captureBillingTokens(designSystemResponse.billing);
                    activeProjectDesignSystem = designSystemResponse.designSystem;
                    applyProjectDesignSystem(activeProjectDesignSystem);
                    if (shouldNameProjectOnFirstRequest && isGenericProjectName(useDesignStore.getState().spec?.name)) {
                        const firstDesignSystemName = normalizeSuggestedProjectName(designSystemResponse.designSystem?.systemName);
                        if (firstDesignSystemName) {
                            applyProjectName(firstDesignSystemName);
                            firstRequestProjectNameLocked = true;
                        }
                    }
                } catch (designSystemError) {
                    console.warn('[UI] design-system pre-gen failed; continuing with backend fallback', designSystemError);
                }
            }

            if (shouldPauseForDesignSystemApproval && activeProjectDesignSystem) {
                if (shouldNameProjectOnFirstRequest && isGenericProjectName(useDesignStore.getState().spec?.name)) {
                    let nextProjectName = normalizeSuggestedProjectName(activeProjectDesignSystem.systemName);
                    if (!nextProjectName) {
                        nextProjectName = deriveProjectNameFromPrompt(requestPrompt);
                    }
                    if (nextProjectName) {
                        applyProjectName(nextProjectName);
                        firstRequestProjectNameLocked = true;
                    }
                }

                updateMessage(assistantMsgId, {
                    content: `[h2]Design System Ready[/h2]
[p]Review this project design system, adjust anything you want, then proceed to generate screens.[/p]`,
                    status: 'complete',
                    meta: {
                        ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                        thinkingMs: Date.now() - startTime,
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                        typedComplete: true,
                        designSystemProposal: activeProjectDesignSystem,
                        designSystemProposalContext: {
                            prompt: requestPrompt,
                            appPromptForPlanning,
                            images: imagesToSend,
                            referenceUrls,
                            referenceImageUrls,
                            platform: platformToUse,
                            stylePreset: styleToUse,
                            modelProfile: modelProfileToUse,
                            referenceScreens: referenceScreens.map((screen) => ({
                                screenId: screen.screenId,
                                name: screen.name,
                            })),
                            parentUserId: userMsgId,
                        } as DesignSystemProposalContext,
                    }
                });
                updateMessage(userMsgId, {
                    meta: {
                        ...(useChatStore.getState().messages.find((message) => message.id === userMsgId)?.meta || {}),
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                    }
                });
                void persistProjectAfterAiChange('design system generation');
                notifyInfo('Design system drafted', 'Review or edit it, then click Proceed to generate screens.', tokenUsageTotal > 0 ? tokenUsageTotal : null);
                return;
            }

            if (usePlanner || shouldNameProjectOnFirstRequest) {
                plannerReferenceImages = await buildPlannerVisionInputs(referenceScreens, imagesToSend);
                try {
                    const discoveryPlan = await apiClient.plan(withProjectPlannerContext({
                        phase: 'plan',
                        appPrompt: appPromptForPlanning,
                        platform: platformToUse,
                        stylePreset: styleToUse,
                        screenCountDesired: incomingTargetScreens?.length || 2,
                        screensGenerated: existingScreenNames.map((name) => ({ name })),
                        referenceImages: plannerReferenceImages,
                        referenceUrls,
                        preferredModel: modelProfileToUse === 'fast' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile',
                    }));
                    applyReferenceContextFeedback(userMsgId, referenceUrls, discoveryPlan.referenceContext);
                    captureBillingTokens((discoveryPlan as any)?.billing);
                    if (discoveryPlan.phase === 'plan' || discoveryPlan.phase === 'discovery') {
                        plannerPlan = discoveryPlan;
                        if (!firstRequestProjectNameLocked) {
                            plannerSuggestedProjectName = normalizeSuggestedProjectName(discoveryPlan.appName);
                        }
                        if (incomingTargetScreens && incomingTargetScreens.length > 0) {
                            generationPromptFromPlanner = makePlannerTargetedGenerationPromptWithStyle(
                                appPromptForPlanning,
                                incomingTargetScreens,
                                existingScreenNames,
                                incomingStyleReference
                            );
                        } else if (!shouldLockToImageReference && discoveryPlan.generatorPrompt?.trim()) {
                            generationPromptFromPlanner = discoveryPlan.generatorPrompt.trim();
                        }
                    }
                } catch (plannerError) {
                    console.warn('[UI] planner pre-gen failed; continuing with raw prompt', plannerError);
                }
            }

            const existingBoards = useCanvasStore.getState().doc.boards;
            const startX = existingBoards.length > 0
                ? Math.max(...existingBoards.map(b => b.x + (b.width || 402))) + 100
                : 100;
            startTime = Date.now();

            updateMessage(assistantMsgId, {
                content: FEEDBACK_BUCKETS.early[0],
                status: 'streaming',
                meta: {
                    feedbackKey: Date.now(),
                    feedbackPhase: 'early',
                    feedbackStart: startTime
                } as any
            });

            const parserState = createStreamParserState();
            const screenIdBySeq = new Map<number, string>();
            const createdSeqs: number[] = [];
            let completedCount = 0;
            let finalDescription = '';
            let thinkingStopped = false;

            const stopThinkingOnFirstScreen = () => {
                if (thinkingStopped) return;
                thinkingStopped = true;
                updateMessage(assistantMsgId, {
                    meta: {
                        ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                        thinkingMs: Date.now() - startTime,
                        thinkingStopped: true,
                    } as any
                });
            };

            const ensureScreen = (seq: number, name: string): string => {
                const existingId = screenIdBySeq.get(seq);
                if (existingId) return existingId;

                const index = createdSeqs.length;
                const screenId = uuidv4();
                createdSeqs.push(seq);
                screenIdBySeq.set(seq, screenId);

                addScreens([{
                    screenId,
                    name,
                    html: '',
                    width: effectiveDimensions.width,
                    height: effectiveDimensions.height,
                    status: 'streaming',
                }]);

                const board = {
                    boardId: screenId,
                    screenId,
                    x: startX + index * (effectiveDimensions.width + 100),
                    y: 100,
                    width: effectiveDimensions.width,
                    height: effectiveDimensions.height,
                    deviceFrame: 'none' as const,
                    locked: false,
                    visible: true,
                };
                const currentBoards = useCanvasStore.getState().doc.boards;
                setBoards([...currentBoards, board]);
                stopThinkingOnFirstScreen();
                setFocusNodeId(screenId);

                return screenId;
            };

            const controller = new AbortController();
            setAbortController(controller);

            const shouldUseNonStreamingPath = Boolean(preferredModel && !String(preferredModel).toLowerCase().startsWith('gemini-'));

            if (shouldUseNonStreamingPath) {
                const generatedIds: string[] = [];
                const regen = await apiClient.generate({
                    prompt: generationPromptFromPlanner,
                    stylePreset: styleToUse,
                    platform: platformToUse,
                    images: imagesToSend,
                    referenceUrls,
                    referenceImageUrls,
                    expectedScreenCount: requestedScreenCount,
                    preferredModel,
                    projectDesignSystem: activeProjectDesignSystem,
                    bundleIncludesDesignSystem: shouldBundleDesignSystemWithFirstGeneration,
                    projectId: projectId || undefined,
                }, controller.signal);
                applyReferenceContextFeedback(userMsgId, referenceUrls, regen.referenceContext);
                captureBillingTokens(regen.billing);
                activeProjectDesignSystem = regen.designSpec.designSystem || activeProjectDesignSystem;

                for (let index = 0; index < regen.designSpec.screens.length; index += 1) {
                    const screen = regen.designSpec.screens[index];
                    const screenId = uuidv4();
                    const repairedHtml = await runConsistencyRepairIfNeeded(
                        {
                            ...screen,
                            screenId,
                            html: normalizePlaceholderCatalogInHtml(screen.html),
                        },
                        normalizePlaceholderCatalogInHtml(screen.html),
                        appPromptForPlanning,
                        referenceScreens,
                        imagesToSend
                    );
                    addScreens([{
                        screenId,
                        name: screen.name,
                        html: repairedHtml,
                        width: screen.width,
                        height: screen.height,
                        status: 'complete'
                    }]);
                    generatedIds.push(screenId);

                    const board = {
                        boardId: screenId,
                        screenId,
                        x: startX + index * (effectiveDimensions.width + 100),
                        y: 100,
                        width: screen.width,
                        height: screen.height,
                        deviceFrame: 'none' as const,
                        locked: false,
                        visible: true,
                    };
                    const currentBoards = useCanvasStore.getState().doc.boards;
                    setBoards([...currentBoards, board]);
                }
                applyProjectDesignSystem(activeProjectDesignSystem);

                let postgenSummary = '';
                let postgenData: PlannerPostgenResponse | null = null;
                {
                    try {
                        const postgen = await apiClient.plan(withProjectPlannerContext({
                            phase: 'postgen',
                            appPrompt: appPromptForPlanning,
                            platform: platformToUse,
                            stylePreset: styleToUse,
                            screensGenerated: regen.designSpec.screens.map((screen) => ({ name: screen.name })),
                            referenceImages: plannerReferenceImages,
                            referenceUrls,
                            preferredModel: 'llama-3.3-70b-versatile',
                        }));
                        captureBillingTokens((postgen as any)?.billing);
                        if (postgen.phase === 'postgen') {
                            postgenData = postgen;
                            postgenSummary = formatPostgenSuggestionText(postgen);
                        }
                    } catch (plannerError) {
                        console.warn('[UI] planner post-gen failed (fast model path)', plannerError);
                    }
                }

                const snapshotScreens = useDesignStore.getState().spec?.screens || [];
                const snapshotScreenNames = snapshotScreens.map((screen) => screen.name);
                const snapshotStyleReference = buildContinuationStyleReference(snapshotScreens);
                const content = `${regen.designSpec.description || `Generated ${regen.designSpec.screens.length} screens customized to your request.`}${postgenSummary ? `\n\n${postgenSummary}` : ''}`.trim();

                updateMessage(assistantMsgId, {
                    content,
                    status: 'complete',
                    meta: {
                        ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                        thinkingMs: Date.now() - startTime,
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                        ...{
                            plannerPrompt: appPromptForPlanning,
                            plannerPostgen: postgenData || undefined,
                            plannerContext: {
                                appPrompt: appPromptForPlanning,
                                platform: platformToUse,
                                stylePreset: styleToUse,
                                modelProfile: modelProfileToUse,
                                existingScreenNames: snapshotScreenNames,
                                styleReference: snapshotStyleReference,
                                referenceUrls,
                            } as PlannerSuggestionContext,
                        },
                    }
                });
                updateMessage(userMsgId, {
                    meta: {
                        ...(useChatStore.getState().messages.find((message) => message.id === userMsgId)?.meta || {}),
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                    }
                });
                if (plannerSuggestedProjectName && !firstRequestProjectNameLocked) {
                    applyProjectName(plannerSuggestedProjectName);
                }
                if (generatedIds.length > 0) {
                    setFocusNodeIds(generatedIds);
                }
                void persistProjectAfterAiChange('screen generation');
                notifySuccess(
                    'Generation complete',
                    `Created ${regen.designSpec.screens.length} screen${regen.designSpec.screens.length === 1 ? '' : 's'}.`,
                    tokenUsageTotal > 0 ? tokenUsageTotal : null
                );
                console.info('[UI] generate: complete (fast model)', { screens: regen.designSpec.screens.length });
                return;
            }

            const streamResult = await apiClient.generateStream({
                prompt: generationPromptFromPlanner,
                stylePreset: styleToUse,
                platform: platformToUse,
                images: imagesToSend,
                referenceUrls,
                referenceImageUrls,
                expectedScreenCount: requestedScreenCount,
                preferredModel,
                projectDesignSystem: activeProjectDesignSystem,
                bundleIncludesDesignSystem: shouldBundleDesignSystemWithFirstGeneration,
                projectId: projectId || undefined,
            }, (chunk) => {
                const events = parseStreamChunk(parserState, chunk);
                for (const event of events) {
                    if (event.type === 'description') {
                        finalDescription = event.text;
                        continue;
                    }
                    if (event.type === 'screen_start') {
                        ensureScreen(event.seq, event.name);
                        continue;
                    }
                    if (event.type === 'screen_preview') {
                        const screenId = ensureScreen(event.seq, event.name);
                        updateScreen(screenId, normalizePlaceholderCatalogInHtml(event.html), 'streaming', effectiveDimensions.width, effectiveDimensions.height, event.name);
                        continue;
                    }
                    if (event.type === 'screen_complete') {
                        const screenId = ensureScreen(event.seq, event.name);
                        updateScreen(screenId, normalizePlaceholderCatalogInHtml(event.html), 'complete', effectiveDimensions.width, effectiveDimensions.height, event.name);
                        completedCount += 1;
                    }
                }
            }, controller.signal);
            applyReferenceContextFeedback(userMsgId, referenceUrls, streamResult.referenceContext);
            captureBillingTokens(streamResult.billing);

            const finalizeEvents = finalizeStream(parserState);
            for (const event of finalizeEvents) {
                if (event.type === 'description') {
                    finalDescription = event.text;
                    continue;
                }
                if (event.type === 'screen_incomplete') {
                    const screenId = ensureScreen(event.seq, event.name);
                    let finalHtml = event.html;
                    if (!event.valid) {
                        try {
                            const repaired = await apiClient.completeScreen({
                                screenName: event.name,
                            partialHtml: event.rawPartial,
                            prompt: generationPromptFromPlanner,
                            platform: platformToUse,
                            stylePreset: styleToUse,
                            projectDesignSystem: activeProjectDesignSystem,
                            preferredModel,
                            projectId: projectId || undefined,
                        }, controller.signal);
                            captureBillingTokens(repaired.billing);
                            finalHtml = repaired.html;
                        } catch (repairError) {
                            console.warn('[UI] stream finalize: complete-screen failed, using best effort HTML', repairError);
                        }
                    }
                    updateScreen(screenId, normalizePlaceholderCatalogInHtml(finalHtml), 'complete', effectiveDimensions.width, effectiveDimensions.height, event.name);
                    completedCount += 1;
                }
            }

            if (completedCount === 0) {
                const regen = await apiClient.generate({
                    prompt: generationPromptFromPlanner,
                    stylePreset: styleToUse,
                    platform: platformToUse,
                    images: imagesToSend,
                    referenceUrls,
                    referenceImageUrls,
                    expectedScreenCount: requestedScreenCount,
                    preferredModel,
                    projectDesignSystem: activeProjectDesignSystem,
                    bundleIncludesDesignSystem: shouldBundleDesignSystemWithFirstGeneration,
                    projectId: projectId || undefined,
                }, controller.signal);
                applyReferenceContextFeedback(userMsgId, referenceUrls, regen.referenceContext);
                captureBillingTokens(regen.billing);
                activeProjectDesignSystem = regen.designSpec.designSystem || activeProjectDesignSystem;

                for (let index = 0; index < regen.designSpec.screens.length; index += 1) {
                    const screen = regen.designSpec.screens[index];
                    const seq = createdSeqs[index];
                    const normalizedHtml = normalizePlaceholderCatalogInHtml(screen.html);
                    if (seq !== undefined) {
                        const targetId = screenIdBySeq.get(seq);
                        if (targetId) {
                            const repairedHtml = await runConsistencyRepairIfNeeded(
                                {
                                    ...screen,
                                    screenId: targetId,
                                    html: normalizedHtml,
                                },
                                normalizedHtml,
                                appPromptForPlanning,
                                referenceScreens,
                                imagesToSend
                            );
                            updateScreen(targetId, repairedHtml, 'complete', screen.width, screen.height, screen.name);
                            continue;
                        }
                    }

                    const screenId = uuidv4();
                    const repairedHtml = await runConsistencyRepairIfNeeded(
                        {
                            ...screen,
                            screenId,
                            html: normalizedHtml,
                        },
                        normalizedHtml,
                        appPromptForPlanning,
                        referenceScreens,
                        imagesToSend
                    );
                    addScreens([{
                        screenId,
                        name: screen.name,
                        html: repairedHtml,
                        width: screen.width,
                        height: screen.height,
                        status: 'complete'
                    }]);

                    const board = {
                        boardId: screenId,
                        screenId,
                        x: startX + index * (effectiveDimensions.width + 100),
                        y: 100,
                        width: screen.width,
                        height: screen.height,
                        deviceFrame: 'none' as const,
                        locked: false,
                        visible: true,
                    };
                    const currentBoards = useCanvasStore.getState().doc.boards;
                    setBoards([...currentBoards, board]);
                }
                applyProjectDesignSystem(activeProjectDesignSystem);

                let postgenSummary = '';
                let postgenData: PlannerPostgenResponse | null = null;
                {
                    try {
                        const postgen = await apiClient.plan(withProjectPlannerContext({
                            phase: 'postgen',
                            appPrompt: appPromptForPlanning,
                            platform: platformToUse,
                            stylePreset: styleToUse,
                            screensGenerated: regen.designSpec.screens.map((screen) => ({ name: screen.name })),
                            referenceImages: plannerReferenceImages,
                            referenceUrls,
                            preferredModel: 'llama-3.3-70b-versatile',
                        }));
                        captureBillingTokens((postgen as any)?.billing);
                        if (postgen.phase === 'postgen') {
                            postgenData = postgen;
                            postgenSummary = formatPostgenSuggestionText(postgen);
                        }
                    } catch (plannerError) {
                        console.warn('[UI] planner post-gen failed (fallback json path)', plannerError);
                    }
                }

                const snapshotScreens = useDesignStore.getState().spec?.screens || [];
                const snapshotScreenNames = snapshotScreens.map((screen) => screen.name);
                const snapshotStyleReference = buildContinuationStyleReference(snapshotScreens);
                const content = `${regen.designSpec.description || `Generated ${regen.designSpec.screens.length} screens customized to your request.`}${postgenSummary ? `\n\n${postgenSummary}` : ''}`.trim();

                updateMessage(assistantMsgId, {
                    content,
                    status: 'complete',
                    meta: {
                        ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                        thinkingMs: Date.now() - startTime,
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                        ...{
                            plannerPrompt: appPromptForPlanning,
                            plannerPostgen: postgenData || undefined,
                            plannerContext: {
                                appPrompt: appPromptForPlanning,
                                platform: platformToUse,
                                stylePreset: styleToUse,
                                modelProfile: modelProfileToUse,
                                existingScreenNames: snapshotScreenNames,
                                styleReference: snapshotStyleReference,
                                referenceUrls,
                            } as PlannerSuggestionContext,
                        },
                    }
                });
                updateMessage(userMsgId, {
                    meta: {
                        ...(useChatStore.getState().messages.find((message) => message.id === userMsgId)?.meta || {}),
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                    }
                });
                if (plannerSuggestedProjectName && !firstRequestProjectNameLocked) {
                    applyProjectName(plannerSuggestedProjectName);
                }
                const fallbackIds = regen.designSpec.screens
                    .map((_, index) => screenIdBySeq.get(createdSeqs[index] as number))
                    .filter(Boolean) as string[];
                if (fallbackIds.length > 0) {
                    setFocusNodeIds(fallbackIds);
                }
                void persistProjectAfterAiChange('screen generation');
                notifySuccess(
                    'Generation complete',
                    `Created ${regen.designSpec.screens.length} screen${regen.designSpec.screens.length === 1 ? '' : 's'}.`,
                    tokenUsageTotal > 0 ? tokenUsageTotal : null
                );
                console.info('[UI] generate: complete (fallback json)', { screens: regen.designSpec.screens.length });
                return;
            }

            for (const seq of createdSeqs) {
                const screenId = screenIdBySeq.get(seq);
                if (!screenId) continue;
                const current = useDesignStore.getState().spec?.screens.find(s => s.screenId === screenId);
                if (current && current.status === 'streaming') {
                    updateScreen(screenId, current.html, 'complete', current.width, current.height, current.name);
                }
            }
            for (const seq of createdSeqs) {
                const screenId = screenIdBySeq.get(seq);
                if (!screenId) continue;
                const current = useDesignStore.getState().spec?.screens.find((screen) => screen.screenId === screenId);
                if (!current) continue;
                const repairedHtml = await runConsistencyRepairIfNeeded(
                    current,
                    current.html,
                    appPromptForPlanning,
                    referenceScreens,
                    imagesToSend
                );
                if (repairedHtml !== current.html) {
                    updateScreen(screenId, repairedHtml, 'complete', current.width, current.height, current.name);
                }
            }
            applyProjectDesignSystem(activeProjectDesignSystem);

            let postgenSummary = '';
            let postgenData: PlannerPostgenResponse | null = null;
            {
                try {
                    const postgen = await apiClient.plan(withProjectPlannerContext({
                        phase: 'postgen',
                        appPrompt: appPromptForPlanning,
                        platform: platformToUse,
                        stylePreset: styleToUse,
                        screensGenerated: createdSeqs
                            .map((seq) => screenIdBySeq.get(seq))
                            .filter(Boolean)
                            .map((screenId) => {
                                const screen = useDesignStore.getState().spec?.screens.find((item) => item.screenId === screenId);
                                return screen ? { name: screen.name } : null;
                            })
                            .filter(Boolean) as Array<{ name: string }>,
                        preferredModel: 'llama-3.3-70b-versatile',
                    }));
                    captureBillingTokens((postgen as any)?.billing);
                    if (postgen.phase === 'postgen') {
                        postgenData = postgen;
                        postgenSummary = formatPostgenSuggestionText(postgen);
                    }
                } catch (plannerError) {
                    console.warn('[UI] planner post-gen failed; skipping follow-up suggestions', plannerError);
                }
            }

            const responseSummary = finalDescription || `Generated ${completedCount} screens customized to your request.`;
            const planningSummary = usePlanner && plannerPlan?.generationSuggestion?.why
                ? `\n\n[h3]Plan rationale[/h3]\n[li]${plannerPlan.generationSuggestion.why}[/li]`
                : '';
            const postgenBlock = postgenSummary ? `\n\n${postgenSummary}` : '';
            const snapshotScreens = useDesignStore.getState().spec?.screens || [];
            const snapshotScreenNames = snapshotScreens.map((screen) => screen.name);
            const snapshotStyleReference = buildContinuationStyleReference(snapshotScreens);

            updateMessage(assistantMsgId, {
                content: `${responseSummary}${planningSummary}${postgenBlock}`.trim(),
                status: 'complete',
                meta: {
                    ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                    thinkingMs: Date.now() - startTime,
                    ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                    ...{
                        plannerPrompt: appPromptForPlanning,
                        plannerPostgen: postgenData || undefined,
                        plannerContext: {
                            appPrompt: appPromptForPlanning,
                            platform: platformToUse,
                            stylePreset: styleToUse,
                            modelProfile: modelProfileToUse,
                            existingScreenNames: snapshotScreenNames,
                            styleReference: snapshotStyleReference,
                            referenceUrls,
                        } as PlannerSuggestionContext,
                    },
                }
            });
            updateMessage(userMsgId, {
                meta: {
                    ...(useChatStore.getState().messages.find((message) => message.id === userMsgId)?.meta || {}),
                    ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                }
            });
            if (plannerSuggestedProjectName && !firstRequestProjectNameLocked) {
                applyProjectName(plannerSuggestedProjectName);
            }
            const generatedIds = createdSeqs
                .map((seq) => screenIdBySeq.get(seq))
                .filter(Boolean) as string[];
            if (generatedIds.length > 0) {
                setFocusNodeIds(generatedIds);
            }
            void persistProjectAfterAiChange('screen generation');
            notifySuccess(
                'Generation complete',
                `Created ${completedCount} screen${completedCount === 1 ? '' : 's'}.`,
                tokenUsageTotal > 0 ? tokenUsageTotal : null
            );
            console.info('[UI] generate: complete (stream)', { screens: completedCount });
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                updateMessage(assistantMsgId, {
                    content: 'Generation stopped.',
                    status: 'error',
                    meta: {
                        ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                        thinkingMs: Date.now() - startTime,
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                    }
                });
                updateMessage(userMsgId, {
                    meta: {
                        ...(useChatStore.getState().messages.find((message) => message.id === userMsgId)?.meta || {}),
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                    }
                });
                notifyInfo('Generation stopped', 'The request was cancelled.', tokenUsageTotal > 0 ? tokenUsageTotal : null);
                return;
            }
            updateMessage(assistantMsgId, {
                content: toTaggedErrorMessage(error),
                status: 'error',
                meta: {
                    ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                    thinkingMs: Date.now() - startTime,
                    ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                }
            });
            const friendly = getUserFacingError(error);
            updateMessage(userMsgId, {
                meta: {
                    ...(useChatStore.getState().messages.find((message) => message.id === userMsgId)?.meta || {}),
                    ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                }
            });
            notifyError(friendly.title, friendly.summary, tokenUsageTotal > 0 ? tokenUsageTotal : null);
            console.error('[UI] generate: error', error);
        } finally {
            setAbortController(null);
            setGenerating(false);
            clearLoadingToast(generationLoadingToastRef);
        }
    };

    useEffect(() => {
        const requestId = initialRequest?.id || '';
        const next = (initialRequest?.prompt || '').trim();
        const nextImages = Array.isArray(initialRequest?.images) ? initialRequest.images : [];
        const nextReferenceUrls = Array.isArray(initialRequest?.referenceUrls)
            ? initialRequest.referenceUrls.filter((item) => typeof item === 'string' && item.trim().length > 0)
            : [];
        const nextReferenceImageUrls = Array.isArray(initialRequest?.referenceImageUrls)
            ? initialRequest.referenceImageUrls.filter((item) => typeof item === 'string' && item.trim().length > 0)
            : [];
        const nextPlatform = initialRequest?.platform;
        const nextStylePreset = initialRequest?.stylePreset;
        const nextModelProfile = initialRequest?.modelProfile;
        const nextModelTemperature = initialRequest?.modelTemperature;
        if (!requestId || !next) return;
        if (messages.length > 0 || isGenerating) return;
        if (initialRequestSubmittedRef.current === requestId) return;

        initialRequestSubmittedRef.current = requestId;
        if (nextPlatform) setPlatform(nextPlatform);
        if (nextStylePreset) setStylePreset(nextStylePreset);
        if (nextModelProfile) setModelProfile(nextModelProfile);
        if (Number.isFinite(nextModelTemperature)) {
            const safeTemperature = Math.max(0, Math.min(2, Number(nextModelTemperature)));
            setModelTemperature(safeTemperature);
            apiClient.setComposerTemperature(safeTemperature);
        }
        pinToLatest('auto');
        void handleGenerate(next, nextImages, nextPlatform, nextStylePreset, nextModelProfile, undefined, undefined, undefined, undefined, undefined, undefined, false, undefined, undefined, nextReferenceUrls, nextReferenceImageUrls);
    }, [initialRequest, messages.length, isGenerating]);

    type EditExecutionOptions = {
        assistantMessageId?: string;
        suppressBranchActivation?: boolean;
        suppressLoadingToast?: boolean;
        suppressToasts?: boolean;
        skipFinalMessageUpdate?: boolean;
        skipUserMetaUpdate?: boolean;
    };

    type EditExecutionResult = {
        screenId: string;
        screenName: string;
        ok: boolean;
        description: string;
        errorMessage?: string;
        thinkingMs: number;
        tokenUsageTotal: number;
    };

    const handleEditForScreen = async (
        targetScreen: HtmlScreen,
        instruction: string,
        attachedImages?: string[],
        existingUserMessageId?: string,
        incomingReferenceScreens?: HtmlScreen[],
        options?: EditExecutionOptions,
        incomingReferenceUrls?: string[]
    ): Promise<EditExecutionResult> => {
        setIsAwaitingAssistantDecision(false);
        if (!instruction.trim() || isGenerating) {
            return {
                screenId: targetScreen.screenId,
                screenName: targetScreen.name,
                ok: false,
                description: '',
                errorMessage: 'Edit skipped.',
                thinkingMs: 0,
                tokenUsageTotal: 0,
            };
        }
        const resolvedModelProfile = await maybeSwitchToFastForLowCredits({
            operation: 'edit',
            currentModelProfile: modelProfile,
        });
        if (!resolvedModelProfile) {
            return {
                screenId: targetScreen.screenId,
                screenName: targetScreen.name,
                ok: false,
                description: '',
                errorMessage: 'Edit canceled.',
                thinkingMs: 0,
                tokenUsageTotal: 0,
            };
        }
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            if (!options?.suppressToasts) {
                notifyError('No internet connection', 'Reconnect and try editing again.');
            }
            return {
                screenId: targetScreen.screenId,
                screenName: targetScreen.name,
                ok: false,
                description: '',
                errorMessage: 'No internet connection.',
                thinkingMs: 0,
                tokenUsageTotal: 0,
            };
        }
        void ensureNotificationPermission();

        const screenRef = {
            id: targetScreen.screenId,
            label: targetScreen.name,
            type: targetScreen.width >= 1024 ? 'desktop' : targetScreen.width >= 600 ? 'tablet' : 'mobile'
        } as const;

        const parsedEditReferences = extractComposerInlineReferences(instruction, {
            allowScreen: true,
            screens: availableMentionScreens,
        });
        const currentPrompt = parsedEditReferences.cleanedText.trim();
        const editImages = Array.isArray(attachedImages) ? attachedImages : [];
        const userMsgId = existingUserMessageId || addMessage('user', currentPrompt, editImages.length ? editImages : undefined, screenRef);
        const assistantMsgId = options?.assistantMessageId || addMessage('assistant', 'Updating...', undefined, screenRef);
        const referenceScreens = incomingReferenceScreens || getScreenReferencesFromComposer(parsedEditReferences.screenReferences);
        const referenceUrls = incomingReferenceUrls || parsedEditReferences.urlReferences.map((item) => item.url);
        const referenceMeta = buildScreenReferenceMeta([targetScreen, ...referenceScreens]);
        if (!options?.skipUserMetaUpdate) {
            updateMessage(userMsgId, {
                meta: {
                    ...(useChatStore.getState().messages.find(m => m.id === userMsgId)?.meta || {}),
                    requestKind: 'edit',
                    livePreview: false,
                    ...(referenceUrls.length > 0 ? { referenceUrls } : {}),
                    ...referenceMeta,
                }
            });
        }
        if (!options?.suppressLoadingToast) {
            startLoadingToast(
                editLoadingToastRef,
                'Applying edit',
                'Updating the selected screen...'
            );
        }
        setPrompt((prev) => (prev.trim() === instruction.trim() ? '' : prev));
        setGenerating(true);
        const startTime = Date.now();
        let tokenUsageTotal = 0;
        const captureBillingTokens = (billing: unknown) => {
            const tokens = getBillingTotalTokens(billing);
            if (tokens !== null) tokenUsageTotal += tokens;
            return tokens;
        };
        updateMessage(assistantMsgId, {
            meta: {
                ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                livePreview: true,
                feedbackStart: startTime,
                parentUserId: userMsgId,
                typedComplete: false,
            }
        });
        if (!options?.suppressBranchActivation) {
            setActiveBranchForUser(userMsgId, assistantMsgId);
        }

        try {
            setFocusNodeId(targetScreen.screenId);
            updateScreen(targetScreen.screenId, targetScreen.html, 'streaming', targetScreen.width, targetScreen.height, targetScreen.name);
            const controller = new AbortController();
            setAbortController(controller);
            const localMemory = useProjectMemoryStore.getState().memory
                || deriveProjectMemoryFromState(useDesignStore.getState().spec?.screens || [], useChatStore.getState().messages, useDesignStore.getState().spec?.designSystem);
            const editRequest = {
                instruction: currentPrompt,
                html: targetScreen.html,
                screenId: targetScreen.screenId,
                images: editImages,
                referenceUrls,
                preferredModel: getPreferredTextModel(resolvedModelProfile),
                projectDesignSystem: useDesignStore.getState().spec?.designSystem,
                projectId: projectId || undefined,
                consistencyProfile: {
                    canonicalNavbarLabels: localMemory?.components?.navbar?.labels || [],
                    canonicalNavbarSignature: localMemory?.components?.navbar?.signature || '',
                    rules: ['Keep navbar and shared components consistent with existing project screens.'],
                },
                referenceScreens: referenceScreens.slice(0, 2).map((screen) => ({
                    screenId: screen.screenId,
                    name: screen.name,
                    html: screen.html,
                })),
            };
            const preferredEditModel = String(editRequest.preferredModel || '').toLowerCase();
            const shouldUseStreamingEdit = preferredEditModel.startsWith('gemini-');

            let editedHtml = '';
            let responseDescription = '';

            if (shouldUseStreamingEdit) {
                const parserState = createEditStreamParserState();
                const streamResponse = await apiClient.editStream(editRequest, (chunk) => {
                    const previewHtml = parseEditStreamChunk(parserState, chunk);
                    if (!previewHtml) return;
                    const normalizedPreview = normalizePlaceholderCatalogInHtml(previewHtml);
                    updateScreen(targetScreen.screenId, normalizedPreview, 'streaming', targetScreen.width, targetScreen.height, targetScreen.name);
                    if (isEditMode && editScreenId === targetScreen.screenId) {
                        setActiveScreen(targetScreen.screenId, normalizedPreview);
                    }
                }, controller.signal);
                applyReferenceContextFeedback(userMsgId, referenceUrls, streamResponse.referenceContext);
                captureBillingTokens(streamResponse.billing);
                const finalized = finalizeEditStream(parserState);
                editedHtml = finalized.html;
            } else {
                const response = await apiClient.edit(editRequest, controller.signal);
                applyReferenceContextFeedback(userMsgId, referenceUrls, response.referenceContext);
                captureBillingTokens(response.billing);
                editedHtml = response.html;
                responseDescription = response.description?.trim() || '';
            }
            if (!editedHtml.trim()) {
                throw new Error('Edit stream returned no HTML.');
            }

            const repairedHtml = await runConsistencyRepairIfNeeded(
                targetScreen,
                editedHtml,
                currentPrompt,
                referenceScreens,
                editImages
            );

            updateScreen(targetScreen.screenId, repairedHtml, 'complete', targetScreen.width, targetScreen.height, targetScreen.name);
            if (isEditMode && editScreenId === targetScreen.screenId) {
                setActiveScreen(targetScreen.screenId, repairedHtml);
            }
            setFocusNodeIds([targetScreen.screenId]);

            let postgenSummary = '';
            let postgenData: PlannerPostgenResponse | null = null;
            if (!options?.skipFinalMessageUpdate) {
                try {
                    const plannerReferenceImages = await buildPlannerVisionInputs(referenceScreens, editImages);
                    const postgen = await apiClient.plan(withProjectPlannerContext({
                        phase: 'postgen',
                        appPrompt: currentPrompt,
                        platform: selectedPlatform,
                        stylePreset,
                        screensGenerated: (useDesignStore.getState().spec?.screens || []).map((screen) => ({ name: screen.name })),
                        referenceImages: plannerReferenceImages,
                        referenceUrls,
                        preferredModel: 'llama-3.3-70b-versatile',
                    }));
                    captureBillingTokens((postgen as any)?.billing);
                    if (postgen.phase === 'postgen') {
                        postgenData = postgen;
                        postgenSummary = formatPostgenSuggestionText(postgen);
                    }
                } catch (plannerError) {
                    console.warn('[UI] planner post-gen failed (edit path)', plannerError);
                }
            }
            const snapshotScreens = useDesignStore.getState().spec?.screens || [];
            const snapshotScreenNames = snapshotScreens.map((screen) => screen.name);
            const snapshotStyleReference = buildContinuationStyleReference(snapshotScreens);
            const baseDescription = responseDescription
                ? responseDescription
                : `Updated ${targetScreen.name} based on your feedback.`;
            const content = `${baseDescription}${postgenSummary ? `\n\n${postgenSummary}` : ''}`.trim();

            if (!options?.skipFinalMessageUpdate) {
                updateMessage(assistantMsgId, {
                    content,
                    status: 'complete',
                    meta: {
                        ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                        thinkingMs: Date.now() - startTime,
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                        ...{
                            plannerPrompt: currentPrompt,
                            plannerPostgen: postgenData || undefined,
                            plannerContext: {
                                appPrompt: currentPrompt,
                                platform: selectedPlatform,
                                stylePreset,
                                modelProfile: resolvedModelProfile,
                                existingScreenNames: snapshotScreenNames,
                                styleReference: snapshotStyleReference,
                                referenceUrls,
                            } as PlannerSuggestionContext,
                        },
                    }
                });
                updateMessage(userMsgId, {
                    meta: {
                        ...(useChatStore.getState().messages.find((message) => message.id === userMsgId)?.meta || {}),
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                    }
                });
            }
            if (!options?.suppressToasts) {
                notifySuccess('Edit complete', `${targetScreen.name} was updated successfully.`, tokenUsageTotal > 0 ? tokenUsageTotal : null);
            }
            void persistProjectAfterAiChange('screen edit');
            return {
                screenId: targetScreen.screenId,
                screenName: targetScreen.name,
                ok: true,
                description: baseDescription,
                thinkingMs: Date.now() - startTime,
                tokenUsageTotal,
            };
        } catch (error) {
            const friendly = getUserFacingError(error);
            updateScreen(targetScreen.screenId, targetScreen.html, 'complete', targetScreen.width, targetScreen.height, targetScreen.name);
            if (!options?.skipFinalMessageUpdate) {
                updateMessage(assistantMsgId, {
                    content: toTaggedErrorMessage(error),
                    status: 'error',
                    meta: {
                        ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                        thinkingMs: Date.now() - startTime,
                        ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                    }
                });
            }
            updateMessage(userMsgId, {
                meta: {
                    ...(useChatStore.getState().messages.find((message) => message.id === userMsgId)?.meta || {}),
                    ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                }
            });
            if (!options?.suppressToasts) {
                notifyError(friendly.title, friendly.summary, tokenUsageTotal > 0 ? tokenUsageTotal : null);
            }
            return {
                screenId: targetScreen.screenId,
                screenName: targetScreen.name,
                ok: false,
                description: '',
                errorMessage: friendly.summary || (error as Error)?.message || 'Unable to update this screen.',
                thinkingMs: Date.now() - startTime,
                tokenUsageTotal,
            };
        } finally {
            setAbortController(null);
            setGenerating(false);
            if (!options?.suppressLoadingToast) {
                clearLoadingToast(editLoadingToastRef);
            }
        }
    };

    const looksLikeDesignSystemPrompt = (value: string): boolean => {
        const text = value.trim().toLowerCase();
        if (!text) return false;
        const mentionsDesign = /(design\s*system|token|palette|color|typography|font|radius|corner|theme|dark mode|light mode)/i.test(text);
        const mentionsChange = /(update|change|adjust|tweak|make|set|switch|revamp|refine|improve|replace)/i.test(text);
        return mentionsDesign && mentionsChange;
    };

    const handlePromptDrivenDesignSystemUpdate = async (params: {
        userMessageId: string;
        requestPrompt: string;
        attachedImages: string[];
        referenceMeta: ReturnType<typeof buildScreenReferenceMeta>;
        referenceUrls: string[];
    }) => {
        setIsAwaitingAssistantDecision(false);
        const { userMessageId, requestPrompt, attachedImages, referenceMeta, referenceUrls } = params;
        const currentSpec = useDesignStore.getState().spec;
        const currentDesignSystem = currentSpec?.designSystem;
        if (!currentDesignSystem) return false;
        const resolvedModelProfile = await maybeSwitchToFastForLowCredits({
            operation: 'design_system',
            currentModelProfile: modelProfile,
        });
        if (!resolvedModelProfile) return true;

        const assistantMsgId = addMessage('assistant', 'Updating your design system from this prompt...');
        updateMessage(userMessageId, {
            meta: {
                ...(useChatStore.getState().messages.find((message) => message.id === userMessageId)?.meta || {}),
                requestKind: 'design_system',
                ...(referenceUrls.length > 0 ? { referenceUrls } : {}),
                ...(referenceMeta.screenIds.length > 0 ? referenceMeta : {}),
            },
        });
        updateMessage(assistantMsgId, {
            status: 'streaming',
            meta: {
                ...(useChatStore.getState().messages.find((message) => message.id === assistantMsgId)?.meta || {}),
                parentUserId: userMessageId,
                livePreview: true,
                typedComplete: false,
            },
        });
        setActiveBranchForUser(userMessageId, assistantMsgId);

        const controller = new AbortController();
        setAbortController(controller);
        setGenerating(true);
        let tokenUsageTotal = 0;
        const captureBillingTokens = (billing: unknown) => {
            const tokens = getBillingTotalTokens(billing);
            if (tokens !== null) tokenUsageTotal += tokens;
            return tokens;
        };
        startLoadingToast(
            generationLoadingToastRef,
            'Updating design system',
            'Applying token and style updates...'
        );
        try {
            const response = await apiClient.generateDesignSystem({
                prompt: requestPrompt,
                stylePreset,
                platform: selectedPlatform,
                images: attachedImages,
                referenceUrls,
                projectId: projectId || undefined,
                projectDesignSystem: currentDesignSystem,
                preferredModel: resolvedModelProfile === 'fast' ? 'llama-3.1-8b-instant' : undefined,
            }, controller.signal);
            applyReferenceContextFeedback(userMessageId, referenceUrls, response.referenceContext);
            captureBillingTokens(response.billing);
            const normalizedDraft = normalizeProjectDesignSystemModes(response.designSystem);
            const previousDesignSystem = normalizeProjectDesignSystemModes(currentDesignSystem);
            const tokenPatches = buildDesignTokenColorPatches(previousDesignSystem, normalizedDraft);
            const typographyChanged =
                !areFontStacksEquivalent(previousDesignSystem.typography.displayFont, normalizedDraft.typography.displayFont)
                || !areFontStacksEquivalent(previousDesignSystem.typography.bodyFont, normalizedDraft.typography.bodyFont);
            const radiusChanged =
                !areRadiusValuesEquivalent(previousDesignSystem.radius.card, normalizedDraft.radius.card)
                || !areRadiusValuesEquivalent(previousDesignSystem.radius.control, normalizedDraft.radius.control)
                || !areRadiusValuesEquivalent(previousDesignSystem.radius.pill, normalizedDraft.radius.pill);

            let patchedScreenCount = 0;
            const patchedScreens = (currentSpec?.screens || []).map((screen) => {
                let nextHtml = screen.html;
                let screenChanged = false;

                const colorResult = applyDesignTokenColorPatchesToHtml(nextHtml, tokenPatches);
                nextHtml = colorResult.html;
                screenChanged = screenChanged || colorResult.changed;

                if (typographyChanged) {
                    const typographyResult = applyTypographyToScreenHtml(
                        nextHtml,
                        normalizedDraft.typography.displayFont,
                        normalizedDraft.typography.bodyFont
                    );
                    nextHtml = typographyResult.html;
                    screenChanged = screenChanged || typographyResult.changed;
                }

                if (radiusChanged) {
                    const radiusResult = applyRadiusToScreenHtml(nextHtml, normalizedDraft.radius);
                    nextHtml = radiusResult.html;
                    screenChanged = screenChanged || radiusResult.changed;
                }

                const themeRepairResult = applyThemeVariantClassRepairsToHtml(nextHtml, normalizedDraft);
                nextHtml = themeRepairResult.html;
                screenChanged = screenChanged || themeRepairResult.changed;

                if (!screenChanged) return screen;
                patchedScreenCount += 1;
                return { ...screen, html: nextHtml };
            });

            if (currentSpec) {
                useDesignStore.getState().setSpec({
                    ...currentSpec,
                    designSystem: normalizedDraft,
                    screens: patchedScreens,
                    updatedAt: new Date().toISOString(),
                });
            } else {
                applyProjectDesignSystem(normalizedDraft);
            }
            setDesignSystemDraft(cloneDesignSystem(normalizedDraft));

            const summary = patchedScreenCount > 0
                ? `Design system updated and synced to ${patchedScreenCount} existing screen${patchedScreenCount === 1 ? '' : 's'}.`
                : 'Design system updated. Future generations will use the new tokens.';
            updateMessage(assistantMsgId, {
                content: `[h2]Design system updated[/h2]\n[p]${summary}[/p]`,
                status: 'complete',
                meta: {
                    ...(useChatStore.getState().messages.find((message) => message.id === assistantMsgId)?.meta || {}),
                    ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                    typedComplete: true,
                    livePreview: false,
                },
            });
            updateMessage(userMessageId, {
                meta: {
                    ...(useChatStore.getState().messages.find((message) => message.id === userMessageId)?.meta || {}),
                    ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                }
            });
            notifySuccess('Design system updated', summary, tokenUsageTotal > 0 ? tokenUsageTotal : null);
            return true;
        } catch (error) {
            const friendly = getUserFacingError(error);
            updateMessage(assistantMsgId, {
                content: `[h2]${friendly.title}[/h2]\n[p]${friendly.summary}[/p]`,
                status: 'error',
                meta: {
                    ...(useChatStore.getState().messages.find((message) => message.id === assistantMsgId)?.meta || {}),
                    ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                },
            });
            updateMessage(userMessageId, {
                meta: {
                    ...(useChatStore.getState().messages.find((message) => message.id === userMessageId)?.meta || {}),
                    ...(tokenUsageTotal > 0 ? { tokenUsageTotal } : {}),
                }
            });
            notifyError(friendly.title, friendly.summary, tokenUsageTotal > 0 ? tokenUsageTotal : null);
            return true;
        } finally {
            clearLoadingToast(generationLoadingToastRef);
            setAbortController(null);
            setGenerating(false);
        }
    };

    const handleRoutedGenerateOrEdit = async (
        existingUserMessageId?: string,
        overridePrompt?: string,
        overrideImages?: string[],
        incomingReferenceScreens?: HtmlScreen[],
        incomingReferenceUrls?: string[]
    ) => {
        const resolvedComposerReferences = resolveInlineComposerReferences(overridePrompt ?? prompt);
        const requestPrompt = resolvedComposerReferences.prompt;
        if (!requestPrompt || isGenerating || isAwaitingAssistantDecision) return;
        setIsAwaitingAssistantDecision(true);
        pinToLatest('smooth');
        const attachedImages = overrideImages ? [...overrideImages] : [...images];
        const referenceScreens = incomingReferenceScreens || resolvedComposerReferences.referenceScreens;
        const referenceUrls = incomingReferenceUrls || resolvedComposerReferences.referenceUrls;
        const routeReferenceScreens = pickRouteReferenceScreens(
            requestPrompt,
            useDesignStore.getState().spec?.screens || [],
            referenceScreens
        );
        const generationReferenceScreens = mergeReferenceScreens(referenceScreens, routeReferenceScreens, 2);
        const routedReferencePreviewMode = referenceScreens.length > 0
            ? 'screen'
            : generationReferenceScreens.length > 0
                ? 'palette'
                : undefined;
        const routingPrompt = referenceScreens.length > 0
            ? `${requestPrompt}\n\n${buildReferencedScreensPromptContext(referenceScreens)}`
            : requestPrompt;
        const referenceMeta = buildScreenReferenceMeta(referenceScreens);
        const userMsgId = existingUserMessageId || addMessage('user', requestPrompt, attachedImages.length ? attachedImages : undefined);
        updateMessage(userMsgId, {
            meta: {
                ...(useChatStore.getState().messages.find((message) => message.id === userMsgId)?.meta || {}),
                requestKind: 'route',
                ...(routedReferencePreviewMode ? { referencePreviewMode: routedReferencePreviewMode } : {}),
                ...(referenceUrls.length > 0 ? { referenceUrls } : {}),
                ...(referenceMeta.screenIds.length > 0 ? referenceMeta : {}),
            },
        });
        if (!existingUserMessageId) {
            closeMentionMenu();
            setPrompt('');
            if (attachedImages.length > 0) {
                setImages([]);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }

        if (looksLikeDesignSystemPrompt(requestPrompt)) {
            const handledAsDesignSystem = await handlePromptDrivenDesignSystemUpdate({
                userMessageId: userMsgId,
                requestPrompt,
                attachedImages,
                referenceMeta,
                referenceUrls,
            });
            if (handledAsDesignSystem) return;
        }

        const executeFallbackRoute = async () => {
            const editLike = /(edit|update|rework|revise|refine|fix|adjust|change|regenerate|polish)/i.test(requestPrompt);
            const fallbackTarget = generationReferenceScreens[0] || null;
            if (editLike && fallbackTarget) {
                await handleEditForScreen(fallbackTarget, requestPrompt, attachedImages, userMsgId, generationReferenceScreens, undefined, referenceUrls);
                return;
            }
            await handleGenerate(
                requestPrompt,
                attachedImages,
                selectedPlatform,
                stylePreset,
                modelProfile,
                undefined,
                requestPrompt,
                undefined,
                undefined,
                userMsgId,
                generationReferenceScreens,
                false,
                undefined,
                routedReferencePreviewMode,
                referenceUrls
            );
        };

        try {
            const plannerReferenceImages = await buildPlannerVisionInputs(referenceScreens, attachedImages);
            const routeResponse = await apiClient.plan(withProjectPlannerContext({
                phase: 'route',
                appPrompt: routingPrompt,
                platform: selectedPlatform,
                stylePreset,
                screensGenerated: (useDesignStore.getState().spec?.screens || []).map((screen) => ({ name: screen.name })),
                referenceImages: plannerReferenceImages,
                referenceUrls,
                preferredModel: modelProfile === 'fast' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile',
            }, routeReferenceScreens));
            if (routeResponse.phase !== 'route') {
                throw new Error('Planner route phase mismatch');
            }
            const route = routeResponse;
            const routeTokenUsage = getBillingTotalTokens((route as any)?.billing);

            updateMessage(userMsgId, {
                meta: {
                    ...(useChatStore.getState().messages.find((message) => message.id === userMsgId)?.meta || {}),
                    requestKind: route.intent === 'chat_assist'
                        ? 'assist'
                        : route.intent === 'edit_existing_screen'
                            ? 'edit'
                            : 'generate',
                    plannerRoute: route,
                    ...(routedReferencePreviewMode ? { referencePreviewMode: routedReferencePreviewMode } : {}),
                    ...(routeTokenUsage !== null ? { tokenUsageTotal: routeTokenUsage } : {}),
                    ...(referenceUrls.length > 0 ? { referenceUrls } : {}),
                    ...(referenceMeta.screenIds.length > 0 ? referenceMeta : {}),
                },
            });

            if (route.intent === 'chat_assist' || route.action === 'assist') {
                const snapshotScreens = useDesignStore.getState().spec?.screens || [];
                const snapshotScreenNames = snapshotScreens.map((screen) => screen.name);
                const snapshotStyleReference = buildContinuationStyleReference(snapshotScreens);
                const routeSuggestions = buildRouteChatSuggestionPayload(route);
                setIsAwaitingAssistantDecision(false);
                const assistantMsgId = addMessage('assistant', route.assistantResponse || 'Here is a direct response based on your request.');
                updateMessage(assistantMsgId, {
                    status: 'complete',
                    meta: {
                        ...(useChatStore.getState().messages.find((message) => message.id === assistantMsgId)?.meta || {}),
                        parentUserId: userMsgId,
                        typedComplete: true,
                        plannerRoute: route,
                        plannerPostgen: routeSuggestions,
                        plannerPrompt: requestPrompt,
                        plannerContext: {
                            appPrompt: requestPrompt,
                            platform: selectedPlatform,
                            stylePreset,
                            modelProfile,
                            existingScreenNames: snapshotScreenNames,
                            styleReference: snapshotStyleReference,
                            referenceUrls,
                        } as PlannerSuggestionContext,
                        ...(routeTokenUsage !== null ? { tokenUsageTotal: routeTokenUsage } : {}),
                    },
                });
                setActiveBranchForUser(userMsgId, assistantMsgId);
                return;
            }

            if (route.intent === 'edit_existing_screen' || route.action === 'edit') {
                const allScreens = useDesignStore.getState().spec?.screens || [];
                const targets = resolveRoutedScreens(route, allScreens, generationReferenceScreens);
                if (targets.length === 0) {
                    setIsAwaitingAssistantDecision(false);
                    const assistantMsgId = addMessage(
                        'assistant',
                        `[h2]Need target screen[/h2]\n[p]I interpreted this as an edit request, but I could not map it to an existing screen. Mention the exact screen name (for example: [b]Profile[/b]) or use @screen reference.</p>`
                    );
                    updateMessage(assistantMsgId, {
                        status: 'complete',
                        meta: {
                            ...(useChatStore.getState().messages.find((message) => message.id === assistantMsgId)?.meta || {}),
                            parentUserId: userMsgId,
                            plannerRoute: route,
                        },
                    });
                    setActiveBranchForUser(userMsgId, assistantMsgId);
                    return;
                }
                if (targets.length > 1) {
                    setIsAwaitingAssistantDecision(false);
                    const names = targets.map((screen) => screen.name).join(', ');
                    const combinedReferenceMeta = buildScreenReferenceMeta([
                        ...targets,
                        ...generationReferenceScreens,
                    ]);
                    updateMessage(userMsgId, {
                        meta: {
                            ...(useChatStore.getState().messages.find((message) => message.id === userMsgId)?.meta || {}),
                            requestKind: 'edit',
                            referencePreviewMode: 'screen',
                            ...combinedReferenceMeta,
                        },
                    });
                    const assistantMsgId = addMessage(
                        'assistant',
                        `[h2]Applying multi-screen edit[/h2]\n[p]Updating [b]${targets.length}[/b] screens: ${names}.</p>`
                    );
                    const batchStart = Date.now();
                    updateMessage(assistantMsgId, {
                        status: 'streaming',
                        meta: {
                            ...(useChatStore.getState().messages.find((message) => message.id === assistantMsgId)?.meta || {}),
                            parentUserId: userMsgId,
                            plannerRoute: route,
                            ...combinedReferenceMeta,
                            feedbackStart: batchStart,
                            typedComplete: false,
                            livePreview: true,
                        },
                    });
                    setActiveBranchForUser(userMsgId, assistantMsgId);

                    const results: EditExecutionResult[] = [];
                    startLoadingToast(
                        editLoadingToastRef,
                        'Applying multi-screen edit',
                        `Updating ${targets.length} screens...`
                    );
                    try {
                        for (const [index, target] of targets.entries()) {
                            updateMessage(assistantMsgId, {
                                content: `[h2]Applying multi-screen edit[/h2]\n[p]Updating [b]${index + 1}/${targets.length}[/b]: ${target.name}</p>`,
                                status: 'streaming',
                                meta: {
                                    ...(useChatStore.getState().messages.find((message) => message.id === assistantMsgId)?.meta || {}),
                                    progressLabel: `Updating ${target.name}`,
                                },
                            });
                            const perTargetReferences = mergeReferenceScreens(
                                generationReferenceScreens.filter((screen) => screen.screenId !== target.screenId),
                                targets.filter((screen) => screen.screenId !== target.screenId),
                                2
                            );
                            const result = await handleEditForScreen(
                                target,
                                route.editInstruction || requestPrompt,
                                attachedImages,
                                userMsgId,
                                perTargetReferences,
                                {
                                    assistantMessageId: assistantMsgId,
                                    suppressBranchActivation: true,
                                    suppressLoadingToast: true,
                                    suppressToasts: true,
                                    skipFinalMessageUpdate: true,
                                    skipUserMetaUpdate: true,
                                },
                                referenceUrls
                            );
                            results.push(result);
                        }
                    } finally {
                        clearLoadingToast(editLoadingToastRef);
                    }

                    const succeeded = results.filter((item) => item.ok);
                    const failed = results.filter((item) => !item.ok);
                    const totalTokenUsage = results.reduce((sum, item) => sum + (Number.isFinite(item.tokenUsageTotal) ? item.tokenUsageTotal : 0), 0);
                    const successLines = succeeded
                        .map((item) => `[li][b]${item.screenName}[/b]: ${item.description || 'Updated successfully.'}[/li]`)
                        .join('\n');
                    const failureLines = failed
                        .map((item) => `[li][b]${item.screenName}[/b]: ${item.errorMessage || 'Failed to update.'}[/li]`)
                        .join('\n');
                    const finalContent = [
                        '[h2]Multi-screen edit complete[/h2]',
                        `[p]Updated [b]${succeeded.length}[/b] of [b]${targets.length}[/b] screens in one pass.[/p]`,
                        `[h3]Changes[/h3]\n${successLines || '[li]No screens were updated.[/li]'}`,
                        failed.length > 0 ? `[h3]Needs attention[/h3]\n${failureLines}` : '',
                    ].filter(Boolean).join('\n\n');

                    updateMessage(assistantMsgId, {
                        content: finalContent,
                        status: failed.length === targets.length ? 'error' : 'complete',
                        meta: {
                            ...(useChatStore.getState().messages.find((message) => message.id === assistantMsgId)?.meta || {}),
                            ...combinedReferenceMeta,
                            thinkingMs: Date.now() - batchStart,
                            ...(totalTokenUsage > 0 ? { tokenUsageTotal: totalTokenUsage } : {}),
                            typedComplete: true,
                            livePreview: false,
                        },
                    });
                    if (succeeded.length > 0) {
                        notifySuccess(
                            'Multi-screen edit complete',
                            `Updated ${succeeded.length} screen${succeeded.length === 1 ? '' : 's'}.`,
                            totalTokenUsage > 0 ? totalTokenUsage : null
                        );
                    }
                    if (failed.length > 0) {
                        notifyError(
                            'Some edits failed',
                            `Could not update ${failed.length} screen${failed.length === 1 ? '' : 's'}.`,
                            totalTokenUsage > 0 ? totalTokenUsage : null
                        );
                    }
                    return;
                }
                for (const target of targets) {
                    updateMessage(userMsgId, {
                        meta: {
                            ...(useChatStore.getState().messages.find((message) => message.id === userMsgId)?.meta || {}),
                            requestKind: 'edit',
                            referencePreviewMode: 'screen',
                        },
                    });
                    const perTargetReferences = mergeReferenceScreens(
                        generationReferenceScreens.filter((screen) => screen.screenId !== target.screenId),
                        targets.filter((screen) => screen.screenId !== target.screenId),
                        2
                    );
                    await handleEditForScreen(
                        target,
                        route.editInstruction || requestPrompt,
                        attachedImages,
                        userMsgId,
                        perTargetReferences,
                        undefined,
                        referenceUrls
                    );
                }
                return;
            }

            const targetedScreens = route.intent === 'add_screen'
                ? route.generateTheseNow.filter(Boolean).slice(0, 3)
                : undefined;
            await handleGenerate(
                requestPrompt,
                attachedImages,
                selectedPlatform,
                stylePreset,
                modelProfile,
                targetedScreens && targetedScreens.length > 0 ? targetedScreens : undefined,
                route.appContextPrompt || requestPrompt,
                undefined,
                undefined,
                userMsgId,
                generationReferenceScreens,
                false,
                undefined,
                routedReferencePreviewMode,
                referenceUrls
            );
        } catch (routeError) {
            console.warn('[UI] route planner failed; using deterministic fallback', routeError);
            await executeFallbackRoute();
        } finally {
            setIsAwaitingAssistantDecision(false);
        }
    };

    const handleSubmit = () => {
        apiClient.setComposerTemperature(modelTemperature);
        pinToLatest('smooth');
        if (planMode) {
            void handlePlanOnly();
        } else {
            void handleRoutedGenerateOrEdit();
        }
    };

    const handleRetryUserMessage = async (userMessageId: string) => {
        if (isGenerating || isAwaitingAssistantDecision) return;
        pinToLatest('smooth');
        const source = messages.find((message) => message.id === userMessageId && message.role === 'user');
        if (!source) return;

        const requestKind = String((source.meta as any)?.requestKind || 'generate');
        const retryPrompt = source.content || '';
        const retryImages = Array.isArray(source.images) ? source.images : [];
        const retryScreenIds = Array.isArray((source.meta as any)?.screenIds)
            ? (((source.meta as any)?.screenIds as string[]).filter(Boolean))
            : [];
        if (source.screenRef?.id && !retryScreenIds.includes(source.screenRef.id)) {
            retryScreenIds.push(source.screenRef.id);
        }
        const retryReferences = getScreenReferencesFromComposer(retryScreenIds.map((screenId) => ({ screenId, name: '' })));
        const retryReferenceUrls = Array.isArray((source.meta as any)?.referenceUrls)
            ? (((source.meta as any)?.referenceUrls as string[]).filter((item) => typeof item === 'string' && item.trim().length > 0))
            : [];

        if (requestKind === 'plan') {
            await handlePlanOnly(userMessageId, retryPrompt, retryImages, retryReferences, retryReferenceUrls);
            return;
        }

        await handleRoutedGenerateOrEdit(
            userMessageId,
            retryPrompt,
            retryImages,
            retryReferences,
            retryReferenceUrls
        );
    };

    const cycleAssistantBranch = (userMessageId: string, direction: 'prev' | 'next') => {
        const branches = assistantBranchesByUser[userMessageId] || [];
        if (branches.length < 2) return;
        const activeId = activeAssistantByUser[userMessageId] || branches[branches.length - 1];
        const currentIndex = Math.max(0, branches.indexOf(activeId));
        const nextIndex = direction === 'prev'
            ? (currentIndex - 1 + branches.length) % branches.length
            : (currentIndex + 1) % branches.length;
        setActiveBranchForUser(userMessageId, branches[nextIndex]);
    };

    const handleStop = () => {
        abortGeneration();
        setAbortController(null);
        clearLoadingToast(generationLoadingToastRef);
        clearLoadingToast(editLoadingToastRef);

        const currentSpec = useDesignStore.getState().spec;
        const currentBoards = useCanvasStore.getState().doc.boards;

        if (currentSpec) {
            const incompleteIds = currentSpec.screens
                .filter(s => s.status === 'streaming')
                .map(s => s.screenId);

            incompleteIds.forEach(id => {
                updateScreen(id, '', 'complete');
                removeScreen(id);
                removeBoard(id);
            });

            if (incompleteIds.length > 0) {
                const filteredBoards = currentBoards.filter(b => !incompleteIds.includes(b.screenId));
                setBoards(filteredBoards);
            }
        }

        updateMessage(assistantMsgIdRef.current, {
            content: 'Generation cancelled.',
            status: 'error',
        });
        notifyInfo('Generation cancelled', 'Stopped and removed incomplete screens.');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isMentionOpen) {
            if (referenceMenuMode === 'root' && rootReferenceOptions.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setMentionActiveIndex((prev) => (prev + 1) % rootReferenceOptions.length);
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setMentionActiveIndex((prev) => (prev - 1 + rootReferenceOptions.length) % rootReferenceOptions.length);
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeMentionMenu();
                    return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const choice = rootReferenceOptions[mentionActiveIndex] || rootReferenceOptions[0];
                    if (choice?.key === 'url') openUrlReferenceInput();
                    if (choice?.key === 'screen') openScreenReferenceInput();
                    return;
                }
            }
            if (referenceMenuMode === 'screen' && filteredMentionScreens.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setMentionActiveIndex((prev) => (prev + 1) % filteredMentionScreens.length);
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setMentionActiveIndex((prev) => (prev - 1 + filteredMentionScreens.length) % filteredMentionScreens.length);
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeMentionMenu();
                    return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const choice = filteredMentionScreens[mentionActiveIndex] || filteredMentionScreens[0];
                    if (choice) {
                        selectMentionScreen(choice);
                    }
                    return;
                }
            }
            if (referenceMenuMode === 'url' && e.key === 'Escape') {
                e.preventDefault();
                closeMentionMenu();
                return;
            }
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handlePromptChange = (nextValue: string, cursor: number) => {
        setPrompt(nextValue);
        syncMentionState(nextValue, cursor);
    };

    const requestInFlight = isGenerating || isAwaitingAssistantDecision;
    const hasPromptText = prompt.trim().length > 0;
    const showSendAction = hasPromptText;
    const actionIsStop = isGenerating || isRecording;
    const actionDisabled = isAwaitingAssistantDecision || (!showSendAction && !requestInFlight && isTranscribing);
    const composerOrbActivity: OrbActivityState = requestInFlight
        ? 'thinking'
        : (showSendAction || isRecording || isTranscribing)
            ? 'talking'
            : 'idle';
    const { agentState: composerOrbState, colors: composerOrbColors } = useOrbVisuals(composerOrbActivity);
    const composerOrbInput = isRecording ? 0.92 : isTranscribing ? 0.48 : 0.18;
    const composerOrbOutput = requestInFlight ? 0.88 : (showSendAction || isRecording || isTranscribing) ? 0.44 : 0.2;
    const StyleIcon = stylePreset === 'minimal'
        ? LineSquiggle
        : stylePreset === 'vibrant'
            ? Palette
            : stylePreset === 'luxury'
                ? Gem
                : stylePreset === 'playful'
                    ? Smile
                    : CircleStar;
    const styleButtonTone = 'bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-surface-4))] text-[var(--ui-primary)] ring-[color:color-mix(in_srgb,var(--ui-primary)_34%,var(--ui-border))] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_22%,var(--ui-surface-4))]';
    const hiddenMessageCount = Math.max(0, messages.length - visibleMessages.length);
    const designSystem = spec?.designSystem;
    const normalizedStoredDesignSystem = designSystem ? normalizeProjectDesignSystemModes(designSystem) : null;
    const normalizedDesignSystemDraft = designSystemDraft ? normalizeProjectDesignSystemModes(designSystemDraft) : null;
    const hasDesignSystem = Boolean(designSystem);
    const isDesignSystemView = chatPanelView === 'design-system';
    const designSystemForPanel = (isDesignSystemEditing && normalizedDesignSystemDraft)
        ? normalizedDesignSystemDraft
        : normalizedStoredDesignSystem;
    const isDesignSystemEditable = isDesignSystemView && Boolean(designSystemForPanel);
    const hasDesignSystemDraftChanges = Boolean(
        normalizedStoredDesignSystem
        && normalizedDesignSystemDraft
        && JSON.stringify(normalizedDesignSystemDraft) !== JSON.stringify(normalizedStoredDesignSystem)
    );
    const designTokenEntries = designSystemForPanel
        ? (Object.entries(designSystemForPanel.tokens) as Array<[DesignTokenKey, string]>)
        : [];
    const selectedDesignTokenEntry = designTokenEntries.find(([tokenName]) => tokenName === activeTokenEditor)
        || null;
    const selectedDesignTokenName = selectedDesignTokenEntry?.[0] || null;
    const handleDesignColorPlaneDrag = useCallback((
        event: ReactPointerEvent<HTMLDivElement>,
        tokenName: DesignTokenKey,
        hue: number
    ) => {
        event.preventDefault();
        const target = event.currentTarget;
        const updateFromPoint = (clientX: number, clientY: number) => {
            const rect = target.getBoundingClientRect();
            const saturation = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
            const value = clamp(1 - ((clientY - rect.top) / Math.max(rect.height, 1)), 0, 1);
            updateDesignSystemTokenDraft(tokenName, hsvToPickerHex(hue, saturation, value));
        };

        updateFromPoint(event.clientX, event.clientY);
        const handleMove = (pointerEvent: PointerEvent) => updateFromPoint(pointerEvent.clientX, pointerEvent.clientY);
        const handleEnd = () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleEnd);
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleEnd);
    }, [updateDesignSystemTokenDraft]);
    const handleDesignHueDrag = useCallback((
        event: ReactPointerEvent<HTMLDivElement>,
        tokenName: DesignTokenKey,
        saturation: number,
        value: number
    ) => {
        event.preventDefault();
        const target = event.currentTarget;
        const updateFromPoint = (clientX: number) => {
            const rect = target.getBoundingClientRect();
            const ratio = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
            updateDesignSystemTokenDraft(tokenName, hsvToPickerHex(ratio * 360, saturation, value));
        };

        updateFromPoint(event.clientX);
        const handleMove = (pointerEvent: PointerEvent) => updateFromPoint(pointerEvent.clientX);
        const handleEnd = () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleEnd);
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleEnd);
    }, [updateDesignSystemTokenDraft]);
    const chatPanelTabs = [
        { key: 'chat' as const, label: 'Chat', icon: Sparkles, disabled: false },
        { key: 'design-system' as const, label: 'Design System', icon: Palette, disabled: !hasDesignSystem },
        { key: 'assets' as const, label: 'Assets', icon: Copy, disabled: false },
    ];

    return (
        <>
            <div
                className={`group relative flex h-full shrink-0 flex-col overflow-visible bg-transparent font-sans text-[var(--ui-text)] transition-all duration-300 ease-in-out ${isCollapsed ? 'w-0' : 'w-[var(--chat-width)]'
                    }`}
            >
                {!isEditMode && isCollapsed && (
                    <button
                        type="button"
                        onClick={() => setIsCollapsed(false)}
                        className="fixed left-4 top-4 z-[90] inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-4)] text-[var(--ui-text-muted)] shadow-xl transition-colors hover:text-[var(--ui-text)]"
                        title="Expand Sidebar"
                    >
                        <PanelLeftOpen size={18} />
                    </button>
                )}
                {/* Collapse Button Header */}
                {!isEditMode && !isCollapsed && (
                    <div className="absolute top-4 -right-12 z-20">
                        <button
                            onClick={() => setIsCollapsed(true)}
                            className="rounded-lg bg-[var(--ui-surface-4)] p-2 text-[var(--ui-text-muted)] shadow-xl transition-all hover:text-[var(--ui-text)] opacity-0 group-hover:opacity-100"
                            title="Collapse Sidebar"
                        >
                            <PanelLeftClose size={18} />
                        </button>
                    </div>
                )}

                <div className={`relative flex flex-col h-full w-[var(--chat-width)] overflow-hidden transition-opacity duration-200 ${isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    {/* Header / Date */}
                    <div className="sticky top-0 z-10 bg-transparent px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="leading-tight group/title">
                                <div className="inline-flex items-center gap-2">
                                    <img src={appLogo} alt="EazyUI logo" className="h-4 w-4 object-contain" />
                                    {isTitleEditing ? (
                                        <input
                                            autoFocus
                                            value={titleDraft}
                                            onChange={(event) => setTitleDraft(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    void commitProjectTitle();
                                                }
                                                if (event.key === 'Escape') {
                                                    setIsTitleEditing(false);
                                                    setTitleDraft(spec?.name?.trim() || '');
                                                }
                                            }}
                                            onBlur={() => void commitProjectTitle()}
                                            className="h-7 min-w-[170px] rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2 text-[13px] font-semibold tracking-wide text-[var(--ui-text)] outline-none"
                                            placeholder="Project name"
                                            disabled={isTitleSaving}
                                        />
                                    ) : (
                                        <>
                                            <p className="text-[12px] font-semibold text-[var(--ui-text)] tracking-wide">{spec?.name?.trim() || 'Chat'}</p>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setTitleDraft(spec?.name?.trim() || '');
                                                    setIsTitleEditing(true);
                                                }}
                                                className="p-1 rounded-md text-[var(--ui-text-subtle)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)] opacity-0 group-hover/title:opacity-100 transition-opacity"
                                                title="Edit project name"
                                            >
                                                <Pencil size={12} />
                                            </button>
                                        </>
                                    )}
                                </div>
                                <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">
                                    {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </p>
                            </div>
                            {!isEditMode && (
                                <button
                                    onClick={() => setIsCollapsed(true)}
                                    className="rounded-lg p-2 text-[var(--ui-text-subtle)] transition-colors hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text-muted)]"
                                    title="Collapse Sidebar"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                            )}
                        </div>
                        <div className="mt-2">
                            <div className="inline-flex w-full items-center gap-0.5 rounded-[14px] border border-[var(--ui-border)] bg-[color:color-mix(in_srgb,var(--ui-surface-2)_94%,transparent)] p-[3px]">
                                {chatPanelTabs.map((tab) => {
                                    const Icon = tab.icon;
                                    const active = chatPanelView === tab.key;
                                    return (
                                        <button
                                            key={tab.key}
                                            type="button"
                                            onClick={() => setChatPanelView(tab.key)}
                                            disabled={tab.disabled}
                                            className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[11px] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${active
                                                ? 'bg-[var(--ui-surface-1)] text-[var(--ui-text)]'
                                                : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]'
                                                } ${tab.disabled ? 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-[var(--ui-text-muted)]' : ''}`}
                                            title={tab.disabled ? 'Generate a screen first to create a design system' : undefined}
                                        >
                                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-[7px] ${active ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,transparent)] text-[var(--ui-primary)]' : 'bg-[var(--ui-surface-2)] text-[var(--ui-text-subtle)]'}`}>
                                                <Icon size={12} />
                                            </span>
                                            <span className="truncate">{tab.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Messages / Design System */}
                    {chatPanelView === 'chat' ? (
                    <div
                        ref={messagesContainerRef}
                        className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-7 scrollbar-hide"
                    >
                        {hiddenMessageCount > 0 && (
                            <div className="flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => setRenderedMessageCount(messages.length)}
                                    className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] ring-1 ring-[var(--ui-border)] hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text)]"
                                >
                                    Load {hiddenMessageCount} older message{hiddenMessageCount === 1 ? '' : 's'}
                                </button>
                            </div>
                        )}

                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-[#A1A1AA] text-center px-4 opacity-0 animate-fade-in" style={{ animationFillMode: 'forwards' }}>
                                <div className="w-full max-w-[300px] p-5 rounded-2xl bg-transparent shadow-none">
                                    <div className="w-12 h-12 rounded-2xl bg-transparent flex items-center justify-center mx-auto mb-3">
                                        <ArrowUp size={20} className="text-[var(--ui-text-muted)]" />
                                    </div>
                                    <h2 className="text-lg font-medium text-[var(--ui-text)] mb-1">What are we building?</h2>
                                    <p className="text-sm text-[var(--ui-text-muted)] leading-relaxed">Describe your app idea to generate screens.</p>
                                </div>
                            </div>
                        )}

                        {visibleMessages.map((message) => {
                            if (message.role === 'assistant') {
                                const parentUserId = String((message.meta as any)?.parentUserId || '').trim();
                                if (parentUserId) {
                                    const activeId = activeAssistantByUser[parentUserId];
                                    if (activeId && activeId !== message.id) {
                                        return null;
                                    }
                                }
                            }
                            const messageTokenUsageTotal = getMessageTokenUsageTotal(message);
                            return (
                            <div
                                key={message.id}
                                className={`flex flex-col gap-2 ${message.role === 'user' ? 'items-end' : 'items-start'}`}
                            >
                                {/* Screen Reference Visual */}
                                {(message.screenRef || Array.isArray(message.meta?.screenIds)) && (message.role !== 'user') && (message.status === 'complete' || message.status === 'error') && (
                                    <div className="flex flex-wrap gap-2 mb-1 justify-start ml-1">
                                        {(message.screenRef ? [message.screenRef.id] : ((message.meta?.screenIds as string[]) || []))
                                            .slice(0, 4)
                                            .map((screenId) => {
                                                const snapshotPreview = (message.meta?.screenSnapshots as Record<string, any> | undefined)?.[screenId] || null;
                                                const preview = snapshotPreview || getScreenPreview(screenId);
                                                const label = preview?.name || message.screenRef?.label || 'Screen';
                                                return (
                                                    <ScreenReferenceThumb
                                                        key={`${message.id}-${screenId}`}
                                                        screenId={screenId}
                                                        preview={preview}
                                                        label={label}
                                                        thumbWidth={THUMB_W}
                                                        onFocus={setFocusNodeId}
                                                    />
                                                );
                                            })}
                                    </div>
                                )}

                                {message.role === 'user' ? (
                                    <div className="flex flex-col items-end gap-2 max-w-[90%]">
                                        {(() => {
                                            const userReferenceIds = message.screenRef ? [message.screenRef.id] : ((message.meta?.screenIds as string[]) || []);
                                            const userReferenceUrls = Array.isArray((message.meta as any)?.referenceUrls)
                                                ? (((message.meta as any)?.referenceUrls as string[]).filter((item) => typeof item === 'string' && item.trim().length > 0))
                                                : [];
                                            const referenceContext = ((message.meta as any)?.referenceContext || null) as ReferenceContextMeta | null;
                                            const referencePreviewMode = String((message.meta as any)?.referencePreviewMode || 'screen');
                                            const hasReferenceStrip = userReferenceIds.length > 0 && referencePreviewMode === 'palette';
                                            const hasReferenceThumbs = userReferenceIds.length > 0 && referencePreviewMode !== 'palette';
                                            if (!hasReferenceStrip && !hasReferenceThumbs && userReferenceUrls.length === 0 && !(message.images && message.images.length > 0)) return null;
                                            return (
                                            <div className="flex flex-wrap items-end gap-2 justify-end mb-1 w-full">
                                                {hasReferenceStrip && (
                                                    <DesignSystemReferenceStrip
                                                        screenIds={userReferenceIds}
                                                        designSystem={spec?.designSystem}
                                                        onFocus={setFocusNodeId}
                                                    />
                                                )}
                                                {hasReferenceThumbs && userReferenceIds
                                                    .slice(0, 4)
                                                    .map((screenId) => {
                                                        const snapshotPreview = (message.meta?.screenSnapshots as Record<string, any> | undefined)?.[screenId] || null;
                                                        const preview = snapshotPreview || getScreenPreview(screenId);
                                                        const label = preview?.name || message.screenRef?.label || 'Screen';
                                                        return (
                                                            <ScreenReferenceThumb
                                                                key={`${message.id}-${screenId}`}
                                                                screenId={screenId}
                                                                preview={preview}
                                                                label={label}
                                                                thumbWidth={THUMB_W}
                                                                onFocus={setFocusNodeId}
                                                            />
                                                        );
                                                    })}
                                                {message.images && message.images.map((img, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => setViewerImage({ src: img, alt: `attachment-${idx + 1}` })}
                                                        className="group relative h-20 w-20 overflow-hidden rounded-xl border border-[var(--ui-border)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--ui-primary)_48%,transparent)]"
                                                        title="Open image"
                                                    >
                                                        <img src={img} alt="attached" className="w-full h-full object-cover" />
                                                    </button>
                                                ))}
                                                {userReferenceUrls.slice(0, 3).map((url) => (
                                                    <div
                                                        key={`${message.id}-${url}`}
                                                        className="inline-flex h-9 items-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-[12px] font-medium text-[var(--ui-text)]"
                                                        title={url}
                                                    >
                                                        {getComposerReferenceHostname(url)}
                                                    </div>
                                                ))}
                                                {userReferenceUrls.length > 0 && referenceContext && (
                                                    <div
                                                        className={`inline-flex h-9 items-center rounded-full border px-3 text-[12px] font-medium ${
                                                            referenceContext.webContextApplied
                                                                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                                                                : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                                                        }`}
                                                        title={referenceContext.warnings[0] || (referenceContext.webContextApplied ? 'Web page context applied.' : 'Web page context was skipped.')}
                                                    >
                                                        {referenceContext.webContextApplied ? 'Web context applied' : 'Web context skipped'}
                                                    </div>
                                                )}
                                            </div>
                                            );
                                        })()}
                                        <div className="bg-[var(--ui-surface-3)] px-5 py-3 rounded-[24px]  text-[15px] text-[var(--ui-text)] shadow-sm ring-1 ring-[var(--ui-border)]">
                                            {message.content}
                                        </div>
                                        <div className="flex items-center justify-end w-full pr-1">
                                            <button
                                                onClick={() => void handleRetryUserMessage(message.id)}
                                                disabled={isGenerating}
                                                className="px-2 py-1 rounded-md text-[11px] font-medium text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                                title="Retry this request as a new response branch"
                                            >
                                                Retry
                                            </button>
                                            <button
                                                onClick={() => handleCopyMessage(message.id, message.content)}
                                                className="p-1.5 rounded-md text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)] transition-all"
                                                title="Copy"
                                            >
                                                {copiedMessageIds[message.id]
                                                    ? <Check size={14} className="text-emerald-400" />
                                                    : <Copy size={14} />}
                                            </button>
                                        </div>
                                        <div className="w-full px-1 text-right text-[10px] text-[var(--ui-text-subtle)]">
                                            {formatTokenUsageLabel(messageTokenUsageTotal)}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full max-w-[95%] flex items-start gap-2">
                                        <div className="mt-1 h-8 w-8 shrink-0 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-0.5">
                                            <Orb
                                                className="h-full w-full"
                                                colors={['#60A5FA', '#A78BFA']}
                                                seed={message.id.length * 137}
                                                agentState={(message.status === 'pending' || message.status === 'streaming') ? 'thinking' : 'talking'}
                                                volumeMode="manual"
                                                manualInput={(message.status === 'pending' || message.status === 'streaming') ? 0.64 : 0.22}
                                                manualOutput={(message.status === 'pending' || message.status === 'streaming') ? 0.52 : 0.72}
                                            />
                                        </div>
                                        <div className="flex-1 space-y-2">
                                        {(() => {
                                            const proposal = (message.meta?.designSystemProposal || null) as ProjectDesignSystem | null;
                                            if (!proposal || message.status !== 'complete') return null;
                                            const proceeded = Boolean((message.meta as any)?.designSystemProceedAt);
                                            return (
                                                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3.5 space-y-3">
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Project Design System</p>
                                                        <h4 className="text-[13px] font-semibold text-[var(--ui-text)] mt-1">{proposal.systemName}</h4>
                                                        <p className="text-[11px] text-[var(--ui-text-muted)] mt-1 leading-relaxed">{proposal.intentSummary}</p>
                                                    </div>
                                                    <div className="grid grid-cols-4 gap-1.5">
                                                        {Object.entries(proposal.tokens).slice(0, 8).map(([tokenName, tokenValue]) => (
                                                            <div key={`${message.id}-${tokenName}`} className="space-y-1">
                                                                <div className="h-7 rounded-md ring-1 ring-black/15" style={{ background: tokenValue }} />
                                                                <p className="text-[9px] font-semibold text-[var(--ui-text-muted)] truncate">{tokenName}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-[10px] text-[var(--ui-text-muted)]">
                                                        <p><span className="text-[var(--ui-text)] font-semibold">Type:</span> {proposal.typography.displayFont} / {proposal.typography.bodyFont}</p>
                                                        <p><span className="text-[var(--ui-text)] font-semibold">Spacing:</span> {proposal.spacing.baseUnit}px · {proposal.spacing.density}</p>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => openDesignSystemEditor(proposal)}
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold bg-[var(--ui-surface-3)] text-[var(--ui-text)] ring-1 ring-[var(--ui-border)] hover:bg-[var(--ui-surface-4)]"
                                                        >
                                                            <Pencil size={12} />
                                                            <span>Edit in Design Tab</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleProceedWithDesignSystem(message.id)}
                                                            disabled={isGenerating || proceeded}
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold ring-1 shadow-sm transition-colors ${(isGenerating || proceeded)
                                                                ? 'bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] ring-[var(--ui-border)] cursor-not-allowed'
                                                                : 'bg-[var(--ui-primary)] text-white ring-[color:color-mix(in_srgb,var(--ui-primary)_44%,transparent)] hover:bg-[var(--ui-primary-hover)]'
                                                                }`}
                                                        >
                                                            <Sparkles size={12} />
                                                            <span>{proceeded ? 'Generating...' : 'Proceed to Generate Screens'}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        {(message.status === 'pending' || message.status === 'streaming') && (() => {
                                            const steps = getProcessSteps(message);
                                            const progress = getProcessProgress(message, steps);
                                            const visibleCount = getProcessVisibleCount(message, steps);
                                            return (
                                                <div className="px-2 py-1">
                                                    <ul className="space-y-2.5">
                                                        {steps.slice(0, visibleCount).map((step, idx) => {
                                                            const isDone = idx <= progress.doneUntil;
                                                            const isActive = idx === progress.activeAt;
                                                            const showConnector = idx < visibleCount - 1;
                                                            const displayLabel = isDone ? step.past : step.present;
                                                            return (
                                                                <li
                                                                    key={`${message.id}-step-${idx}`}
                                                                    className="relative flex items-center gap-2.5 text-sm"
                                                                    style={{ transitionDelay: `${idx * 120}ms` }}
                                                                >
                                                                    <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
                                                                        {showConnector && (
                                                                            <span className="absolute top-4 left-1/2 h-4 w-px -translate-x-1/2 bg-[var(--ui-border)]" />
                                                                        )}
                                                                        {isDone ? (
                                                                            <Check size={13} className="text-emerald-400" />
                                                                        ) : isActive ? (
                                                                            <Loader2 size={13} className="animate-spin text-[var(--ui-primary)]" />
                                                                        ) : (
                                                                            <span className="h-2.5 w-2.5 rounded-sm border border-[var(--ui-border-light)] bg-transparent" />
                                                                        )}
                                                                    </span>
                                                                    <span className={`${isDone || isActive ? 'text-[var(--ui-text)]' : 'text-[var(--ui-text-muted)]'}`}>{displayLabel}</span>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                </div>
                                            );
                                        })()}
                                        <div className="space-y-2">
                                            {(() => {
                                                const parentUserId = String((message.meta as any)?.parentUserId || '').trim();
                                                if (!parentUserId) return null;
                                                const branches = assistantBranchesByUser[parentUserId] || [];
                                                if (branches.length < 2) return null;
                                                const activeId = activeAssistantByUser[parentUserId] || branches[branches.length - 1];
                                                const index = Math.max(0, branches.indexOf(activeId));
                                                return (
                                                    <div className="flex items-center gap-2 text-[11px] text-[var(--ui-text-muted)] px-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => cycleAssistantBranch(parentUserId, 'prev')}
                                                            className="px-2 py-1 rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-2)] hover:bg-[var(--ui-surface-3)]"
                                                        >
                                                            Previous
                                                        </button>
                                                        <span>{index + 1}/{branches.length}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => cycleAssistantBranch(parentUserId, 'next')}
                                                            className="px-2 py-1 rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-2)] hover:bg-[var(--ui-surface-3)]"
                                                        >
                                                            Next
                                                        </button>
                                                    </div>
                                                );
                                            })()}
                                            {message.status === 'complete' && (() => {
                                                const thinkingSeconds = getThinkingSeconds(message);
                                                if (!thinkingSeconds) return null;
                                                return (
                                                    <div className="flex items-center gap-2 text-xs text-[var(--ui-text-muted)] px-2">
                                                        <Lightbulb size={13} />
                                                        <span>Thought for {thinkingSeconds} second{thinkingSeconds === 1 ? '' : 's'}</span>
                                                    </div>
                                                );
                                            })()}
                                            <div className="text-[13px] leading-relaxed whitespace-pre-wrap font-book transition-opacity duration-700 ease-in-out text-[var(--ui-text)] bg-transparent px-2">
                                                {message.status === 'streaming' ? (
                                                    message.meta?.thinkingStopped ? (
                                                        <span className="text-[13px] font-medium text-[var(--ui-text-muted)]">Rendering remaining screens...</span>
                                                    ) : (
                                                        <>
                                                            {/* Typing animation intentionally disabled.
                                                            <TextType ... />
                                                            */}
                                                            <span className="text-[13px] font-medium text-[var(--ui-text-muted)]">Working on your screens...</span>
                                                        </>
                                                    )
                                                ) : message.status === 'complete' ? (
                                                    ((message.meta as any)?.typedComplete === false) ? (
                                                    <TypedTaggedText
                                                        key={`${message.id}-${message.content}`}
                                                        text={message.content}
                                                        className="text-[13px] font-medium text-[var(--ui-text)]"
                                                        speed={12}
                                                        onDone={() => {
                                                            updateMessage(message.id, {
                                                                meta: {
                                                                    ...(useChatStore.getState().messages.find((m) => m.id === message.id)?.meta || {}),
                                                                    typedComplete: true,
                                                                }
                                                            });
                                                            setTypedDoneByMessageId((prev) => (
                                                                prev[message.id] ? prev : { ...prev, [message.id]: true }
                                                            ));
                                                        }}
                                                    />
                                                    ) : (
                                                        renderTaggedDescription(message.content)
                                                    )
                                                ) : message.status === 'error' ? (
                                                    <div className="flex items-start gap-2 text-rose-300">
                                                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-300" />
                                                        <div className="[&_*]:text-rose-300 text-rose-300">
                                                            {renderTaggedDescription(message.content)}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    renderTaggedDescription(message.content)
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 px-1">
                                                    <button
                                                        onClick={() => handleCopyMessage(message.id, message.content)}
                                                        className="p-1.5 rounded-md text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] transition-all"
                                                        title="Copy"
                                                    >
                                                        {copiedMessageIds[message.id]
                                                            ? <Check size={14} className="text-emerald-400" />
                                                            : <Copy size={14} />}
                                                    </button>
                                                    {message.status === 'complete' && (
                                                        <>
                                                                <button
                                                                    onClick={() => handleReaction(message.id, 'like')}
                                                                    className={`p-1.5 rounded-md transition-all ${(message.meta?.reaction as string) === 'like' ? 'text-emerald-300 bg-emerald-500/15' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)]'}`}
                                                                    title="Like"
                                                                >
                                                                <ThumbsUp size={14} />
                                                            </button>
                                                                <button
                                                                    onClick={() => handleReaction(message.id, 'dislike')}
                                                                    className={`p-1.5 rounded-md transition-all ${(message.meta?.reaction as string) === 'dislike' ? 'text-rose-300 bg-rose-500/15' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)]'}`}
                                                                    title="Dislike"
                                                                >
                                                                <ThumbsDown size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleShareMessage(message.id, message.content)}
                                                                className="p-1.5 rounded-md text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] transition-all"
                                                                title="Share"
                                                            >
                                                                <Share2 size={14} />
                                                            </button>
                                                        </>
                                                    )}
                                            </div>
                                            <div className="px-2 text-[10px] text-[var(--ui-text-subtle)]">
                                                {formatTokenUsageLabel(messageTokenUsageTotal)}
                                            </div>
                                            {message.status === 'complete' && ((((message.meta as any)?.typedComplete !== false) || typedDoneByMessageId[message.id]) && (() => {
                                                const postgen = message.meta?.plannerPostgen as (PlannerPostgenResponse | PlannerCtaPayload | undefined);
                                                const used = new Set(usedSuggestionKeysByMessage[message.id] || []);
                                                const suggestions = deriveMessageSuggestions(message.id, postgen, used);
                                                if (suggestions.length === 0) return null;
                                                return (
                                                    <div className="flex flex-wrap gap-1.5 px-1 pt-1">
                                                        {suggestions.map((item) => (
                                                            <button
                                                                key={`${item.messageId}-${item.key}`}
                                                                type="button"
                                                                onClick={() => handlePlannerCta(item)}
                                                                disabled={isGenerating}
                                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold ring-1 shadow-sm disabled:opacity-55 disabled:cursor-not-allowed transition-colors ${item.tone === 'primary'
                                                                    ? 'bg-[var(--ui-primary)] text-white ring-[color:color-mix(in_srgb,var(--ui-primary)_44%,transparent)] hover:bg-[var(--ui-primary-hover)]'
                                                                    : 'bg-[var(--ui-surface-3)] text-[var(--ui-text)] ring-[var(--ui-border)] hover:bg-[var(--ui-surface-4)]'
                                                                    }`}
                                                                title={`Generate ${item.screenNames.join(', ')}`}
                                                            >
                                                                <Sparkles size={12} />
                                                                <span>{item.label}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                );
                                            })())}
                                        </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                        })}
                        {isAwaitingAssistantDecision && (
                            <div className="w-full max-w-[95%] flex items-start gap-2">
                                <div className="mt-1 h-8 w-8 shrink-0 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-0.5">
                                    <Orb
                                        className="h-full w-full"
                                        colors={['#60A5FA', '#A78BFA']}
                                        seed={2407}
                                        agentState="thinking"
                                        volumeMode="manual"
                                        manualInput={0.62}
                                        manualOutput={0.5}
                                    />
                                </div>
                                <div className="inline-flex items-center gap-1.5 rounded-[22px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 shadow-sm">
                                    {[0, 1, 2].map((idx) => (
                                        <span
                                            key={`assistant-decision-dot-${idx}`}
                                            className="h-2 w-2 rounded-full bg-[var(--ui-text-muted)] animate-pulse"
                                            style={{ animationDelay: `${idx * 140}ms` }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    ) : chatPanelView === 'design-system' ? (
                        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 scrollbar-hide">
                            {!designSystemForPanel ? (
                                <div className="flex h-full items-center justify-center px-2">
                                    <div className="w-full rounded-[28px] border border-[var(--ui-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ui-surface-2)_96%,transparent),var(--ui-surface-1))] p-5 text-left">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Design System</p>
                                        <h3 className="mt-3 text-[20px] font-semibold leading-[1.05] text-[var(--ui-text)]">No design system yet</h3>
                                        <p className="mt-2 max-w-[280px] text-[12px] leading-relaxed text-[var(--ui-text-muted)]">
                                            Generate your first screen and EazyUI will assemble the project palette, typography and radius rules here.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="overflow-hidden rounded-[28px] border border-[var(--ui-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ui-surface-2)_96%,transparent),var(--ui-surface-1))]">
                                        <div className="border-b border-[var(--ui-border)] px-4 py-4">
                                        <div className="relative flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--ui-primary)]" />
                                                    Live Inspector
                                                </div>
                                                <h3 className="mt-3 text-[24px] leading-[1.02] tracking-[-0.03em] font-semibold text-[var(--ui-text)] break-words" style={{ fontFamily: designSystemForPanel.typography.displayFont }}>
                                                    {designSystemForPanel.systemName}
                                                </h3>
                                                <p className="mt-2 text-[12px] text-[var(--ui-text-muted)] leading-relaxed max-w-[300px]">{designSystemForPanel.intentSummary}</p>
                                            </div>
                                            <div className="text-right shrink-0 rounded-[20px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2">
                                                <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Type Stack</p>
                                                <p className="mt-2 text-[32px] leading-none text-[var(--ui-text)]" style={{ fontFamily: designSystemForPanel.typography.displayFont }}>Aa</p>
                                                <p className="mt-1 text-[20px] leading-none text-[var(--ui-text-muted)]" style={{ fontFamily: designSystemForPanel.typography.bodyFont }}>Aa</p>
                                            </div>
                                        </div>
                                        <div className="mt-4 grid grid-cols-3 gap-2">
                                            {[
                                                { label: 'Preset', value: designSystemForPanel.stylePreset },
                                                { label: 'Platform', value: designSystemForPanel.platform },
                                                { label: 'Theme', value: designSystemForPanel.themeMode },
                                            ].map((item) => (
                                                <div key={`design-meta-${item.label}`} className="rounded-[18px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2.5">
                                                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">{item.label}</p>
                                                    <p className="mt-1 text-[12px] font-medium capitalize text-[var(--ui-text)]">{item.value}</p>
                                                </div>
                                            ))}
                                        </div>
                                        </div>
                                        <div className="px-3 py-3">
                                            <p className="text-[11px] text-[var(--ui-text-muted)]">
                                                Live editing mode is on. Changes are staged until you save and apply.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="rounded-[22px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-1.5">
                                        <div className="grid grid-cols-3 gap-1">
                                            {([
                                                ['colors', 'Colors'],
                                                ['fonts', 'Fonts'],
                                                ['corners', 'Corners'],
                                            ] as const).map(([tabKey, tabLabel]) => (
                                                <button
                                                    key={`ds-tab-${tabKey}`}
                                                    type="button"
                                                    onClick={() => {
                                                        setDesignSystemInspectorTab(tabKey);
                                                        setOpenFontDropdown(null);
                                                        setOpenRadiusDropdown(null);
                                                    }}
                                                    className={`h-9 rounded-[14px] px-3 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${designSystemInspectorTab === tabKey
                                                        ? 'bg-[var(--ui-surface-4)] text-[var(--ui-text)] ring-1 ring-[var(--ui-border-light)]'
                                                        : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]'
                                                        }`}
                                                >
                                                    {tabLabel}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {designSystemInspectorTab === 'colors' && (
                                    <div className="rounded-[24px]">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--ui-text-subtle)]">Mode</p>
                                                <p className="mt-1 text-[12px] text-[var(--ui-text-muted)]">
                                                    Switch the live palette between light and dark variants.
                                                </p>
                                            </div>
                                            <div className="inline-flex items-center gap-0.5 rounded-[14px] border border-[var(--ui-border)] bg-[color:color-mix(in_srgb,var(--ui-surface-2)_94%,transparent)] p-[3px]">
                                                {([
                                                    { key: 'light', label: 'Light', icon: Sun },
                                                    { key: 'dark', label: 'Dark', icon: Moon },
                                                ] as const).map((mode) => {
                                                    const active = designSystemForPanel.themeMode === mode.key;
                                                    const Icon = mode.icon;
                                                    return (
                                                        <button
                                                            key={`design-mode-${mode.key}`}
                                                            type="button"
                                                            onClick={() => {
                                                                if (!active) toggleDesignSystemThemeVariant();
                                                            }}
                                                            className={`inline-flex items-center gap-1.5 rounded-[11px] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${active
                                                                ? 'bg-[var(--ui-surface-1)] text-[var(--ui-text)]'
                                                                : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]'
                                                                }`}
                                                        >
                                                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-[7px] ${active ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,transparent)] text-[var(--ui-primary)]' : 'bg-[var(--ui-surface-2)] text-[var(--ui-text-subtle)]'}`}>
                                                                <Icon size={12} />
                                                            </span>
                                                            <span>{mode.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="mt-4 rounded-[20px] border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-3">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Color Theme</p>
                                            <div className="mt-3 flex items-center gap-3 rounded-[16px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-3">
                                                <span className="h-10 w-10 shrink-0 rounded-full" style={{ background: `conic-gradient(from 220deg, ${designSystemForPanel.tokens.accent}, ${designSystemForPanel.tokens.accent2}, ${designSystemForPanel.tokens.surface2}, ${designSystemForPanel.tokens.accent})` }} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[12px] font-semibold capitalize text-[var(--ui-text)]">{designSystemForPanel.stylePreset}</p>
                                                    <p className="text-[11px] text-[var(--ui-text-muted)]">Custom</p>
                                                </div>
                                                <ChevronDown size={16} className="text-[var(--ui-text-subtle)]" />
                                            </div>
                                        </div>
                                        <div className="mt-4">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Color Palette</p>
                                            <div className="mt-3 space-y-2.5">
                                                {designTokenEntries.map(([tokenName, tokenValue]) => {
                                                    const isActive = selectedDesignTokenName === tokenName;
                                                    const normalizedTokenHex = normalizePickerHexColor(tokenValue, '#F9A825');
                                                    const tokenHsv = hexToPickerHsv(normalizedTokenHex);
                                                    const tokenMeta = {
                                                        bg: { label: 'Background', note: 'Canvas and shell base' },
                                                        surface: { label: 'Surface', note: 'Cards and primary panes' },
                                                        surface2: { label: 'Tertiary', note: 'Elevated content and hovers' },
                                                        text: { label: 'Text', note: 'Primary typography' },
                                                        muted: { label: 'Neutral', note: 'Muted labels and meta' },
                                                        stroke: { label: 'Stroke', note: 'Borders and separators' },
                                                        accent: { label: 'Primary', note: 'Main emphasis color' },
                                                        accent2: { label: 'Secondary', note: 'Support accent color' },
                                                    }[tokenName];
                                                    return (
                                                        <div
                                                            key={tokenName}
                                                            className={`overflow-hidden rounded-[18px] border bg-[var(--ui-surface-1)] transition-colors ${isActive
                                                                ? 'border-[color:color-mix(in_srgb,var(--ui-primary)_36%,var(--ui-border))]'
                                                                : 'border-[var(--ui-border)]'
                                                                }`}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (!isDesignSystemEditable) return;
                                                                    setActiveTokenEditor(isActive ? null : tokenName);
                                                                }}
                                                                className="flex w-full items-center gap-3 px-3 py-3 text-left"
                                                            >
                                                                <span className="h-10 w-10 shrink-0 rounded-full border border-white/10" style={{ background: normalizedTokenHex }} />
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-[12px] font-medium text-[var(--ui-text)]">{tokenMeta?.label || tokenName}</p>
                                                                    <p className="text-[11px] text-[var(--ui-text-muted)] truncate">{tokenMeta?.note || normalizedTokenHex}</p>
                                                                </div>
                                                                <ChevronDown
                                                                    size={16}
                                                                    className={`shrink-0 text-[var(--ui-text-subtle)] transition-transform ${isActive ? 'rotate-180' : ''}`}
                                                                />
                                                            </button>
                                                            {isActive && (
                                                                <div className="border-t border-[var(--ui-border)] px-3 pb-3 pt-2">
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="h-11 w-11 shrink-0 rounded-full border border-white/10" style={{ background: normalizedTokenHex }} />
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="text-[12px] font-semibold text-[var(--ui-text)]">{tokenMeta?.label || tokenName}</p>
                                                                            <p className="text-[11px] text-[var(--ui-text-muted)] truncate">{normalizedTokenHex}</p>
                                                                        </div>
                                                                    </div>
                                                                    <div
                                                                        className="relative mt-3 aspect-square overflow-hidden rounded-[18px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] touch-none"
                                                                        onPointerDown={(event) => handleDesignColorPlaneDrag(event, tokenName, tokenHsv.h)}
                                                                    >
                                                                        <div
                                                                            className="absolute inset-0"
                                                                            style={{ background: `linear-gradient(90deg,#ffffff 0%, ${hsvToPickerHex(tokenHsv.h, 1, 1)} 100%)` }}
                                                                        />
                                                                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(0,0,0,0.98)_100%)]" />
                                                                        <span
                                                                            className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                                                                            style={{
                                                                                left: `${tokenHsv.s * 100}%`,
                                                                                top: `${(1 - tokenHsv.v) * 100}%`,
                                                                                background: normalizedTokenHex,
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <div
                                                                        className="relative mt-3 h-5 overflow-hidden rounded-full border border-[var(--ui-border)] bg-[linear-gradient(90deg,#ff6436,#f9d423,#36d96d,#2f82ff,#7248ff,#ff3bbf)] touch-none"
                                                                        onPointerDown={(event) => handleDesignHueDrag(event, tokenName, tokenHsv.s, tokenHsv.v)}
                                                                    >
                                                                        <span
                                                                            className="pointer-events-none absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                                                                            style={{
                                                                                left: `${(tokenHsv.h / 360) * 100}%`,
                                                                                background: normalizedTokenHex,
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <div className="mt-3 flex items-center gap-2">
                                                                        <input
                                                                            type="color"
                                                                            value={normalizedTokenHex}
                                                                            onChange={(event) => updateDesignSystemTokenDraft(tokenName, normalizePickerHexColor(event.target.value))}
                                                                            className="h-11 w-14 rounded-[14px] border border-[var(--ui-border)] bg-transparent p-1 cursor-pointer"
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            value={tokenValue}
                                                                            onChange={(event) => updateDesignSystemTokenDraft(tokenName, event.target.value)}
                                                                            className="h-11 flex-1 rounded-[14px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-[12px] text-[var(--ui-text)] outline-none"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                    )}

                                    {designSystemInspectorTab === 'fonts' && (
                                        <div className="rounded-[24px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 space-y-4">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Font</p>
                                            <div className="grid grid-cols-1 gap-2.5">
                                                <div className="rounded-[20px] border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div>
                                                            <p className="text-[12px] font-semibold text-[var(--ui-text)]">Headline</p>
                                                            <p className="text-[11px] text-[var(--ui-text-muted)]">Titles and hero-sized emphasis.</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setOpenFontDropdown((current) => (current === 'display' ? null : 'display'))}
                                                            className="rounded-[12px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]"
                                                        >
                                                            Change
                                                        </button>
                                                    </div>
                                                    <p className="mt-1 text-[34px] leading-[0.95] text-[var(--ui-text)] break-words" style={{ fontFamily: designSystemForPanel.typography.displayFont }}>Aa</p>
                                                    <p className="text-[10px] text-[var(--ui-text-muted)] truncate">{designSystemForPanel.typography.displayFont}</p>
                                                    {openFontDropdown === 'display' && (
                                                        <div className="mt-2 max-h-44 overflow-y-auto rounded-[16px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-1.5 space-y-1">
                                                            {DESIGN_FONT_STACK_PRESETS.map((fontStack) => (
                                                                <button
                                                                    key={`dropdown-display-${fontStack}`}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        updateDesignSystemTypographyDraft('displayFont', fontStack);
                                                                        setOpenFontDropdown(null);
                                                                    }}
                                                                    className="w-full rounded-[12px] px-3 py-2 text-left text-[13px] text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)]"
                                                                    style={{ fontFamily: fontStack }}
                                                                >
                                                                    {extractPrimaryFontFamily(fontStack)}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="rounded-[20px] border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div>
                                                            <p className="text-[12px] font-semibold text-[var(--ui-text)]">Body</p>
                                                            <p className="text-[11px] text-[var(--ui-text-muted)]">UI copy, descriptions and helper text.</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setOpenFontDropdown((current) => (current === 'body' ? null : 'body'))}
                                                            className="rounded-[12px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]"
                                                        >
                                                            Change
                                                        </button>
                                                    </div>
                                                    <p className="mt-1 text-[16px] leading-[1.25] text-[var(--ui-text)]" style={{ fontFamily: designSystemForPanel.typography.bodyFont }}>The quick brown fox jumps.</p>
                                                    <p className="text-[10px] text-[var(--ui-text-muted)] truncate">{designSystemForPanel.typography.bodyFont}</p>
                                                    {openFontDropdown === 'body' && (
                                                        <div className="mt-2 max-h-44 overflow-y-auto rounded-[16px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-1.5 space-y-1">
                                                            {DESIGN_FONT_STACK_PRESETS.map((fontStack) => (
                                                                <button
                                                                    key={`dropdown-body-${fontStack}`}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        updateDesignSystemTypographyDraft('bodyFont', fontStack);
                                                                        setOpenFontDropdown(null);
                                                                    }}
                                                                    className="w-full rounded-[12px] px-3 py-2 text-left text-[13px] text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)]"
                                                                    style={{ fontFamily: fontStack }}
                                                                >
                                                                    {extractPrimaryFontFamily(fontStack)}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="rounded-[20px] border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-3">
                                                    <p className="text-[12px] font-semibold text-[var(--ui-text)]">Label</p>
                                                    <p className="text-[11px] text-[var(--ui-text-muted)]">Compact metadata and control labels.</p>
                                                    <p className="mt-3 text-[13px] uppercase tracking-[0.08em] text-[var(--ui-text)]" style={{ fontFamily: designSystemForPanel.typography.bodyFont }}>Inter Label</p>
                                                    <p className="mt-1 text-[10px] text-[var(--ui-text-muted)] truncate">{designSystemForPanel.typography.bodyFont}</p>
                                                </div>
                                            </div>
                                            <div className="space-y-3">
                                                <div>
                                                    <p className="text-[10px] font-semibold text-[var(--ui-text-muted)] uppercase tracking-[0.16em]">Display Presets</p>
                                                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                                                        {DESIGN_FONT_STACK_PRESETS.map((fontStack) => {
                                                            const isSelected = areFontStacksEquivalent(designSystemForPanel.typography.displayFont, fontStack);
                                                            return (
                                                                <button
                                                                    key={`display-font-stack-${fontStack}`}
                                                                    type="button"
                                                                    onClick={() => updateDesignSystemTypographyDraft('displayFont', fontStack)}
                                                                    className={`rounded-[18px] border p-3 text-left transition-all ${isSelected
                                                                        ? 'border-[color:color-mix(in_srgb,var(--ui-primary)_36%,var(--ui-border))] bg-[var(--ui-surface-1)]'
                                                                        : 'border-[var(--ui-border)] bg-[var(--ui-surface-1)] hover:bg-[var(--ui-surface-3)]'
                                                                        }`}
                                                                >
                                                                    <span className="block leading-none text-[24px] text-[var(--ui-text)]" style={{ fontFamily: fontStack }}>Aa</span>
                                                                    <span className="mt-1 block text-[10px] font-semibold text-[var(--ui-text-muted)] truncate">
                                                                        {extractPrimaryFontFamily(fontStack)}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {designSystemInspectorTab === 'corners' && (
                                        <div className="rounded-[24px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 space-y-4">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Corner Radius</p>
                                            <div className="space-y-3">
                                                {(['card', 'control', 'pill'] as const).map((radiusKey) => (
                                                    <div key={`radius-preview-${radiusKey}`} className="rounded-[20px] border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-3">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div>
                                                                <p className="text-[12px] font-semibold capitalize text-[var(--ui-text)]">{radiusKey}</p>
                                                                <p className="text-[11px] text-[var(--ui-text-muted)]">Current radius: {designSystemForPanel.radius[radiusKey]}</p>
                                                            </div>
                                                            <div className="h-12 w-12 border border-[var(--ui-border-light)] bg-[var(--ui-surface-2)]" style={{ borderRadius: designSystemForPanel.radius[radiusKey] }} />
                                                        </div>
                                                        <div className="mt-4">
                                                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Presets</p>
                                                            <div className="mt-2 grid grid-cols-4 gap-2">
                                                                {DESIGN_RADIUS_STYLE_PRESETS.map((preset) => {
                                                                    const isSelected = designSystemForPanel.radius[radiusKey] === preset.value;
                                                                    return (
                                                                        <button
                                                                            key={`radius-preset-${radiusKey}-${preset.key}`}
                                                                            type="button"
                                                                            onClick={() => updateDesignSystemRadiusDraft(radiusKey, preset.value)}
                                                                            className={`rounded-[16px] border px-2 py-2 transition-colors ${isSelected
                                                                                ? 'border-[color:color-mix(in_srgb,var(--ui-primary)_36%,var(--ui-border))] bg-[var(--ui-surface-3)]'
                                                                                : 'border-[var(--ui-border)] bg-[var(--ui-surface-2)] hover:bg-[var(--ui-surface-3)]'
                                                                                }`}
                                                                            title={preset.label}
                                                                        >
                                                                            <span className="flex h-8 items-center justify-center">
                                                                                <span
                                                                                    className="block h-5 w-5 border-2 border-[var(--ui-text-muted)] border-r-0 border-b-0"
                                                                                    style={{ borderTopLeftRadius: preset.value }}
                                                                                />
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                        <div className="mt-4">
                                                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Manual Setting</p>
                                                            <div className="mt-2 flex items-center gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={designSystemForPanel.radius[radiusKey]}
                                                                    onChange={(event) => updateDesignSystemRadiusDraft(radiusKey, event.target.value)}
                                                                    className="h-11 flex-1 rounded-[14px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-[12px] text-[var(--ui-text)] outline-none"
                                                                    placeholder="e.g. 12px"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setOpenRadiusDropdown((current) => (current === radiusKey ? null : radiusKey))}
                                                                    className="rounded-[12px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]"
                                                                >
                                                                    More
                                                                </button>
                                                            </div>
                                                            {openRadiusDropdown === radiusKey && (
                                                                <div className="mt-2 grid grid-cols-4 gap-2 rounded-[16px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-2">
                                                                    {DESIGN_RADIUS_PRESETS.map((radiusPreset) => (
                                                                        <button
                                                                            key={`radius-manual-preset-${radiusKey}-${radiusPreset}`}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                updateDesignSystemRadiusDraft(radiusKey, radiusPreset);
                                                                                setOpenRadiusDropdown(null);
                                                                            }}
                                                                            className={`rounded-[10px] px-2 py-1.5 text-[10px] font-semibold transition-colors ${designSystemForPanel.radius[radiusKey] === radiusPreset
                                                                                ? 'bg-[var(--ui-surface-3)] text-[var(--ui-text)]'
                                                                                : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]'
                                                                                }`}
                                                                        >
                                                                            {radiusPreset}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="rounded-[18px] border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-3">
                                                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Spacing</p>
                                                    <p className="mt-2 text-[14px] font-semibold text-[var(--ui-text)]">{designSystemForPanel.spacing.baseUnit}px</p>
                                                    <p className="mt-1 text-[11px] text-[var(--ui-text-muted)]">{designSystemForPanel.spacing.density}, {designSystemForPanel.spacing.rhythm}</p>
                                                </div>
                                                <div className="rounded-[18px] border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-3">
                                                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Motion</p>
                                                    <p className="mt-2 text-[14px] font-semibold text-[var(--ui-text)] capitalize">{designSystemForPanel.motion.style}</p>
                                                    <p className="mt-1 text-[11px] text-[var(--ui-text-muted)]">{designSystemForPanel.motion.durationFastMs}ms / {designSystemForPanel.motion.durationBaseMs}ms</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* <div className="rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 space-y-3">
                                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Component Voice & Rules</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-3)] p-2">
                                                <p className="text-[10px] text-[var(--ui-text-subtle)] uppercase tracking-[0.08em]">Buttons</p>
                                                <p className="mt-1 text-[11px] text-[var(--ui-text)]">{designSystemForPanel.componentLanguage.button}</p>
                                            </div>
                                            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-3)] p-2">
                                                <p className="text-[10px] text-[var(--ui-text-subtle)] uppercase tracking-[0.08em]">Cards</p>
                                                <p className="mt-1 text-[11px] text-[var(--ui-text)]">{designSystemForPanel.componentLanguage.card}</p>
                                            </div>
                                            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-3)] p-2">
                                                <p className="text-[10px] text-[var(--ui-text-subtle)] uppercase tracking-[0.08em]">Inputs</p>
                                                <p className="mt-1 text-[11px] text-[var(--ui-text)]">{designSystemForPanel.componentLanguage.input}</p>
                                            </div>
                                            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-3)] p-2">
                                                <p className="text-[10px] text-[var(--ui-text-subtle)] uppercase tracking-[0.08em]">Navigation</p>
                                                <p className="mt-1 text-[11px] text-[var(--ui-text)]">{designSystemForPanel.componentLanguage.nav}</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-3">
                                            <div>
                                                <p className="text-[11px] font-semibold text-emerald-300 mb-1">Do</p>
                                                <ul className="space-y-1">
                                                    {designSystemForPanel.rules.do.map((rule, index) => (
                                                        <li key={`do-${index}`} className="text-xs text-[var(--ui-text-muted)] leading-relaxed">- {rule}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-semibold text-rose-300 mb-1">Don't</p>
                                                <ul className="space-y-1">
                                                    {designSystemForPanel.rules.dont.map((rule, index) => (
                                                        <li key={`dont-${index}`} className="text-xs text-[var(--ui-text-muted)] leading-relaxed">- {rule}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </div> */}
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto px-4 py-4">
                            <div className="flex min-h-full items-center">
                                <div className="w-full rounded-[28px] p-5">
                                    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">
                                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--ui-primary)]" />
                                        Assets
                                    </div>
                                    <h3 className="mt-4 text-[24px] font-semibold leading-[1.02] tracking-[-0.03em] text-[var(--ui-text)]">Coming soon</h3>
                                    <p className="mt-2 max-w-[290px] text-[12px] leading-relaxed text-[var(--ui-text-muted)]">
                                        The project asset space will live here once uploads, saved snippets and reusable media are ready.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {chatPanelView === 'chat' && showScrollToLatest && (
                        <button
                            type="button"
                            onClick={() => triggerScrollToLatestFab('smooth')}
                            className="absolute left-1/2 -translate-x-1/2 bottom-[190px] z-20 h-9 min-w-9 px-2 rounded-full bg-[var(--ui-primary)] text-white ring-1 ring-[var(--ui-primary)] shadow-lg hover:bg-[var(--ui-primary-hover)] transition-colors inline-flex items-center justify-center"
                            title="Scroll to latest"
                        >
                            <ArrowDown size={16} />
                        </button>
                    )}

                    {chatPanelView === 'chat' ? (
                    <>
                    {/* Chat Input Container */}
                    <div className="relative mx-4 mb-6 overflow-visible">
                        <ComposerAttachmentStack images={images} onRemove={removeImage} size="compact" />
                        <div className="relative flex flex-col gap-2 rounded-[20px] border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ui-primary)_5%,var(--ui-surface-1)),var(--ui-surface-1))] p-3 transition-all">
                            <button
                                type="button"
                                onClick={togglePlanMode}
                                className={`absolute -top-10 right-1 sm:right-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold ring-1 transition-colors ${planMode
                                    ? 'bg-[var(--ui-primary)] text-white ring-[color:color-mix(in_srgb,var(--ui-primary)_44%,transparent)] hover:bg-[var(--ui-primary-hover)]'
                                    : 'bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] ring-[var(--ui-border)] hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text)]'
                                    }`}
                                title={planMode ? 'Disable plan mode' : 'Enable plan mode'}
                            >
                                <Sparkles size={12} />
                                <span>Plan mode</span>
                            </button>


                            {/* Text Area & Images */}
                            <div className="relative min-w-0 flex-1">
                                <div className="flex items-start gap-2 px-1">
                                    <div className="-mt-1 -ml-0.5 h-9 w-9 shrink-0 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-3))] p-[2px]">
                                        <Orb
                                            className="h-full w-full"
                                            colors={composerOrbColors}
                                            seed={2401}
                                            agentState={composerOrbState}
                                            volumeMode="manual"
                                            manualInput={composerOrbInput}
                                            manualOutput={composerOrbOutput}
                                        />
                                    </div>
                                    <div className="relative min-w-0 flex-1">
                                        <ComposerInlineReferenceInput
                                            ref={textareaRef}
                                            value={prompt}
                                            onChange={handlePromptChange}
                                            onSelectionChange={syncMentionState}
                                            onReferenceClick={handleReferenceTokenClick}
                                            onKeyDown={handleKeyDown}
                                            placeholder="Describe your UI you want to create... (type @ to reference a URL or screen)"
                                            placeholderClassName="pr-2 py-1 leading-relaxed"
                                            disabled={isGenerating}
                                            allowScreen
                                            screens={availableMentionScreens}
                                            className="no-focus-ring w-full bg-transparent text-[var(--ui-text)] text-[16px] min-h-[48px] max-h-[200px] overflow-y-auto outline-none pr-2 py-1 leading-relaxed"
                                        />
                                    </div>
                                </div>
                                {isMentionOpen && (
                                    <ComposerReferenceMenu
                                        activeIndex={mentionActiveIndex}
                                        menuMode={referenceMenuMode}
                                        menuRef={mentionMenuRef}
                                        onCancel={closeMentionMenu}
                                        onRootOptionHover={setMentionActiveIndex}
                                        onScreenHover={setMentionActiveIndex}
                                        onScreenQueryChange={setMentionQuery}
                                        onSelectRootOption={(key) => {
                                            if (key === 'url') openUrlReferenceInput();
                                            if (key === 'screen') openScreenReferenceInput();
                                        }}
                                        onSelectScreen={selectMentionScreen}
                                        onSubmitUrl={submitUrlReference}
                                        rootOptions={rootReferenceOptions}
                                        screenOptions={filteredMentionScreens}
                                        screenQuery={referenceMenuMode === 'screen' ? mentionQuery : ''}
                                        searchInputRef={mentionSearchInputRef}
                                        urlDraft={referenceUrlDraft}
                                        urlInputRef={referenceUrlInputRef}
                                        onUrlDraftChange={setReferenceUrlDraft}
                                    />
                                )}
                            </div>

                            {/* Bottom Controls Row */}
                            <div className="flex items-center justify-between pt-1">

                            {/* Left: Attach & Platform */}
                            <div className="flex items-center gap-2">
                                {/* Attach Button */}
                                <button
                                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-3))] text-[var(--ui-text-muted)] transition-all ring-1 ring-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-surface-4))] hover:text-[var(--ui-primary)]"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Add Image"
                                >
                                    <Plus size={18} />
                                </button>

                                {/* Platform Selector (Pill) */}
                                <div className="flex items-center rounded-full bg-[color:color-mix(in_srgb,var(--ui-primary)_7%,var(--ui-surface-3))] p-1 ring-1 ring-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))]">
                                    {(['mobile', 'tablet', 'desktop'] as const).map((p) => (
                                        <button
                                            key={p}
                                            onClick={() => setPlatform(p)}
                                            className={`p-1.5 rounded-full transition-all ${selectedPlatform === p
                                                ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-surface-4))] text-[var(--ui-primary)] ring-1 ring-[color:color-mix(in_srgb,var(--ui-primary)_26%,transparent)]'
                                                : 'text-[var(--ui-text-subtle)] hover:text-[var(--ui-primary)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-3))]'
                                                }`}
                                            title={`Generate for ${p}`}
                                        >
                                            {p === 'mobile' && <Smartphone size={14} />}
                                            {p === 'tablet' && <Tablet size={14} />}
                                            {p === 'desktop' && <Monitor size={14} />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Right: Send Button */}
                            <div className="flex items-center gap-3">
                                <div className="flex items-center rounded-full bg-[color:color-mix(in_srgb,var(--ui-primary)_7%,var(--ui-surface-3))] p-1 ring-1 ring-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))]">
                                    <button
                                        type="button"
                                        onClick={() => setModelProfile('fast')}
                                        className={`h-8 w-8 rounded-full text-[11px] font-semibold transition-all inline-flex items-center justify-center ${modelProfile === 'fast'
                                            ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-surface-4))] text-[var(--ui-primary)] ring-1 ring-[color:color-mix(in_srgb,var(--ui-primary)_28%,transparent)]'
                                            : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-primary)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-3))]'
                                            }`}
                                        title="Fast model"
                                    >
                                        <Zap size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModelProfile('quality')}
                                        className={`h-8 w-8 rounded-full text-[11px] font-semibold transition-all inline-flex items-center justify-center ${modelProfile === 'quality'
                                            ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-surface-4))] text-[var(--ui-primary)] ring-1 ring-[color:color-mix(in_srgb,var(--ui-primary)_28%,transparent)]'
                                            : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-primary)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-3))]'
                                            }`}
                                        title="Quality model"
                                    >
                                        <Sparkles size={12} />
                                    </button>
                                </div>
                                <div ref={styleMenuRef} className="relative hidden sm:flex items-center">
                                    <button
                                        onClick={() => setShowStyleMenu(v => !v)}
                                        className={`h-9 w-9 rounded-full ring-1 transition-all inline-flex items-center justify-center ${styleButtonTone}`}
                                        title="Select style preset"
                                    >
                                        <StyleIcon size={14} />
                                    </button>
                                    {showStyleMenu && (
                                        <div className="absolute bottom-12 right-0 w-56 bg-[var(--ui-popover)] border border-[var(--ui-border)] rounded-xl shadow-2xl p-2 z-50">
                                            {(['modern', 'minimal', 'vibrant', 'luxury', 'playful'] as const).map((preset) => (
                                                <button
                                                    key={preset}
                                                    onClick={() => {
                                                        setStylePreset(preset);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${stylePreset === preset
                                                        ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-surface-4))] text-[var(--ui-primary)]'
                                                        : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]'
                                                        }`}
                                                >
                                                    {preset}
                                                </button>
                                            ))}
                                            <div className="mt-2 border-t border-[var(--ui-border)] pt-2 px-1">
                                                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-subtle)]">
                                                    <span>Temporary</span>
                                                    <span>{modelTemperature.toFixed(2)}</span>
                                                </div>
                                                <label className="mt-1.5 block text-[11px] text-[var(--ui-text-muted)]">
                                                    Temperature
                                                    <input
                                                        type="range"
                                                        min={0}
                                                        max={2}
                                                        step={0.01}
                                                        value={modelTemperature}
                                                        onChange={(event) => {
                                                            const numeric = Number(event.target.value);
                                                            if (!Number.isFinite(numeric)) return;
                                                            setModelTemperature(Math.max(0, Math.min(2, numeric)));
                                                        }}
                                                        className="mt-2 w-full accent-[var(--ui-primary)] cursor-pointer"
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (requestInFlight) {
                                            handleStop();
                                            return;
                                        }
                                        if (showSendAction) {
                                            handleSubmit();
                                            return;
                                        }
                                        handleMicToggle();
                                    }}
                                    disabled={actionDisabled}
                                    className={`w-9 h-9 rounded-[12px] flex items-center justify-center transition-all ${requestInFlight
                                        ? 'bg-[var(--ui-surface-4)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] ring-1 ring-[var(--ui-border-light)]'
                                        : isRecording
                                            ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-300/25'
                                            : showSendAction
                                                ? 'bg-[var(--ui-primary)] text-white hover:bg-[var(--ui-primary-hover)]'
                                                : 'bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] ring-1 ring-[var(--ui-border)]'
                                        }`}
                                    title={isAwaitingAssistantDecision
                                        ? 'Preparing response...'
                                        : isGenerating
                                            ? 'Stop generation'
                                        : showSendAction
                                            ? 'Send prompt'
                                            : isRecording
                                                ? 'Stop recording'
                                                : isTranscribing
                                                    ? 'Transcribing...'
                                                    : 'Record voice'}
                                >
                                    {isAwaitingAssistantDecision ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : actionIsStop ? (
                                        <Square size={14} className="fill-current" />
                                    ) : showSendAction ? (
                                        <ArrowUp size={20} className="text-[var(--ui-text)]" />
                                    ) : (
                                        <Mic size={15} />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                        accept="image/*"
                        multiple
                    />
                    </div>
                    </>
                    ) : chatPanelView === 'design-system' ? (
                        <div className="mx-4 mb-6 rounded-[18px] border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-3.5">
                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={cancelDesignSystemEdit}
                                    disabled={!hasDesignSystemDraftChanges}
                                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold ring-1 transition-colors ${hasDesignSystemDraftChanges
                                        ? 'bg-[var(--ui-surface-3)] text-[var(--ui-text)] ring-[var(--ui-border)] hover:bg-[var(--ui-surface-4)]'
                                        : 'bg-[var(--ui-surface-2)] text-[var(--ui-text-subtle)] ring-[var(--ui-border)] cursor-not-allowed'
                                        }`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={saveDesignSystemEdit}
                                    disabled={!hasDesignSystemDraftChanges}
                                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold ring-1 transition-colors ${hasDesignSystemDraftChanges
                                        ? 'bg-[var(--ui-primary)] text-white ring-[color:color-mix(in_srgb,var(--ui-primary)_44%,transparent)] hover:bg-[var(--ui-primary-hover)]'
                                        : 'bg-[var(--ui-surface-2)] text-[var(--ui-text-subtle)] ring-[var(--ui-border)] cursor-not-allowed'
                                        }`}
                                >
                                    Save & Apply
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
            {viewerImage && (
                <div
                    className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setViewerImage(null)}
                >
                    <div
                        className="relative w-full max-w-5xl max-h-[92vh] rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] shadow-2xl p-2"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setViewerImage(null)}
                            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white hover:bg-black/75 flex items-center justify-center transition-colors z-10"
                            title="Close viewer"
                        >
                            <X size={16} />
                        </button>
                        <img
                            src={viewerImage.src}
                            alt={viewerImage.alt || 'image preview'}
                            className="block w-full h-auto max-h-[88vh] object-contain rounded-xl"
                        />
                    </div>
                </div>
            )}
        </>
    );
}
