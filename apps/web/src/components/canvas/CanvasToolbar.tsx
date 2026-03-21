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
        <div className="absolute bottom-1 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-[24px] border border-[color:color-mix(in_srgb,var(--ui-border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-surface-1)_92%,transparent)] px-2.5 py-2 backdrop-blur-xl">
            {/* History Group */}
            <div className="flex items-center gap-1 border-r border-[color:color-mix(in_srgb,var(--ui-border)_88%,transparent)] pr-2">
                <button
                    onClick={handleUndo}
                    disabled={!canUndo()}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)] disabled:cursor-not-allowed disabled:opacity-35"
                    title="Undo"
                >
                    <Undo2 size={18} />
                </button>
                <button
                    onClick={handleRedo}
                    disabled={!canRedo()}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)] disabled:cursor-not-allowed disabled:opacity-35"
                    title="Redo"
                >
                    <Redo2 size={18} />
                </button>
            </div>

            {/* Tools Group */}
            <div className="flex items-center gap-1 border-r border-[color:color-mix(in_srgb,var(--ui-border)_88%,transparent)] pr-2">
                <button
                    onClick={() => setActiveTool('select')}
                    className={`inline-flex h-10 items-center gap-2 rounded-[14px] px-3 transition-colors ${activeTool === 'select'
                        ? 'bg-[var(--ui-surface-3)] text-[var(--ui-text)]'
                        : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]'
                        }`}
                    title="Select Tool (Shift+Drag to Select)"
                >
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-[10px] ${activeTool === 'select' ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_18%,transparent)] text-[var(--ui-primary)]' : 'bg-[var(--ui-surface-2)] text-[var(--ui-text-subtle)]'}`}>
                        <MousePointer2 size={15} />
                    </span>
                    <span className="hidden text-[12px] font-medium tracking-[0.01em] sm:inline">Select</span>
                </button>
                <button
                    onClick={() => setActiveTool('hand')}
                    className={`inline-flex h-10 items-center gap-2 rounded-[14px] px-3 transition-colors ${activeTool === 'hand'
                        ? 'bg-[var(--ui-surface-3)] text-[var(--ui-text)]'
                        : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]'
                        }`}
                    title="Pan Tool (Drag to Move)"
                >
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-[10px] ${activeTool === 'hand' ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_18%,transparent)] text-[var(--ui-primary)]' : 'bg-[var(--ui-surface-2)] text-[var(--ui-text-subtle)]'}`}>
                        <Hand size={15} />
                    </span>
                    <span className="hidden text-[12px] font-medium tracking-[0.01em] sm:inline">Pan</span>
                </button>
            </div>

            {/* View Controls Group */}
            <div className="flex items-center gap-1 pl-1">
                <button
                    onClick={() => zoomOut()}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]"
                    title="Zoom Out"
                >
                    <ZoomOut size={18} />
                </button>
                <span className="min-w-[52px] select-none text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ui-text-subtle)]">
                    {Math.round(viewport.zoom * 100)}%
                </span>
                <button
                    onClick={() => zoomIn()}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]"
                    title="Zoom In"
                >
                    <ZoomIn size={18} />
                </button>
                <button
                    onClick={() => fitView({ padding: 0.15, duration: 800 })}
                    className="inline-flex h-10 items-center gap-2 rounded-[14px] px-3 text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]"
                    title="Fit to Screen"
                >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] bg-[var(--ui-surface-2)] text-[var(--ui-text-subtle)]">
                        <Maximize size={15} />
                    </span>
                    <span className="hidden text-[12px] font-medium tracking-[0.01em] sm:inline">Fit</span>
                </button>
            </div>
        </div>
    );
}
