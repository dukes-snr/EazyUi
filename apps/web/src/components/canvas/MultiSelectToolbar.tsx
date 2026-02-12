import { memo, useState, useRef, useEffect } from 'react';
import {
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignVerticalJustifyStart,
    AlignVerticalJustifyCenter,
    AlignVerticalJustifyEnd,
    MoveHorizontal,
    MoveVertical,
    Sparkles,
    ChevronDown,
    LayoutGrid,
    Focus,
    ArrowUp,
    X,
} from 'lucide-react';
import { useCanvasStore } from '../../stores';
import { useReactFlow } from '@xyflow/react';
import { useDesignStore } from '../../stores/design-store';
import { useChatStore } from '../../stores/chat-store';
import { apiClient } from '../../api/client';

type MenuType = 'align' | 'space' | 'generate' | 'edit' | 'more' | null;

export const MultiSelectToolbar = memo(() => {
    const { alignSelectedBoards, distributeSelectedBoards, smartArrangeSelectedBoards, moveSelectedBoards, doc } = useCanvasStore();
    const { spec, updateScreen } = useDesignStore();
    const { isGenerating, setGenerating, setAbortController, addMessage, updateMessage } = useChatStore();
    const { fitView } = useReactFlow();
    const [activeMenu, setActiveMenu] = useState<MenuType>(null);
    const [isWriting, setIsWriting] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setActiveMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleMenu = (menu: MenuType) => {
        setActiveMenu(activeMenu === menu ? null : menu);
    };

    const selectedCount = doc.selection.selectedNodeIds.length;
    if (selectedCount < 2) return null;

    const handleBatchRefine = async () => {
        const instruction = inputValue.trim();
        if (!instruction || isGenerating || !spec) return;

        const selectedIds = doc.selection.selectedNodeIds;
        const targetScreens = spec.screens.filter((s) => selectedIds.includes(s.screenId));
        if (!targetScreens.length) return;

        const userMsg = `Refine ${targetScreens.length} selected screens: ${instruction}`;
        const userMsgId = addMessage('user', userMsg);
        const assistantMsgId = addMessage('assistant', `Applying edit to ${targetScreens.length} selected screens...`);
        updateMessage(userMsgId, {
            meta: {
                screenIds: targetScreens.map((s) => s.screenId),
                screenSnapshots: Object.fromEntries(
                    targetScreens.map((s) => [s.screenId, {
                        screenId: s.screenId,
                        name: s.name,
                        html: s.html,
                        width: s.width,
                        height: s.height,
                    }])
                )
            }
        });
        updateMessage(assistantMsgId, { meta: { screenIds: targetScreens.map((s) => s.screenId), livePreview: true }, status: 'streaming' });

        setGenerating(true);
        const controller = new AbortController();
        setAbortController(controller);

        try {
            targetScreens.forEach((screen) => {
                updateScreen(screen.screenId, screen.html, 'streaming', screen.width, screen.height, screen.name);
            });

            const results = await Promise.allSettled(
                targetScreens.map(async (screen) => {
                    const response = await apiClient.edit({
                        instruction: `Apply this edit to this exact screen only. Keep screen intent and content structure. User request: ${instruction}`,
                        html: screen.html,
                        screenId: screen.screenId,
                    }, controller.signal);
                    return { screenId: screen.screenId, html: response.html, name: screen.name };
                })
            );

            let success = 0;
            let failed = 0;
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    updateScreen(result.value.screenId, result.value.html, 'complete', undefined, undefined, result.value.name);
                    success++;
                } else {
                    const original = targetScreens[index];
                    if (original) {
                        updateScreen(original.screenId, original.html, 'complete', original.width, original.height, original.name);
                    }
                    failed++;
                }
            });

            updateMessage(assistantMsgId, {
                content: failed === 0
                    ? `Updated ${success} screens successfully.`
                    : `Updated ${success} screens, ${failed} failed.`,
                status: failed === 0 ? 'complete' : 'error',
            });
            setInputValue('');
            setIsWriting(false);
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                updateMessage(assistantMsgId, { content: 'Multi-screen edit cancelled.', status: 'error' });
            } else {
                updateMessage(assistantMsgId, { content: `Error: ${(error as Error).message}`, status: 'error' });
            }
        } finally {
            setAbortController(null);
            setGenerating(false);
        }
    };

    return (
        <div
            ref={containerRef}
            className="flex items-center gap-1 p-1.5 bg-[#141414]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-auto ring-1 ring-white/5"
        >
            {!isWriting ? (
                <button
                    onClick={() => setIsWriting(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-indigo-700 hover:text-white text-black rounded-xl transition-all active:scale-95 group"
                    disabled={isGenerating}
                >
                    <Sparkles size={14} />
                    <span className="text-[13px] font-medium whitespace-nowrap">Refine</span>
                </button>
            ) : (
                <div className="flex items-center gap-2 min-w-[340px]">
                    <input
                        autoFocus
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleBatchRefine();
                            if (e.key === 'Escape') setIsWriting(false);
                        }}
                        placeholder="Edit selected screens..."
                        className="w-full h-9 pl-3 pr-3 bg-white/5 rounded-xl text-white text-[13px] outline-none placeholder:text-gray-500"
                    />
                    <button
                        onClick={handleBatchRefine}
                        disabled={!inputValue.trim() || isGenerating}
                        className="p-2 bg-white text-slate-900 rounded-xl hover:bg-gray-200 disabled:opacity-30 transition-all active:scale-90"
                    >
                        <ArrowUp size={16} />
                    </button>
                    <button
                        onClick={() => setIsWriting(false)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            <div className="w-[1px] h-4 bg-white/10 mx-1" />

            {/* Alignment Tool */}
            <div className="relative">
                <IconButton
                    icon={<AlignLeft size={18} />}
                    active={activeMenu === 'align'}
                    onClick={() => toggleMenu('align')}
                />

                {activeMenu === 'align' && (
                    <DropdownMenu className="w-48 top-full mt-3 left-0">
                        <MenuOption label="Align Left" icon={<AlignLeft size={16} />} onClick={() => { alignSelectedBoards('left'); setActiveMenu(null); }} />
                        <MenuOption label="Horizontal Center" icon={<AlignCenter size={16} />} onClick={() => { alignSelectedBoards('center'); setActiveMenu(null); }} />
                        <MenuOption label="Align Right" icon={<AlignRight size={16} />} onClick={() => { alignSelectedBoards('right'); setActiveMenu(null); }} />
                        <div className="h-[1px] bg-white/5 my-1" />
                        <MenuOption label="Align Top" icon={<AlignVerticalJustifyStart size={16} />} onClick={() => { alignSelectedBoards('top'); setActiveMenu(null); }} />
                        <MenuOption label="Vertical Center" icon={<AlignVerticalJustifyCenter size={16} />} onClick={() => { alignSelectedBoards('middle'); setActiveMenu(null); }} />
                        <MenuOption label="Align Bottom" icon={<AlignVerticalJustifyEnd size={16} />} onClick={() => { alignSelectedBoards('bottom'); setActiveMenu(null); }} />
                    </DropdownMenu>
                )}
            </div>

            {/* Spacing Tool */}
            <div className="relative">
                <IconButton
                    icon={<MoveHorizontal size={18} />}
                    active={activeMenu === 'space'}
                    onClick={() => toggleMenu('space')}
                />

                {activeMenu === 'space' && (
                    <DropdownMenu className="w-44 top-full mt-3 left-0">
                        <MenuOption label="Horizontal Space" icon={<MoveHorizontal size={16} />} onClick={() => { distributeSelectedBoards('horizontal'); setActiveMenu(null); }} />
                        <MenuOption label="Vertical Space" icon={<MoveVertical size={16} />} onClick={() => { distributeSelectedBoards('vertical'); setActiveMenu(null); }} />
                    </DropdownMenu>
                )}
            </div>

            {/* Smart Arrange Tool */}
            <IconButton
                icon={<LayoutGrid size={18} />}
                active={false}
                onClick={() => smartArrangeSelectedBoards()}
                title="Smart Arrange"
            />

            {/* Focus Selected */}
            <IconButton
                icon={<Focus size={18} />}
                active={false}
                onClick={() => {
                    const ids = doc.selection.selectedNodeIds;
                    if (!ids.length) return;
                    fitView({
                        nodes: ids.map((id) => ({ id })),
                        padding: 0.2,
                        duration: 700,
                        maxZoom: 1.2,
                    });
                }}
                title="Focus Selected"
            />

            <div className="w-[1px] h-4 bg-white/10 mx-1" />

            {/* More Button */}
            <div className="relative">
                <DropdownButton
                    label="More"
                    active={activeMenu === 'more'}
                    onClick={() => toggleMenu('more')}
                    hasChevron
                />

                {activeMenu === 'more' && (
                    <DropdownMenu className="w-40 top-full mt-3 right-0">
                        <MenuOption label="Bring to Front" onClick={() => { moveSelectedBoards('front'); setActiveMenu(null); }} />
                        <MenuOption label="Send to Back" onClick={() => { moveSelectedBoards('back'); setActiveMenu(null); }} />
                    </DropdownMenu>
                )}
            </div>
        </div>
    );
});

const DropdownButton = ({ label, icon, active, onClick, hasChevron }: {
    label: string,
    icon?: React.ReactNode,
    active: boolean,
    onClick: () => void,
    hasChevron?: boolean
}) => (
    <button
        onClick={onClick}
        className={`
            flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all
            ${active ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white hover:bg-white/5'}
        `}
    >
        {icon}
        <span className="text-[13px] font-medium">{label}</span>
        {hasChevron && <ChevronDown size={14} className={`transition-transform duration-200 ${active ? 'rotate-180' : ''}`} />}
    </button>
);

const IconButton = ({ icon, active, onClick, title }: { icon: React.ReactNode, active: boolean, onClick: () => void, title?: string }) => (
    <button
        onClick={onClick}
        title={title}
        className={`
            p-2 rounded-xl transition-all
            ${active ? 'bg-white/10 text-white shadow-inner' : 'text-slate-400 hover:text-white hover:bg-white/5'}
        `}
    >
        {icon}
    </button>
);

const DropdownMenu = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    <div className={`absolute z-[100] p-1.5 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200 ${className}`}>
        {children}
    </div>
);

const MenuOption = ({ label, icon, onClick }: { label: string, icon?: React.ReactNode, onClick: () => void }) => (
    <button
        onClick={onClick}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-[13px] text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-all text-left group"
    >
        <div className="flex items-center gap-2">
            {icon && <span className="text-slate-500 group-hover:text-indigo-400 transition-colors">{icon}</span>}
            <span className="font-medium">{label}</span>
        </div>
    </button>
);
