import { getComposerInlineReferenceSegments, type ComposerScreenReferenceOption } from '../../utils/composerReferences';

type ComposerInlineReferenceOverlayProps = {
    value: string;
    allowScreen?: boolean;
    screens?: ComposerScreenReferenceOption[];
    className?: string;
};

const HIGHLIGHT_TONES = [
    'bg-[linear-gradient(180deg,transparent_30%,rgba(251,191,36,0.68)_30%,rgba(251,191,36,0.68)_92%,transparent_92%)] text-[#fff6d6]',
    'bg-[linear-gradient(180deg,transparent_30%,rgba(110,231,183,0.58)_30%,rgba(110,231,183,0.58)_92%,transparent_92%)] text-[#eafff6]',
    'bg-[linear-gradient(180deg,transparent_30%,rgba(125,211,252,0.58)_30%,rgba(125,211,252,0.58)_92%,transparent_92%)] text-[#eef9ff]',
    'bg-[linear-gradient(180deg,transparent_30%,rgba(244,114,182,0.54)_30%,rgba(244,114,182,0.54)_92%,transparent_92%)] text-[#fff0f7]',
    'bg-[linear-gradient(180deg,transparent_30%,rgba(196,181,253,0.6)_30%,rgba(196,181,253,0.6)_92%,transparent_92%)] text-[#f6f1ff]',
];

function getHighlightTone(text: string): string {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(index);
        hash |= 0;
    }
    return HIGHLIGHT_TONES[Math.abs(hash) % HIGHLIGHT_TONES.length] || HIGHLIGHT_TONES[0];
}

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

                const toneClass = getHighlightTone(segment.text);

                return (
                    <span
                        key={`segment-${index}`}
                        className={`mx-[0.02em] inline rounded-[0.2em] px-[0.08em] py-0 align-baseline font-semibold decoration-clone [-webkit-box-decoration-break:clone] [box-decoration-break:clone] ${toneClass}`}
                    >
                        {segment.text}
                    </span>
                );
            })}
        </div>
    );
}
