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
import { useReactFlow, useViewport } from '@xyflow/react';

export function CanvasToolbar() {
    const { activeTool, setActiveTool, setDoc, triggerExternalUpdate } = useCanvasStore();
    const { setSpec } = useDesignStore();
    const { undoSnapshot, redoSnapshot, canUndo, canRedo } = useHistoryStore();
    const { zoomIn, zoomOut, fitView } = useReactFlow();
    const viewport = useViewport();

    const handleUndo = () => {
        const snapshot = undoSnapshot();
        if (!snapshot) return;
        setSpec(snapshot.spec as any);
        setDoc(snapshot.doc);
        triggerExternalUpdate();
    };

    const handleRedo = () => {
        const snapshot = redoSnapshot();
        if (!snapshot) return;
        setSpec(snapshot.spec as any);
        setDoc(snapshot.doc);
        triggerExternalUpdate();
    };

    return (
        <div className="absolute bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-2))] p-1.5 ring-1 ring-[color:color-mix(in_srgb,var(--ui-primary)_10%,transparent)] backdrop-blur-xl">
            {/* History Group */}
            <div className="flex items-center gap-1 border-r border-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-border))] pr-2">
                <button
                    onClick={handleUndo}
                    disabled={!canUndo()}
                    className="rounded-full p-2.5 text-[var(--ui-text-muted)] transition-all hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-4))] hover:text-[var(--ui-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                    title="Undo"
                >
                    <Undo2 size={20} />
                </button>
                <button
                    onClick={handleRedo}
                    disabled={!canRedo()}
                    className="rounded-full p-2.5 text-[var(--ui-text-muted)] transition-all hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-4))] hover:text-[var(--ui-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                    title="Redo"
                >
                    <Redo2 size={20} />
                </button>
            </div>

            {/* Tools Group */}
            <div className="flex items-center gap-1 border-r border-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-border))] pr-2">
                <button
                    onClick={() => setActiveTool('select')}
                    className={`p-2.5 rounded-full transition-all ${activeTool === 'select'
                        ? 'bg-[var(--ui-primary)] text-white'
                        : 'text-[var(--ui-text-muted)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-4))] hover:text-[var(--ui-primary)]'
                        }`}
                    title="Select Tool (Shift+Drag to Select)"
                >
                    <MousePointer2 size={20} />
                </button>
                <button
                    onClick={() => setActiveTool('hand')}
                    className={`p-2.5 rounded-full transition-all ${activeTool === 'hand'
                        ? 'bg-[var(--ui-primary)] text-white'
                        : 'text-[var(--ui-text-muted)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-4))] hover:text-[var(--ui-primary)]'
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
                    className="rounded-full p-2.5 text-[var(--ui-text-muted)] transition-all hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-4))] hover:text-[var(--ui-primary)]"
                    title="Zoom Out"
                >
                    <ZoomOut size={20} />
                </button>
                <span className="min-w-[32px] select-none text-center text-xs font-medium text-[var(--ui-text-subtle)]">
                    {Math.round(viewport.zoom * 100)}%
                </span>
                <button
                    onClick={() => zoomIn()}
                    className="rounded-full p-2.5 text-[var(--ui-text-muted)] transition-all hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-4))] hover:text-[var(--ui-primary)]"
                    title="Zoom In"
                >
                    <ZoomIn size={20} />
                </button>
                <button
                    onClick={() => fitView({ padding: 0.15, duration: 800 })}
                    className="rounded-full p-2.5 text-[var(--ui-text-muted)] transition-all hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-4))] hover:text-[var(--ui-primary)]"
                    title="Fit to Screen"
                >
                    <Maximize size={20} />
                </button>
            </div>
        </div>
    );
}
