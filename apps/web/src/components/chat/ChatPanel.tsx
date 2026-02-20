// ============================================================================
// Chat Panel Component - Streaming Version
// ============================================================================

import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useChatStore, useDesignStore, useCanvasStore, useEditStore, useUiStore } from '../../stores';
import { apiClient, type PlannerPlanResponse, type PlannerPostgenResponse, type HtmlScreen } from '../../api/client';
import { v4 as uuidv4 } from 'uuid';
import { ArrowUp, Plus, Monitor, Smartphone, Sparkles, Tablet, X, Loader2, ChevronLeft, PanelLeftClose, PanelLeftOpen, Square, Copy, Check, ThumbsUp, ThumbsDown, Share2, Lightbulb, CircleStar, Mic, Zap, LineSquiggle, Palette, Gem, Smile, AlertTriangle } from 'lucide-react';
import { getPreferredTextModel, type DesignModelProfile } from '../../constants/designModels';
import { notifyWhenInBackground, requestBrowserNotificationPermissionIfNeeded } from '../../utils/browserNotifications';
import { getUserFacingError, toTaggedErrorMessage } from '../../utils/userFacingErrors';
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

    if (html.includes('</head>')) {
        return html.replace('</head>', `${warningFilterScript}\n${styleTag}\n</head>`);
    }
    return `${warningFilterScript}\n${styleTag}\n${html}`;
}

function normalizePlaceholderCatalogInHtml(html: string): string {
    if (!html || !/<img\b/i.test(html)) return html;
    const generic = [
        'https://placehold.net/1200x600.png',
        'https://placehold.net/800x600.png',
        'https://placehold.net/600x400.png',
        'https://placehold.net/600x800.png',
        'https://placehold.net/400x600.png',
        'https://placehold.net/600x600.png',
        'https://placehold.net/400x400.png',
    ];
    const map = [
        'https://placehold.net/map-1200x600.png',
        'https://placehold.net/map-600x400.png',
        'https://placehold.net/map-400x600.png',
        'https://placehold.net/map-600x600.png',
        'https://placehold.net/map-400x400.png',
    ];
    const avatar = [
        'https://placehold.net/avatar.svg',
        'https://placehold.net/avatar.png',
        'https://placehold.net/avatar-2.svg',
        'https://placehold.net/avatar-2.png',
        'https://placehold.net/avatar-3.svg',
        'https://placehold.net/avatar-3.png',
        'https://placehold.net/avatar-4.svg',
        'https://placehold.net/avatar-4.png',
        'https://placehold.net/avatar-5.svg',
        'https://placehold.net/avatar-5.png',
    ];
    const allowed = new Set([...generic, ...map, ...avatar]);
    let g = 0;
    let m = 0;
    let a = 0;

    return html.replace(/<img\b[^>]*>/gi, (tag) => {
        const srcMatch = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
        const currentSrc = (srcMatch?.[2] || '').trim();
        if (allowed.has(currentSrc)) return tag;

        const context = `${tag} ${currentSrc}`.toLowerCase();
        const isMap = /map|location|route|pin|geo/.test(context);
        const isAvatar = /avatar|profile|user|person|creator|author|commenter/.test(context);
        const dims = currentSrc.match(/(\d{2,4})x(\d{2,4})/i);
        const w = dims ? Number(dims[1]) : 0;
        const h = dims ? Number(dims[2]) : 0;
        const ratio = w > 0 && h > 0 ? w / h : 1;

        const nextSrc = isMap
            ? (ratio >= 1.8 ? map[0] : ratio >= 1.3 ? map[1] : ratio <= 0.78 ? map[2] : ratio > 0.9 && ratio < 1.1 ? map[3] : map[m++ % map.length])
            : isAvatar
                ? avatar[a++ % avatar.length]
                : (ratio >= 1.8 ? generic[0] : ratio >= 1.25 ? generic[1] : ratio <= 0.7 ? generic[3] : ratio <= 0.85 ? generic[4] : ratio > 0.9 && ratio < 1.1 ? generic[6] : generic[g++ % generic.length]);

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
    nextScreenSuggestions?: Array<{ name: string; why: string; priority: number }>;
};

type PlannerSuggestionContext = {
    appPrompt: string;
    platform: 'mobile' | 'tablet' | 'desktop';
    stylePreset: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
    modelProfile: DesignModelProfile;
    existingScreenNames: string[];
    styleReference?: string;
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
};

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

    const pushSuggestion = (label: string, screenNames: string[], tone: 'primary' | 'secondary') => {
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
        });
    };

    if (postgen?.callToAction?.primary) {
        pushSuggestion(postgen.callToAction.primary.label, postgen.callToAction.primary.screenNames, 'primary');
        if (postgen.callToAction.primary.screenNames.length > 1) {
            postgen.callToAction.primary.screenNames.forEach((name) => {
                pushSuggestion(`Generate ${name}`, [name], 'secondary');
            });
        }
    }
    if (postgen?.callToAction?.secondary) {
        pushSuggestion(postgen.callToAction.secondary.label, postgen.callToAction.secondary.screenNames, 'secondary');
        if (postgen.callToAction.secondary.screenNames.length > 1) {
            postgen.callToAction.secondary.screenNames.forEach((name) => {
                pushSuggestion(`Generate ${name}`, [name], 'secondary');
            });
        }
    }

    const extra = (postgen as (PlannerPostgenResponse | PlannerCtaPayload | undefined))?.nextScreenSuggestions || [];
    extra.forEach((item) => {
        pushSuggestion(`Generate ${item.name}`, [item.name], 'secondary');
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
    return raw.replace(/^["'`]+|["'`]+$/g, '').slice(0, 72).trim();
}

function isGenericProjectName(value: string | undefined): boolean {
    const name = String(value || '').trim().toLowerCase();
    if (!name) return true;
    return ['untitled', 'untitled project', 'new design', 'new project', 'chat'].includes(name);
}

function buildRouteChatSuggestionPayload(route: {
    recommendNextScreens?: boolean;
    nextScreenSuggestions?: Array<{ name: string; why: string; priority?: number }>;
}): PlannerCtaPayload | undefined {
    if (!route.recommendNextScreens) return undefined;
    const next = (route.nextScreenSuggestions || [])
        .slice(0, 6)
        .map((item, index) => ({
            name: item.name,
            why: item.why || 'Recommended next step.',
            priority: item.priority || index + 1,
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

    const sourceW = preview?.width || 375;
    const sourceH = preview?.height || 812;
    const thumbH = preview ? Math.max(1, Math.round(thumbWidth * (sourceH / sourceW))) : 170;
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

function renderTaggedDescription(text: string): ReactNode {
    const source = text || '';
    const blockPattern = /\[(h1|h2|h3|p|li)\]([\s\S]*?)\[\/\1\]/gi;
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

function bestEffortCompleteHtml(content: string): string {
    let html = extractLikelyHtml(content);
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

type ChatPanelProps = {
    initialRequest?: {
        id: string;
        prompt: string;
        images?: string[];
        platform?: 'mobile' | 'tablet' | 'desktop';
        stylePreset?: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
        modelProfile?: DesignModelProfile;
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
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [copiedMessageIds, setCopiedMessageIds] = useState<Record<string, boolean>>({});
    const [typedDoneByMessageId, setTypedDoneByMessageId] = useState<Record<string, boolean>>({});
    const [usedSuggestionKeysByMessage, setUsedSuggestionKeysByMessage] = useState<Record<string, string[]>>({});
    const [activeAssistantByUser, setActiveAssistantByUser] = useState<Record<string, string>>({});
    const [viewerImage, setViewerImage] = useState<{ src: string; alt?: string } | null>(null);
    const [composerScreenReferences, setComposerScreenReferences] = useState<ComposerScreenReference[]>([]);
    const [isMentionOpen, setIsMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionAnchorIndex, setMentionAnchorIndex] = useState<number | null>(null);
    const [mentionCursorIndex, setMentionCursorIndex] = useState<number | null>(null);
    const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
    const [renderedMessageCount, setRenderedMessageCount] = useState(INITIAL_MESSAGE_RENDER_COUNT);
    const [, setClockTick] = useState(0);
    const autoCollapsedRef = useRef(false);
    const copyResetTimersRef = useRef<Record<string, number>>({});
    const initialRequestSubmittedRef = useRef<string | null>(null);
    const previousMessageLengthRef = useRef(0);
    const previousScrollMessageLengthRef = useRef(0);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const styleMenuRef = useRef<HTMLDivElement>(null);
    const mentionMenuRef = useRef<HTMLDivElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const { messages, isGenerating, addMessage, updateMessage, setGenerating, setAbortController, abortGeneration } = useChatStore();
    const { updateScreen, spec, selectedPlatform, setPlatform, addScreens, removeScreen } = useDesignStore();
    const { setBoards, setFocusNodeId, setFocusNodeIds, removeBoard } = useCanvasStore();
    const { isEditMode, screenId: editScreenId, setActiveScreen } = useEditStore();
    const { modelProfile, setModelProfile, pushToast, removeToast } = useUiStore();
    const assistantMsgIdRef = useRef<string>('');
    const notificationGuideShownRef = useRef(false);
    const generationLoadingToastRef = useRef<string | null>(null);
    const editLoadingToastRef = useRef<string | null>(null);

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

    const notifySuccess = (title: string, message: string) => {
        pushToast({ kind: 'success', title, message });
        notifyWhenInBackground(title, message);
    };

    const notifyInfo = (title: string, message: string) => {
        pushToast({ kind: 'info', title, message });
        notifyWhenInBackground(title, message);
    };

    const notifyError = (title: string, message: string) => {
        pushToast({ kind: 'error', title, message });
        notifyWhenInBackground(title, message);
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
        if (!isMentionOpen) return [];
        const query = mentionQuery.trim().toLowerCase();
        const selected = new Set(composerScreenReferences.map((item) => item.screenId));
        return availableMentionScreens
            .filter((screen) => !selected.has(screen.screenId))
            .filter((screen) => !query || screen.name.toLowerCase().includes(query))
            .slice(0, 8);
    }, [availableMentionScreens, composerScreenReferences, isMentionOpen, mentionQuery]);

    useEffect(() => {
        setActiveAssistantByUser((prev) => {
            const next: Record<string, string> = {};
            let changed = false;
            Object.entries(assistantBranchesByUser).forEach(([userId, branchIds]) => {
                const existing = prev[userId];
                const value = existing && branchIds.includes(existing) ? existing : branchIds[branchIds.length - 1];
                if (existing !== value) changed = true;
                if (value) next[userId] = value;
            });
            if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
            return changed ? next : prev;
        });
    }, [assistantBranchesByUser]);

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
    }, [filteredMentionScreens.length, mentionQuery]);

    useEffect(() => {
        const validScreenIds = new Set((spec?.screens || []).map((screen) => screen.screenId));
        setComposerScreenReferences((prev) => prev.filter((item) => validScreenIds.has(item.screenId)));
    }, [spec?.screens]);

    useEffect(() => {
        if (!isMentionOpen) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (!mentionMenuRef.current) return;
            if (!mentionMenuRef.current.contains(event.target as Node) && event.target !== textareaRef.current) {
                setIsMentionOpen(false);
            }
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isMentionOpen]);

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
        const previousLength = previousMessageLengthRef.current;
        const nextLength = messages.length;
        previousMessageLengthRef.current = nextLength;

        if (nextLength === 0) {
            setRenderedMessageCount(INITIAL_MESSAGE_RENDER_COUNT);
            return;
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

    const visibleMessages = useMemo(() => {
        if (messages.length <= renderedMessageCount) return messages;
        return messages.slice(-renderedMessageCount);
    }, [messages, renderedMessageCount]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (!messagesEndRef.current) return;
        const previousLength = previousScrollMessageLengthRef.current;
        const largeJump = messages.length - previousLength > 12;
        previousScrollMessageLengthRef.current = messages.length;
        messagesEndRef.current.scrollIntoView({ behavior: largeJump ? 'auto' : 'smooth' });
    }, [messages.length]);

    useEffect(() => {
        if (!isGenerating) return;
        const timer = window.setInterval(() => setClockTick(v => v + 1), 1000);
        return () => window.clearInterval(timer);
    }, [isGenerating]);

    useEffect(() => {
        return () => {
            Object.values(copyResetTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
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
        setMentionQuery('');
        setMentionAnchorIndex(null);
        setMentionCursorIndex(null);
        setMentionActiveIndex(0);
    };

    const syncMentionState = (value: string, cursor: number) => {
        const beforeCursor = value.slice(0, cursor);
        const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
        if (!match) {
            closeMentionMenu();
            return;
        }
        const query = match[1] || '';
        const anchor = cursor - query.length - 1;
        setMentionQuery(query);
        setMentionAnchorIndex(anchor);
        setMentionCursorIndex(cursor);
        setIsMentionOpen(true);
    };

    const addComposerScreenReference = (screen: ComposerScreenReference) => {
        setComposerScreenReferences((prev) => {
            if (prev.some((item) => item.screenId === screen.screenId)) return prev;
            return [...prev, screen];
        });
    };

    const removeComposerScreenReference = (screenId: string) => {
        setComposerScreenReferences((prev) => prev.filter((item) => item.screenId !== screenId));
    };

    const selectMentionScreen = (screen: ComposerScreenReference) => {
        addComposerScreenReference(screen);
        const start = mentionAnchorIndex ?? 0;
        const end = mentionCursorIndex ?? start;
        const nextPrompt = `${prompt.slice(0, start)}${prompt.slice(end)}`.replace(/\s{2,}/g, ' ');
        setPrompt(nextPrompt);
        closeMentionMenu();
        window.setTimeout(() => {
            if (!textareaRef.current) return;
            const cursor = Math.max(0, Math.min(start, nextPrompt.length));
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(cursor, cursor);
        }, 0);
    };

    const getScreenReferencesFromComposer = (references: ComposerScreenReference[] = composerScreenReferences): HtmlScreen[] => {
        if (!references.length) return [];
        const currentScreens = useDesignStore.getState().spec?.screens || [];
        const byId = new Map(currentScreens.map((screen) => [screen.screenId, screen]));
        return references
            .map((item) => byId.get(item.screenId))
            .filter(Boolean) as HtmlScreen[];
    };

    const buildPlannerReferenceImages = async (screens: HtmlScreen[]): Promise<string[]> => {
        if (!screens.length) return [];
        const samples = screens.slice(0, 2);
        const images = await Promise.all(
            samples.map(async (screen) => {
                try {
                    const rendered = await apiClient.renderScreenImage({
                        html: screen.html,
                        width: Math.max(320, Math.min(1280, screen.width || 375)),
                        height: Math.max(480, Math.min(2200, screen.height || 812)),
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

        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                setImages(prev => [...prev, base64]);
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

    const handlePlannerCta = (messageId: string, screenNames: string[], label?: string) => {
        if (!Array.isArray(screenNames) || screenNames.length === 0 || isGenerating) return;
        const source = useChatStore.getState().messages.find((item) => item.id === messageId);
        const suggestionContext = (source?.meta?.plannerContext || null) as PlannerSuggestionContext | null;
        const basePrompt = String(suggestionContext?.appPrompt || source?.meta?.plannerPrompt || '').trim();
        if (!basePrompt) return;
        const suggestionKey = buildComposerSuggestionKey(screenNames);
        if (suggestionKey) {
            setUsedSuggestionKeysByMessage((prev) => {
                const existing = prev[messageId] || [];
                if (existing.includes(suggestionKey)) return prev;
                return {
                    ...prev,
                    [messageId]: [...existing, suggestionKey],
                };
            });
        }

        updateMessage(messageId, {
            meta: {
                ...(source?.meta || {}),
                plannerActionAt: Date.now(),
                plannerActionScreens: screenNames,
            }
        });

        const visiblePrompt = (label || `Generate ${screenNames.join(' + ')}`).trim();
        const targetPlatform = suggestionContext?.platform || selectedPlatform;
        const targetStyle = suggestionContext?.stylePreset || stylePreset;
        const targetModel = suggestionContext?.modelProfile || modelProfile;
        const targetExistingScreens = Array.isArray(suggestionContext?.existingScreenNames)
            ? suggestionContext!.existingScreenNames
            : [];
        const targetStyleReference = String(suggestionContext?.styleReference || '').trim();

        void handleGenerate(
            visiblePrompt,
            [],
            targetPlatform,
            targetStyle,
            targetModel,
            screenNames,
            basePrompt,
            targetExistingScreens,
            targetStyleReference
        );
    };

    const handlePlanOnly = async (
        existingUserMessageId?: string,
        overridePrompt?: string,
        overrideImages?: string[],
        incomingReferenceScreens?: HtmlScreen[]
    ) => {
        const requestPrompt = (overridePrompt ?? prompt).trim();
        if (!requestPrompt || isGenerating) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            notifyError('No internet connection', 'Reconnect and try planning again.');
            return;
        }

        const imagesToSend = overrideImages ? [...overrideImages] : [...images];
        const referenceScreens = incomingReferenceScreens || [];
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
            setComposerScreenReferences([]);
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
        const hasScreens = Boolean(spec?.screens?.length);

        try {
            const plannerReferenceImages = await buildPlannerVisionInputs(referenceScreens, imagesToSend);
            const route = await apiClient.plan({
                phase: 'route',
                appPrompt: requestPromptWithReferences,
                platform: selectedPlatform,
                stylePreset,
                screensGenerated: (spec?.screens || []).map((screen) => ({ name: screen.name })),
                referenceImages: plannerReferenceImages,
                preferredModel: modelProfile === 'fast' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile',
            });

            if (route.phase === 'route' && route.intent === 'chat_assist') {
                const routeSuggestions = buildRouteChatSuggestionPayload(route);
                updateMessage(assistantMsgId, {
                    content: (route.assistantResponse || 'Here is a quick take:'),
                    status: 'complete',
                    meta: {
                        ...(useChatStore.getState().messages.find((m) => m.id === assistantMsgId)?.meta || {}),
                        thinkingMs: Date.now() - startTime,
                        plannerPrompt: requestPrompt,
                        plannerRoute: route,
                        plannerPostgen: routeSuggestions,
                    }
                });
                notifySuccess('Assistant response ready', 'Planner answered directly based on your request.');
                return;
            }

            const response = await apiClient.plan({
                phase: hasScreens ? 'postgen' : 'plan',
                appPrompt: requestPromptWithReferences,
                platform: selectedPlatform,
                stylePreset,
                screenCountDesired: 2,
                screensGenerated: (spec?.screens || []).map((screen) => ({ name: screen.name })),
                referenceImages: plannerReferenceImages,
                preferredModel: modelProfile === 'fast' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile',
            });

            if (response.phase === 'postgen') {
                const snapshotScreens = useDesignStore.getState().spec?.screens || [];
                updateMessage(assistantMsgId, {
                    content: formatPostgenSuggestionText(response),
                    status: 'complete',
                    meta: {
                        ...(useChatStore.getState().messages.find((m) => m.id === assistantMsgId)?.meta || {}),
                        thinkingMs: Date.now() - startTime,
                        plannerPrompt: requestPrompt,
                        plannerPostgen: response,
                        plannerContext: {
                            appPrompt: requestPrompt,
                            platform: selectedPlatform,
                            stylePreset,
                            modelProfile,
                            existingScreenNames: snapshotScreens.map((screen) => screen.name),
                            styleReference: buildContinuationStyleReference(snapshotScreens),
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
                        } as PlannerSuggestionContext,
                    }
                });
            } else {
                throw new Error('Unexpected planner response for plan mode.');
            }

            notifySuccess('Plan ready', 'Review suggested screens and generate from the CTA buttons.');
        } catch (error) {
            const friendly = getUserFacingError(error);
            updateMessage(assistantMsgId, {
                content: toTaggedErrorMessage(error),
                status: 'error',
                meta: {
                    ...(useChatStore.getState().messages.find((m) => m.id === assistantMsgId)?.meta || {}),
                    thinkingMs: Date.now() - startTime,
                }
            });
            notifyError(friendly.title, friendly.summary);
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
        allowPlannerFlow?: boolean
    ) => {
        const requestPrompt = (incomingPrompt ?? prompt).trim();
        if (!requestPrompt || isGenerating) return;
        const usePlanner = allowPlannerFlow ?? planMode;
        const hasPriorScreens = (spec?.screens?.length || 0) > 0;
        const hasPriorUserMessages = messages.some((message) => message.role === 'user');
        const shouldNameProjectOnFirstRequest = !hasPriorScreens && !hasPriorUserMessages && isGenericProjectName(spec?.name);
        const referenceScreens = incomingReferenceScreens || [];
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
        const modelProfileToUse = incomingModelProfile || modelProfile;
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
            setComposerScreenReferences([]);
            closeMentionMenu();
        }
        setGenerating(true);

        const effectiveDimensions = platformToUse === 'desktop'
            ? { width: 1280, height: 1200 }
            : platformToUse === 'tablet'
                ? { width: 768, height: 1024 }
                : { width: 375, height: 812 };
        let startTime = Date.now();
        let plannerPlan: PlannerPlanResponse | null = null;
        let plannerSuggestedProjectName = '';
        let generationPromptFromPlanner = requestPromptWithReferences;
        let plannerReferenceImages: string[] = [];

        try {
            console.info('[UI] generate: start (stream)', {
                prompt: requestPrompt,
                stylePreset: styleToUse,
                platform: platformToUse,
                images: imagesToSend,
                modelProfile: modelProfileToUse,
            });
            if (usePlanner || shouldNameProjectOnFirstRequest) {
                plannerReferenceImages = await buildPlannerVisionInputs(referenceScreens, imagesToSend);
                try {
                    const discoveryPlan = await apiClient.plan({
                        phase: 'plan',
                        appPrompt: appPromptForPlanning,
                        platform: platformToUse,
                        stylePreset: styleToUse,
                        screenCountDesired: incomingTargetScreens?.length || 2,
                        screensGenerated: existingScreenNames.map((name) => ({ name })),
                        referenceImages: plannerReferenceImages,
                        preferredModel: modelProfileToUse === 'fast' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile',
                    });
                    if (discoveryPlan.phase === 'plan' || discoveryPlan.phase === 'discovery') {
                        plannerPlan = discoveryPlan;
                        plannerSuggestedProjectName = normalizeSuggestedProjectName(discoveryPlan.appName);
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
                ? Math.max(...existingBoards.map(b => b.x + (b.width || 375))) + 100
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

            if (preferredModel) {
                const generatedIds: string[] = [];
                const regen = await apiClient.generate({
                    prompt: generationPromptFromPlanner,
                    stylePreset: styleToUse,
                    platform: platformToUse,
                    images: imagesToSend,
                    preferredModel,
                }, controller.signal);

                regen.designSpec.screens.forEach((screen, index) => {
                    const screenId = uuidv4();
                    addScreens([{
                        screenId,
                        name: screen.name,
                        html: screen.html,
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
                });

                let postgenSummary = '';
                let postgenData: PlannerPostgenResponse | null = null;
                if (usePlanner) {
                    try {
                        const postgen = await apiClient.plan({
                            phase: 'postgen',
                            appPrompt: appPromptForPlanning,
                            platform: platformToUse,
                            stylePreset: styleToUse,
                            screensGenerated: regen.designSpec.screens.map((screen) => ({ name: screen.name })),
                            referenceImages: plannerReferenceImages,
                            preferredModel: 'llama-3.3-70b-versatile',
                        });
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
                        ...(usePlanner ? {
                            plannerPrompt: appPromptForPlanning,
                            plannerPostgen: postgenData || undefined,
                            plannerContext: {
                                appPrompt: appPromptForPlanning,
                                platform: platformToUse,
                                stylePreset: styleToUse,
                                modelProfile: modelProfileToUse,
                                existingScreenNames: snapshotScreenNames,
                                styleReference: snapshotStyleReference,
                            } as PlannerSuggestionContext,
                        } : {}),
                    }
                });
                if (plannerSuggestedProjectName) {
                    applyProjectName(plannerSuggestedProjectName);
                }
                if (generatedIds.length > 0) {
                    setFocusNodeIds(generatedIds);
                }
                notifySuccess(
                    'Generation complete',
                    `Created ${regen.designSpec.screens.length} screen${regen.designSpec.screens.length === 1 ? '' : 's'}.`
                );
                console.info('[UI] generate: complete (fast model)', { screens: regen.designSpec.screens.length });
                return;
            }

            await apiClient.generateStream({
                prompt: generationPromptFromPlanner,
                stylePreset: styleToUse,
                platform: platformToUse,
                images: imagesToSend,
                preferredModel,
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
                        }, controller.signal);
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
                    preferredModel,
                }, controller.signal);

                regen.designSpec.screens.forEach((screen, index) => {
                    const seq = createdSeqs[index];
                    if (seq !== undefined) {
                        const targetId = screenIdBySeq.get(seq);
                        if (targetId) {
                            updateScreen(targetId, screen.html, 'complete', screen.width, screen.height, screen.name);
                            return;
                        }
                    }

                    const screenId = uuidv4();
                    addScreens([{
                        screenId,
                        name: screen.name,
                        html: screen.html,
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
                });

                let postgenSummary = '';
                let postgenData: PlannerPostgenResponse | null = null;
                if (usePlanner) {
                    try {
                        const postgen = await apiClient.plan({
                            phase: 'postgen',
                            appPrompt: appPromptForPlanning,
                            platform: platformToUse,
                            stylePreset: styleToUse,
                            screensGenerated: regen.designSpec.screens.map((screen) => ({ name: screen.name })),
                            referenceImages: plannerReferenceImages,
                            preferredModel: 'llama-3.3-70b-versatile',
                        });
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
                        ...(usePlanner ? {
                            plannerPrompt: appPromptForPlanning,
                            plannerPostgen: postgenData || undefined,
                            plannerContext: {
                                appPrompt: appPromptForPlanning,
                                platform: platformToUse,
                                stylePreset: styleToUse,
                                modelProfile: modelProfileToUse,
                                existingScreenNames: snapshotScreenNames,
                                styleReference: snapshotStyleReference,
                            } as PlannerSuggestionContext,
                        } : {}),
                    }
                });
                if (plannerSuggestedProjectName) {
                    applyProjectName(plannerSuggestedProjectName);
                }
                const fallbackIds = regen.designSpec.screens
                    .map((_, index) => screenIdBySeq.get(createdSeqs[index] as number))
                    .filter(Boolean) as string[];
                if (fallbackIds.length > 0) {
                    setFocusNodeIds(fallbackIds);
                }
                notifySuccess(
                    'Generation complete',
                    `Created ${regen.designSpec.screens.length} screen${regen.designSpec.screens.length === 1 ? '' : 's'}.`
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

            let postgenSummary = '';
            let postgenData: PlannerPostgenResponse | null = null;
            if (usePlanner) {
                try {
                    const postgen = await apiClient.plan({
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
                    });
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
                    ...(usePlanner ? {
                        plannerPrompt: appPromptForPlanning,
                        plannerPostgen: postgenData || undefined,
                        plannerContext: {
                            appPrompt: appPromptForPlanning,
                            platform: platformToUse,
                            stylePreset: styleToUse,
                            modelProfile: modelProfileToUse,
                            existingScreenNames: snapshotScreenNames,
                            styleReference: snapshotStyleReference,
                        } as PlannerSuggestionContext,
                    } : {}),
                }
            });
            if (plannerSuggestedProjectName) {
                applyProjectName(plannerSuggestedProjectName);
            }
            const generatedIds = createdSeqs
                .map((seq) => screenIdBySeq.get(seq))
                .filter(Boolean) as string[];
            if (generatedIds.length > 0) {
                setFocusNodeIds(generatedIds);
            }
            notifySuccess(
                'Generation complete',
                `Created ${completedCount} screen${completedCount === 1 ? '' : 's'}.`
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
                    }
                });
                notifyInfo('Generation stopped', 'The request was cancelled.');
                return;
            }
            updateMessage(assistantMsgId, {
                content: toTaggedErrorMessage(error),
                status: 'error',
                meta: {
                    ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                    thinkingMs: Date.now() - startTime,
                }
            });
            const friendly = getUserFacingError(error);
            notifyError(friendly.title, friendly.summary);
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
        const nextPlatform = initialRequest?.platform;
        const nextStylePreset = initialRequest?.stylePreset;
        const nextModelProfile = initialRequest?.modelProfile;
        if (!requestId || !next) return;
        if (messages.length > 0 || isGenerating) return;
        if (initialRequestSubmittedRef.current === requestId) return;

        initialRequestSubmittedRef.current = requestId;
        if (nextPlatform) setPlatform(nextPlatform);
        if (nextStylePreset) setStylePreset(nextStylePreset);
        if (nextModelProfile) setModelProfile(nextModelProfile);
        void handleGenerate(next, nextImages, nextPlatform, nextStylePreset, nextModelProfile);
    }, [initialRequest, messages.length, isGenerating]);

    const handleEditForScreen = async (
        targetScreen: HtmlScreen,
        instruction: string,
        attachedImages?: string[],
        existingUserMessageId?: string,
        incomingReferenceScreens?: HtmlScreen[]
    ) => {
        if (!instruction.trim() || isGenerating) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            notifyError('No internet connection', 'Reconnect and try editing again.');
            return;
        }
        void ensureNotificationPermission();

        const screenRef = {
            id: targetScreen.screenId,
            label: targetScreen.name,
            type: targetScreen.width >= 1024 ? 'desktop' : targetScreen.width >= 600 ? 'tablet' : 'mobile'
        } as const;

        const editImages = Array.isArray(attachedImages) ? attachedImages : [];
        const userMsgId = existingUserMessageId || addMessage('user', instruction, editImages.length ? editImages : undefined, screenRef);
        const assistantMsgId = addMessage('assistant', `Updating...`, undefined, screenRef);
        const referenceScreens = incomingReferenceScreens || [];
        const referenceMeta = buildScreenReferenceMeta([targetScreen, ...referenceScreens]);
        updateMessage(userMsgId, {
            meta: {
                ...(useChatStore.getState().messages.find(m => m.id === userMsgId)?.meta || {}),
                requestKind: 'edit',
                livePreview: false,
                ...referenceMeta,
            }
        });
        const currentPrompt = instruction;
        startLoadingToast(
            editLoadingToastRef,
            'Applying edit',
            'Updating the selected screen...'
        );
        setPrompt((prev) => (prev.trim() === instruction.trim() ? '' : prev));
        setGenerating(true);
        const startTime = Date.now();
        updateMessage(assistantMsgId, {
            meta: {
                ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                livePreview: true,
                feedbackStart: startTime,
                parentUserId: userMsgId,
                typedComplete: false,
            }
        });
        setActiveBranchForUser(userMsgId, assistantMsgId);

        try {
            setFocusNodeId(targetScreen.screenId);
            updateScreen(targetScreen.screenId, targetScreen.html, 'streaming', targetScreen.width, targetScreen.height, targetScreen.name);
            const controller = new AbortController();
            setAbortController(controller);
            const response = await apiClient.edit({
                instruction: currentPrompt,
                html: targetScreen.html,
                screenId: targetScreen.screenId,
                images: editImages,
                preferredModel: getPreferredTextModel(modelProfile),
            }, controller.signal);

            updateScreen(targetScreen.screenId, response.html, 'complete', targetScreen.width, targetScreen.height, targetScreen.name);
            if (isEditMode && editScreenId === targetScreen.screenId) {
                setActiveScreen(targetScreen.screenId, response.html);
            }
            setFocusNodeIds([targetScreen.screenId]);

            let postgenSummary = '';
            let postgenData: PlannerPostgenResponse | null = null;
            if (planMode) {
                try {
                    const plannerReferenceImages = await buildPlannerVisionInputs(referenceScreens, editImages);
                    const postgen = await apiClient.plan({
                        phase: 'postgen',
                        appPrompt: currentPrompt,
                        platform: selectedPlatform,
                        stylePreset,
                        screensGenerated: (useDesignStore.getState().spec?.screens || []).map((screen) => ({ name: screen.name })),
                        referenceImages: plannerReferenceImages,
                        preferredModel: 'llama-3.3-70b-versatile',
                    });
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
            const content = `${response.description?.trim()
                ? response.description
                : `Updated ${targetScreen.name} based on your feedback.`}${postgenSummary ? `\n\n${postgenSummary}` : ''}`.trim();

            updateMessage(assistantMsgId, {
                content,
                status: 'complete',
                meta: {
                    ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                    thinkingMs: Date.now() - startTime,
                    ...(planMode ? {
                        plannerPrompt: currentPrompt,
                        plannerPostgen: postgenData || undefined,
                        plannerContext: {
                            appPrompt: currentPrompt,
                            platform: selectedPlatform,
                            stylePreset,
                            modelProfile,
                            existingScreenNames: snapshotScreenNames,
                            styleReference: snapshotStyleReference,
                        } as PlannerSuggestionContext,
                    } : {}),
                }
            });
            notifySuccess('Edit complete', `${targetScreen.name} was updated successfully.`);
        } catch (error) {
            const friendly = getUserFacingError(error);
            updateScreen(targetScreen.screenId, targetScreen.html, 'complete', targetScreen.width, targetScreen.height, targetScreen.name);
            updateMessage(assistantMsgId, {
                content: toTaggedErrorMessage(error),
                status: 'error',
                meta: {
                    ...(useChatStore.getState().messages.find(m => m.id === assistantMsgId)?.meta || {}),
                    thinkingMs: Date.now() - startTime,
                }
            });
            notifyError(friendly.title, friendly.summary);
        } finally {
            setAbortController(null);
            setGenerating(false);
            clearLoadingToast(editLoadingToastRef);
        }
    };

    const handleRoutedGenerateOrEdit = async () => {
        const requestPrompt = prompt.trim();
        if (!requestPrompt || isGenerating) return;
        const attachedImages = [...images];
        const referenceScreens = getScreenReferencesFromComposer();
        setComposerScreenReferences([]);
        closeMentionMenu();
        if (attachedImages.length > 0) {
            setImages([]);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
        await handleGenerate(
            requestPrompt,
            attachedImages,
            selectedPlatform,
            stylePreset,
            modelProfile,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            referenceScreens,
            false
        );
    };

    const handleSubmit = () => {
        const referenceScreens = getScreenReferencesFromComposer();
        if (planMode) {
            void handlePlanOnly(undefined, undefined, undefined, referenceScreens);
        } else {
            void handleRoutedGenerateOrEdit();
        }
    };

    const handleRetryUserMessage = async (userMessageId: string) => {
        if (isGenerating) return;
        const source = messages.find((message) => message.id === userMessageId && message.role === 'user');
        if (!source) return;

        const requestKind = String((source.meta as any)?.requestKind || 'generate');
        const retryPrompt = source.content || '';
        const retryImages = Array.isArray(source.images) ? source.images : [];
        const retryScreenIds = Array.isArray((source.meta as any)?.screenIds)
            ? (((source.meta as any)?.screenIds as string[]).filter(Boolean))
            : [];
        const retryReferences = getScreenReferencesFromComposer(
            retryScreenIds.map((screenId) => ({ screenId, name: '' }))
        );

        if (requestKind === 'plan') {
            await handlePlanOnly(userMessageId, retryPrompt, retryImages, retryReferences);
            return;
        }

        if (requestKind === 'edit' && source.screenRef?.id) {
            const target = useDesignStore.getState().spec?.screens.find((screen) => screen.screenId === source.screenRef?.id);
            if (target) {
                await handleEditForScreen(target, retryPrompt, retryImages, userMessageId, retryReferences);
                return;
            }
        }

        if (requestKind === 'assist') {
            await handleGenerate(
                retryPrompt,
                retryImages,
                selectedPlatform,
                stylePreset,
                modelProfile,
                undefined,
                retryPrompt,
                undefined,
                undefined,
                userMessageId,
                retryReferences,
                false
            );
            return;
        }

        await handleGenerate(
            retryPrompt,
            retryImages,
            selectedPlatform,
            stylePreset,
            modelProfile,
            undefined,
            retryPrompt,
            undefined,
            undefined,
            userMessageId,
            retryReferences,
            false
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
        if (isMentionOpen && filteredMentionScreens.length > 0) {
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
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const nextValue = e.target.value;
        const cursor = e.target.selectionStart ?? nextValue.length;
        setPrompt(nextValue);
        syncMentionState(nextValue, cursor);
    };

    const handlePromptCursorSync = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
        const target = e.currentTarget;
        const cursor = target.selectionStart ?? target.value.length;
        syncMentionState(target.value, cursor);
    };

    const hasPromptText = prompt.trim().length > 0;
    const showSendAction = hasPromptText;
    const actionIsStop = isGenerating || isRecording;
    const actionDisabled = !showSendAction && !isGenerating && isTranscribing;
    const StyleIcon = stylePreset === 'minimal'
        ? LineSquiggle
        : stylePreset === 'vibrant'
            ? Palette
            : stylePreset === 'luxury'
                ? Gem
                : stylePreset === 'playful'
                    ? Smile
                    : CircleStar;
    const styleButtonTone = stylePreset === 'minimal'
        ? 'bg-[var(--ui-surface-4)] text-[var(--ui-text)] ring-[var(--ui-border-light)] hover:bg-[var(--ui-surface-4)]'
        : stylePreset === 'vibrant'
            ? 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/35 hover:bg-emerald-400/20'
            : stylePreset === 'luxury'
                ? 'bg-amber-400/15 text-amber-200 ring-amber-300/35 hover:bg-amber-400/20'
                : stylePreset === 'playful'
                    ? 'bg-fuchsia-400/15 text-fuchsia-200 ring-fuchsia-300/35 hover:bg-fuchsia-400/20'
                    : 'bg-indigo-400/15 text-indigo-200 ring-indigo-300/35 hover:bg-indigo-400/20';
    const hiddenMessageCount = Math.max(0, messages.length - visibleMessages.length);

    return (
        <>
            <div
                className={`group flex flex-col h-full text-[var(--ui-text)] font-sans transition-all duration-300 ease-in-out relative bg-transparent ${isCollapsed ? 'w-0' : 'w-[var(--chat-width)]'
                    }`}
            >
                {/* Collapse Button Header */}
                {!isEditMode && (
                    <div className="absolute top-4 -right-12 z-20">
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className={`p-2 rounded-lg bg-[var(--ui-surface-4)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] shadow-xl transition-all ${isCollapsed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                }`}
                            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                        >
                            {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                        </button>
                    </div>
                )}

                <div className={`relative flex flex-col h-full w-[var(--chat-width)] overflow-hidden transition-opacity duration-200 ${isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    {/* Header / Date */}
                    <div className="py-4 px-5 flex items-center justify-between sticky top-0 z-10 bg-transparent">
                        <div className="leading-tight">
                            <div className="inline-flex items-center gap-2">
                                <img src={appLogo} alt="EazyUI logo" className="h-4 w-4 object-contain" />
                                <p className="text-[13px] font-semibold text-[var(--ui-text)] tracking-wide">{spec?.name?.trim() || 'Chat'}</p>
                            </div>
                            <p className="text-[10px] font-medium text-[var(--ui-text-subtle)] uppercase tracking-[0.12em]">
                                {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </p>
                        </div>
                        {!isEditMode && (
                            <button
                                onClick={() => setIsCollapsed(true)}
                                className="p-2 rounded-lg hover:bg-[var(--ui-surface-3)] text-[var(--ui-text-subtle)] hover:text-[var(--ui-text-muted)] transition-colors"
                                title="Collapse Sidebar"
                            >
                                <ChevronLeft size={16} />
                            </button>
                        )}
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-7 scrollbar-hide">
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
                                        {(((message.screenRef ? [message.screenRef.id] : ((message.meta?.screenIds as string[]) || [])).length > 0) || (message.images && message.images.length > 0)) && (
                                            <div className="flex flex-wrap items-end gap-2 justify-end mb-1 w-full">
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
                                                {message.images && message.images.map((img, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => setViewerImage({ src: img, alt: `attachment-${idx + 1}` })}
                                                        className="relative w-20 h-20 rounded-xl overflow-hidden border border-[var(--ui-border)] shadow-sm group focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
                                                        title="Open image"
                                                    >
                                                        <img src={img} alt="attached" className="w-full h-full object-cover" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
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
                                    </div>
                                ) : (
                                    <div className="w-full max-w-[95%] space-y-2">
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
                                                                            <Loader2 size={13} className="text-indigo-400 animate-spin" />
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
                                            {message.status === 'complete' && ((((message.meta as any)?.typedComplete === true) || typedDoneByMessageId[message.id]) && (() => {
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
                                                                onClick={() => handlePlannerCta(item.messageId, item.screenNames, item.label)}
                                                                disabled={isGenerating}
                                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold ring-1 shadow-sm disabled:opacity-55 disabled:cursor-not-allowed transition-colors ${item.tone === 'primary'
                                                                    ? 'bg-indigo-600 text-indigo-100 ring-indigo-300/60 hover:bg-indigo-500'
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
                                )}
                            </div>
                        );
                        })}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Chat Input Container */}
                    <div className="mx-4 mb-6 relative bg-[var(--ui-surface-1)] rounded-[20px] border border-[var(--ui-border)] p-3 shadow-2xl transition-all flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={togglePlanMode}
                            className={`absolute -top-10 right-1 sm:right-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold ring-1 shadow-lg transition-colors ${planMode
                                ? 'bg-indigo-600 text-indigo-100 ring-indigo-300/60 hover:bg-indigo-500'
                                : 'bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] ring-[var(--ui-border)] hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text)]'
                                }`}
                            title={planMode ? 'Disable plan mode' : 'Enable plan mode'}
                        >
                            <Sparkles size={12} />
                            <span>Plan mode</span>
                        </button>


                        {/* Text Area & Images */}
                        <div className="flex-1 min-w-0 relative">
                            {composerScreenReferences.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-2 px-1 pb-2 border-b border-[var(--ui-border)]">
                                    {composerScreenReferences.map((item) => (
                                        <div
                                            key={item.screenId}
                                            className="inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--ui-surface-3)] text-[var(--ui-text)] ring-1 ring-[var(--ui-border)]"
                                        >
                                            <span className="truncate max-w-[170px]">@{item.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeComposerScreenReference(item.screenId)}
                                                className="inline-flex items-center justify-center rounded-full text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                                                title={`Remove ${item.name}`}
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {images.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-2 px-1 pb-2 border-b border-[var(--ui-border)]">
                                    {images.map((img, idx) => (
                                        <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-[var(--ui-border)] shrink-0">
                                            <img src={img} alt="upload" className="w-full h-full object-cover" />
                                            <button
                                                onClick={() => removeImage(idx)}
                                                className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={14} className="text-[var(--ui-text)]" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <textarea
                                name=""
                                id=""
                                ref={textareaRef}
                                value={prompt}
                                onChange={handlePromptChange}
                                onClick={handlePromptCursorSync}
                                onKeyUp={handlePromptCursorSync}
                                onKeyDown={handleKeyDown}
                                placeholder="Describe your UI you want to create... (type @ to reference screens)"
                                disabled={isGenerating}
                                className="no-focus-ring w-full bg-transparent text-[var(--ui-text)] text-[16px] min-h-[48px] max-h-[200px] resize-none outline-none placeholder:text-[13px] placeholder:text-[var(--ui-text-subtle)] px-2 py-1 leading-relaxed"
                                style={{ border: 'none', boxShadow: 'none' }}
                            />
                            {isMentionOpen && filteredMentionScreens.length > 0 && (
                                <div
                                    ref={mentionMenuRef}
                                    className="absolute left-2 right-2 bottom-[2px] mb-14 bg-[var(--ui-popover)] border border-[var(--ui-border)] rounded-xl shadow-2xl max-h-56 overflow-y-auto z-50"
                                >
                                    {filteredMentionScreens.map((screen, index) => (
                                        <button
                                            key={screen.screenId}
                                            type="button"
                                            onMouseDown={(event) => {
                                                event.preventDefault();
                                                selectMentionScreen(screen);
                                            }}
                                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${index === mentionActiveIndex
                                                ? 'bg-indigo-500/20 text-[var(--ui-text)]'
                                                : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text)]'
                                                }`}
                                        >
                                            <span className="font-medium">@{screen.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Bottom Controls Row */}
                        <div className="flex items-center justify-between pt-1">

                            {/* Left: Attach & Platform */}
                            <div className="flex items-center gap-2">
                                {/* Attach Button */}
                                <button
                                    className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] transition-all ring-1 ring-[var(--ui-border)]"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Add Image"
                                >
                                    <Plus size={18} />
                                </button>

                                {/* Platform Selector (Pill) */}
                                <div className="flex items-center bg-[var(--ui-surface-3)] rounded-full p-1 ring-1 ring-[var(--ui-border)]">
                                    {(['mobile', 'tablet', 'desktop'] as const).map((p) => (
                                        <button
                                            key={p}
                                            onClick={() => setPlatform(p)}
                                            className={`p-1.5 rounded-full transition-all ${selectedPlatform === p
                                                ? 'bg-[var(--ui-surface-4)] text-[var(--ui-text)] shadow-sm'
                                                : 'text-[var(--ui-text-subtle)] hover:text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)]'
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
                                <div className="flex items-center bg-[var(--ui-surface-3)] rounded-full p-1 ring-1 ring-[var(--ui-border)]">
                                    <button
                                        type="button"
                                        onClick={() => setModelProfile('fast')}
                                        className={`h-8 w-8 rounded-full text-[11px] font-semibold transition-all inline-flex items-center justify-center ${modelProfile === 'fast'
                                            ? 'bg-amber-500/20 text-[var(--ui-text)] ring-1 ring-amber-400/40'
                                            : 'text-amber-400 hover:text-amber-200 hover:bg-[var(--ui-surface-3)]'
                                            }`}
                                        title="Fast model"
                                    >
                                        <Zap size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModelProfile('quality')}
                                        className={`h-8 w-8 rounded-full text-[11px] font-semibold transition-all inline-flex items-center justify-center ${modelProfile === 'quality'
                                            ? 'bg-indigo-500/20 text-[var(--ui-text)] ring-1 ring-indigo-300/40'
                                            : 'text-indigo-400 hover:text-indigo-200 hover:bg-[var(--ui-surface-3)]'
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
                                        <div className="absolute bottom-12 right-0 w-40 bg-[var(--ui-popover)] border border-[var(--ui-border)] rounded-xl shadow-2xl p-2 z-50">
                                            {(['modern', 'minimal', 'vibrant', 'luxury', 'playful'] as const).map((preset) => (
                                                <button
                                                    key={preset}
                                                    onClick={() => {
                                                        setStylePreset(preset);
                                                        setShowStyleMenu(false);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${stylePreset === preset
                                                        ? 'bg-indigo-500/20 text-[var(--ui-text)]'
                                                        : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]'
                                                        }`}
                                                >
                                                    {preset}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isGenerating) {
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
                                    className={`w-9 h-9 rounded-[12px] flex items-center justify-center transition-all ${isGenerating
                                        ? 'bg-[var(--ui-surface-4)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] ring-1 ring-[var(--ui-border-light)]'
                                        : isRecording
                                            ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-300/25'
                                            : showSendAction
                                                ? 'bg-indigo-500 text-[var(--ui-text)] hover:bg-indigo-400 shadow-lg shadow-indigo-500/20'
                                                : 'bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] ring-1 ring-[var(--ui-border)]'
                                        }`}
                                    title={isGenerating
                                        ? 'Stop generation'
                                        : showSendAction
                                            ? 'Send prompt'
                                            : isRecording
                                                ? 'Stop recording'
                                                : isTranscribing
                                                    ? 'Transcribing...'
                                                    : 'Record voice'}
                                >
                                    {actionIsStop ? (
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
