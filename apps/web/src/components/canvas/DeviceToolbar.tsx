import { memo, useEffect, useRef, useState } from 'react';
import {
    ArrowUp,
    Check,
    Focus,
    Monitor,
    MoreHorizontal,
    PencilLine,
    Plus,
    RotateCcw,
    Smartphone,
    Sparkles,
    Tablet,
    Trash2,
    X,
} from 'lucide-react';

interface DeviceToolbarProps {
    screenId?: string;
    onAction?: (action: string, payload?: any) => void;
    currentDevice?: 'desktop' | 'tablet' | 'mobile';
    currentDisplayMode?: 'framed' | 'clean';
}

export const DeviceToolbar = memo(({ onAction, currentDevice = 'mobile', currentDisplayMode = 'framed' }: DeviceToolbarProps) => {
    const [isWriting, setIsWriting] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [editImages, setEditImages] = useState<string[]>([]);
    const [isRegenOpen, setIsRegenOpen] = useState(false);
    const [regenImages, setRegenImages] = useState<string[]>([]);
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const editFileInputRef = useRef<HTMLInputElement>(null);
    const regenFileInputRef = useRef<HTMLInputElement>(null);
    const moreMenuRef = useRef<HTMLDivElement>(null);

    const handleFiles = (files: FileList | null, target: 'edit' | 'regen') => {
        if (!files) return;
        Array.from(files).forEach((file) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                if (!result) return;
                if (target === 'edit') {
                    setEditImages((prev) => [...prev, result]);
                } else {
                    setRegenImages((prev) => [...prev, result]);
                }
            };
            reader.readAsDataURL(file);
        });
    };

    const handleSubmit = () => {
        if (!inputValue.trim()) return;
        onAction?.('submit-edit', { instruction: inputValue, images: editImages });
        setInputValue('');
        setEditImages([]);
        setIsWriting(false);
    };

    const handleRegenerate = () => {
        onAction?.('regenerate', { images: regenImages });
        setRegenImages([]);
        setIsRegenOpen(false);
    };

    useEffect(() => {
        if (!isMoreOpen) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (!moreMenuRef.current) return;
            if (!moreMenuRef.current.contains(event.target as Node)) {
                setIsMoreOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isMoreOpen]);

    return (
        <div className="pointer-events-auto flex items-center gap-2">
            <div
                className={`animate-fade-in-up flex items-center gap-1.5 rounded-[28px] border border-[var(--ui-border-card)] bg-[color:color-mix(in_srgb,var(--ui-surface-2)_92%,var(--ui-surface-1))] px-[8px] py-[7px] shadow-[0_10px_28px_rgba(0,0,0,0.18)] transition-all duration-300 ${isWriting ? 'min-w-[500px]' : 'min-w-[360px]'}`}
            >
                <div className="flex flex-1 items-center transition-all duration-300">
                    {!isWriting ? (
                        <button
                            onClick={() => setIsWriting(true)}
                            className="flex h-10 items-center gap-2 rounded-full bg-[var(--ui-surface-1)] px-3.5 text-[var(--ui-text)] shadow-[0_2px_8px_rgba(0,0,0,0.14)] transition-all active:scale-95"
                        >
                            <Sparkles size={14} />
                            <span className="whitespace-nowrap text-[13px] font-medium">Refine</span>
                        </button>
                    ) : (
                        <div className="animate-in slide-in-from-left-2 fade-in flex flex-1 items-center gap-2 px-1 duration-300">
                            <div className="relative flex-1">
                                <input
                                    autoFocus
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSubmit();
                                        if (e.key === 'Escape') setIsWriting(false);
                                    }}
                                    placeholder="What style edit do you want?"
                                    className="h-9 w-full rounded-full border border-[var(--ui-border-card)] bg-[color:color-mix(in_srgb,var(--ui-surface-3)_92%,transparent)] pl-9 pr-3 text-[13px] text-[var(--ui-text)] outline-none transition-all placeholder:text-[var(--ui-text-subtle)]"
                                />
                                <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-text-subtle)]" />
                            </div>
                            <button
                                onClick={() => editFileInputRef.current?.click()}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ui-text-subtle)] transition-all hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-3))] hover:text-[var(--ui-text)]"
                                title="Attach reference image(s)"
                            >
                                <Plus size={15} />
                            </button>
                            <input
                                ref={editFileInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    handleFiles(e.target.files, 'edit');
                                    e.currentTarget.value = '';
                                }}
                            />
                            <button
                                onClick={handleSubmit}
                                disabled={!inputValue.trim()}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ui-surface-1)] text-[var(--ui-text)] transition-all hover:bg-[var(--ui-surface-1)] disabled:opacity-30 active:scale-90"
                            >
                                <ArrowUp size={15} />
                            </button>
                            <button
                                onClick={() => {
                                    setIsWriting(false);
                                    setEditImages([]);
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ui-text-subtle)] transition-all hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-3))] hover:text-[var(--ui-text)]"
                            >
                                <X size={15} />
                            </button>
                        </div>
                    )}
                </div>

                {!isWriting && (
                    <>
                        <div className="mx-1 h-[22px] w-px bg-[color:color-mix(in_srgb,var(--ui-border-card)_90%,transparent)]" />

                        <div className="flex items-center gap-1">
                            <ToolbarButton icon={<PencilLine size={16} />} title="Edit" onClick={() => onAction?.('edit')} />
                            <ToolbarButton icon={<Focus size={16} />} title="Focus Screen" onClick={() => onAction?.('focus')} />
                            <div className="mx-0.5 h-3 w-px bg-[color:color-mix(in_srgb,var(--ui-border-card)_90%,transparent)]" />
                            <ToolbarButton
                                icon={<Trash2 size={16} />}
                                title="Delete Screen"
                                className="text-red-400/75 hover:text-red-300 hover:bg-red-500/10"
                                onClick={() => onAction?.('delete')}
                            />
                        </div>

                        <div className="mx-1 h-[22px] w-px bg-[color:color-mix(in_srgb,var(--ui-border-card)_90%,transparent)]" />

                        <div className="flex items-center gap-1 pr-1">
                            <ToolbarButton
                                icon={<Monitor size={16} />}
                                title="Desktop"
                                active={currentDevice === 'desktop'}
                                onClick={() => onAction?.('desktop')}
                            />
                            <ToolbarButton
                                icon={<Tablet size={16} />}
                                title="Tablet"
                                active={currentDevice === 'tablet'}
                                onClick={() => onAction?.('tablet')}
                            />
                            <ToolbarButton
                                icon={<Smartphone size={16} />}
                                title="Mobile"
                                active={currentDevice === 'mobile'}
                                onClick={() => onAction?.('mobile')}
                            />
                            <div ref={moreMenuRef} className="relative ml-1">
                                <ToolbarButton
                                    icon={<MoreHorizontal size={16} />}
                                    title="More settings"
                                    active={isMoreOpen}
                                    onClick={() => setIsMoreOpen((value) => !value)}
                                />
                                {isMoreOpen && (
                                    <div className="absolute right-0 top-full z-[120] mt-3 min-w-[180px] rounded-2xl border border-[var(--ui-border-card)] bg-[color:color-mix(in_srgb,var(--ui-popover)_96%,transparent)] p-1.5 shadow-[0_10px_24px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                                        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">
                                            Canvas display
                                        </div>
                                        <MenuOption
                                            label="Framed"
                                            active={currentDisplayMode === 'framed'}
                                            icon={currentDisplayMode === 'framed' ? <Check size={14} /> : undefined}
                                            onClick={() => {
                                                onAction?.('display-mode', { mode: 'framed' });
                                                setIsMoreOpen(false);
                                            }}
                                        />
                                        <MenuOption
                                            label="Clean"
                                            active={currentDisplayMode === 'clean'}
                                            icon={currentDisplayMode === 'clean' ? <Check size={14} /> : undefined}
                                            onClick={() => {
                                                onAction?.('display-mode', { mode: 'clean' });
                                                setIsMoreOpen(false);
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {!isRegenOpen ? (
                <button
                    onClick={() => setIsRegenOpen(true)}
                    title="Regenerate"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--ui-border-card)] bg-[color:color-mix(in_srgb,var(--ui-surface-2)_92%,var(--ui-surface-1))] text-[var(--ui-text-muted)] shadow-[0_10px_28px_rgba(0,0,0,0.18)] transition-all hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-3))] hover:text-[var(--ui-text)] active:scale-95"
                >
                    <RotateCcw size={16} />
                </button>
            ) : (
                <div className="animate-in slide-in-from-right-2 fade-in flex h-10 items-center gap-1.5 rounded-full border border-[var(--ui-border-card)] bg-[color:color-mix(in_srgb,var(--ui-surface-2)_92%,var(--ui-surface-1))] pl-2 pr-1 shadow-[0_10px_28px_rgba(0,0,0,0.18)] transition-all duration-300">
                    <button
                        onClick={() => regenFileInputRef.current?.click()}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ui-text-subtle)] transition-all hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-3))] hover:text-[var(--ui-text)]"
                        title="Attach reference image(s)"
                    >
                        <Plus size={15} />
                    </button>
                    <input
                        ref={regenFileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                            handleFiles(e.target.files, 'regen');
                            e.currentTarget.value = '';
                        }}
                    />
                    <button
                        onClick={handleRegenerate}
                        className="h-8 whitespace-nowrap rounded-full bg-[var(--ui-surface-1)] px-3 text-xs font-semibold text-[var(--ui-text)] transition-all hover:bg-[var(--ui-surface-1)] active:scale-95"
                    >
                        Regenerate
                    </button>
                    <button
                        onClick={() => {
                            setIsRegenOpen(false);
                            setRegenImages([]);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ui-text-subtle)] transition-all hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-3))] hover:text-[var(--ui-text)]"
                        title="Close"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {isWriting && editImages.length > 0 && (
                <div className="scrollbar-hide flex max-w-[180px] items-center gap-1 overflow-x-auto">
                    {editImages.map((img, idx) => (
                        <div key={idx} className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-[var(--ui-border)]">
                            <img src={img} alt="edit-attachment" className="h-full w-full object-cover" />
                            <button
                                onClick={() => setEditImages((prev) => prev.filter((_, i) => i !== idx))}
                                className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity hover:opacity-100"
                            >
                                <X size={10} className="text-white" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {isRegenOpen && regenImages.length > 0 && (
                <div className="scrollbar-hide flex max-w-[120px] items-center gap-1 overflow-x-auto">
                    {regenImages.map((img, idx) => (
                        <div key={idx} className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-[var(--ui-border)]">
                            <img src={img} alt="regen-attachment" className="h-full w-full object-cover" />
                            <button
                                onClick={() => setRegenImages((prev) => prev.filter((_, i) => i !== idx))}
                                className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity hover:opacity-100"
                            >
                                <X size={10} className="text-white" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});

const ToolbarButton = ({
    icon,
    title,
    onClick,
    className = '',
    active = false,
}: {
    icon: React.ReactNode;
    title: string;
    onClick: () => void;
    className?: string;
    active?: boolean;
}) => (
    <button
        title={title}
        onClick={onClick}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-all active:scale-90 ${active
            ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-surface-3))] text-[var(--ui-primary)] ring-1 ring-[color:color-mix(in_srgb,var(--ui-primary)_30%,transparent)]'
            : 'text-[var(--ui-text-muted)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-3))] hover:text-[var(--ui-text)]'
            } ${className}`}
    >
        {icon}
    </button>
);

const MenuOption = ({
    label,
    icon,
    onClick,
    active = false,
}: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    active?: boolean;
}) => (
    <button
        onClick={onClick}
        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[13px] transition-all ${active
            ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_12%,var(--ui-surface-3))] text-[var(--ui-text)]'
            : 'text-[var(--ui-text-muted)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-3))] hover:text-[var(--ui-text)]'
            }`}
    >
        <span className="font-medium">{label}</span>
        {icon ? <span className="text-[var(--ui-primary)]">{icon}</span> : null}
    </button>
);
