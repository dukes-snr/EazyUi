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
import { useUiStore } from '../../stores/ui-store';
import { apiClient } from '../../api/client';
import { getPreferredTextModel } from '../../constants/designModels';
import { toTaggedErrorMessage } from '../../utils/userFacingErrors';

type MenuType = 'align' | 'space' | 'generate' | 'edit' | 'more' | null;

export const MultiSelectToolbar = memo(() => {
    const { alignSelectedBoards, distributeSelectedBoards, smartArrangeSelectedBoards, moveSelectedBoards, doc, setFocusNodeIds } = useCanvasStore();
    const { spec, updateScreen } = useDesignStore();
    const { isGenerating, setGenerating, setAbortController, addMessage, updateMessage } = useChatStore();
    const { modelProfile } = useUiStore();
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
                        preferredModel: getPreferredTextModel(modelProfile),
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
            const successIds = results
                .flatMap((result) => result.status === 'fulfilled' ? [result.value.screenId] : []);
            const targetIds = successIds.length > 0 ? successIds : targetScreens.map((s) => s.screenId);
            setFocusNodeIds(targetIds);

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
                updateMessage(assistantMsgId, { content: toTaggedErrorMessage(error), status: 'error' });
            }
        } finally {
            setAbortController(null);
            setGenerating(false);
        }
    };

    return (
        <div
            ref={containerRef}
            className="flex items-center gap-1 p-1.5 bg-[var(--ui-surface-2)]/95 backdrop-blur-xl border border-[var(--ui-border)] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.35)] pointer-events-auto ring-1 ring-[var(--ui-border)]"
        >
            {!isWriting ? (
                <button
                    onClick={() => setIsWriting(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--ui-primary)] hover:bg-[var(--ui-primary-hover)] text-white rounded-xl transition-all active:scale-95 group"
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
                        className="w-full h-9 pl-3 pr-3 bg-[var(--ui-surface-3)] rounded-xl text-[var(--ui-text)] text-[13px] outline-none placeholder:text-[var(--ui-text-subtle)]"
                    />
                    <button
                        onClick={handleBatchRefine}
                        disabled={!inputValue.trim() || isGenerating}
                        className="p-2 bg-[var(--ui-primary)] text-white rounded-xl hover:bg-[var(--ui-primary-hover)] disabled:opacity-30 transition-all active:scale-90"
                    >
                        <ArrowUp size={16} />
                    </button>
                    <button
                        onClick={() => setIsWriting(false)}
                        className="p-2 text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] rounded-xl transition-all"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            <div className="w-[1px] h-4 bg-[var(--ui-border)] mx-1" />

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
                        <div className="h-[1px] bg-[var(--ui-border)] my-1" />
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

            <div className="w-[1px] h-4 bg-[var(--ui-border)] mx-1" />

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
            ${active ? 'bg-[var(--ui-surface-4)] text-[var(--ui-text)]' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)]'}
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
            ${active ? 'bg-[var(--ui-surface-4)] text-[var(--ui-text)] shadow-inner' : 'text-[var(--ui-text-subtle)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)]'}
        `}
    >
        {icon}
    </button>
);

const DropdownMenu = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    <div className={`absolute z-[100] p-1.5 bg-[var(--ui-popover)] border border-[var(--ui-border)] rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200 ${className}`}>
        {children}
    </div>
);

const MenuOption = ({ label, icon, onClick }: { label: string, icon?: React.ReactNode, onClick: () => void }) => (
    <button
        onClick={onClick}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-[13px] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] rounded-xl transition-all text-left group"
    >
        <div className="flex items-center gap-2">
            {icon && <span className="text-[var(--ui-text-subtle)] group-hover:text-indigo-400 transition-colors">{icon}</span>}
            <span className="font-medium">{label}</span>
        </div>
    </button>
);
