import { Globe, Paperclip } from 'lucide-react';
import type { Ref } from 'react';

type ComposerAddMenuProps = {
    menuRef?: Ref<HTMLDivElement>;
    onAddFiles: () => void;
    onAddUrl: () => void;
};

export function ComposerAddMenu({
    menuRef,
    onAddFiles,
    onAddUrl,
}: ComposerAddMenuProps) {
    return (
        <div
            ref={menuRef}
            className="absolute bottom-full left-0 z-50 mb-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[26px] border border-[var(--ui-border)] bg-[color-mix(in_srgb,var(--ui-popover)_92%,rgba(15,23,42,0.12))] shadow-[0_28px_70px_rgba(2,6,23,0.26)] backdrop-blur-2xl"
        >
            <div className="p-2">
                <div className="px-3 pb-2 pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ui-text-subtle)]">Add to prompt</p>
                    <p className="mt-1 text-xs text-[var(--ui-text-muted)]">Attach files or add a website reference.</p>
                </div>
                {[
                    {
                        key: 'files',
                        label: 'Add photos & files',
                        description: 'Upload screenshots, moodboards, or UI references.',
                        Icon: Paperclip,
                        action: onAddFiles,
                    },
                    {
                        key: 'url',
                        label: 'Add website URL',
                        description: 'Use the reference popup to scrape branding, content, and optional site visuals.',
                        Icon: Globe,
                        action: onAddUrl,
                    },
                ].map(({ key, label, description, Icon, action }) => (
                    <button
                        key={key}
                        type="button"
                        onMouseDown={(event) => {
                            event.preventDefault();
                            action();
                        }}
                        className="flex w-full items-start gap-3 rounded-[18px] px-3 py-3 text-left text-[var(--ui-text-muted)] transition-all hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,transparent)] hover:text-[var(--ui-text)]"
                    >
                        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-3))] text-[var(--ui-primary)]">
                            <Icon size={16} />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-sm font-semibold">{label}</span>
                            <span className="mt-0.5 block text-xs text-[var(--ui-text-subtle)]">{description}</span>
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
