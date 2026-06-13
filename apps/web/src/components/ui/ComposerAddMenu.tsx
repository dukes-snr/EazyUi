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
            className="composer-add-menu absolute bottom-full left-0 z-50 mb-3 overflow-hidden border border-[var(--ui-border)] bg-[color-mix(in_srgb,var(--ui-popover)_96%,rgba(255,255,255,0.4))] shadow-[0_24px_60px_rgba(2,6,23,0.22)] backdrop-blur-2xl"
        >
            <div className="composer-add-menu__inner">
                <div className="composer-add-menu__header">
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
                        className="composer-add-menu__option"
                    >
                        <span className="composer-add-menu__icon">
                            <Icon size={16} />
                        </span>
                        <span className="composer-add-menu__copy">
                            <span className="block text-sm font-semibold">{label}</span>
                            <span className="mt-0.5 block text-xs text-[var(--ui-text-subtle)]">{description}</span>
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
