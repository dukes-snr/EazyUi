import { useMemo } from 'react';
import { useCanvasStore, useDesignStore } from '../../stores';

export function InspectorPanel() {
    const { spec } = useDesignStore();
    const { doc } = useCanvasStore();

    const selectedId = doc.selection.selectedBoardId || doc.selection.selectedNodeIds[0];
    const selectedScreen = useMemo(() => {
        if (!selectedId || !spec) return null;
        return spec.screens.find((screen) => screen.screenId === selectedId) || null;
    }, [selectedId, spec]);

    if (!selectedScreen) {
        return (
            <div className="inspector-panel">
                <div className="inspector-header">
                    <h3>Inspector</h3>
                </div>
                <div className="inspector-empty">
                    <p>Select a screen to see details.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="inspector-panel">
            <div className="inspector-header">
                <h3>{selectedScreen.name}</h3>
                <div className="inspector-breadcrumb">
                    <span>Screen</span>
                    <span>/</span>
                    <span>{selectedScreen.screenId}</span>
                </div>
            </div>
            <div className="inspector-content">
                <div className="inspector-section">
                    <h4>Meta</h4>
                    <div className="inspector-field">
                        <label>Width</label>
                        <input readOnly value={selectedScreen.width} />
                    </div>
                    <div className="inspector-field">
                        <label>Height</label>
                        <input readOnly value={selectedScreen.height} />
                    </div>
                    <div className="inspector-field">
                        <label>Status</label>
                        <input readOnly value={selectedScreen.status || 'complete'} />
                    </div>
                </div>
                <div className="inspector-section">
                    <h4>HTML</h4>
                    <div className="inspector-field">
                        <label>Preview</label>
                        <textarea readOnly value={selectedScreen.html.slice(0, 800)} />
                    </div>
                </div>
            </div>
        </div>
    );
}
