import { memo, useRef, useState } from 'react';
import {
    Sparkles,
    PencilLine,
    Monitor,
    Tablet,
    Smartphone,
    Focus,
    ArrowUp,
    X,
    Trash2,
    RotateCcw,
    Plus
} from 'lucide-react';

interface DeviceToolbarProps {
    screenId?: string;
    onAction?: (action: string, payload?: any) => void;
}

export const DeviceToolbar = memo(({ onAction }: DeviceToolbarProps) => {
    const [isWriting, setIsWriting] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [editImages, setEditImages] = useState<string[]>([]);
    const [isRegenOpen, setIsRegenOpen] = useState(false);
    const [regenImages, setRegenImages] = useState<string[]>([]);
    const editFileInputRef = useRef<HTMLInputElement>(null);
    const regenFileInputRef = useRef<HTMLInputElement>(null);

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

    return (
        <div className="flex items-center gap-2 pointer-events-auto">
            <div className={`flex items-center gap-1.5 p-2 bg-[#0f111a]/95 backdrop-blur-md rounded-full shadow-2xl ring-1 ring-white/10 transition-all duration-300 animate-fade-in-up ${isWriting ? 'min-w-[500px]' : 'min-w-[360px]'}`}>
                {/* Left: Write Content Action */}
                <div className={`flex items-center transition-all duration-300 flex-1`}>
                    {!isWriting ? (
                        <button
                            onClick={() => setIsWriting(true)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-indigo-700 hover:text-white text-black rounded-2xl transition-all active:scale-95 group"
                        >
                            <Sparkles size={14} className="text-ink-800" />
                            <span className="text-[13px] font-medium whitespace-nowrap">Refine</span>
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 flex-1 px-1 animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="flex-1 relative">
                                <input
                                    autoFocus
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSubmit();
                                        if (e.key === 'Escape') setIsWriting(false);
                                    }}
                                    placeholder="What style edit do you want?"
                                    className="w-full h-9 pl-9 pr-3 bg-white/5 rounded-3xl text-white text-[13px] outline-none transition-all placeholder:text-gray-500"
                                />
                                <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-300" />
                            </div>
                            <button
                                onClick={() => editFileInputRef.current?.click()}
                                className="p-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                                title="Attach reference image(s)"
                            >
                                <Plus size={16} />
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
                                className="p-2 bg-white text-slate-900 rounded-2xl hover:bg-gray-200 disabled:opacity-30 transition-all active:scale-90"
                            >
                                <ArrowUp size={16} />
                            </button>
                            <button
                                onClick={() => {
                                    setIsWriting(false);
                                    setEditImages([]);
                                }}
                                className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}
                </div>

                {!isWriting && (
                    <>
                        {/* Separator */}
                        <div className="w-[1px] h-4 bg-white/10 mx-1" />

                        {/* Center: Actions */}
                        <div className="flex items-center gap-1">
                            <ToolbarButton
                                icon={<PencilLine size={16} />}
                                title="Edit"
                                onClick={() => onAction?.('edit')}
                            />
                            <ToolbarButton
                                icon={<Focus size={16} />}
                                title="Focus Screen"
                                onClick={() => onAction?.('focus')}
                            />
                            <div className="w-[1px] h-3 bg-white/5 mx-0.5" />
                            <ToolbarButton
                                icon={<Trash2 size={16} />}
                                title="Delete Screen"
                                className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                                onClick={() => onAction?.('delete')}
                            />
                        </div>

                        {/* Separator */}
                        <div className="w-[1px] h-4 bg-white/10 mx-1" />

                        {/* Right: Device Switcher */}
                        <div className="flex items-center gap-1 pr-1">
                            <ToolbarButton
                                icon={<Monitor size={16} />}
                                title="Desktop"
                                onClick={() => onAction?.('desktop')}
                            />
                            <ToolbarButton
                                icon={<Tablet size={16} />}
                                title="Tablet"
                                onClick={() => onAction?.('tablet')}
                            />
                            <ToolbarButton
                                icon={<Smartphone size={16} />}
                                title="Mobile"
                                onClick={() => onAction?.('mobile')}
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Floating regenerate control */}
            {!isRegenOpen ? (
                <button
                    onClick={() => setIsRegenOpen(true)}
                    title="Regenerate"
                    className="h-12 w-12 shrink-0 rounded-full bg-[#0f111a]/95 text-gray-300 hover:text-white ring-1 ring-white/10 backdrop-blur-md shadow-2xl flex items-center justify-center transition-all active:scale-95"
                >
                    <RotateCcw size={16} />
                </button>
            ) : (
                <div className="h-12 pl-2 pr-1 rounded-full bg-[#0f111a]/95 ring-1 ring-white/10 backdrop-blur-md shadow-2xl flex items-center gap-1.5 transition-all duration-300 animate-in fade-in slide-in-from-right-2">
                    <button
                        onClick={() => regenFileInputRef.current?.click()}
                        className="p-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all"
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
                        className="h-8 px-3 rounded-full bg-white text-black hover:bg-gray-200 text-xs font-semibold transition-all active:scale-95 whitespace-nowrap"
                    >
                        Regenerate
                    </button>
                    <button
                        onClick={() => {
                            setIsRegenOpen(false);
                            setRegenImages([]);
                        }}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                        title="Close"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {(isWriting && editImages.length > 0) && (
                <div className="flex items-center gap-1 max-w-[180px] overflow-x-auto scrollbar-hide">
                    {editImages.map((img, idx) => (
                        <div key={idx} className="relative h-8 w-8 rounded-md overflow-hidden border border-white/10 shrink-0">
                            <img src={img} alt="edit-attachment" className="h-full w-full object-cover" />
                            <button
                                onClick={() => setEditImages((prev) => prev.filter((_, i) => i !== idx))}
                                className="absolute inset-0 bg-black/45 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"
                            >
                                <X size={10} className="text-white" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {(isRegenOpen && regenImages.length > 0) && (
                <div className="flex items-center gap-1 max-w-[120px] overflow-x-auto scrollbar-hide">
                    {regenImages.map((img, idx) => (
                        <div key={idx} className="relative h-8 w-8 rounded-md overflow-hidden border border-white/10 shrink-0">
                            <img src={img} alt="regen-attachment" className="h-full w-full object-cover" />
                            <button
                                onClick={() => setRegenImages((prev) => prev.filter((_, i) => i !== idx))}
                                className="absolute inset-0 bg-black/45 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"
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

const ToolbarButton = ({ icon, title, onClick, className = '' }: { icon: React.ReactNode, title: string, onClick: () => void, className?: string }) => (
    <button
        title={title}
        onClick={onClick}
        className={`p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all active:scale-90 ${className}`}
    >
        {icon}
    </button>
);
