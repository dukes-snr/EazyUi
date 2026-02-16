import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Moon, Settings, Sun, UserCircle2 } from 'lucide-react';
import { useUiStore } from '../../stores';

export function CanvasProfileMenu() {
    const { theme, toggleTheme } = useUiStore();
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    return (
        <div ref={menuRef} className="pointer-events-auto relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="canvas-profile-trigger"
                title="Profile and settings"
            >
                <div className="canvas-profile-avatar">
                    <UserCircle2 size={16} />
                </div>
                <div className="canvas-profile-meta">
                    <span className="canvas-profile-name">You</span>
                    <span className="canvas-profile-role">Designer</span>
                </div>
                <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="canvas-profile-menu">
                    <button
                        type="button"
                        className="canvas-profile-menu-item"
                        onClick={() => {
                            toggleTheme();
                            setOpen(false);
                        }}
                    >
                        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                        <span>Switch to {theme === 'dark' ? 'Light' : 'Dark'} Theme</span>
                    </button>
                    <button
                        type="button"
                        className="canvas-profile-menu-item"
                        onClick={() => {
                            // Placeholder for upcoming settings modal/page.
                            setOpen(false);
                        }}
                    >
                        <Settings size={14} />
                        <span>Settings</span>
                    </button>
                </div>
            )}
        </div>
    );
}
