import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

type GuideBubblePlacement = 'top' | 'right' | 'bottom' | 'left';

export type GuideBubbleStep = {
    id: string;
    targetId: string;
    title: string;
    body: string;
    placement?: GuideBubblePlacement;
};

type GuideBubbleOverlayProps = {
    step: GuideBubbleStep | null;
    stepIndex: number;
    stepCount: number;
    onNext: () => void;
    onPrev: () => void;
    onSkip: () => void;
};

type BubbleLayout = {
    bubble: { top: number; left: number; width: number };
    tail: { top: number; left: number; rotation: string };
};

type FocusMaskRect = {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
};

const BUBBLE_WIDTH = 280;
const VIEWPORT_PADDING = 18;
const TARGET_MARGIN = 22;
const TAIL_SIZE = 16;
const FOCUS_PADDING = 12;
const SMALL_TARGET_CIRCLE_MAX_SIZE = 72;

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function resolveFocusMaskRect(targetRect: DOMRect): FocusMaskRect {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const top = clamp(targetRect.top - FOCUS_PADDING, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING));
    const left = clamp(targetRect.left - FOCUS_PADDING, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING));
    const right = clamp(targetRect.right + FOCUS_PADDING, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING));
    const bottom = clamp(targetRect.bottom + FOCUS_PADDING, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING));

    return {
        top,
        left,
        right,
        bottom,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
    };
}

function shouldUseCircularFocus(targetRect: DOMRect) {
    return Math.max(targetRect.width, targetRect.height) <= SMALL_TARGET_CIRCLE_MAX_SIZE;
}

function resolveBubbleLayout(targetRect: DOMRect, placement: GuideBubblePlacement): BubbleLayout {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const bubbleWidth = Math.min(BUBBLE_WIDTH, Math.max(280, viewportWidth - (VIEWPORT_PADDING * 2)));
    const bubbleHeightEstimate = 212;

    let top = 0;
    let left = 0;
    let tailTop = 0;
    let tailLeft = 0;
    let rotation = 'rotate(45deg)';

    if (placement === 'top') {
        top = targetRect.top - bubbleHeightEstimate - TARGET_MARGIN;
        left = targetRect.left + (targetRect.width / 2) - (bubbleWidth / 2);
        tailTop = top + bubbleHeightEstimate - (TAIL_SIZE / 2);
        tailLeft = targetRect.left + (targetRect.width / 2) - (TAIL_SIZE / 2);
        rotation = 'rotate(45deg)';
    } else if (placement === 'left') {
        top = targetRect.top + (targetRect.height / 2) - (bubbleHeightEstimate / 2);
        left = targetRect.left - bubbleWidth - TARGET_MARGIN;
        tailTop = targetRect.top + (targetRect.height / 2) - (TAIL_SIZE / 2);
        tailLeft = left + bubbleWidth - (TAIL_SIZE / 2);
        rotation = 'rotate(45deg)';
    } else if (placement === 'right') {
        top = targetRect.top + (targetRect.height / 2) - (bubbleHeightEstimate / 2);
        left = targetRect.right + TARGET_MARGIN;
        tailTop = targetRect.top + (targetRect.height / 2) - (TAIL_SIZE / 2);
        tailLeft = left - (TAIL_SIZE / 2);
        rotation = 'rotate(45deg)';
    } else {
        top = targetRect.bottom + TARGET_MARGIN;
        left = targetRect.left + (targetRect.width / 2) - (bubbleWidth / 2);
        tailTop = top - (TAIL_SIZE / 2);
        tailLeft = targetRect.left + (targetRect.width / 2) - (TAIL_SIZE / 2);
        rotation = 'rotate(45deg)';
    }

    const clampedTop = clamp(top, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewportHeight - bubbleHeightEstimate - VIEWPORT_PADDING));
    const clampedLeft = clamp(left, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewportWidth - bubbleWidth - VIEWPORT_PADDING));

    return {
        bubble: {
            top: clampedTop,
            left: clampedLeft,
            width: bubbleWidth,
        },
        tail: {
            top: clamp(tailTop, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewportHeight - TAIL_SIZE - VIEWPORT_PADDING)),
            left: clamp(tailLeft, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewportWidth - TAIL_SIZE - VIEWPORT_PADDING)),
            rotation,
        },
    };
}

export function GuideBubbleOverlay({
    step,
    stepIndex,
    stepCount,
    onNext,
    onPrev,
    onSkip,
}: GuideBubbleOverlayProps) {
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (!step) {
            setTargetRect(null);
            return;
        }

        const update = () => {
            const target = document.querySelector(`[data-guide-id="${step.targetId}"]`) as HTMLElement | null;
            if (!target) {
                setTargetRect(null);
                return;
            }
            const rect = target.getBoundingClientRect();
            if (rect.top < 88 || rect.bottom > (window.innerHeight - 88)) {
                target.scrollIntoView({ block: 'center', behavior: 'smooth', inline: 'nearest' });
            }
            setTargetRect(rect);
        };

        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [step]);

    const layout = useMemo(() => {
        if (!step || !targetRect) return null;
        return resolveBubbleLayout(targetRect, step.placement || 'bottom');
    }, [step, targetRect]);
    const focusMaskRect = useMemo(() => {
        if (!targetRect) return null;
        return resolveFocusMaskRect(targetRect);
    }, [targetRect]);
    const useCircularFocus = useMemo(() => {
        if (!targetRect) return false;
        return shouldUseCircularFocus(targetRect);
    }, [targetRect]);
    const circularFocusMaskStyle = useMemo(() => {
        if (!targetRect || !useCircularFocus) return null;
        const centerX = targetRect.left + (targetRect.width / 2);
        const centerY = targetRect.top + (targetRect.height / 2);
        const radius = Math.max(targetRect.width, targetRect.height) / 2 + FOCUS_PADDING;
        const maskImage = `radial-gradient(circle ${radius}px at ${centerX}px ${centerY}px, transparent ${Math.max(0, radius - 0.5)}px, black ${radius + 0.5}px)`;

        return {
            WebkitMaskImage: maskImage,
            maskImage,
        } as const;
    }, [targetRect, useCircularFocus]);

    if (!step || !targetRect || !layout || !focusMaskRect) return null;

    const isLastStep = stepIndex >= stepCount - 1;

    return (
        <div className="pointer-events-none fixed inset-0 z-[160]">
            {useCircularFocus && circularFocusMaskStyle ? (
                <div
                    className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--ui-bg)_34%,rgba(6,8,12,0.32))] backdrop-blur-[10px]"
                    style={circularFocusMaskStyle}
                />
            ) : (
                <>
                    <div
                        className="absolute left-0 right-0 top-0 bg-[color:color-mix(in_srgb,var(--ui-bg)_34%,rgba(6,8,12,0.32))] backdrop-blur-[10px]"
                        style={{ height: focusMaskRect.top }}
                    />
                    <div
                        className="absolute bottom-0 left-0 right-0 bg-[color:color-mix(in_srgb,var(--ui-bg)_34%,rgba(6,8,12,0.32))] backdrop-blur-[10px]"
                        style={{ top: focusMaskRect.bottom }}
                    />
                    <div
                        className="absolute bg-[color:color-mix(in_srgb,var(--ui-bg)_34%,rgba(6,8,12,0.32))] backdrop-blur-[10px]"
                        style={{
                            top: focusMaskRect.top,
                            left: 0,
                            width: focusMaskRect.left,
                            height: focusMaskRect.height,
                        }}
                    />
                    <div
                        className="absolute bg-[color:color-mix(in_srgb,var(--ui-bg)_34%,rgba(6,8,12,0.32))] backdrop-blur-[10px]"
                        style={{
                            top: focusMaskRect.top,
                            left: focusMaskRect.right,
                            right: 0,
                            height: focusMaskRect.height,
                        }}
                    />
                </>
            )}
            <div
                className="absolute h-3.5 w-3.5 rounded-[2px] border border-[var(--ui-border)] bg-[var(--ui-popover)]"
                style={{
                    top: layout.tail.top,
                    left: layout.tail.left,
                    transform: layout.tail.rotation,
                }}
            />
            <div
                className="pointer-events-auto absolute rounded-lg border border-[var(--ui-border)] bg-[var(--ui-popover)] px-3 py-2 text-sm text-[var(--ui-text)]"
                style={{
                    top: layout.bubble.top,
                    left: layout.bubble.left,
                    width: layout.bubble.width,
                }}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">
                            Workspace guide
                        </p>
                        <h3 className="mt-1.5 text-[16px] font-semibold leading-5 tracking-[-0.02em] text-[var(--ui-text)]">
                            {step.title}
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onSkip}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
                        aria-label="Close guide"
                    >
                        <X size={14} />
                    </button>
                </div>

                <p className="mt-2 text-[13px] leading-5 text-[var(--ui-text-muted)]">
                    {step.body}
                </p>

                <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[12px] font-medium text-[var(--ui-text-subtle)]">
                        {stepIndex + 1} of {stepCount}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onSkip}
                            className="inline-flex h-8 items-center justify-center rounded-md px-2 text-[12px] font-medium text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
                        >
                            Skip
                        </button>
                        {stepIndex > 0 && (
                            <button
                                type="button"
                                onClick={onPrev}
                                className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--ui-border)] bg-[var(--ui-popover)] px-2.5 text-[12px] font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-2)]"
                            >
                                <ChevronLeft size={14} />
                                Back
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onNext}
                            className="inline-flex h-8 items-center gap-1 rounded-md bg-[var(--ui-surface-2)] px-2.5 text-[12px] font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-3)]"
                        >
                            {isLastStep ? 'Done' : 'Next'}
                            {!isLastStep && <ChevronRight size={14} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
