import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';

type GuideBubblePlacement = 'top' | 'right' | 'bottom' | 'left';

export type GuideBubbleStep = {
    id: string;
    targetId: string;
    title: string;
    body: string;
    placement?: GuideBubblePlacement;
    label?: string;
    tip?: string;
    focusPadding?: number;
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

const BUBBLE_WIDTH = 332;
const VIEWPORT_PADDING = 18;
const TARGET_MARGIN = 22;
const TAIL_SIZE = 16;
const FOCUS_PADDING = 16;
const SMALL_TARGET_CIRCLE_MAX_SIZE = 72;

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function resolveFocusMaskRect(targetRect: DOMRect, focusPadding = FOCUS_PADDING): FocusMaskRect {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const top = clamp(targetRect.top - focusPadding, 0, viewportHeight);
    const left = clamp(targetRect.left - focusPadding, 0, viewportWidth);
    const right = clamp(targetRect.right + focusPadding, 0, viewportWidth);
    const bottom = clamp(targetRect.bottom + focusPadding, 0, viewportHeight);

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

function resolveBubbleLayout(targetRect: DOMRect, placement: GuideBubblePlacement, bubbleHeight: number): BubbleLayout {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const bubbleWidth = Math.min(BUBBLE_WIDTH, Math.max(240, viewportWidth - (VIEWPORT_PADDING * 2)));
    const bubbleHeightEstimate = bubbleHeight || 246;

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
    const [targetMissing, setTargetMissing] = useState(false);
    const [bubbleHeight, setBubbleHeight] = useState(246);
    const bubbleRef = useRef<HTMLDivElement | null>(null);
    const scrollAdjustedStepRef = useRef<string | null>(null);

    useEffect(() => {
        if (!step) {
            setTargetRect(null);
            return;
        }

        const update = () => {
            const target = document.querySelector(`[data-guide-id="${step.targetId}"]`) as HTMLElement | null;
            if (!target) {
                setTargetRect(null);
                setTargetMissing(true);
                return;
            }
            setTargetMissing(false);
            const rect = target.getBoundingClientRect();
            if (scrollAdjustedStepRef.current !== step.id) {
                const visibleTop = 112;
                const visibleBottom = window.innerHeight - 112;
                let scrollDelta = 0;
                if (rect.top < visibleTop) scrollDelta = rect.top - visibleTop;
                else if (rect.top > visibleBottom) scrollDelta = rect.top - visibleBottom;
                else if (rect.height < window.innerHeight * 0.55 && rect.bottom > visibleBottom) scrollDelta = rect.bottom - visibleBottom;

                scrollAdjustedStepRef.current = step.id;
                if (Math.abs(scrollDelta) > 2) {
                    const scrollContainer = target.closest('.overflow-y-auto') as HTMLElement | null;
                    if (scrollContainer) scrollContainer.scrollBy({ top: scrollDelta, behavior: 'smooth' });
                    else window.scrollBy({ top: scrollDelta, behavior: 'smooth' });
                }
            }
            setTargetRect(rect);
        };

        scrollAdjustedStepRef.current = null;
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [step]);

    useEffect(() => {
        const bubble = bubbleRef.current;
        if (!bubble) return;
        const update = () => setBubbleHeight(bubble.offsetHeight);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(bubble);
        return () => observer.disconnect();
    }, [step]);

    useEffect(() => {
        if (!step) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onSkip();
            if (event.key === 'ArrowLeft' && stepIndex > 0) onPrev();
            if (event.key === 'ArrowRight') onNext();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onNext, onPrev, onSkip, step, stepIndex]);

    const layout = useMemo(() => {
        if (!step || !targetRect) return null;
        return resolveBubbleLayout(targetRect, step.placement || 'bottom', bubbleHeight);
    }, [bubbleHeight, step, targetRect]);
    const focusMaskRect = useMemo(() => {
        if (!targetRect) return null;
        return resolveFocusMaskRect(targetRect, step?.focusPadding);
    }, [step?.focusPadding, targetRect]);
    const useCircularFocus = useMemo(() => {
        if (!targetRect) return false;
        return shouldUseCircularFocus(targetRect);
    }, [targetRect]);
    const circularFocusMaskStyle = useMemo(() => {
        if (!targetRect || !useCircularFocus) return null;
        const centerX = targetRect.left + (targetRect.width / 2);
        const centerY = targetRect.top + (targetRect.height / 2);
        const radius = Math.max(targetRect.width, targetRect.height) / 2 + (step?.focusPadding ?? FOCUS_PADDING);
        const maskImage = `radial-gradient(circle ${radius + 24}px at ${centerX}px ${centerY}px, transparent 0%, transparent 62%, rgba(0,0,0,0.22) 76%, black 100%)`;

        return {
            WebkitMaskImage: maskImage,
            maskImage,
        } as const;
    }, [step?.focusPadding, targetRect, useCircularFocus]);
    const featheredFocusMaskStyle = useMemo(() => {
        if (!focusMaskRect) return null;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const radius = Math.min(18, Math.max(8, Math.min(focusMaskRect.width, focusMaskRect.height) * 0.12));
        const blur = 14;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${viewportWidth}" height="${viewportHeight}" viewBox="0 0 ${viewportWidth} ${viewportHeight}"><defs><filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${blur}"/></filter><mask id="m" maskUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="white"/><rect x="${focusMaskRect.left}" y="${focusMaskRect.top}" width="${focusMaskRect.width}" height="${focusMaskRect.height}" rx="${radius}" fill="black" filter="url(#b)"/><rect x="${focusMaskRect.left}" y="${focusMaskRect.top}" width="${focusMaskRect.width}" height="${focusMaskRect.height}" rx="${radius}" fill="black"/></mask></defs><rect width="100%" height="100%" fill="white" mask="url(#m)"/></svg>`;
        const maskImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
        return { WebkitMaskImage: maskImage, maskImage } as const;
    }, [focusMaskRect]);

    if (!step) return null;

    const isLastStep = stepIndex >= stepCount - 1;
    const tourLabel = step.label || (
        step.targetId.startsWith('canvas-') ? 'Canvas essentials'
            : step.targetId.startsWith('chat-') ? 'Build with AI'
                : step.targetId.startsWith('edit-') ? 'Screen editor'
                    : 'Workspace essentials'
    );
    const bubbleStyle = targetMissing || !layout
        ? { top: '50%', left: '50%', width: Math.min(BUBBLE_WIDTH, window.innerWidth - 36), transform: 'translate(-50%, -50%)' }
        : { top: layout.bubble.top, left: layout.bubble.left, width: layout.bubble.width };

    return (
        <div className="pointer-events-none fixed inset-0 z-[160]" role="dialog" aria-modal="true" aria-label={tourLabel}>
            {targetMissing || !focusMaskRect ? (
                <div className="absolute inset-0 bg-[rgba(14,19,17,0.32)] backdrop-blur-[3px]" />
            ) : useCircularFocus && circularFocusMaskStyle ? (
                <div
                    className="absolute inset-0 bg-[rgba(14,19,17,0.3)] backdrop-blur-[3px]"
                    style={circularFocusMaskStyle}
                />
            ) : (
                <div className="absolute inset-0 bg-[rgba(14,19,17,0.3)] backdrop-blur-[3px]" style={featheredFocusMaskStyle || undefined} />
            )}
            {!targetMissing && layout && <div className="absolute h-4 w-4 rounded-[3px] border border-black/10 bg-white" style={{ top: layout.tail.top, left: layout.tail.left, transform: layout.tail.rotation }} />}
            <div
                ref={bubbleRef}
                className="pointer-events-auto absolute overflow-hidden rounded-[20px] border border-black/10 bg-white/95 text-[#171814] shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur-2xl"
                style={bubbleStyle}
            >
                <div className="h-1 bg-black/[0.06]">
                    <div className="h-full bg-[#0e1311] transition-[width] duration-300" style={{ width: `${((stepIndex + 1) / stepCount) * 100}%` }} />
                </div>
                <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.17em] text-[#8b867f]">
                                <Sparkles size={11} /> {tourLabel}
                            </p>
                            <h3 className="mt-2 text-[18px] font-bold leading-[1.15] tracking-[-0.035em] text-[#171814]">
                            {step.title}
                            </h3>
                        </div>
                        <button
                            type="button"
                            onClick={onSkip}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#8b867f] transition-colors hover:bg-black/[0.05] hover:text-black"
                            aria-label="Close guide"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <p className="mt-3 text-[13px] font-medium leading-[1.55] text-[#68645e]">{step.body}</p>
                    {step.tip && <p className="mt-3 rounded-[10px] bg-black/[0.035] px-3 py-2 text-[11px] leading-4 text-[#77726b]">{step.tip}</p>}
                    {targetMissing && <p className="mt-3 rounded-[10px] bg-amber-50 px-3 py-2 text-[11px] text-amber-800">This control is not visible right now. Continue to the next step or reopen the tour from Help later.</p>}

                    <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5" aria-label={`Step ${stepIndex + 1} of ${stepCount}`}>
                            {Array.from({ length: stepCount }, (_, index) => (
                                <span key={index} className={`h-1.5 rounded-full transition-all ${index === stepIndex ? 'w-5 bg-[#0e1311]' : index < stepIndex ? 'w-1.5 bg-[#8f9993]' : 'w-1.5 bg-black/10'}`} />
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            {stepIndex > 0 && (
                            <button
                                type="button"
                                onClick={onPrev}
                                className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-[11px] font-bold text-[#77726b] transition-colors hover:bg-black/[0.04] hover:text-black"
                            >
                                <ChevronLeft size={14} />
                                Back
                            </button>
                            )}
                            <button type="button" onClick={onNext} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0e1311] px-4 text-[11px] font-bold text-white transition-colors hover:bg-[#28342d]">
                                {isLastStep ? <><Check size={13} /> Finish</> : <>Next <ChevronRight size={14} /></>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
