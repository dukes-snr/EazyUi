// ============================================================================
// Debug Response Page
// ----------------------------------------------------------------------------
// Internal tool for manually injecting an AI response into a workspace.
// Paste the raw streamed markup the backend would emit for /api/generate-stream
// (i.e. <description>, <activity>, and <screen name="…">…</screen> blocks),
// or a copied debug JSON payload, preview it parsed, then send it into a fresh
// project exactly as if the AI produced it.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bug, ClipboardPaste, Code2, Copy, Check, Send, Trash2, AlertTriangle, Eye, Loader2, Figma } from 'lucide-react';
import {
    parseDebugResponse,
    writeDebugInjectPayload,
    type ParsedDebugResponse,
} from '../../utils/debugResponse';
import { copyFigmaPayloadToClipboard } from '../../utils/exportScreens';
import type { HtmlScreen } from '../../api/client';
import { ReadonlyDeviceNode } from '../canvas/DeviceNode';
import { useCanvasStore } from '../../stores/canvas-store';

const STORAGE_KEY = 'eazyui:debug-response-draft';

const SAMPLE = `<description>A minimal two-screen onboarding flow.</description>
<activity id="plan" status="completed" tools="design-system" type="plan">Setting up the design system</activity>
<screen name="Welcome">
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-bg text-text min-h-screen flex flex-col items-center justify-center gap-6 p-8">
  <h1 class="text-3xl font-semibold">Welcome</h1>
  <p class="text-muted">Get started in seconds.</p>
  <button class="bg-accent text-white rounded-xl px-6 py-3">Continue</button>
</body>
</html>
</screen>
<screen name="Sign In">
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-bg text-text min-h-screen flex flex-col gap-4 p-8">
  <h1 class="text-2xl font-semibold">Sign in</h1>
  <input class="bg-surface rounded-xl px-4 py-3" placeholder="Email" />
  <input class="bg-surface rounded-xl px-4 py-3" placeholder="Password" type="password" />
  <button class="bg-accent text-white rounded-xl px-6 py-3">Sign in</button>
</body>
</html>
</screen>`;

type Platform = 'mobile' | 'tablet' | 'desktop';
type DeviceDisplayMode = 'framed' | 'clean';

interface Props {
    onNavigate: (path: string, search?: string) => void;
}

export function DebugResponsePage({ onNavigate }: Props) {
    const [raw, setRaw] = useState('');
    const [platform, setPlatform] = useState<Platform>('mobile');
    const [stylePreset, setStylePreset] = useState('modern');
    const [autoParse, setAutoParse] = useState(true);
    const [copiedJson, setCopiedJson] = useState(false);
    const [copiedRaw, setCopiedRaw] = useState(false);
    const [copiedFigma, setCopiedFigma] = useState(false);
    const [copyingFigma, setCopyingFigma] = useState(false);
    const [figmaError, setFigmaError] = useState<string | null>(null);
    const [hasInjected, setHasInjected] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Restore last draft so reloads don't lose work.
    useEffect(() => {
        try {
            const saved = window.sessionStorage.getItem(STORAGE_KEY);
            if (saved) setRaw(saved);
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        try {
            if (raw) window.sessionStorage.setItem(STORAGE_KEY, raw);
        } catch {
            // ignore
        }
    }, [raw]);

    const parseResult = useMemo<ParsedDebugResponse | null>(() => {
        if (!autoParse || !raw.trim()) return null;
        const result = parseDebugResponse(raw, { platform, stylePreset });
        return result.ok ? result.result! : null;
    }, [raw, autoParse, platform, stylePreset]);

    const error = useMemo<string | null>(() => {
        if (!raw.trim()) return null;
        if (parseResult) return null;
        const result = parseDebugResponse(raw, { platform, stylePreset });
        return result.ok ? null : result.error || 'Could not parse the response.';
    }, [raw, parseResult, platform, stylePreset]);

    const handlePasteClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                setRaw(text);
                textareaRef.current?.focus();
            }
        } catch {
            // Clipboard may be unavailable; user can paste manually.
        }
    };

    const handleClear = () => {
        setRaw('');
        try {
            window.sessionStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
        textareaRef.current?.focus();
    };

    const handleInject = () => {
        const result = parseDebugResponse(raw, { platform, stylePreset });
        if (!result.ok || !result.result) return;
        writeDebugInjectPayload({
            designSpec: result.result.designSpec,
            source: 'debug',
            createdAt: new Date().toISOString(),
        });
        setHasInjected(true);
        // A fresh project will pick the stashed payload up during hydration.
        onNavigate('/app/projects/new');
    };

    const handleCopyJson = async () => {
        if (!parseResult) return;
        try {
            await navigator.clipboard.writeText(JSON.stringify(parseResult.designSpec, null, 2));
            setCopiedJson(true);
            window.setTimeout(() => setCopiedJson(false), 1600);
        } catch {
            // ignore
        }
    };

    const handleCopyRaw = async () => {
        if (!raw) return;
        try {
            await navigator.clipboard.writeText(raw);
            setCopiedRaw(true);
            window.setTimeout(() => setCopiedRaw(false), 1600);
        } catch {
            // ignore
        }
    };

    const handleCopyFigmaPayload = async () => {
        if (!parseResult || copyingFigma) return;
        setCopyingFigma(true);
        setFigmaError(null);
        try {
            await copyFigmaPayloadToClipboard(
                parseResult.designSpec.screens,
                parseResult.designSpec.designSystem || null,
            );
            setCopiedFigma(true);
            window.setTimeout(() => setCopiedFigma(false), 1600);
        } catch (error) {
            setFigmaError((error as Error)?.message || 'Could not copy the Figma payload.');
        } finally {
            setCopyingFigma(false);
        }
    };

    const screenCount = parseResult?.screenCount ?? 0;

    return (
        <div className="debug-response-page">
            <header className="debug-response-page__header">
                <button
                    type="button"
                    className="debug-response-page__back"
                    onClick={() => onNavigate('/app')}
                >
                    <ArrowLeft size={16} />
                    Back to workspace
                </button>
                <div className="debug-response-page__title">
                    <Bug size={18} />
                    <div>
                        <h1>Debug Response Injection</h1>
                        <p>Paste a raw AI generation response and inject it into a live project.</p>
                    </div>
                </div>
            </header>

            <div className="debug-response-page__columns">
                {/* Editor column */}
                <section className="debug-response-page__editor">
                    <div className="debug-response-page__toolbar">
                        <div className="debug-response-page__toolbar-group">
                            <label className="debug-response-page__field">
                                <span>Platform</span>
                                <select
                                    value={platform}
                                    onChange={(e) => setPlatform(e.target.value as Platform)}
                                >
                                    <option value="mobile">Mobile</option>
                                    <option value="tablet">Tablet</option>
                                    <option value="desktop">Desktop</option>
                                </select>
                            </label>
                            <label className="debug-response-page__field">
                                <span>Style</span>
                                <select
                                    value={stylePreset}
                                    onChange={(e) => setStylePreset(e.target.value)}
                                >
                                    <option value="modern">Modern</option>
                                    <option value="minimal">Minimal</option>
                                    <option value="vibrant">Vibrant</option>
                                    <option value="luxury">Luxury</option>
                                    <option value="playful">Playful</option>
                                </select>
                            </label>
                        </div>
                        <div className="debug-response-page__toolbar-group">
                            <button type="button" className="debug-response-page__chip" onClick={handlePasteClipboard}>
                                <ClipboardPaste size={14} />
                                Paste
                            </button>
                            <button type="button" className="debug-response-page__chip" onClick={() => setRaw(SAMPLE)}>
                                <Code2 size={14} />
                                Sample
                            </button>
                            <button type="button" className="debug-response-page__chip" onClick={handleClear}>
                                <Trash2 size={14} />
                                Clear
                            </button>
                            <label className="debug-response-page__toggle">
                                <input
                                    type="checkbox"
                                    checked={autoParse}
                                    onChange={(e) => setAutoParse(e.target.checked)}
                                />
                                Live parse
                            </label>
                        </div>
                    </div>

                    <textarea
                        ref={textareaRef}
                        className="debug-response-page__textarea"
                        placeholder={`Paste the raw AI response here.\n\nAccepted shapes:\n<description>…</description>\n<activity …>…</activity>\n<screen name="Home"><!DOCTYPE html>…</screen>\n\nor JSON:\n[{ "type": "screen", "name": "Home", "html": "<!DOCTYPE html>…" }]`}
                        value={raw}
                        onChange={(e) => {
                            setRaw(e.target.value);
                            setHasInjected(false);
                            setFigmaError(null);
                            setCopiedFigma(false);
                        }}
                        spellCheck={false}
                    />

                    <div className="debug-response-page__actions">
                        <div className="debug-response-page__status">
                            {error ? (
                                <span className="debug-response-page__status--error">
                                    <AlertTriangle size={14} /> {error}
                                </span>
                            ) : figmaError ? (
                                <span className="debug-response-page__status--error">
                                    <AlertTriangle size={14} /> {figmaError}
                                </span>
                            ) : parseResult ? (
                                <span className="debug-response-page__status--ok">
                                    <Check size={14} /> {screenCount} screen{screenCount === 1 ? '' : 's'} parsed
                                    {parseResult.warnings.length > 0 ? ` · ${parseResult.warnings.length} warning${parseResult.warnings.length === 1 ? '' : 's'}` : ''}
                                </span>
                            ) : (
                                <span className="debug-response-page__status--idle">Awaiting input…</span>
                            )}
                        </div>
                        <div className="debug-response-page__action-buttons">
                            <button
                                type="button"
                                className="debug-response-page__button debug-response-page__button--ghost"
                                onClick={handleCopyRaw}
                                disabled={!raw}
                            >
                                {copiedRaw ? <Check size={14} /> : <Copy size={14} />}
                                Copy raw
                            </button>
                            <button
                                type="button"
                                className="debug-response-page__button debug-response-page__button--ghost"
                                onClick={handleCopyJson}
                                disabled={!parseResult}
                            >
                                {copiedJson ? <Check size={14} /> : <Copy size={14} />}
                                Copy JSON
                            </button>
                            <button
                                type="button"
                                className="debug-response-page__button debug-response-page__button--ghost"
                                onClick={handleCopyFigmaPayload}
                                disabled={!parseResult || copyingFigma}
                            >
                                {copyingFigma ? <Loader2 size={14} className="animate-spin" /> : copiedFigma ? <Check size={14} /> : <Figma size={14} />}
                                {copyingFigma ? 'Copying Figma...' : copiedFigma ? 'Figma copied' : 'Copy Figma Payload'}
                            </button>
                            <button
                                type="button"
                                className="debug-response-page__button debug-response-page__button--primary"
                                onClick={handleInject}
                                disabled={!parseResult}
                            >
                                <Send size={14} />
                                {hasInjected ? 'Injected — opening project…' : 'Inject into new project'}
                            </button>
                        </div>
                    </div>

                    {parseResult && parseResult.warnings.length > 0 && (
                        <ul className="debug-response-page__warnings">
                            {parseResult.warnings.map((warning, index) => (
                                <li key={index}>
                                    <AlertTriangle size={12} /> {warning}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* Preview column */}
                <aside className="debug-response-page__preview">
                    <div className="debug-response-page__preview-header">
                        <Eye size={14} />
                        <span>Preview</span>
                        {parseResult?.description && (
                            <em className="debug-response-page__description">{parseResult.description}</em>
                        )}
                    </div>
                    <div className="debug-response-page__screens">
                        {!parseResult ? (
                            <div className="debug-response-page__empty">
                                Valid screens will preview here as you paste.
                            </div>
                        ) : parseResult.designSpec.screens.length === 0 ? (
                            <div className="debug-response-page__empty">No renderable screens.</div>
                        ) : (
                            parseResult.designSpec.screens.map((screen) => (
                                <ScreenPreview key={screen.screenId} screen={screen} />
                            ))
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}

function ScreenPreview({ screen }: { screen: HtmlScreen }) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const displayMode = useCanvasStore((state) => {
        const prefs = state.doc.editorPrefs as { deviceDisplayMode?: DeviceDisplayMode };
        return prefs.deviceDisplayMode || 'framed';
    });
    const screenWidth = Math.max(Number(screen.width) || 402, 1);
    const screenHeight = Math.max(Number(screen.height) || 874, 1);
    const isDesktop = screenWidth >= 1024;
    const isTablet = screenWidth >= 600 && screenWidth < 1024;
    const borderWidth = isDesktop ? 1 : isTablet ? 12 : 8;
    const shellWidth = displayMode === 'framed' ? screenWidth + (isDesktop ? 0 : borderWidth * 2) : screenWidth;
    const shellHeight = displayMode === 'framed' ? screenHeight + (isDesktop ? 40 : borderWidth * 2) : screenHeight;

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        const updateScale = () => {
            const availableWidth = Math.max(viewport.clientWidth, 1);
            const availableHeight = Math.max(viewport.clientHeight, 1);
            const scale = Math.min(availableWidth / shellWidth, availableHeight / shellHeight, 1);
            viewport.style.setProperty('--debug-device-scale', String(scale));
            viewport.style.setProperty('--debug-device-width', `${shellWidth * scale}px`);
            viewport.style.setProperty('--debug-device-height', `${shellHeight * scale}px`);
        };

        updateScale();
        const observer = new ResizeObserver(updateScale);
        observer.observe(viewport);
        return () => observer.disconnect();
    }, [shellHeight, shellWidth]);

    return (
        <div className="debug-response-page__screen">
            <div className="debug-response-page__screen-meta">
                <strong>{screen.name}</strong>
                <span>{screenWidth}×{screenHeight}</span>
            </div>
            <div ref={viewportRef} className="debug-response-page__device-viewport">
                <div className="debug-response-page__device-shell">
                    <ReadonlyDeviceNode
                        screenId={screen.screenId}
                        html={screen.html}
                        width={screenWidth}
                        height={screenHeight}
                        displayMode={displayMode}
                    />
                </div>
            </div>
            <div className="debug-response-page__screen-note">
                <span>{displayMode === 'framed' ? 'Framed device display' : 'Clean screen display'}</span>
            </div>
        </div>
    );
}
