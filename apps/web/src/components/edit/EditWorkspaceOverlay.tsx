import { useEffect, useMemo, useRef, useState } from 'react';
import { Layers, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { CanvasWorkspace } from '../canvas/CanvasWorkspace';
import { useCanvasStore, useDesignStore } from '../../stores';
import { useEditStore } from '../../stores/edit-store';
import { LayersPanel } from './LayersPanel';
import { EditPanel } from './EditPanel';
import { EditAiComposer } from './EditAiComposer';

export function EditWorkspaceOverlay() {
    const { isEditMode, screenId } = useEditStore();
    const { spec } = useDesignStore();
    const { setFocusNodeId } = useCanvasStore();
    const [layersOpen, setLayersOpen] = useState(false);
    const recenterTimersRef = useRef<number[]>([]);

    const activeScreenName = useMemo(() => {
        if (!spec || !screenId) return 'Screen Editor';
        return spec.screens.find((screen) => screen.screenId === screenId)?.name || 'Screen Editor';
    }, [screenId, spec]);

    useEffect(() => {
        return () => {
            recenterTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
            recenterTimersRef.current = [];
        };
    }, []);

    useEffect(() => {
        if (!isEditMode || !screenId) return;
        recenterTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
        recenterTimersRef.current = [];

        // Recenter immediately + during/after layers transition so available space is respected.
        const ticks = [0, 160, 340];
        recenterTimersRef.current = ticks.map((delay) =>
            window.setTimeout(() => {
                setFocusNodeId(screenId);
            }, delay)
        );
    }, [isEditMode, layersOpen, screenId, setFocusNodeId]);

    if (!isEditMode) return null;

    return (
        <div className="edit-workspace-overlay">
            <div className="edit-workspace-modal">
                <div className={`edit-workspace-layers-drawer ${layersOpen ? 'open' : 'closed'}`}>
                    {layersOpen && <LayersPanel />}
                </div>

                <div className="edit-workspace-preview-pane">
                    <div className="edit-workspace-preview-canvas">
                        <CanvasWorkspace mode="edit-workspace" />
                        <div className="edit-workspace-floating-controls">
                            <button
                                type="button"
                                onClick={() => setLayersOpen((value) => !value)}
                                className="edit-workspace-layers-toggle"
                                title={layersOpen ? 'Hide layers panel' : 'Show layers panel'}
                            >
                                {layersOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                                <span>Layers</span>
                            </button>
                            <div className="edit-workspace-screen-title">
                                <div className="edit-workspace-screen-chip">
                                    <Layers size={14} />
                                    <span>{activeScreenName}</span>
                                </div>
                            </div>
                        </div>
                        <EditAiComposer />
                    </div>
                </div>

                <div className="edit-workspace-editor-pane">
                    <EditPanel />
                </div>
            </div>
        </div>
    );
}
