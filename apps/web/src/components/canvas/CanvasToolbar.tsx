import { useReactFlow } from '@xyflow/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
    CircleHelp,
    Hand,
    Maximize,
    MousePointer2,
    Redo2,
    Undo2,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';

import { useCanvasStore, useHistoryStore } from '../../stores';
import { CANVAS_DOCK_SHORTCUTS, formatShortcutKeys } from './canvasShortcuts';
import { CanvasProfileDock } from './CanvasProfileDock';
import { restoreProjectHistorySnapshot } from '../../utils/projectHistory';

function railButtonClass(active = false, prominent = false) {
    if (prominent) {
        return `inline-flex items-center justify-center rounded-full transition-all duration-150 ${active
            ? 'h-10 w-10 bg-[#f4f4f1] text-[#1b1b1b] shadow-[0_2px_8px_rgba(0,0,0,0.18)]'
            : 'h-10 w-10 bg-[rgba(255,255,255,0.04)] text-[#a8a8a6] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#f2f2ef]'
            }`;
    }

    return `inline-flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 ${active
        ? 'bg-[rgba(255,255,255,0.08)] text-[#f3f3f0]'
        : 'bg-transparent text-[#9a9a97] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#f3f3f0]'
        }`;
}

export function CanvasToolbar() {
    const { activeTool, setActiveTool } = useCanvasStore();
    const { undoSnapshot, redoSnapshot, canUndo, canRedo } = useHistoryStore();
    const { zoomIn, zoomOut, fitView } = useReactFlow();

    const handleUndo = () => {
        const snapshot = undoSnapshot();
        if (!snapshot) return;
        restoreProjectHistorySnapshot(snapshot);
    };

    const handleRedo = () => {
        const snapshot = redoSnapshot();
        if (!snapshot) return;
        restoreProjectHistorySnapshot(snapshot);
    };

    const openHelpLauncher = (event: ReactMouseEvent<HTMLButtonElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        window.dispatchEvent(new CustomEvent('eazyui:open-canvas-help', {
            detail: {
                panel: 'launcher',
                anchorRect: {
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                },
            },
        }));
    };

    return (
        <div
            data-guide-id="canvas-toolbar"
            className="absolute left-3 top-1/2 z-50 flex -translate-y-1/2 flex-col items-center rounded-[28px] border border-[rgba(255,255,255,0.06)] bg-[#232323] px-[7px] py-[8px] shadow-[0_10px_28px_rgba(0,0,0,0.28)]"
        >
            <button
                onClick={() => setActiveTool('select')}
                className={railButtonClass(activeTool === 'select', true)}
                title={`Select tool (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.select])})`}
                aria-label={`Select tool (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.select])})`}
            >
                <MousePointer2 size={18} strokeWidth={2.1} />
            </button>

            <div className="mt-[10px] flex flex-col items-center gap-[10px]">
                <button
                    onClick={() => setActiveTool('hand')}
                    className={railButtonClass(activeTool === 'hand')}
                    title={`Pan tool (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.hand])})`}
                    aria-label={`Pan tool (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.hand])})`}
                >
                    <Hand size={16} strokeWidth={2} />
                </button>

                <button
                    onClick={handleUndo}
                    disabled={!canUndo()}
                    className={`${railButtonClass()} disabled:cursor-not-allowed disabled:opacity-35`}
                    title={`Undo (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.undo])})`}
                    aria-label={`Undo (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.undo])})`}
                >
                    <Undo2 size={16} strokeWidth={2} />
                </button>

                <button
                    onClick={handleRedo}
                    disabled={!canRedo()}
                    className={`${railButtonClass()} disabled:cursor-not-allowed disabled:opacity-35`}
                    title={`Redo (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.redo])})`}
                    aria-label={`Redo (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.redo])})`}
                >
                    <Redo2 size={16} strokeWidth={2} />
                </button>

                <button
                    onClick={() => zoomOut()}
                    className={railButtonClass()}
                    title={`Zoom out (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.zoomOut])})`}
                    aria-label={`Zoom out (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.zoomOut])})`}
                >
                    <ZoomOut size={16} strokeWidth={2} />
                </button>

                <button
                    onClick={() => zoomIn()}
                    className={railButtonClass()}
                    title={`Zoom in (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.zoomIn])})`}
                    aria-label={`Zoom in (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.zoomIn])})`}
                >
                    <ZoomIn size={16} strokeWidth={2} />
                </button>

                <button
                    onClick={() => fitView({ padding: 0.28, duration: 500, maxZoom: 0.9 })}
                    className={railButtonClass()}
                    title={`Fit to screen (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.fit])})`}
                    aria-label={`Fit to screen (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.fit])})`}
                >
                    <Maximize size={16} strokeWidth={2} />
                </button>

                <button
                    onClick={openHelpLauncher}
                    className={railButtonClass()}
                    title={`Help & shortcuts (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.help])})`}
                    aria-label={`Help & shortcuts (${formatShortcutKeys([...CANVAS_DOCK_SHORTCUTS.help])})`}
                    data-guide-id="canvas-help-trigger"
                >
                    <CircleHelp size={16} strokeWidth={2} />
                </button>
            </div>

            <div className="my-[10px] h-px w-[28px] bg-[rgba(255,255,255,0.08)]" />

            <CanvasProfileDock />
        </div>
    );
}
