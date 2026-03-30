import type { CSSProperties } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export const MAX_COMPOSER_ATTACHMENTS = 5;

const STACK_ROTATIONS = [-8, -4, 3, 7, 10];
const STACK_STEP_PX = 38;

type ComposerAttachmentStackProps = {
    images: string[];
    onRemove: (index: number) => void;
    className?: string;
    size?: 'default' | 'compact';
    badges?: Array<{
        label: string;
        tone?: 'saved' | 'upload';
    }>;
};

export function ComposerAttachmentStack({
    images,
    onRemove,
    className,
    size = 'default',
    badges,
}: ComposerAttachmentStackProps) {
    if (images.length === 0) return null;

    const visibleImages = images.slice(0, MAX_COMPOSER_ATTACHMENTS);
    const visibleBadges = (badges || []).slice(0, MAX_COMPOSER_ATTACHMENTS);
    const isCompact = size === 'compact';
    const stackStep = isCompact ? 30 : STACK_STEP_PX;
    const stackWidth = (isCompact ? 76 : 96) + Math.max(0, visibleImages.length - 1) * stackStep;

    return (
        <div
            className={cn(
                isCompact
                    ? 'pointer-events-none absolute left-4 top-[-3.35rem] z-0 h-[5rem] overflow-visible sm:left-5 sm:top-[-3.6rem] sm:h-[5.5rem]'
                    : 'pointer-events-none absolute left-4 top-[-4.8rem] z-0 h-[6.3rem] overflow-visible sm:left-5',
                className,
            )}
            style={{ width: `${stackWidth}px` }}
        >
            {visibleImages.map((src, index) => {
                const stackStyle = {
                    '--stack-x': `${index * stackStep}px`,
                    '--stack-rotation': `${STACK_ROTATIONS[index % STACK_ROTATIONS.length]}deg`,
                } as CSSProperties;

                return (
                    <div
                        key={`${src.slice(0, 32)}-${index}`}
                        className={cn(
                            'group pointer-events-auto absolute left-0 top-0 origin-bottom-left rounded-[1.2rem] [transform:translateX(var(--stack-x))_rotate(var(--stack-rotation))] transition-[transform,box-shadow] duration-200 ease-out hover:z-30 hover:[transform:translateX(var(--stack-x))_rotate(0deg)_scale(1.08)]',
                            isCompact ? 'h-[68px] w-[68px] sm:h-[76px] sm:w-[76px]' : 'h-[84px] w-[84px] sm:h-[96px] sm:w-[96px]',
                        )}
                        style={stackStyle}
                    >
                        <div
                            className={cn(
                                'relative w-full overflow-hidden rounded-[inherit] border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[var(--ui-surface-2)] shadow-[0_18px_40px_color-mix(in_srgb,var(--ui-primary)_10%,transparent)]',
                                'h-full',
                            )}
                        >
                            <img src={src} alt="" className="h-full w-full object-cover" />
                            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(15,23,42,0.16))]" />
                            {visibleBadges[index] ? (
                                <div
                                    className={`pointer-events-none absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                                        visibleBadges[index]?.tone === 'saved'
                                            ? 'bg-emerald-500/85 text-white'
                                            : 'bg-[var(--ui-surface-1)]/90 text-[var(--ui-text)]'
                                    }`}
                                >
                                    {visibleBadges[index]?.label}
                                </div>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            onClick={() => onRemove(index)}
                            className="absolute -right-2 -top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_24%,var(--ui-border))] bg-[var(--ui-surface-1)] text-[var(--ui-text)] opacity-0 shadow-[0_8px_24px_rgba(15,23,42,0.22)] transition-all duration-200 group-hover:opacity-100 group-hover:scale-100 hover:bg-[var(--ui-surface-3)]"
                            title={`Remove attachment ${index + 1}`}
                            aria-label={`Remove attachment ${index + 1}`}
                        >
                            <X size={12} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
