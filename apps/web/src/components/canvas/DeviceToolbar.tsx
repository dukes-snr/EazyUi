import { memo, useState } from 'react';
import {
    Sparkles,
    LayoutGrid,
    Link2,
    PencilLine,
    MoreHorizontal,
    Monitor,
    Tablet,
    Smartphone,
    Save,
    ArrowUp,
    X,
    Trash2,
    RotateCcw
} from 'lucide-react';

interface DeviceToolbarProps {
    screenId: string;
    onAction?: (action: string, payload?: any) => void;
}

export const DeviceToolbar = memo(({ screenId, onAction }: DeviceToolbarProps) => {
    const [isWriting, setIsWriting] = useState(false);
    const [inputValue, setInputValue] = useState('');

    const handleSubmit = () => {
        if (!inputValue.trim()) return;
        onAction?.('submit-edit', inputValue);
        setInputValue('');
        setIsWriting(false);
    };

    return (
        <div className={`flex items-center gap-1.5 p-1.5 bg-slate-900/95 backdrop-blur-md rounded-full shadow-2xl ring-1 ring-white/10 pointer-events-auto transition-all duration-300 animate-fade-in-up ${isWriting ? 'min-w-[400px]' : 'min-w-[300px]'}`}>
            {/* Left: Write Content Action */}
            <div className={`flex items-center transition-all duration-300 flex-1`}>
                {!isWriting ? (
                    <button
                        onClick={() => setIsWriting(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-full transition-all active:scale-95 group"
                    >
                        <Sparkles size={14} className="text-purple-400 group-hover:animate-pulse" />
                        <span className="text-[13px] font-medium whitespace-nowrap">Edit </span>
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
                                className="w-full h-9 pl-9 pr-3 bg-white/5 rounded-full text-white text-[13px] outline-none focus:ring-2 focus:ring-purple-500/40 transition-all placeholder:text-gray-500"
                            />
                            <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" />
                        </div>
                        <button
                            onClick={handleSubmit}
                            disabled={!inputValue.trim()}
                            className="p-2 bg-white text-slate-900 rounded-full hover:bg-gray-200 disabled:opacity-30 transition-all active:scale-90"
                        >
                            <ArrowUp size={16} />
                        </button>
                        <button
                            onClick={() => setIsWriting(false)}
                            className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-all"
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

                    {/* Center: Tools */}
                    <div className="flex items-center gap-1">
                        <ToolbarButton
                            icon={<LayoutGrid size={16} />}
                            title="Layout"
                            onClick={() => onAction?.('layout')}
                        />
                        <ToolbarButton
                            icon={<Link2 size={16} />}
                            title="Connect"
                            onClick={() => onAction?.('link')}
                        />
                        <ToolbarButton
                            icon={<PencilLine size={16} />}
                            title="Edit"
                            onClick={() => onAction?.('edit')}
                        />
                        <ToolbarButton
                            icon={<MoreHorizontal size={16} />}
                            title="More"
                            onClick={() => onAction?.('more')}
                        />
                        <div className="w-[1px] h-3 bg-white/5 mx-0.5" />
                        <ToolbarButton
                            icon={<RotateCcw size={16} />}
                            title="Regenerate"
                            onClick={() => onAction?.('regenerate')}
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

                    {/* Right: Device Switcher & Save */}
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
                        <button
                            onClick={() => {
                                console.log(`Saving screen: ${screenId}`);
                                onAction?.('save');
                            }}
                            className="ml-2 px-3 py-1.5 bg-white hover:bg-gray-200 text-slate-900 rounded-full text-[13px] font-medium transition-all active:scale-95 flex items-center gap-2"
                        >
                            <Save size={14} />
                            Save
                        </button>
                    </div>
                </>
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
