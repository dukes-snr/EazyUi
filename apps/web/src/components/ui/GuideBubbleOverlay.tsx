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

const BUBBLE_WIDTH = 320;
const VIEWPORT_PADDING = 16;
const TARGET_MARGIN = 18;
const TAIL_SIZE = 14;

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function resolveBubbleLayout(targetRect: DOMRect, placement: GuideBubblePlacement): BubbleLayout {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const bubbleWidth = Math.min(BUBBLE_WIDTH, Math.max(280, viewportWidth - (VIEWPORT_PADDING * 2)));
    const bubbleHeightEstimate = 188;

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

    if (!step || !targetRect || !layout) return null;

    const isLastStep = stepIndex >= stepCount - 1;

    return (
        <div className="pointer-events-none fixed inset-0 z-[160]">
            <div className="absolute inset-0 bg-[rgba(6,8,12,0.46)] backdrop-blur-[1px]" />
            <div
                className="absolute rounded-[26px] border border-[color:color-mix(in_srgb,var(--ui-primary)_34%,white)] shadow-[0_0_0_9999px_rgba(6,8,12,0.18),0_28px_80px_rgba(2,6,23,0.34)]"
                style={{
                    top: targetRect.top - 8,
                    left: targetRect.left - 8,
                    width: targetRect.width + 16,
                    height: targetRect.height + 16,
                }}
            />
            <div
                className="absolute h-3.5 w-3.5 rounded-[4px] border border-[color:color-mix(in_srgb,var(--ui-primary)_26%,white)] bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-popover))] shadow-[0_12px_28px_rgba(2,6,23,0.22)]"
                style={{
                    top: layout.tail.top,
                    left: layout.tail.left,
                    transform: layout.tail.rotation,
                }}
            />
            <div
                className="pointer-events-auto absolute rounded-[30px] border border-[color:color-mix(in_srgb,var(--ui-primary)_28%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-popover)_96%,rgba(9,14,22,0.14))] p-4 shadow-[0_28px_80px_rgba(2,6,23,0.34)] backdrop-blur-xl"
                style={{
                    top: layout.bubble.top,
                    left: layout.bubble.left,
                    width: layout.bubble.width,
                }}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-primary)]">
                            Workspace guide
                        </p>
                        <h3 className="mt-2 text-[18px] font-semibold leading-6 tracking-[-0.03em] text-[var(--ui-text)]">
                            {step.title}
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onSkip}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] text-[var(--ui-text-muted)] transition-colors hover:text-[var(--ui-text)]"
                        aria-label="Close guide"
                    >
                        <X size={14} />
                    </button>
                </div>

                <p className="mt-3 text-[14px] leading-6 text-[var(--ui-text-muted)]">
                    {step.body}
                </p>

                <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-[12px] font-medium text-[var(--ui-text-subtle)]">
                        {stepIndex + 1} / {stepCount}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onSkip}
                            className="inline-flex h-9 items-center justify-center rounded-full px-3 text-[12px] font-medium text-[var(--ui-text-muted)] transition-colors hover:text-[var(--ui-text)]"
                        >
                            Skip
                        </button>
                        {stepIndex > 0 && (
                            <button
                                type="button"
                                onClick={onPrev}
                                className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-[12px] font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-3)]"
                            >
                                <ChevronLeft size={14} />
                                Back
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onNext}
                            className="inline-flex h-9 items-center gap-1 rounded-full bg-[var(--ui-primary)] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[var(--ui-primary-hover)]"
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
