import { getComposerInlineReferenceSegments, type ComposerScreenReferenceOption } from '../../utils/composerReferences';

type ComposerInlineReferenceOverlayProps = {
    value: string;
    allowScreen?: boolean;
    screens?: ComposerScreenReferenceOption[];
    className?: string;
};

export function ComposerInlineReferenceOverlay({
    value,
    allowScreen = false,
    screens = [],
    className = '',
}: ComposerInlineReferenceOverlayProps) {
    const segments = getComposerInlineReferenceSegments(value, { allowScreen, screens });

    return (
        <div
            aria-hidden="true"
            className={`pointer-events-none whitespace-pre-wrap break-words text-[var(--ui-text)] ${className}`.trim()}
        >
            {segments.map((segment, index) => {
                if (segment.kind === 'text') {
                    return <span key={`segment-${index}`}>{segment.text || (index === segments.length - 1 ? ' ' : '')}</span>;
                }

                const toneClass = segment.kind === 'screen'
                    ? 'bg-[color-mix(in_srgb,var(--ui-primary)_16%,white_6%)] text-[var(--ui-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'bg-[color-mix(in_srgb,var(--ui-surface-3)_92%,transparent)] text-[var(--ui-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]';

                return (
                    <span
                        key={`segment-${index}`}
                        className={`mx-[0.1em] inline-block rounded-full px-[0.5em] py-[0.08em] align-baseline ${toneClass}`}
                    >
                        {segment.text}
                    </span>
                );
            })}
        </div>
    );
}
