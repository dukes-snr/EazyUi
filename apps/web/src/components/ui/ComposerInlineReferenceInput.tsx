import {
    forwardRef,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    type FormEvent as ReactFormEvent,
    type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
    getComposerInlineReferenceSegments,
    removeComposerAtomicReferenceAtSelection,
    type ComposerScreenReferenceOption,
} from '../../utils/composerReferences';

export type ComposerInlineReferenceInputHandle = {
    focus: () => void;
    blur: () => void;
    setSelectionRange: (start: number, end: number) => void;
    getSelectionRange: () => { start: number; end: number };
    getValue: () => string;
    element: HTMLDivElement | null;
};

type ComposerInlineReferenceInputProps = {
    value: string;
    onChange: (value: string, cursor: number) => void;
    onSelectionChange?: (value: string, cursor: number) => void;
    onKeyDown?: (
        event: ReactKeyboardEvent<HTMLDivElement>,
        meta: { value: string; selectionStart: number; selectionEnd: number }
    ) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    placeholder?: string;
    placeholderClassName?: string;
    disabled?: boolean;
    className?: string;
    allowScreen?: boolean;
    screens?: ComposerScreenReferenceOption[];
};

const HIGHLIGHT_TONES = [
    'bg-[rgba(251,191,36,0.48)] text-[#fff7db]',
    'bg-[rgba(110,231,183,0.4)] text-[#ecfff7]',
    'bg-[rgba(125,211,252,0.42)] text-[#eef9ff]',
    'bg-[rgba(244,114,182,0.38)] text-[#fff2f8]',
    'bg-[rgba(196,181,253,0.42)] text-[#f7f2ff]',
];
const EMPTY_SCREEN_OPTIONS: ComposerScreenReferenceOption[] = [];

function getHighlightTone(text: string): string {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(index);
        hash |= 0;
    }
    return HIGHLIGHT_TONES[Math.abs(hash) % HIGHLIGHT_TONES.length] || HIGHLIGHT_TONES[0];
}

function getSelectionOffsets(root: HTMLDivElement): { start: number; end: number } {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        const fallback = root.textContent?.length ?? 0;
        return { start: fallback, end: fallback };
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
        const fallback = root.textContent?.length ?? 0;
        return { start: fallback, end: fallback };
    }

    const startRange = document.createRange();
    startRange.selectNodeContents(root);
    startRange.setEnd(range.startContainer, range.startOffset);

    const endRange = document.createRange();
    endRange.selectNodeContents(root);
    endRange.setEnd(range.endContainer, range.endOffset);

    return {
        start: startRange.toString().length,
        end: endRange.toString().length,
    };
}

function isReferenceElement(node: Node): node is HTMLElement {
    return node instanceof HTMLElement && node.dataset.composerReference === 'true';
}

function resolvePointForOffset(root: HTMLDivElement, targetOffset: number): { node: Node; offset: number } {
    let remaining = Math.max(0, targetOffset);

    const visit = (node: Node): { node: Node; offset: number } | null => {
        if (node.nodeType === Node.TEXT_NODE) {
            const textLength = node.textContent?.length ?? 0;
            if (remaining <= textLength) {
                return { node, offset: remaining };
            }
            remaining -= textLength;
            return null;
        }

        if (isReferenceElement(node)) {
            const textLength = node.textContent?.length ?? 0;
            const parent = node.parentNode;
            if (!parent) return null;
            const childIndex = Array.prototype.indexOf.call(parent.childNodes, node);
            if (remaining === 0) {
                return { node: parent, offset: childIndex };
            }
            if (remaining <= textLength) {
                return { node: parent, offset: childIndex + 1 };
            }
            remaining -= textLength;
            return null;
        }

        for (const child of Array.from(node.childNodes)) {
            const result = visit(child);
            if (result) return result;
        }
        return null;
    };

    const point = visit(root);
    if (point) return point;
    return { node: root, offset: root.childNodes.length };
}

function setSelectionOffsets(root: HTMLDivElement, start: number, end: number) {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    const startPoint = resolvePointForOffset(root, start);
    const endPoint = resolvePointForOffset(root, end);
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    selection.removeAllRanges();
    selection.addRange(range);
}

function replaceSelectionText(
    source: string,
    selectionStart: number,
    selectionEnd: number,
    text: string
): { value: string; cursor: number } {
    const nextValue = `${source.slice(0, selectionStart)}${text}${source.slice(selectionEnd)}`;
    return {
        value: nextValue,
        cursor: selectionStart + text.length,
    };
}

function deleteSelectionText(
    source: string,
    selectionStart: number,
    selectionEnd: number,
    direction: 'backward' | 'forward'
): { value: string; cursor: number } | null {
    if (selectionStart !== selectionEnd) {
        return {
            value: `${source.slice(0, selectionStart)}${source.slice(selectionEnd)}`,
            cursor: selectionStart,
        };
    }
    if (direction === 'backward') {
        if (selectionStart === 0) return null;
        return {
            value: `${source.slice(0, selectionStart - 1)}${source.slice(selectionStart)}`,
            cursor: selectionStart - 1,
        };
    }
    if (selectionStart >= source.length) return null;
    return {
        value: `${source.slice(0, selectionStart)}${source.slice(selectionStart + 1)}`,
        cursor: selectionStart,
    };
}

function syncRootSegments(
    root: HTMLDivElement,
    segments: ReturnType<typeof getComposerInlineReferenceSegments>
) {
    root.replaceChildren();

    segments.forEach((segment) => {
        if (segment.kind === 'text') {
            root.append(document.createTextNode(segment.text));
            return;
        }

        const token = document.createElement('span');
        token.dataset.composerReference = 'true';
        token.contentEditable = 'false';
        token.className = `inline rounded-[0.24em] px-[0.08em] py-0 font-semibold [box-decoration-break:clone] [-webkit-box-decoration-break:clone] ${getHighlightTone(segment.text)}`;
        token.textContent = segment.text;
        root.append(token);
    });
}

export const ComposerInlineReferenceInput = forwardRef<ComposerInlineReferenceInputHandle, ComposerInlineReferenceInputProps>(
    function ComposerInlineReferenceInput(
        {
            value,
            onChange,
            onSelectionChange,
            onKeyDown,
            onFocus,
            onBlur,
            placeholder = '',
            placeholderClassName = '',
            disabled = false,
            className = '',
            allowScreen = false,
            screens = EMPTY_SCREEN_OPTIONS,
        },
        forwardedRef
    ) {
        const rootRef = useRef<HTMLDivElement | null>(null);
        const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

        const commitValue = (nextValue: string, cursor: number) => {
            const selection = { start: cursor, end: cursor };
            pendingSelectionRef.current = selection;
            const root = rootRef.current;
            if (root) {
                syncRootSegments(root, getComposerInlineReferenceSegments(nextValue, { allowScreen, screens }));
                setSelectionOffsets(root, cursor, cursor);
            }
            onChange(nextValue, cursor);
            onSelectionChange?.(nextValue, cursor);
        };

        useImperativeHandle(forwardedRef, () => ({
            focus: () => rootRef.current?.focus(),
            blur: () => rootRef.current?.blur(),
            setSelectionRange: (start: number, end: number) => {
                const root = rootRef.current;
                if (!root) return;
                pendingSelectionRef.current = { start, end };
                setSelectionOffsets(root, start, end);
            },
            getSelectionRange: () => {
                const root = rootRef.current;
                if (!root) {
                    return { start: 0, end: 0 };
                }
                return getSelectionOffsets(root);
            },
            getValue: () => rootRef.current?.textContent ?? value,
            element: rootRef.current,
        }), [value]);

        useLayoutEffect(() => {
            const root = rootRef.current;
            if (!root) return;
            const selection = pendingSelectionRef.current;
            const segments = getComposerInlineReferenceSegments(value, { allowScreen, screens });
            syncRootSegments(root, segments);
            if (selection) {
                setSelectionOffsets(root, selection.start, selection.end);
                pendingSelectionRef.current = null;
            }
        }, [allowScreen, screens, value]);

        const emitSelection = () => {
            const root = rootRef.current;
            if (!root) return;
            const selection = getSelectionOffsets(root);
            pendingSelectionRef.current = selection;
            onSelectionChange?.(root.textContent ?? '', selection.start);
        };

        const reconcileDomValue = () => {
            const root = rootRef.current;
            if (!root) return;
            const nextValue = root.textContent ?? '';
            if (nextValue === value) return;
            const selection = getSelectionOffsets(root);
            commitValue(nextValue, selection.start);
        };

        const insertPlainText = (text: string) => {
            const root = rootRef.current;
            if (!root) return;
            const selection = getSelectionOffsets(root);
            const next = replaceSelectionText(value, selection.start, selection.end, text);
            commitValue(next.value, next.cursor);
        };

        const deleteText = (direction: 'backward' | 'forward') => {
            const root = rootRef.current;
            if (!root) return false;
            const selection = getSelectionOffsets(root);
            const atomicResult = removeComposerAtomicReferenceAtSelection(
                value,
                selection.start,
                selection.end,
                direction,
                { allowScreen, screens }
            );
            const next = atomicResult || deleteSelectionText(value, selection.start, selection.end, direction);
            if (!next) return false;
            commitValue(next.value, next.cursor);
            return true;
        };

        return (
            <div className="relative min-w-0 flex-1 w-full">
                {value.length === 0 && placeholder && (
                    <div className={`pointer-events-none absolute inset-0 w-full select-none text-left text-[inherit] leading-[inherit] text-[var(--ui-text-subtle)] ${placeholderClassName}`.trim()}>
                        {placeholder}
                    </div>
                )}
                <div
                    ref={rootRef}
                    contentEditable={!disabled}
                    suppressContentEditableWarning
                    spellCheck={false}
                    role="textbox"
                    aria-multiline="true"
                    data-placeholder={placeholder}
                    className={`block w-full text-left whitespace-pre-wrap break-words outline-none ${disabled ? 'cursor-not-allowed opacity-65' : ''} ${className}`.trim()}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    onInput={() => reconcileDomValue()}
                    onClick={() => emitSelection()}
                    onKeyUp={() => emitSelection()}
                    onBeforeInput={(event: ReactFormEvent<HTMLDivElement>) => {
                        if (disabled) return;
                        const nativeEvent = event.nativeEvent as InputEvent;
                        const inputType = nativeEvent.inputType || '';
                        if (inputType === 'insertText' || inputType === 'insertCompositionText') {
                            event.preventDefault();
                            insertPlainText(nativeEvent.data || '');
                            return;
                        }
                        if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
                            event.preventDefault();
                            insertPlainText('\n');
                            return;
                        }
                        if (inputType === 'deleteContentBackward') {
                            event.preventDefault();
                            deleteText('backward');
                            return;
                        }
                        if (inputType === 'deleteContentForward') {
                            event.preventDefault();
                            deleteText('forward');
                        }
                    }}
                    onPaste={(event) => {
                        event.preventDefault();
                        const pastedText = event.clipboardData.getData('text/plain');
                        insertPlainText(pastedText);
                    }}
                    onKeyDown={(event) => {
                        const root = rootRef.current;
                        if (!root) return;
                        const selection = getSelectionOffsets(root);
                        const meta = {
                            value,
                            selectionStart: selection.start,
                            selectionEnd: selection.end,
                        };

                        onKeyDown?.(event, meta);
                    }}
                />
            </div>
        );
    }
);
