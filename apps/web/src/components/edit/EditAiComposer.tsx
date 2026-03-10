import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles, Square, Send } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useDesignStore, useUiStore } from '../../stores';
import { useEditStore } from '../../stores/edit-store';
import { dispatchSelectUid } from '../../utils/editMessaging';
import { ensureEditableUids } from '../../utils/htmlPatcher';
import { getPreferredTextModel } from '../../constants/designModels';
import { useOrbVisuals, type OrbActivityState } from '../../utils/orbVisuals';
import {
    extractComposerInlineReferences,
    findComposerReferenceTrigger,
    formatComposerUrlReferenceToken,
    getFilteredComposerReferenceRootOptions,
    normalizeComposerReferenceUrl,
    replaceComposerReferenceTrigger,
    type ComposerReferenceTextRange,
} from '../../utils/composerReferences';
import { ComposerInlineReferenceOverlay } from '../ui/ComposerInlineReferenceOverlay';
import { ComposerReferenceMenu } from '../ui/ComposerReferenceMenu';
import { Orb } from '../ui/Orb';

export function EditAiComposer() {
    const { spec, updateScreen } = useDesignStore();
    const { modelProfile } = useUiStore();
    const {
        isEditMode,
        screenId,
        selected,
        setActiveScreen,
        rebuildHtml,
        addAiEditHistory,
    } = useEditStore();

    const [prompt, setPrompt] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [description, setDescription] = useState('');
    const [isReferenceMenuOpen, setIsReferenceMenuOpen] = useState(false);
    const [referenceMenuMode, setReferenceMenuMode] = useState<'root' | 'url'>('root');
    const [referenceRootQuery, setReferenceRootQuery] = useState('');
    const [referenceActiveIndex, setReferenceActiveIndex] = useState(0);
    const [referenceUrlDraft, setReferenceUrlDraft] = useState('');
    const abortRef = useRef<AbortController | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const textareaOverlayRef = useRef<HTMLDivElement | null>(null);
    const referenceMenuRef = useRef<HTMLDivElement | null>(null);
    const referenceUrlInputRef = useRef<HTMLInputElement | null>(null);
    const referenceTriggerRangeRef = useRef<ComposerReferenceTextRange | null>(null);

    const activeScreen = useMemo(() => {
        if (!spec || !screenId) return null;
        return spec.screens.find((screen) => screen.screenId === screenId) || null;
    }, [screenId, spec]);

    const selectionLabel = useMemo(() => {
        if (!selected) return null;
        return `${selected.tagName.toLowerCase()} · ${selected.elementType} · ${selected.uid}`;
    }, [selected]);

    const editOrbActivity: OrbActivityState = busy ? 'thinking' : prompt.trim() ? 'talking' : 'idle';
    const { agentState: editOrbState, colors: editOrbColors } = useOrbVisuals(editOrbActivity);
    const editOrbInput = busy ? 0.6 : prompt.trim() ? 0.38 : 0.15;
    const editOrbOutput = busy ? 0.8 : prompt.trim() ? 0.55 : 0.2;
    const rootReferenceOptions = useMemo(
        () => getFilteredComposerReferenceRootOptions(referenceRootQuery, false),
        [referenceRootQuery]
    );

    const closeReferenceMenu = () => {
        setIsReferenceMenuOpen(false);
        setReferenceMenuMode('root');
        setReferenceRootQuery('');
        setReferenceActiveIndex(0);
        setReferenceUrlDraft('');
        referenceTriggerRangeRef.current = null;
    };

    const syncReferenceTrigger = (value: string, cursor: number) => {
        const match = findComposerReferenceTrigger(value, cursor);
        if (!match) {
            if (referenceMenuMode === 'root') {
                closeReferenceMenu();
            }
            return;
        }
        referenceTriggerRangeRef.current = match.range;
        setReferenceRootQuery(match.query);
        setReferenceMenuMode('root');
        setIsReferenceMenuOpen(true);
    };

    const openUrlReferenceInput = () => {
        setReferenceMenuMode('url');
        setReferenceActiveIndex(0);
        setReferenceUrlDraft('');
        setIsReferenceMenuOpen(true);
    };

    const submitUrlReference = () => {
        const normalized = normalizeComposerReferenceUrl(referenceUrlDraft);
        if (!normalized) return;
        const range = referenceTriggerRangeRef.current;
        if (!range) return;
        const result = replaceComposerReferenceTrigger(prompt, range, formatComposerUrlReferenceToken(normalized));
        setPrompt(result.value);
        closeReferenceMenu();
        window.setTimeout(() => {
            const target = textareaRef.current;
            if (!target) return;
            target.focus();
            target.setSelectionRange(result.cursor, result.cursor);
        }, 0);
    };

    const applyAiEdit = async () => {
        if (!isEditMode || !screenId || !activeScreen || !selected) return;
        const nextPrompt = prompt.trim();
        if (!nextPrompt || busy) return;
        const parsedReferences = extractComposerInlineReferences(nextPrompt);

        const htmlSource = rebuildHtml() || activeScreen.html;
        if (!htmlSource) return;

        const scopedInstruction = `
Edit only the selected component in this screen.

USER REQUEST:
${parsedReferences.cleanedText.trim()}

TARGET COMPONENT:
- data-uid: ${selected.uid}
- tag: ${selected.tagName.toLowerCase()}
- type: ${selected.elementType}
- classes: ${(selected.classList || []).join(' ') || '(none)'}
- inline-style: ${JSON.stringify(selected.inlineStyle || {})}
- attrs: ${JSON.stringify(selected.attributes || {})}

LAYOUT CONTEXT:
- computed display: ${selected.computedStyle.display || ''}
- computed position: ${selected.computedStyle.position || ''}
- computed z-index: ${selected.computedStyle.zIndex || ''}
- computed width: ${selected.computedStyle.width || ''}
- computed height: ${selected.computedStyle.height || ''}
- computed margin: ${selected.computedStyle.margin || ''}
- computed padding: ${selected.computedStyle.padding || ''}

RULES:
- Keep the screen architecture intact and preserve all unrelated components.
- Modify only the target element and only minimal nearby wrappers if required for layout integrity.
- Preserve existing data-uid and data-editable attributes.
- Keep icon/text visibility and stacking context correct.
- Return valid full HTML only.
`.trim();

        setError('');
        setDescription('');
        setBusy(true);
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const response = await apiClient.edit({
                instruction: scopedInstruction,
                html: htmlSource,
                screenId,
                referenceUrls: parsedReferences.urlReferences.map((item) => item.url),
                preferredModel: getPreferredTextModel(modelProfile),
            }, controller.signal);
            const ensured = ensureEditableUids(response.html);
            updateScreen(screenId, ensured, 'complete');
            setActiveScreen(screenId, ensured);
            if (response.description?.trim()) setDescription(response.description.trim());
            addAiEditHistory({
                id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                screenId,
                uid: selected.uid,
                tagName: selected.tagName.toLowerCase(),
                elementType: selected.elementType,
                prompt: nextPrompt,
                description: response.description?.trim(),
                createdAt: new Date().toISOString(),
            });
            setPrompt('');
            window.setTimeout(() => dispatchSelectUid(screenId, selected.uid), 100);
        } catch (err) {
            if ((err as Error).name === 'AbortError') {
                setError('AI edit stopped.');
            } else {
                setError((err as Error).message || 'Failed to apply AI edit.');
            }
        } finally {
            abortRef.current = null;
            setBusy(false);
        }
    };

    const stopAiEdit = () => {
        abortRef.current?.abort();
    };

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            abortRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!isReferenceMenuOpen) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (referenceMenuRef.current?.contains(event.target as Node)) return;
            if (event.target === textareaRef.current) return;
            closeReferenceMenu();
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isReferenceMenuOpen, referenceMenuMode]);

    useEffect(() => {
        if (!isReferenceMenuOpen || referenceMenuMode !== 'url') return;
        referenceUrlInputRef.current?.focus();
    }, [isReferenceMenuOpen, referenceMenuMode]);

    if (!isEditMode) return null;

    return (
        <div className="edit-ai-composer-shell">
            <div className="edit-ai-composer">
                <div className="edit-ai-context-row">
                    {selectionLabel ? (
                        <div className="edit-ai-selected-chip" title={selectionLabel}>
                            <Sparkles size={13} />
                            <span>{selectionLabel}</span>
                        </div>
                    ) : (
                        <div className="edit-ai-selected-empty">Select an element to run AI edit.</div>
                    )}
                </div>

                <div className="edit-ai-input-row">
                    <div className="edit-ai-input-core">
                        <div className="edit-ai-orb-wrap">
                            <Orb
                                className="h-full w-full"
                                colors={editOrbColors}
                                seed={5209}
                                agentState={editOrbState}
                                volumeMode="manual"
                                manualInput={editOrbInput}
                                manualOutput={editOrbOutput}
                            />
                        </div>
                        <div className="relative flex-1 min-w-0">
                            {prompt.length > 0 && (
                                <div
                                    ref={textareaOverlayRef}
                                    className="absolute inset-0 overflow-hidden rounded-[12px] px-3 py-2.5 text-[13px] leading-[1.4]"
                                >
                                    <ComposerInlineReferenceOverlay value={prompt} className="text-[13px] leading-[1.4]" />
                                </div>
                            )}
                            <textarea
                                ref={textareaRef}
                                value={prompt}
                                onChange={(event) => {
                                    const nextValue = event.target.value;
                                    const cursor = event.target.selectionStart ?? nextValue.length;
                                    setPrompt(nextValue);
                                    syncReferenceTrigger(nextValue, cursor);
                                }}
                                onScroll={(event) => {
                                    if (!textareaOverlayRef.current) return;
                                    textareaOverlayRef.current.scrollTop = event.currentTarget.scrollTop;
                                    textareaOverlayRef.current.scrollLeft = event.currentTarget.scrollLeft;
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === '@') {
                                        window.setTimeout(() => {
                                            const target = textareaRef.current;
                                            if (!target) return;
                                            const cursor = target.selectionStart ?? target.value.length;
                                            syncReferenceTrigger(target.value, cursor);
                                        }, 0);
                                    }
                                    if (isReferenceMenuOpen) {
                                        if (referenceMenuMode === 'root' && rootReferenceOptions.length > 0) {
                                            if (event.key === 'ArrowDown') {
                                                event.preventDefault();
                                                setReferenceActiveIndex((prev) => (prev + 1) % rootReferenceOptions.length);
                                                return;
                                            }
                                            if (event.key === 'ArrowUp') {
                                                event.preventDefault();
                                                setReferenceActiveIndex((prev) => (prev - 1 + rootReferenceOptions.length) % rootReferenceOptions.length);
                                                return;
                                            }
                                            if (event.key === 'Escape') {
                                                event.preventDefault();
                                                closeReferenceMenu();
                                                return;
                                            }
                                            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                                                // allow submit shortcut to flow below
                                            } else if (event.key === 'Enter' && !event.shiftKey) {
                                                event.preventDefault();
                                                const choice = rootReferenceOptions[referenceActiveIndex] || rootReferenceOptions[0];
                                                if (choice?.key === 'url') openUrlReferenceInput();
                                                return;
                                            }
                                        }
                                        if (referenceMenuMode === 'url' && event.key === 'Escape') {
                                            event.preventDefault();
                                            closeReferenceMenu();
                                            return;
                                        }
                                    }
                                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                                        event.preventDefault();
                                        void applyAiEdit();
                                    }
                                }}
                                onClick={(event) => {
                                    const cursor = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
                                    syncReferenceTrigger(event.currentTarget.value, cursor);
                                }}
                                onKeyUp={(event) => {
                                    const cursor = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
                                    syncReferenceTrigger(event.currentTarget.value, cursor);
                                }}
                                placeholder={selected
                                    ? 'Describe exactly what to change for the selected element... (type @ to add a URL reference)'
                                    : 'Select an element first...'}
                                disabled={!selected || busy}
                                className={`edit-ai-textarea ${prompt.length > 0 ? 'text-transparent caret-[var(--ui-text)] placeholder:text-transparent' : ''}`}
                            />
                        </div>
                    </div>
                    {isReferenceMenuOpen && (
                        <ComposerReferenceMenu
                            activeIndex={referenceActiveIndex}
                            menuMode={referenceMenuMode}
                            menuRef={referenceMenuRef}
                            onCancel={closeReferenceMenu}
                            onRootOptionHover={setReferenceActiveIndex}
                            onScreenHover={setReferenceActiveIndex}
                            onSelectRootOption={(key) => {
                                if (key === 'url') openUrlReferenceInput();
                            }}
                            onSubmitUrl={submitUrlReference}
                            rootOptions={rootReferenceOptions}
                            urlDraft={referenceUrlDraft}
                            urlInputRef={referenceUrlInputRef}
                            onUrlDraftChange={setReferenceUrlDraft}
                        />
                    )}
                    {busy ? (
                        <button
                            type="button"
                            onClick={stopAiEdit}
                            className="edit-ai-send danger"
                            title="Stop AI edit"
                        >
                            <Square size={15} />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => void applyAiEdit()}
                            disabled={!selected || !prompt.trim()}
                            className="edit-ai-send"
                            title="Apply AI edit"
                        >
                            <Send size={15} />
                        </button>
                    )}
                </div>

                {(busy || error || description) && (
                    <div className="edit-ai-feedback-row">
                        {busy && (
                            <span className="edit-ai-feedback loading">
                                <Loader2 size={12} className="animate-spin" />
                                Applying AI edit...
                            </span>
                        )}
                        {!busy && error && <span className="edit-ai-feedback error">{error}</span>}
                        {!busy && !error && description && <span className="edit-ai-feedback success">{description}</span>}
                    </div>
                )}
            </div>
        </div>
    );
}
