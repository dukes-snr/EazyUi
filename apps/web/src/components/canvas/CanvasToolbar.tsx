import { useCanvasStore, useDesignStore, useHistoryStore } from '../../stores';
import {
    MousePointer2,
    Hand,
    ZoomIn,
    ZoomOut,
    Maximize,
    Undo2,
    Redo2,
} from 'lucide-react';
import { useReactFlow } from '@xyflow/react';

export function CanvasToolbar() {
    const { activeTool, setActiveTool, doc, setDoc } = useCanvasStore();
    const { setSpec } = useDesignStore();
    const { undoSnapshot, redoSnapshot, canUndo, canRedo } = useHistoryStore();
    const { zoomIn, zoomOut, fitView } = useReactFlow();

    const handleUndo = () => {
        const snapshot = undoSnapshot();
        if (!snapshot) return;
        setSpec(snapshot.spec as any);
        setDoc(snapshot.doc);
    };

    const handleRedo = () => {
        const snapshot = redoSnapshot();
        if (!snapshot) return;
        setSpec(snapshot.spec as any);
        setDoc(snapshot.doc);
    };

    return (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 bg-[var(--ui-surface-2)]/95 backdrop-blur-xl border border-[var(--ui-border)] rounded-full shadow-2xl z-50">
            {/* History Group */}
            <div className="flex items-center gap-1 pr-2 border-r border-[var(--ui-border)]">
                <button
                    onClick={handleUndo}
                    disabled={!canUndo()}
                    className="p-2.5 rounded-full text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Undo"
                >
                    <Undo2 size={20} />
                </button>
                <button
                    onClick={handleRedo}
                    disabled={!canRedo()}
                    className="p-2.5 rounded-full text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Redo"
                >
                    <Redo2 size={20} />
                </button>
            </div>

            {/* Tools Group */}
            <div className="flex items-center gap-1 pr-2 border-r border-[var(--ui-border)]">
                <button
                    onClick={() => setActiveTool('select')}
                    className={`p-2.5 rounded-full transition-all ${activeTool === 'select'
                        ? 'bg-[var(--ui-primary)] text-white shadow-md'
                        : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text)]'
                        }`}
                    title="Select Tool (Shift+Drag to Select)"
                >
                    <MousePointer2 size={20} />
                </button>
                <button
                    onClick={() => setActiveTool('hand')}
                    className={`p-2.5 rounded-full transition-all ${activeTool === 'hand'
                        ? 'bg-[var(--ui-primary)] text-white shadow-md'
                        : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text)]'
                        }`}
                    title="Pan Tool (Drag to Move)"
                >
                    <Hand size={20} />
                </button>
            </div>

            {/* View Controls Group */}
            <div className="flex items-center gap-1 pl-1">
                <button
                    onClick={() => zoomOut()}
                    className="p-2.5 rounded-full text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text)] transition-all"
                    title="Zoom Out"
                >
                    <ZoomOut size={20} />
                </button>
                <span className="text-xs font-medium text-[var(--ui-text-subtle)] min-w-[32px] text-center select-none">
                    {Math.round(doc.viewport.zoom * 100)}%
                </span>
                <button
                    onClick={() => zoomIn()}
                    className="p-2.5 rounded-full text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text)] transition-all"
                    title="Zoom In"
                >
                    <ZoomIn size={20} />
                </button>
                <button
                    onClick={() => fitView({ padding: 0.15, duration: 800 })}
                    className="p-2.5 rounded-full text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)] hover:text-[var(--ui-text)] transition-all"
                    title="Fit to Screen"
                >
                    <Maximize size={20} />
                </button>
            </div>
        </div>
    );
}
