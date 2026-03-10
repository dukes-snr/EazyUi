import { Globe, Layers3, Link2 } from 'lucide-react';
import type { RefObject } from 'react';
import type { ComposerReferenceRootOption, ComposerScreenReferenceOption } from '../../utils/composerReferences';

type ComposerReferenceMenuProps = {
    activeIndex: number;
    menuMode: 'root' | 'url' | 'screen';
    menuRef?: RefObject<HTMLDivElement | null>;
    onCancel: () => void;
    onRootOptionHover: (index: number) => void;
    onScreenHover: (index: number) => void;
    onScreenQueryChange?: (value: string) => void;
    onSelectRootOption: (key: 'url' | 'screen') => void;
    onSelectScreen?: (screen: ComposerScreenReferenceOption) => void;
    onSubmitUrl?: () => void;
    rootOptions: ComposerReferenceRootOption[];
    screenOptions?: ComposerScreenReferenceOption[];
    screenQuery?: string;
    searchInputRef?: RefObject<HTMLInputElement | null>;
    urlDraft?: string;
    urlInputRef?: RefObject<HTMLInputElement | null>;
    onUrlDraftChange?: (value: string) => void;
};

export function ComposerReferenceMenu({
    activeIndex,
    menuMode,
    menuRef,
    onCancel,
    onRootOptionHover,
    onScreenHover,
    onScreenQueryChange,
    onSelectRootOption,
    onSelectScreen,
    onSubmitUrl,
    rootOptions,
    screenOptions = [],
    screenQuery = '',
    searchInputRef,
    urlDraft = '',
    urlInputRef,
    onUrlDraftChange,
}: ComposerReferenceMenuProps) {
    return (
        <div
            ref={menuRef}
            className="absolute left-12 right-2 bottom-[2px] z-50 mb-14 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-popover)] shadow-2xl"
        >
            {menuMode === 'root' && (
                <div className="max-h-56 overflow-y-auto py-1">
                    {rootOptions.map((option, index) => (
                        <button
                            key={option.key}
                            type="button"
                            onMouseEnter={() => onRootOptionHover(index)}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                onSelectRootOption(option.key);
                            }}
                            className={`flex w-full items-start gap-3 px-3 py-2 text-left transition-colors ${
                                index === activeIndex
                                    ? 'bg-indigo-500/20 text-[var(--ui-text)]'
                                    : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text)]'
                            }`}
                        >
                            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-3)]">
                                {option.key === 'url' ? <Globe size={13} /> : <Layers3 size={13} />}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-medium">{option.label}</span>
                                <span className="block text-xs text-[var(--ui-text-subtle)]">{option.description}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {menuMode === 'url' && (
                <div className="p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Reference URL</p>
                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2">
                        <Link2 size={14} className="shrink-0 text-[var(--ui-text-subtle)]" />
                        <input
                            ref={urlInputRef}
                            type="text"
                            value={urlDraft}
                            onChange={(event) => onUrlDraftChange?.(event.target.value)}
                            placeholder="https://example.com"
                            className="w-full border-0 bg-transparent px-0 py-0 text-sm text-[var(--ui-text)] focus:border-0"
                        />
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onMouseDown={(event) => {
                                event.preventDefault();
                                onCancel();
                            }}
                            className="inline-flex h-8 items-center justify-center rounded-full border border-[var(--ui-border)] px-3 text-xs font-medium text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onMouseDown={(event) => {
                                event.preventDefault();
                                onSubmitUrl?.();
                            }}
                            className="inline-flex h-8 items-center justify-center rounded-full bg-[var(--ui-primary)] px-3 text-xs font-semibold text-white hover:bg-[var(--ui-primary-hover)]"
                        >
                            Add URL
                        </button>
                    </div>
                </div>
            )}

            {menuMode === 'screen' && (
                <div className="p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Reference Screen</p>
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={screenQuery}
                        onChange={(event) => onScreenQueryChange?.(event.target.value)}
                        placeholder="Search screens"
                        className="mt-2 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-sm text-[var(--ui-text)]"
                    />
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
                        {screenOptions.length > 0 ? screenOptions.map((screen, index) => (
                            <button
                                key={screen.screenId}
                                type="button"
                                onMouseEnter={() => onScreenHover(index)}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    onSelectScreen?.(screen);
                                }}
                                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                                    index === activeIndex
                                        ? 'bg-indigo-500/20 text-[var(--ui-text)]'
                                        : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text)]'
                                }`}
                            >
                                <span className="block font-medium">{screen.name}</span>
                            </button>
                        )) : (
                            <div className="px-3 py-3 text-sm text-[var(--ui-text-subtle)]">No matching screens.</div>
                        )}
                    </div>
                    <div className="mt-3 flex items-center justify-end">
                        <button
                            type="button"
                            onMouseDown={(event) => {
                                event.preventDefault();
                                onCancel();
                            }}
                            className="inline-flex h-8 items-center justify-center rounded-full border border-[var(--ui-border)] px-3 text-xs font-medium text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
