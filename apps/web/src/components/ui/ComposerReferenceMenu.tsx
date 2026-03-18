import { Globe, Layers3, Link2 } from 'lucide-react';
import type { Ref } from 'react';
import type { ComposerReferenceRootOption, ComposerReferenceRootOptionKey, ComposerScreenReferenceOption } from '../../utils/composerReferences';

type ComposerReferenceMenuProps = {
    activeIndex: number;
    menuMode: 'root' | 'url' | 'screen';
    menuRef?: Ref<HTMLDivElement>;
    includeScrapedImages?: boolean;
    onCancel: () => void;
    onIncludeScrapedImagesChange?: (value: boolean) => void;
    onRootOptionHover: (index: number) => void;
    onScreenHover: (index: number) => void;
    onScreenQueryChange?: (value: string) => void;
    onSelectRootOption: (key: ComposerReferenceRootOptionKey) => void;
    onSelectScreen?: (screen: ComposerScreenReferenceOption) => void;
    onSubmitUrl?: () => void;
    rootOptions: ComposerReferenceRootOption[];
    screenOptions?: ComposerScreenReferenceOption[];
    screenQuery?: string;
    searchInputRef?: Ref<HTMLInputElement>;
    urlDraft?: string;
    urlInputRef?: Ref<HTMLInputElement>;
    onUrlDraftChange?: (value: string) => void;
};

export function ComposerReferenceMenu({
    activeIndex,
    menuMode,
    menuRef,
    includeScrapedImages = false,
    onCancel,
    onIncludeScrapedImagesChange,
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
            className="absolute inset-x-3 bottom-full z-50 mb-3 overflow-hidden rounded-[24px] border border-[var(--ui-border)] bg-[color-mix(in_srgb,var(--ui-popover)_88%,rgba(15,23,42,0.08))] shadow-[0_24px_60px_rgba(2,6,23,0.28)] backdrop-blur-2xl"
        >
            {menuMode === 'root' && (
                <div className="max-h-56 overflow-y-auto p-2">
                    <div className="px-2 pb-2 pt-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ui-text-subtle)]">Add Reference</p>
                        <p className="mt-1 text-xs text-[var(--ui-text-muted)]">Pull in a URL or reuse a screen as context.</p>
                    </div>
                    {rootOptions.length > 0 ? rootOptions.map((option, index) => (
                        <button
                            key={option.key}
                            type="button"
                            onMouseEnter={() => onRootOptionHover(index)}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                onSelectRootOption(option.key);
                            }}
                            className={`flex w-full items-start gap-3 rounded-[18px] px-3 py-3 text-left transition-all ${
                                index === activeIndex
                                    ? 'bg-[color-mix(in_srgb,var(--ui-primary)_16%,white_6%)] text-[var(--ui-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                                    : 'text-[var(--ui-text-muted)] hover:bg-[color-mix(in_srgb,var(--ui-surface-3)_86%,transparent)] hover:text-[var(--ui-text)]'
                            }`}
                        >
                            <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
                                index === activeIndex
                                    ? 'bg-[color-mix(in_srgb,var(--ui-primary)_22%,transparent)] text-[var(--ui-text)]'
                                    : 'bg-[color-mix(in_srgb,var(--ui-surface-3)_90%,transparent)] text-[var(--ui-text-subtle)]'
                            }`}>
                                {option.key === 'url' ? <Globe size={13} /> : <Layers3 size={13} />}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold">{option.label}</span>
                                <span className="mt-0.5 block text-xs text-[var(--ui-text-subtle)]">{option.description}</span>
                            </span>
                        </button>
                    )) : (
                        <div className="px-4 py-4 text-sm text-[var(--ui-text-subtle)]">
                            No reference types match that query.
                        </div>
                    )}
                </div>
            )}

            {menuMode === 'url' && (
                <div className="p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ui-text-subtle)]">Reference URL</p>
                    <p className="mt-1 text-xs text-[var(--ui-text-muted)]">Add a page to scrape and use as inspiration context.</p>
                    <div className="mt-3 flex items-center gap-2 rounded-[18px] bg-[color-mix(in_srgb,var(--ui-surface-2)_88%,transparent)] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--ui-surface-3)_90%,transparent)] text-[var(--ui-text-subtle)]">
                            <Link2 size={14} />
                        </span>
                        <input
                            ref={urlInputRef}
                            type="text"
                            value={urlDraft}
                            onChange={(event) => onUrlDraftChange?.(event.target.value)}
                            placeholder="https://example.com"
                            className="w-full border-0 bg-transparent px-0 py-0 text-sm text-[var(--ui-text)] placeholder:text-[var(--ui-text-subtle)] focus:border-0 focus:outline-none focus:ring-0"
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    onSubmitUrl?.();
                                }
                                if (event.key === 'Escape') {
                                    event.preventDefault();
                                    onCancel();
                                }
                            }}
                        />
                    </div>
                    {onIncludeScrapedImagesChange ? (
                        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_5%,transparent)] px-3 py-3">
                            <input
                                type="checkbox"
                                checked={includeScrapedImages}
                                onChange={(event) => onIncludeScrapedImagesChange(event.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-[var(--ui-border)] bg-[var(--ui-surface-1)] text-[var(--ui-primary)]"
                            />
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold text-[var(--ui-text)]">Include scraped site images</span>
                                <span className="mt-0.5 block text-xs leading-5 text-[var(--ui-text-subtle)]">
                                    Pull a few visual references from the page and send them with the prompt.
                                </span>
                            </span>
                        </label>
                    ) : null}
                    <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onMouseDown={(event) => {
                                event.preventDefault();
                                onCancel();
                            }}
                            className="inline-flex h-9 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ui-surface-3)_92%,transparent)] px-3.5 text-xs font-medium text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onMouseDown={(event) => {
                                event.preventDefault();
                                onSubmitUrl?.();
                            }}
                            className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--ui-primary)] px-4 text-xs font-semibold text-white shadow-[0_10px_24px_color-mix(in_srgb,var(--ui-primary)_36%,transparent)] transition-colors hover:bg-[var(--ui-primary-hover)]"
                        >
                            Add URL
                        </button>
                    </div>
                </div>
            )}

            {menuMode === 'screen' && (
                <div className="p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ui-text-subtle)]">Reference Screen</p>
                    <p className="mt-1 text-xs text-[var(--ui-text-muted)]">Choose an existing canvas screen to keep layout and style continuity.</p>
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={screenQuery}
                        onChange={(event) => onScreenQueryChange?.(event.target.value)}
                        placeholder="Search screens"
                        className="mt-3 w-full rounded-[18px] bg-[color-mix(in_srgb,var(--ui-surface-2)_88%,transparent)] px-3 py-3 text-sm text-[var(--ui-text)] placeholder:text-[var(--ui-text-subtle)] focus:outline-none focus:ring-0"
                    />
                    <div className="mt-3 max-h-48 overflow-y-auto rounded-[20px] bg-[color-mix(in_srgb,var(--ui-surface-2)_70%,transparent)] p-1.5">
                        {screenOptions.length > 0 ? screenOptions.map((screen, index) => (
                            <button
                                key={screen.screenId}
                                type="button"
                                onMouseEnter={() => onScreenHover(index)}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    onSelectScreen?.(screen);
                                }}
                                className={`w-full rounded-[16px] px-3 py-3 text-left text-sm transition-all ${
                                    index === activeIndex
                                        ? 'bg-[color-mix(in_srgb,var(--ui-primary)_16%,white_6%)] text-[var(--ui-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                                        : 'text-[var(--ui-text-muted)] hover:bg-[color-mix(in_srgb,var(--ui-surface-3)_88%,transparent)] hover:text-[var(--ui-text)]'
                                }`}
                            >
                                <span className="block font-medium">{screen.name}</span>
                            </button>
                        )) : (
                            <div className="px-3 py-4 text-sm text-[var(--ui-text-subtle)]">No matching screens.</div>
                        )}
                    </div>
                    <div className="mt-3 flex items-center justify-end">
                        <button
                            type="button"
                            onMouseDown={(event) => {
                                event.preventDefault();
                                onCancel();
                            }}
                            className="inline-flex h-9 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ui-surface-3)_92%,transparent)] px-3.5 text-xs font-medium text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
