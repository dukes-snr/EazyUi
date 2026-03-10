import { Globe, Layers3, X } from 'lucide-react';
import type { ComposerScreenReferenceOption, ComposerUrlReference } from '../../utils/composerReferences';

type ComposerReferenceChipsProps = {
    screenReferences?: ComposerScreenReferenceOption[];
    urlReferences?: ComposerUrlReference[];
    onRemoveScreen?: (screenId: string) => void;
    onRemoveUrl?: (referenceId: string) => void;
};

export function ComposerReferenceChips({
    screenReferences = [],
    urlReferences = [],
    onRemoveScreen,
    onRemoveUrl,
}: ComposerReferenceChipsProps) {
    if (screenReferences.length === 0 && urlReferences.length === 0) return null;

    return (
        <div className="mb-2 flex flex-wrap gap-1.5 border-b border-[var(--ui-border)] px-1 pb-2">
            {screenReferences.map((item) => (
                <div
                    key={item.screenId}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[var(--ui-surface-3)] px-2.5 py-1 text-[11px] font-medium text-[var(--ui-text)] ring-1 ring-[var(--ui-border)]"
                >
                    <Layers3 size={12} className="shrink-0 text-[var(--ui-text-subtle)]" />
                    <span className="max-w-[170px] truncate">@screen:{item.name}</span>
                    <button
                        type="button"
                        onClick={() => onRemoveScreen?.(item.screenId)}
                        className="inline-flex items-center justify-center rounded-full text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                        title={`Remove ${item.name}`}
                    >
                        <X size={12} />
                    </button>
                </div>
            ))}

            {urlReferences.map((item) => (
                <div
                    key={item.id}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[var(--ui-surface-3)] px-2.5 py-1 text-[11px] font-medium text-[var(--ui-text)] ring-1 ring-[var(--ui-border)]"
                    title={item.url}
                >
                    <Globe size={12} className="shrink-0 text-[var(--ui-text-subtle)]" />
                    <span className="max-w-[170px] truncate">@url:{item.label}</span>
                    <button
                        type="button"
                        onClick={() => onRemoveUrl?.(item.id)}
                        className="inline-flex items-center justify-center rounded-full text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                        title={`Remove ${item.url}`}
                    >
                        <X size={12} />
                    </button>
                </div>
            ))}
        </div>
    );
}
