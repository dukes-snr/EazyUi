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
    Pencil,
    ChevronDown,
    LayoutGrid,
    Focus,
} from 'lucide-react';
import { useCanvasStore } from '../../stores';
import { useReactFlow } from '@xyflow/react';

type MenuType = 'align' | 'space' | 'generate' | 'edit' | 'more' | null;

export const MultiSelectToolbar = memo(() => {
    const { alignSelectedBoards, distributeSelectedBoards, smartArrangeSelectedBoards, moveSelectedBoards, doc } = useCanvasStore();
    const { fitView } = useReactFlow();
    const [activeMenu, setActiveMenu] = useState<MenuType>(null);
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

    return (
        <div
            ref={containerRef}
            className="flex items-center gap-1 p-1.5 bg-[#141414]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-auto ring-1 ring-white/5"
        >
            {/* Generate Button */}
            <DropdownButton
                label="Generate"
                icon={<Sparkles size={16} className="text-indigo-400" />}
                active={activeMenu === 'generate'}
                onClick={() => toggleMenu('generate')}
                hasChevron
            />

            <div className="w-[1px] h-4 bg-white/10 mx-1" />

            {/* Edit Button */}
            <DropdownButton
                label="Edit"
                icon={<Pencil size={14} className="text-slate-400" />}
                active={activeMenu === 'edit'}
                onClick={() => toggleMenu('edit')}
                hasChevron
            />

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
