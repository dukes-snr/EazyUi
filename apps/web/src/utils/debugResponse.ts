// ============================================================================
// Debug Response Parser
// ----------------------------------------------------------------------------
// Parses the raw streamed markup that the AI generation endpoints emit
// (the same contract as the live stream parser in ChatPanel) so it can be
// manually injected from the debug screen. Kept self-contained and dependency
// free to avoid coupling debug tooling to the production parser.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type { HtmlDesignSpec, HtmlScreen } from '../api/client';

const PLATFORM_DIMENSIONS: Record<string, { width: number; height: number }> = {
    mobile: { width: 402, height: 874 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1280, height: 1200 },
};

export interface ParsedDebugResponse {
    designSpec: HtmlDesignSpec;
    description: string;
    screenCount: number;
    warnings: string[];
    /** Raw <activity ...>...</activity> tag bodies, for visibility only. */
    activities: string[];
}

export interface ParseDebugResult {
    ok: boolean;
    error?: string;
    result?: ParsedDebugResponse;
}

/**
 * Pull <description>…</description> text out of the raw markup.
 * Matches the first occurrence and strips surrounding whitespace.
 */
function extractDescription(source: string): { text: string; remaining: string } {
    const openMatch = /<description(?:\s[^>]*)?>/i.exec(source);
    if (!openMatch || openMatch.index === undefined) {
        return { text: '', remaining: source };
    }
    const openTag = openMatch[0];
    const start = openMatch.index;
    const end = source.indexOf('</description>', start + openTag.length);
    if (end < 0) {
        // Unclosed description tag — capture to end of buffer and consume it.
        const text = source.slice(start + openTag.length).trim();
        return { text, remaining: source.slice(0, start) };
    }
    const text = source.slice(start + openTag.length, end).trim();
    return {
        text,
        remaining: `${source.slice(0, start)}${source.slice(end + '</description>'.length)}`,
    };
}

/**
 * Collect <activity …>…</activity> bodies for diagnostic display.
 * Returns the markup with activity tags removed so they don't interfere
 * with screen parsing.
 */
function stripActivities(source: string): { cleaned: string; activities: string[] } {
    const activities: string[] = [];
    const openRegex = /<activity\b[^>]*>/i;
    let cleaned = source;
    while (true) {
        const open = openRegex.exec(cleaned);
        if (!open || open.index === undefined) break;
        const closeIdx = cleaned.indexOf('</activity>', open.index + open[0].length);
        if (closeIdx < 0) {
            // Unclosed activity — drop the dangling open tag.
            cleaned = `${cleaned.slice(0, open.index)}${cleaned.slice(open.index + open[0].length)}`;
            break;
        }
        const body = cleaned.slice(open.index + open[0].length, closeIdx).trim();
        activities.push(`${open[0]}${body}</activity>`);
        cleaned = `${cleaned.slice(0, open.index)}${cleaned.slice(closeIdx + '</activity>'.length)}`;
    }
    return { cleaned, activities };
}

interface RawScreen {
    name: string;
    html: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stripJsonCodeFence(input: string): string {
    const trimmed = input.trim();
    const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
    return fenceMatch?.[1]?.trim() || trimmed;
}

function coerceString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function coercePositiveNumber(value: unknown, fallback: number): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function getJsonItems(parsed: unknown): unknown[] | null {
    if (Array.isArray(parsed)) return parsed;
    if (!isRecord(parsed)) return null;

    if (Array.isArray(parsed.items)) return parsed.items;
    if (Array.isArray(parsed.screens)) return parsed.screens;

    const designSpec = parsed.designSpec;
    if (isRecord(designSpec) && Array.isArray(designSpec.screens)) {
        return designSpec.screens;
    }

    return null;
}

function extractJsonMetadata(parsed: unknown, items: unknown[]): {
    description: string;
    activities: string[];
    designName: string;
} {
    let description = '';
    let designName = '';
    const activities: string[] = [];

    if (isRecord(parsed)) {
        description = coerceString(parsed.description);
        designName = coerceString(parsed.name);
        const designSpec = parsed.designSpec;
        if (isRecord(designSpec)) {
            if (!description) description = coerceString(designSpec.description);
            if (!designName) designName = coerceString(designSpec.name);
        }
    }

    for (const item of items) {
        if (!isRecord(item)) continue;
        const type = coerceString(item.type).toLowerCase();
        const content = coerceString(item.content);
        if (type === 'description' && content && !description) {
            description = content;
        }
        if (type === 'activity') {
            const id = coerceString(item.id);
            const status = coerceString(item.status);
            const activityType = coerceString(item.type);
            const attrs = [
                id ? `id="${id}"` : '',
                status ? `status="${status}"` : '',
                activityType ? `type="${activityType}"` : '',
            ].filter(Boolean).join(' ');
            activities.push(`<activity${attrs ? ` ${attrs}` : ''}>${content}</activity>`);
        }
    }

    return { description, activities, designName };
}

function extractJsonScreens(items: unknown[], dimensions: { width: number; height: number }): {
    screens: RawScreen[];
    warnings: string[];
} {
    const screens: RawScreen[] = [];
    const warnings: string[] = [];

    for (const [index, item] of items.entries()) {
        if (!isRecord(item)) {
            warnings.push(`Ignored JSON item ${index + 1} because it is not an object.`);
            continue;
        }

        const type = coerceString(item.type).toLowerCase();
        const html = coerceString(item.html);
        if (type && type !== 'screen') {
            continue;
        }
        if (!html) {
            if (type === 'screen') {
                warnings.push(`Ignored screen item ${index + 1} because it has no html field.`);
            }
            continue;
        }

        const name = coerceString(item.name) || coerceString(item.title) || `Screen ${screens.length + 1}`;
        screens.push({
            name,
            html,
        });

        const width = coercePositiveNumber(item.width, dimensions.width);
        const height = coercePositiveNumber(item.height, dimensions.height);
        if (width !== dimensions.width || height !== dimensions.height) {
            warnings.push(`Screen "${name}" included ${width}x${height}; debug preview will use the selected ${dimensions.width}x${dimensions.height} platform size.`);
        }
    }

    return { screens, warnings };
}

/**
 * Extract each <screen name="…">…</screen> block. Tolerates self-closing
 * variants and unclosed trailing screens (partial pastes).
 */
function extractScreens(source: string): { screens: RawScreen[]; warnings: string[]; remaining: string } {
    const warnings: string[] = [];
    const screens: RawScreen[] = [];
    const openRegex = /<screen\b[^>]*>/gi;
    let working = source;
    let match: RegExpExecArray | null;

    while ((match = openRegex.exec(working)) !== null) {
        const openTag = match[0];
        const openIndex = match.index;
        const nameMatch = /\bname\s*=\s*(['"])(.*?)\1/i.exec(openTag);
        const name = (nameMatch?.[2] || '').trim() || `Screen ${screens.length + 1}`;

        const closeIdx = working.indexOf('</screen>', openIndex + openTag.length);
        if (closeIdx < 0) {
            // Partial screen — keep what we have, warn, and stop.
            const html = working.slice(openIndex + openTag.length).trim();
            if (html) {
                screens.push({ name, html });
                warnings.push(`Screen "${name}" was not closed with </screen> — captured partial content.`);
            }
            working = working.slice(0, openIndex);
            break;
        }

        const html = working.slice(openIndex + openTag.length, closeIdx).trim();
        screens.push({ name, html });
        working = `${working.slice(0, openIndex)}${working.slice(closeIdx + '</screen>'.length)}`;
        // openRegex is stateful but we sliced `working`, so restart from zero.
        openRegex.lastIndex = 0;
    }

    return { screens, warnings, remaining: working };
}

/**
 * Coerce an arbitrary screen body toward a complete, standalone HTML document.
 * Mirrors the cleanup that the live stream applies before rendering.
 */
function normalizeScreenHtml(input: string, width: number, _height: number): string {
    let html = String(input || '').trim();
    if (!html) return '';

    // Strip a leading markdown code fence if the user pasted from a chat dump.
    html = html.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '');

    const doctypeIdx = html.search(/<!doctype html>/i);
    if (doctypeIdx > 0) html = html.slice(doctypeIdx);
    const htmlIdx = html.search(/<html[\s>]/i);
    if (htmlIdx > 0 && !/<!doctype html>/i.test(html)) html = html.slice(htmlIdx);

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
        html = /<\/head>/i.test(html)
            ? html.replace(/<\/head>/i, '</head><body>')
            : html.replace(/<html([^>]*)>/i, '<html$1><body>');
    }
    if (!/<\/body>/i.test(html)) html += '\n</body>';
    if (!/<\/html>/i.test(html)) html += '\n</html>';

    // Stamp an explicit viewport so iframe previews render at the intended size.
    const viewportMeta = `<meta name="viewport" content="width=${width}, initial-scale=1">`;
    if (/<head\b[^>]*>/i.test(html) && !/name\s*=\s*["']viewport["']/i.test(html)) {
        html = html.replace(/<head\b([^>]*)>/i, `<head$1>${viewportMeta}`);
    }

    return html.trim();
}

function buildDebugResultFromScreens(params: {
    rawScreens: RawScreen[];
    dimensions: { width: number; height: number };
    description: string;
    activities: string[];
    warnings: string[];
    designName?: string;
}): ParseDebugResult {
    const { rawScreens, dimensions, description, activities, warnings, designName } = params;
    if (rawScreens.length === 0) {
        return {
            ok: false,
            error: 'No screens were found. The response must contain at least one screen with HTML.',
        };
    }

    const screens: HtmlScreen[] = rawScreens.map((rawScreen, index) => {
        const normalized = normalizeScreenHtml(rawScreen.html, dimensions.width, dimensions.height);
        if (!normalized) {
            warnings.push(`Screen "${rawScreen.name}" had no renderable HTML and was skipped.`);
        }
        return {
            screenId: `debug-screen-${index}-${uuidv4().slice(0, 6)}`,
            name: rawScreen.name,
            html: normalized,
            width: dimensions.width,
            height: dimensions.height,
            status: (normalized ? 'complete' as const : undefined),
        };
    }).filter((screen) => Boolean(screen.html));

    if (screens.length === 0) {
        return { ok: false, error: 'Screen blocks were found but none contained renderable HTML.' };
    }

    const now = new Date().toISOString();
    const designSpec: HtmlDesignSpec = {
        id: `debug-design-${uuidv4()}`,
        name: designName || screens[0]?.name || 'Debug Injected Design',
        screens,
        description: description || undefined,
        createdAt: now,
        updatedAt: now,
    };

    return {
        ok: true,
        result: {
            designSpec,
            description,
            screenCount: screens.length,
            warnings,
            activities,
        },
    };
}

function parseJsonDebugResponse(rawInput: string, dimensions: { width: number; height: number }): ParseDebugResult | null {
    const jsonText = stripJsonCodeFence(rawInput);
    if (!/^[\[{]/.test(jsonText)) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch {
        return null;
    }

    const items = getJsonItems(parsed);
    if (!items) {
        return {
            ok: false,
            error: 'JSON was parsed, but no screen array was found. Expected an array, { screens: [...] }, or { designSpec: { screens: [...] } }.',
        };
    }

    const metadata = extractJsonMetadata(parsed, items);
    const { screens: rawScreens, warnings } = extractJsonScreens(items, dimensions);

    return buildDebugResultFromScreens({
        rawScreens,
        dimensions,
        description: metadata.description,
        activities: metadata.activities,
        warnings,
        designName: metadata.designName,
    });
}

export function parseDebugResponse(
    rawInput: string,
    options: { platform?: string; stylePreset?: string; intentSummary?: string } = {},
): ParseDebugResult {
    const raw = String(rawInput || '');
    if (!raw.trim()) {
        return { ok: false, error: 'Paste the raw AI response (the streamed markup) first.' };
    }

    const platform = options.platform && PLATFORM_DIMENSIONS[options.platform]
        ? options.platform
        : 'mobile';
    const dimensions = PLATFORM_DIMENSIONS[platform];

    const jsonResult = parseJsonDebugResponse(raw, dimensions);
    if (jsonResult) return jsonResult;

    const warnings: string[] = [];
    let working = raw;

    const { text: description, remaining: afterDescription } = extractDescription(working);
    working = afterDescription;
    const { cleaned: afterActivities, activities } = stripActivities(working);
    working = afterActivities;
    const { screens: rawScreens, warnings: screenWarnings, remaining: tail } = extractScreens(working);

    if (tail.trim() && !/^\s*$/.test(tail)) {
        // Stray markup outside any <screen> — surface as a warning, don't fail.
        const preview = tail.trim().slice(0, 80);
        warnings.push(`Ignored markup outside <screen> tags: "${preview}${tail.length > 80 ? '…' : ''}"`);
    }

    warnings.push(...screenWarnings);

    return buildDebugResultFromScreens({
        rawScreens,
        dimensions,
        description,
        activities,
        warnings,
    });
}

// ----------------------------------------------------------------------------
// Session stash — hands the parsed payload to the canvas route for injection.
// Mirrors the LANDING_DRAFT_KEY pattern used by the landing CTA.
// ----------------------------------------------------------------------------

const DEBUG_INJECT_KEY = 'eazyui:debug-inject';

export interface DebugInjectPayload {
    designSpec: HtmlDesignSpec;
    source: 'debug';
    createdAt: string;
}

export function writeDebugInjectPayload(payload: DebugInjectPayload): void {
    try {
        window.sessionStorage.setItem(DEBUG_INJECT_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('[debug] could not stage inject payload', error);
    }
}

export function consumeDebugInjectPayload(): DebugInjectPayload | null {
    try {
        const raw = window.sessionStorage.getItem(DEBUG_INJECT_KEY);
        if (!raw) return null;
        window.sessionStorage.removeItem(DEBUG_INJECT_KEY);
        const parsed = JSON.parse(raw) as DebugInjectPayload;
        if (parsed && parsed.designSpec && Array.isArray(parsed.designSpec.screens)) {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}

export function peekDebugInjectPayload(): DebugInjectPayload | null {
    try {
        const raw = window.sessionStorage.getItem(DEBUG_INJECT_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as DebugInjectPayload;
    } catch {
        return null;
    }
}
